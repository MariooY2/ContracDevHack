import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const CACHE_TTL = 5 * 60 * 1000; // 5 min server-side cache

// Server-side in-memory cache
let cachedData: { points: { roundId: number; rate: number; timestamp: number; block: number }[]; ts: number } | null = null;

/**
 * GET /api/oracle-logs
 *
 * Reads wstETH/stETH oracle rounds from Supabase (oracle_rounds table).
 * Server-side cached for 5 minutes.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';

    // Return cached data if fresh (unless force refresh)
    if (!forceRefresh && cachedData && Date.now() - cachedData.ts < CACHE_TTL) {
      return NextResponse.json({ points: cachedData.points }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    const { data: rows, error } = await supabase
      .from('oracle_rounds')
      .select('round_id, rate, timestamp')
      .order('round_id', { ascending: true });

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    if (!rows || rows.length === 0) {
      throw new Error('No oracle data in Supabase. Run /api/oracle-seed first.');
    }

    const points = rows.map((row) => ({
      roundId: Number(row.round_id),
      rate: Number(row.rate),
      timestamp: Number(row.timestamp),
      block: 0,
    }));

    console.log(`Fetched ${points.length} oracle rounds from Supabase`);

    // Cache in memory
    cachedData = { points, ts: Date.now() };

    return NextResponse.json({ points }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (err: unknown) {
    // Return stale cache if available
    if (cachedData) {
      console.warn('Supabase fetch failed, returning stale cache');
      return NextResponse.json({ points: cachedData.points }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
