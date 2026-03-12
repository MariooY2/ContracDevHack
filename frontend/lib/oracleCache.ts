/**
 * oracleCache.ts
 *
 * Client-side cache for oracle round data from Dune Analytics.
 * Caches in localStorage with a 6-hour TTL to avoid redundant API calls.
 */

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

  // Fetch from API (Dune Analytics — server-cached, bypass with ?refresh=1)
  try {
    const url = forceRefresh ? '/api/oracle-logs?refresh=1' : '/api/oracle-logs';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Oracle API ${res.status}`);
    const { points } = await res.json();
    if (!points?.length) throw new Error('No oracle data returned');
    saveCache(points);
    return { points, fromCache: false, cacheAgeMs: 0 };
  } catch (err) {
    // If API fails but we have stale cache, return it
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
