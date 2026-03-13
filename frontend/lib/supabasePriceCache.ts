/**
 * supabasePriceCache.ts
 *
 * Shared price cache backed by Supabase (replaces per-user localStorage).
 * All users read/write the same cache — first visitor populates it,
 * subsequent visitors get instant loads.
 *
 * Strategy:
 * 1. Check Supabase price_cache_meta for the coin
 * 2. If last_fetch_ts < 6 hours ago → read from Supabase (instant)
 * 3. If stale or missing → fetch from DeFiLlama, upsert into Supabase
 */

import { supabase } from './supabase';

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const FULL_DAYS = 366;

export interface PriceData {
  wstethPrices: [number, number][];
  ethPrices: [number, number][];
  stethPrices: [number, number][];
  fromCache: boolean;
  cacheAgeMs: number;
}

// ── DeFiLlama fetchers (via our /api/prices proxy) ──────────────────────

async function fetchFromLlama(
  coinId: string,
  mode: 'full' | 'range',
  fromSec?: number,
  toSec?: number
): Promise<[number, number][]> {
  let url: string;
  if (mode === 'range' && fromSec && toSec) {
    url = `/api/prices?coinId=${coinId}&from=${fromSec}&to=${toSec}`;
  } else {
    url = `/api/prices?coinId=${coinId}&days=${FULL_DAYS}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
  const json = await res.json();
  return json.prices as [number, number][];
}

// ── Supabase read/write ─────────────────────────────────────────────────

async function readCachedPrices(coinId: string): Promise<[number, number][]> {
  const { data, error } = await supabase
    .from('price_cache')
    .select('timestamp_ms, price')
    .eq('coin_id', coinId)
    .order('date', { ascending: true });

  if (error || !data) return [];
  return data.map(row => [row.timestamp_ms, row.price] as [number, number]);
}

async function readCacheMeta(coinId: string): Promise<{ lastFetchTs: number; oldestDataTs: number } | null> {
  const { data, error } = await supabase
    .from('price_cache_meta')
    .select('last_fetch_ts, oldest_data_ts')
    .eq('coin_id', coinId)
    .single();

  if (error || !data) return null;
  return { lastFetchTs: data.last_fetch_ts, oldestDataTs: data.oldest_data_ts };
}

async function upsertPrices(coinId: string, prices: [number, number][]) {
  const rows = prices.map(([tsMs, price]) => ({
    coin_id: coinId,
    date: new Date(tsMs).toISOString().split('T')[0],
    price,
    timestamp_ms: tsMs,
  }));

  // Batch upsert in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await supabase
      .from('price_cache')
      .upsert(chunk, { onConflict: 'coin_id,date' });
  }
}

async function upsertMeta(coinId: string, lastFetchTs: number, oldestDataTs: number) {
  await supabase
    .from('price_cache_meta')
    .upsert({
      coin_id: coinId,
      last_fetch_ts: lastFetchTs,
      oldest_data_ts: oldestDataTs,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'coin_id' });
}

// ── Single coin fetch with cache logic ──────────────────────────────────

async function getCoinPrices(coinId: string): Promise<{ prices: [number, number][]; fromCache: boolean; cacheAgeMs: number }> {
  const now = Date.now();
  const meta = await readCacheMeta(coinId);

  // 1. Fresh cache → return from Supabase
  if (meta && now - meta.lastFetchTs < CACHE_TTL) {
    const prices = await readCachedPrices(coinId);
    if (prices.length > 50) {
      return { prices, fromCache: true, cacheAgeMs: now - meta.lastFetchTs };
    }
  }

  // 2. Stale cache → incremental fetch
  if (meta && meta.lastFetchTs > 0) {
    try {
      const fromSec = Math.floor(meta.lastFetchTs / 1000);
      const toSec = Math.floor(now / 1000);
      const newPrices = await fetchFromLlama(coinId, 'range', fromSec, toSec);

      if (newPrices.length > 0) {
        await upsertPrices(coinId, newPrices);
      }
      await upsertMeta(coinId, now, meta.oldestDataTs);

      const all = await readCachedPrices(coinId);
      return { prices: all, fromCache: false, cacheAgeMs: 0 };
    } catch (err) {
      // Incremental failed, try returning stale data
      console.warn(`[supabasePriceCache] Incremental fetch failed for ${coinId}:`, err);
      const stale = await readCachedPrices(coinId);
      if (stale.length > 50) {
        return { prices: stale, fromCache: true, cacheAgeMs: now - meta.lastFetchTs };
      }
    }
  }

  // 3. No cache → full fetch
  const prices = await fetchFromLlama(coinId, 'full');
  if (prices.length > 0) {
    await upsertPrices(coinId, prices);
    await upsertMeta(coinId, now, prices[0][0]);
  }
  return { prices, fromCache: false, cacheAgeMs: 0 };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Fetch historical prices for the wstETH depeg chart.
 * Uses Supabase as a shared cache (all users benefit).
 * Falls back to direct DeFiLlama via /api/prices proxy.
 */
export async function getHistoricalPrices(): Promise<PriceData> {
  const coins = ['wrapped-steth', 'ethereum', 'staked-ether'] as const;

  const [wsteth, eth, steth] = await Promise.all(
    coins.map(c => getCoinPrices(c))
  );

  // Overall cache status: only "fromCache" if ALL three were cached
  const fromCache = wsteth.fromCache && eth.fromCache && steth.fromCache;
  const cacheAgeMs = Math.max(wsteth.cacheAgeMs, eth.cacheAgeMs, steth.cacheAgeMs);

  return {
    wstethPrices: wsteth.prices,
    ethPrices: eth.prices,
    stethPrices: steth.prices,
    fromCache,
    cacheAgeMs,
  };
}

/**
 * Generic: fetch prices for any DeFiLlama coin pair.
 * Returns [timestamp_ms, price][] for each coin.
 */
export async function getCoinPairPrices(
  collateralCoinId: string,
  loanCoinId: string,
  intrinsicCoinId?: string
): Promise<{
  collateralPrices: [number, number][];
  loanPrices: [number, number][];
  intrinsicPrices: [number, number][];
  fromCache: boolean;
  cacheAgeMs: number;
}> {
  const coinIds = [collateralCoinId, loanCoinId];
  if (intrinsicCoinId && intrinsicCoinId !== collateralCoinId) {
    coinIds.push(intrinsicCoinId);
  }

  const results = await Promise.all(coinIds.map(c => getCoinPrices(c)));

  const fromCache = results.every(r => r.fromCache);
  const cacheAgeMs = Math.max(...results.map(r => r.cacheAgeMs));

  return {
    collateralPrices: results[0].prices,
    loanPrices: results[1].prices,
    intrinsicPrices: intrinsicCoinId && intrinsicCoinId !== collateralCoinId
      ? results[2].prices
      : results[0].prices,
    fromCache,
    cacheAgeMs,
  };
}

/** Force clear cache for a coin (refetch on next call) */
export async function clearPriceCacheForCoin(coinId: string) {
  await supabase.from('price_cache_meta').delete().eq('coin_id', coinId);
}
