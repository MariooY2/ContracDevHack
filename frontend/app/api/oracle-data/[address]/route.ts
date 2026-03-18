import { NextResponse } from 'next/server';
import { ORACLE_MAP } from '@/lib/oracleMap';
import {
  readOraclePoints,
  syncSingleOracle,
  KNOWN_ORACLES,
  type OraclePoint,
} from '@/lib/oracleSync';

const MEM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (L1 in-memory cache)

// L1 in-memory cache (per serverless instance)
const memCache = new Map<string, { points: OraclePoint[]; pair: string; ts: number }>();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const addr = address.toLowerCase();

  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';
    const chainSlug = searchParams.get('chain') || 'base';

    if (!/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const cacheKey = `${chainSlug}:${addr}`;

    // ── L1: In-memory cache (5min) ──
    const memCached = memCache.get(cacheKey);
    if (!forceRefresh && memCached && Date.now() - memCached.ts < MEM_CACHE_TTL) {
      return NextResponse.json(
        { points: memCached.points, pair: memCached.pair },
        { headers: { 'Cache-Control': 'public, max-age=300' } }
      );
    }

    // ── L2: Supabase (primary read layer) ──
    try {
      const supaResult = await readOraclePoints(addr, chainSlug);
      if (supaResult && supaResult.points.length > 0) {
        console.log(`[oracle-data] Serving ${supaResult.points.length} points for ${addr} from Supabase`);
        memCache.set(cacheKey, { points: supaResult.points, pair: supaResult.pair, ts: Date.now() });
        return NextResponse.json(
          { points: supaResult.points, pair: supaResult.pair },
          { headers: { 'Cache-Control': 'public, max-age=300' } }
        );
      }
    } catch (supaErr) {
      console.warn('[oracle-data] Supabase read failed, falling back to RPC:', supaErr);
    }

    // ── L3: On-demand RPC sync (fallback when Supabase is empty) ──
    const config = Object.values(ORACLE_MAP).find(
      c => c.address.toLowerCase() === addr && c.chainSlug === chainSlug
    );

    if (!config) {
      const pair = KNOWN_ORACLES[addr]?.pair || address;
      return NextResponse.json({ error: `Unknown oracle ${pair} on ${chainSlug}` }, { status: 404 });
    }

    console.log(`[oracle-data] Supabase empty for ${config.pair} on ${chainSlug}, syncing via RPC...`);
    await syncSingleOracle(config);

    // Read back from Supabase after sync
    const supaResult = await readOraclePoints(addr, chainSlug);
    if (supaResult && supaResult.points.length > 0) {
      memCache.set(cacheKey, { points: supaResult.points, pair: supaResult.pair, ts: Date.now() });
      return NextResponse.json(
        { points: supaResult.points, pair: supaResult.pair },
        { headers: { 'Cache-Control': 'public, max-age=300' } }
      );
    }

    return NextResponse.json({ error: 'No oracle data available' }, { status: 404 });
  } catch (err: unknown) {
    // Try returning stale in-memory cache
    const cacheKey = `${new URL(request.url).searchParams.get('chain') || 'base'}:${addr}`;
    const memCached = memCache.get(cacheKey);
    if (memCached) {
      console.warn('[oracle-data] RPC sync failed, returning stale in-memory cache');
      return NextResponse.json(
        { points: memCached.points, pair: memCached.pair },
        { headers: { 'Cache-Control': 'public, max-age=60' } }
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
