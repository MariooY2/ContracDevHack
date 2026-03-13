/**
 * oracleDataCache.ts
 *
 * Unified client-side cache for oracle data from any Chainlink aggregator.
 * Uses the parameterized /api/oracle-data/[address] endpoint.
 * Each oracle address gets its own localStorage cache with 6h TTL.
 */

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export interface OracleDataPoint {
  roundId: number;
  rate: number;
  timestamp: number;
  block: number;
}

export interface OracleDataResult {
  points: OracleDataPoint[];
  pair: string;
  fromCache: boolean;
  cacheAgeMs: number;
}

function cacheKey(address: string) {
  return `volt_oracle_${address.toLowerCase()}`;
}

function metaKey(address: string) {
  return `volt_oracle_meta_${address.toLowerCase()}`;
}

function loadCache(address: string): { points: OracleDataPoint[]; pair: string; lastFetchTs: number } | null {
  try {
    const dataStr = localStorage.getItem(cacheKey(address));
    const metaStr = localStorage.getItem(metaKey(address));
    if (!dataStr || !metaStr) return null;
    const { lastFetchTs, pair } = JSON.parse(metaStr);
    const points: OracleDataPoint[] = JSON.parse(dataStr);
    if (!points.length) return null;
    return { points, pair: pair || 'Unknown', lastFetchTs };
  } catch {
    return null;
  }
}

function saveCache(address: string, points: OracleDataPoint[], pair: string): void {
  try {
    localStorage.setItem(cacheKey(address), JSON.stringify(points));
    localStorage.setItem(metaKey(address), JSON.stringify({ lastFetchTs: Date.now(), pair }));
  } catch (e) {
    console.warn('[oracleDataCache] Could not save:', e);
  }
}

export async function getOracleDataByAddress(
  address: string,
  forceRefresh = false
): Promise<OracleDataResult> {
  const now = Date.now();
  const cached = loadCache(address);

  if (!forceRefresh && cached && now - cached.lastFetchTs < CACHE_TTL) {
    return {
      points: cached.points,
      pair: cached.pair,
      fromCache: true,
      cacheAgeMs: now - cached.lastFetchTs,
    };
  }

  try {
    const refreshParam = forceRefresh ? '?refresh=1' : '';
    const res = await fetch(`/api/oracle-data/${address}${refreshParam}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Oracle API ${res.status}`);
    const { points, pair } = await res.json();
    if (!points?.length) throw new Error('No oracle data returned');
    saveCache(address, points, pair);
    return { points, pair, fromCache: false, cacheAgeMs: 0 };
  } catch (err) {
    if (cached) {
      return {
        points: cached.points,
        pair: cached.pair,
        fromCache: true,
        cacheAgeMs: now - cached.lastFetchTs,
      };
    }
    throw err;
  }
}

export function clearOracleCacheForAddress(address: string): void {
  localStorage.removeItem(cacheKey(address));
  localStorage.removeItem(metaKey(address));
}
