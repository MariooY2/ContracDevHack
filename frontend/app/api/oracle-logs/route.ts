import { NextResponse } from 'next/server';

const DUNE_API_KEY = process.env.DUNE_API_KEY;
const DUNE_QUERY_ID = 6791272;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Server-side in-memory cache
let cachedData: { points: { roundId: number; rate: number; timestamp: number; block: number }[]; ts: number } | null = null;

/**
 * GET /api/oracle-logs
 *
 * Fetches wstETH/stETH oracle rounds directly from Dune Analytics.
 * Server-side cached for 6 hours.
 */
export async function GET() {
  try {
    // Return cached data if fresh
    if (cachedData && Date.now() - cachedData.ts < CACHE_TTL) {
      return NextResponse.json({ points: cachedData.points }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (!DUNE_API_KEY) {
      return NextResponse.json({ error: 'DUNE_API_KEY not set' }, { status: 500 });
    }

    console.log(`Fetching oracle data from Dune (query ${DUNE_QUERY_ID})...`);

    const res = await fetch(`https://api.dune.com/api/v1/query/${DUNE_QUERY_ID}/results`, {
      headers: { 'X-Dune-API-Key': DUNE_API_KEY },
    });

    if (!res.ok) {
      throw new Error(`Dune API error: ${res.status}`);
    }

    const json = await res.json();
    const rows = json?.result?.rows;

    if (!rows || rows.length === 0) {
      throw new Error('No data from Dune query');
    }

    // Map Dune columns to our schema
    const points = rows
      .map((row: Record<string, unknown>) => ({
        roundId: Number(row.round_id),
        rate: Number(row.redemption_rate),
        timestamp: Math.floor(new Date(String(row.timestamp)).getTime() / 1000),
        block: Number(row.block_number),
      }))
      .sort((a: { roundId: number }, b: { roundId: number }) => a.roundId - b.roundId);

    console.log(`Fetched ${points.length} oracle rounds from Dune`);

    // Cache in memory
    cachedData = { points, ts: Date.now() };

    return NextResponse.json({ points }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    // Return stale cache if available
    if (cachedData) {
      console.warn('Dune fetch failed, returning stale cache');
      return NextResponse.json({ points: cachedData.points }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
