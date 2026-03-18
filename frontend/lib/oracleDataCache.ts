/**
 * oracleDataCache.ts
 *
 * Unified client-side cache for oracle data.
 * Uses the parameterized /api/oracle-data/[address] endpoint.
 * Each oracle address+chain gets its own localStorage cache with 6h TTL.
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

function cacheKey(address: string, chainSlug?: string) {
  const chain = chainSlug || 'base';
  return `volt_oracle_${chain}_${address.toLowerCase()}`;
}

function metaKey(address: string, chainSlug?: string) {
  const chain = chainSlug || 'base';
  return `volt_oracle_meta_${chain}_${address.toLowerCase()}`;
}

function loadCache(address: string, chainSlug?: string): { points: OracleDataPoint[]; pair: string; lastFetchTs: number } | null {
  try {
    const dataStr = localStorage.getItem(cacheKey(address, chainSlug));
    const metaStr = localStorage.getItem(metaKey(address, chainSlug));
    if (!dataStr || !metaStr) return null;
    const { lastFetchTs, pair } = JSON.parse(metaStr);
    const points: OracleDataPoint[] = JSON.parse(dataStr);
    if (!points.length) return null;
    return { points, pair: pair || 'Unknown', lastFetchTs };
  } catch {
    return null;
  }
}

function saveCache(address: string, points: OracleDataPoint[], pair: string, chainSlug?: string): void {
  try {
    localStorage.setItem(cacheKey(address, chainSlug), JSON.stringify(points));
    localStorage.setItem(metaKey(address, chainSlug), JSON.stringify({ lastFetchTs: Date.now(), pair }));
  } catch (e) {
    console.warn('[oracleDataCache] Could not save:', e);
  }
}

export async function getOracleDataByAddress(
  address: string,
  forceRefresh = false,
  chainSlug?: string
): Promise<OracleDataResult> {
  const now = Date.now();
  const cached = loadCache(address, chainSlug);

  if (!forceRefresh && cached && now - cached.lastFetchTs < CACHE_TTL) {
    return {
      points: cached.points,
      pair: cached.pair,
      fromCache: true,
      cacheAgeMs: now - cached.lastFetchTs,
    };
  }

  try {
    const params = new URLSearchParams();
    if (forceRefresh) params.set('refresh', '1');
    if (chainSlug) params.set('chain', chainSlug);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/oracle-data/${address}${qs}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Oracle API ${res.status}`);
    const { points, pair } = await res.json();
    if (!points?.length) throw new Error('No oracle data returned');
    saveCache(address, points, pair, chainSlug);
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

export function clearOracleCacheForAddress(address: string, chainSlug?: string): void {
  localStorage.removeItem(cacheKey(address, chainSlug));
  localStorage.removeItem(metaKey(address, chainSlug));
}
