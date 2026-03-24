/**
 * oracleCache.ts
 *
 * Client-side cache for oracle round data fetched directly from Supabase.
 * Caches in localStorage with a 6-hour TTL to avoid redundant queries.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

const KEY_DATA = 'volt_oracle_data';
const KEY_META = 'volt_oracle_meta';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export interface OracleDataPoint {
  roundId: number;
  rate: number;
  timestamp: number;
  block: number;
  txHash?: string;
}

export interface OracleData {
  points: OracleDataPoint[];
  fromCache: boolean;
  cacheAgeMs: number;
}

function loadCache(): { points: OracleDataPoint[]; lastFetchTs: number } | null {
  try {
    const metaStr = localStorage.getItem(KEY_META);
    const dataStr = localStorage.getItem(KEY_DATA);
    if (!metaStr || !dataStr) return null;
    const { lastFetchTs } = JSON.parse(metaStr);
    const points: OracleDataPoint[] = JSON.parse(dataStr);
    if (!points.length) return null;
    return { points, lastFetchTs };
  } catch {
    return null;
  }
}

function saveCache(points: OracleDataPoint[]): void {
  try {
    localStorage.setItem(KEY_DATA, JSON.stringify(points));
    localStorage.setItem(KEY_META, JSON.stringify({ lastFetchTs: Date.now() }));
  } catch (e) {
    console.warn('[oracleCache] Could not save:', e);
  }
}

export async function getOracleData(forceRefresh = false): Promise<OracleData> {
  const now = Date.now();
  const cached = loadCache();

  // Fresh cache — return immediately (unless force refresh)
  if (!forceRefresh && cached && now - cached.lastFetchTs < CACHE_TTL) {
    return {
      points: cached.points,
      fromCache: true,
      cacheAgeMs: now - cached.lastFetchTs,
    };
  }

  // Fetch directly from Supabase (paginate to get all rows — default limit is 1000)
  try {
    const allRows: { round_id: number; rate: number; timestamp: number }[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: rows, error } = await supabase
        .from('oracle_rounds')
        .select('round_id, rate, timestamp')
        .eq('oracle_address', '0x04030d2f38bc799af9b0aab5757adc98000d7ded')
        .order('round_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Supabase: ${error.message}`);
      if (!rows?.length) break;
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (!allRows.length) throw new Error('No oracle data in Supabase');

    const points: OracleDataPoint[] = allRows.map((row) => ({
      roundId: Number(row.round_id),
      rate: Number(row.rate),
      timestamp: Number(row.timestamp),
      block: 0,
    }));

    saveCache(points);
    return { points, fromCache: false, cacheAgeMs: 0 };
  } catch (err) {
    // If Supabase fails but we have stale cache, return it
    if (cached) {
      return {
        points: cached.points,
        fromCache: true,
        cacheAgeMs: now - cached.lastFetchTs,
      };
    }
    throw err;
  }
}

export function clearOracleCache(): void {
  localStorage.removeItem(KEY_DATA);
  localStorage.removeItem(KEY_META);
}
