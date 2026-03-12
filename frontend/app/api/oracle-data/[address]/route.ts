import { NextResponse } from 'next/server';

const DUNE_API_KEY = process.env.DUNE_API_KEY;
const CHAINLINK_QUERY_ID = 6811071; // Parameterized query with {{oracle_address}}
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Per-address server-side cache
const cache = new Map<string, { points: OraclePoint[]; pair: string; ts: number }>();

interface OraclePoint {
  roundId: number;
  rate: number;
  timestamp: number;
  block: number;
}

// Known oracle addresses → { pair label, type, queryId, decimals }
interface OracleInfo {
  pair: string;
  type: 'chainlink' | 'custom';
  queryId?: number;
  decimals?: number;
}

const KNOWN_ORACLES: Record<string, OracleInfo> = {
  '0x19e6821ee47a4c23e5971febee29f78c2e514dc8': { pair: 'weETH/eETH', type: 'chainlink' },
  '0x04030d2f38bc799af9b0aab5757adc98000d7ded': { pair: 'wstETH/stETH', type: 'chainlink' },
  '0x16f542bc40723dfe8976a334564ef0c3cfd602fd': { pair: 'cbETH/ETH', type: 'chainlink' },
  '0x222d25e4deacab0ee03e0cb282ab3f602ded6ef2': { pair: 'wrsETH/ETH', type: 'chainlink' },
  '0x484cc23fee336291e3c8803cf27e16b9bee68744': { pair: 'rETH/ETH', type: 'chainlink' },
  '0x6e879d0ccc85085a709ebf5539224f53d0d396b0': { pair: 'yoETH/ETH', type: 'custom', queryId: 6811220, decimals: 6 },
  '0x7fcd174e80f264448ebee8c88a7c4476aaf58ea6': { pair: 'wsuperOETHb/ETH', type: 'custom', queryId: 6811262, decimals: 18 },
};

/**
 * For parameterized queries (Chainlink): execute with params, poll for results.
 * For fixed queries (yoETH etc.): try getLatestResult first, fall back to execute.
 */
async function executeDuneQuery(queryId: number, params?: Record<string, string>): Promise<Record<string, unknown>[]> {
  if (!DUNE_API_KEY) throw new Error('DUNE_API_KEY not set');

  // For non-parameterized queries, try cached results first (much faster)
  if (!params) {
    try {
      const cachedRes = await fetch(`https://api.dune.com/api/v1/query/${queryId}/results?limit=50000`, {
        headers: { 'X-Dune-API-Key': DUNE_API_KEY },
      });
      if (cachedRes.ok) {
        const json = await cachedRes.json();
        if (json.result?.rows?.length > 0) {
          console.log(`Using cached Dune results for query ${queryId} (${json.result.rows.length} rows)`);
          return json.result.rows;
        }
      }
    } catch {
      console.log(`No cached results for query ${queryId}, executing fresh...`);
    }
  }

  const body: Record<string, unknown> = {};
  if (params) body.query_parameters = params;

  const execRes = await fetch(`https://api.dune.com/api/v1/query/${queryId}/execute`, {
    method: 'POST',
    headers: {
      'X-Dune-API-Key': DUNE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!execRes.ok) throw new Error(`Dune execute error: ${execRes.status}`);
  const { execution_id } = await execRes.json();

  // Poll for results (max 120s for slow queries)
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(r => setTimeout(r, 2000));

    const resultRes = await fetch(`https://api.dune.com/api/v1/execution/${execution_id}/results`, {
      headers: { 'X-Dune-API-Key': DUNE_API_KEY },
    });

    if (!resultRes.ok) continue;

    const json = await resultRes.json();
    if (json.state === 'QUERY_STATE_COMPLETED') {
      return json.result?.rows || [];
    }
    if (json.state === 'QUERY_STATE_FAILED') {
      throw new Error('Dune query failed');
    }
  }

  throw new Error('Dune query timed out');
}

function parseChainlinkRows(rows: Record<string, unknown>[]): OraclePoint[] {
  return rows
    .map((row) => ({
      roundId: Number(row.round_id),
      rate: Number(row.redemption_rate),
      timestamp: Math.floor(new Date(String(row.timestamp)).getTime() / 1000),
      block: Number(row.block_number),
    }))
    .sort((a, b) => a.roundId - b.roundId);
}

function parseCustomRows(rows: Record<string, unknown>[], decimals: number): OraclePoint[] {
  return rows
    .map((row, i) => ({
      roundId: Number(row.round_id ?? row.block_number ?? i),
      rate: Number(row.rate ?? row.redemption_rate ?? 0) || (Number(row.price_raw ?? 0) / Math.pow(10, decimals)),
      timestamp: Number(row.update_timestamp ?? 0) || Math.floor(new Date(String(row.block_time ?? row.timestamp ?? 0)).getTime() / 1000),
      block: Number(row.block_number ?? 0),
    }))
    .filter(p => p.rate > 0)
    .sort((a, b) => a.timestamp - b.timestamp || a.block - b.block);
}

/**
 * LTTB (Largest Triangle Three Buckets) — optimal chart downsampling.
 * Picks the point in each bucket that forms the largest triangle with
 * its neighbors, preserving visual peaks/troughs in O(n).
 */
function lttbDownsample(data: OraclePoint[], threshold: number): OraclePoint[] {
  const len = data.length;
  if (threshold >= len || threshold <= 2) return data.slice();

  const sampled: OraclePoint[] = [data[0]];
  const bucketSize = (len - 2) / (threshold - 2);
  let prevIdx = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const currStart = Math.floor(i * bucketSize) + 1;
    const currEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, len - 1);
    const nextStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, len - 1);

    // Average of next bucket = right vertex
    let avgT = 0, avgR = 0;
    const nextLen = nextEnd - nextStart || 1;
    for (let j = nextStart; j < nextEnd; j++) {
      avgT += data[j].timestamp;
      avgR += data[j].rate;
    }
    avgT /= nextLen;
    avgR /= nextLen;

    const pT = data[prevIdx].timestamp;
    const pR = data[prevIdx].rate;

    // Find point with largest triangle area
    let maxArea = -1, bestIdx = currStart;
    for (let j = currStart; j < currEnd; j++) {
      const area = Math.abs(
        (pT - avgT) * (data[j].rate - pR) -
        (pT - data[j].timestamp) * (avgR - pR)
      );
      if (area > maxArea) { maxArea = area; bestIdx = j; }
    }

    sampled.push(data[bestIdx]);
    prevIdx = bestIdx;
  }

  sampled.push(data[len - 1]);
  return sampled;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const addr = address.toLowerCase();

  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';

    if (!/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    // Return cached if fresh
    const cached = cache.get(addr);
    if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({
        points: cached.points,
        pair: cached.pair,
      }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (!DUNE_API_KEY) {
      return NextResponse.json({ error: 'DUNE_API_KEY not set' }, { status: 500 });
    }

    const oracleInfo = KNOWN_ORACLES[addr];
    const pair = oracleInfo?.pair || address;
    console.log(`Fetching oracle data for ${pair} from Dune...`);

    let points: OraclePoint[];

    if (oracleInfo?.type === 'custom' && oracleInfo.queryId) {
      // Custom oracle (yoETH, etc.) — dedicated Dune query, no parameters
      const rows = await executeDuneQuery(oracleInfo.queryId);
      points = parseCustomRows(rows, oracleInfo.decimals || 18);
    } else {
      // Chainlink oracle — parameterized query
      const rows = await executeDuneQuery(CHAINLINK_QUERY_ID, { oracle_address: address });
      points = parseChainlinkRows(rows);
    }

    if (points.length === 0) {
      throw new Error('No data from Dune query');
    }

    // LTTB (Largest Triangle Three Buckets) downsampling
    // O(n) single pass, preserves visual shape (peaks, troughs, trends)
    const LTTB_TARGET = 750;
    if (points.length > LTTB_TARGET) {
      const raw = points.length;
      points = lttbDownsample(points, LTTB_TARGET);
      console.log(`LTTB downsampled ${raw} → ${points.length} points for ${pair}`);
    } else {
      console.log(`Fetched ${points.length} points for ${pair}`);
    }

    cache.set(addr, { points, pair, ts: Date.now() });

    return NextResponse.json({ points, pair }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    const cached = cache.get(addr);
    if (cached) {
      console.warn('Dune fetch failed, returning stale cache');
      return NextResponse.json({
        points: cached.points,
        pair: cached.pair,
      }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
