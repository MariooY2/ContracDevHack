/**
 * priceCache.ts
 * Caches raw DeFiLlama wstETH + ETH price arrays in localStorage.
 *
 * Strategy:
 * - Full fetch (366 days) on first load — store in localStorage
 * - If cache is < 6 h old → return immediately without any API call
 * - If cache is ≥ 6 h old → fetch only the delta since lastFetchTs using
 *   DeFiLlama's /market_chart/range endpoint, merge, and update cache
 *
 * The raw [timestamp_ms, price_usd] arrays are stored; derived values
 * (intrinsic, depeg%) are always recomputed from the latest contract data.
 */

const KEY_WSTETH = 'volt_px_wsteth';
const KEY_ETH    = 'volt_px_eth';
const KEY_STETH  = 'volt_px_steth';
const KEY_META   = 'volt_px_meta';

const FULL_DAYS  = 366;
const CACHE_TTL  = 6 * 60 * 60 * 1000; // 6 hours in ms

interface CacheMeta {
  lastFetchTs:  number; // ms — when we last hit the API
  oldestDataTs: number; // ms — timestamp of the oldest data point we hold
}

export interface PriceData {
  wstethPrices: [number, number][];
  ethPrices:    [number, number][];
  stethPrices:  [number, number][];
  /** true when data came entirely from cache (no API call made) */
  fromCache:    boolean;
  /** age of the cache in ms at the time this was returned */
  cacheAgeMs:   number;
}

// ─── private helpers ─────────────────────────────────────────────────────────

function loadCache(): { wsteth: [number, number][]; eth: [number, number][]; steth: [number, number][]; meta: CacheMeta } | null {
  try {
    const metaStr   = localStorage.getItem(KEY_META);
    const wstethStr = localStorage.getItem(KEY_WSTETH);
    const ethStr    = localStorage.getItem(KEY_ETH);
    const stethStr  = localStorage.getItem(KEY_STETH);
    if (!metaStr || !wstethStr || !ethStr || !stethStr) return null;

    const meta:   CacheMeta        = JSON.parse(metaStr);
    const wsteth: [number, number][] = JSON.parse(wstethStr);
    const eth:    [number, number][] = JSON.parse(ethStr);
    const steth:  [number, number][] = JSON.parse(stethStr);

    if (!wsteth.length || !eth.length || !steth.length) return null;
    return { wsteth, eth, steth, meta };
  } catch {
    return null;
  }
}

function saveCache(
  wsteth: [number, number][],
  eth:    [number, number][],
  steth:  [number, number][],
  meta:   CacheMeta,
): void {
  try {
    localStorage.setItem(KEY_WSTETH, JSON.stringify(wsteth));
    localStorage.setItem(KEY_ETH,    JSON.stringify(eth));
    localStorage.setItem(KEY_STETH,  JSON.stringify(steth));
    localStorage.setItem(KEY_META,   JSON.stringify(meta));
  } catch (e) {
    // Ignore QuotaExceededError — graceful degradation
    console.warn('[priceCache] Could not save to localStorage:', e);
  }
}

/**
 * Merge two price arrays, deduplicating by calendar date (YYYY-MM-DD).
 * Incoming points override existing ones for the same day.
 * Result is sorted ascending by timestamp.
 */
function mergePrices(
  existing: [number, number][],
  incoming: [number, number][],
): [number, number][] {
  const map = new Map<string, [number, number]>();

  for (const pt of existing) {
    map.set(new Date(pt[0]).toISOString().split('T')[0], pt);
  }
  // incoming overrides existing (newer data wins)
  for (const pt of incoming) {
    map.set(new Date(pt[0]).toISOString().split('T')[0], pt);
  }

  return Array.from(map.values()).sort((a, b) => a[0] - b[0]);
}

async function fetchRange(
  coinId: string,
  fromSec: number,
  toSec:   number,
): Promise<[number, number][]> {
  const url = `/api/prices?coinId=${coinId}&from=${fromSec}&to=${toSec}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
  const json = await res.json();
  return json.prices as [number, number][];
}

async function fetchFull(coinId: string): Promise<[number, number][]> {
  const url = `/api/prices?coinId=${coinId}&days=${FULL_DAYS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
  const json = await res.json();
  return json.prices as [number, number][];
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Returns historical wstETH and ETH prices, using localStorage cache to
 * minimise DeFiLlama API calls.
 *
 * Throws only if there is no cached data AND the API call fails.
 * If the API fails but we have stale cache, returns the stale data.
 */
export async function getHistoricalPrices(): Promise<PriceData> {
  const now     = Date.now();
  const cached  = loadCache();

  // ── 1. Fresh cache → return immediately ───────────────────────────────────
  if (cached && now - cached.meta.lastFetchTs < CACHE_TTL) {
    return {
      wstethPrices: cached.wsteth,
      ethPrices:    cached.eth,
      stethPrices:  cached.steth,
      fromCache:    true,
      cacheAgeMs:   now - cached.meta.lastFetchTs,
    };
  }

  // ── 2. Stale cache → incremental update ───────────────────────────────────
  if (cached && cached.wsteth.length > 50) {
    try {
      // Fetch only from lastFetchTs → now (DeFiLlama range uses Unix seconds)
      const fromSec = Math.floor(cached.meta.lastFetchTs / 1000);
      const toSec   = Math.floor(now / 1000);

      const [newWsteth, newEth, newSteth] = await Promise.all([
        fetchRange('wrapped-steth', fromSec, toSec),
        fetchRange('ethereum',      fromSec, toSec),
        fetchRange('staked-ether',  fromSec, toSec),
      ]);

      const merged = {
        wsteth: mergePrices(cached.wsteth, newWsteth),
        eth:    mergePrices(cached.eth,    newEth),
        steth:  mergePrices(cached.steth,  newSteth),
      };

      saveCache(merged.wsteth, merged.eth, merged.steth, {
        lastFetchTs:  now,
        oldestDataTs: cached.meta.oldestDataTs,
      });

      return {
        wstethPrices: merged.wsteth,
        ethPrices:    merged.eth,
        stethPrices:  merged.steth,
        fromCache:    false,
        cacheAgeMs:   0,
      };
    } catch (err) {
      console.warn('[priceCache] Incremental fetch failed, returning stale cache:', err);
      // Return stale rather than crashing
      return {
        wstethPrices: cached.wsteth,
        ethPrices:    cached.eth,
        stethPrices:  cached.steth,
        fromCache:    true,
        cacheAgeMs:   now - cached.meta.lastFetchTs,
      };
    }
  }

  // ── 3. No cache → full initial fetch ─────────────────────────────────────
  const [wstethPrices, ethPrices, stethPrices] = await Promise.all([
    fetchFull('wrapped-steth'),
    fetchFull('ethereum'),
    fetchFull('staked-ether'),
  ]);

  if (!wstethPrices.length || !ethPrices.length || !stethPrices.length) {
    throw new Error('No price data from DeFiLlama');
  }

  saveCache(wstethPrices, ethPrices, stethPrices, {
    lastFetchTs:  now,
    oldestDataTs: wstethPrices[0][0],
  });

  return { wstethPrices, ethPrices, stethPrices, fromCache: false, cacheAgeMs: 0 };
}

/** Force-clear cache (useful for a manual refresh button) */
export function clearPriceCache(): void {
  localStorage.removeItem(KEY_WSTETH);
  localStorage.removeItem(KEY_ETH);
  localStorage.removeItem(KEY_STETH);
  localStorage.removeItem(KEY_META);
}

/** Returns cache metadata without loading full arrays */
export function getPriceCacheMeta(): { lastFetchTs: number; ageMs: number } | null {
  try {
    const raw = localStorage.getItem(KEY_META);
    if (!raw) return null;
    const meta: CacheMeta = JSON.parse(raw);
    return { lastFetchTs: meta.lastFetchTs, ageMs: Date.now() - meta.lastFetchTs };
  } catch {
    return null;
  }
}
