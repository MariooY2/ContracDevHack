import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const BASE_RPC = 'https://mainnet.base.org';
const ORACLE_ADDRESS = '0x04030d2F38Bc799aF9B0AaB5757ADC98000D7DeD';
const ANSWER_UPDATED_TOPIC = '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f';
const CHUNK = 9999;

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

interface RawLog {
  topics: string[];
  data: string;
  blockNumber: string;
}

function parseLogs(logs: RawLog[]) {
  return logs.map(l => ({
    round_id: Number(BigInt(l.topics[2])),
    rate: Number(BigInt(l.topics[1])) / 1e18,
    timestamp: Number(BigInt(l.data)),
    block: parseInt(l.blockNumber, 16),
  }));
}

/**
 * GET /api/oracle-logs
 *
 * 1. Syncs any new rounds from on-chain into Supabase
 * 2. Returns all oracle rounds from Supabase
 */
export async function GET() {
  try {
    // Get the latest stored block to know where to sync from
    const { data: latestRow } = await supabase
      .from('oracle_rounds')
      .select('block')
      .order('block', { ascending: false })
      .limit(1);

    const lastBlock = latestRow && latestRow.length > 0 ? latestRow[0].block : 0;

    // If we have data, sync only new blocks
    if (lastBlock > 0) {
      const latestHex = await rpc('eth_blockNumber', []);
      const currentBlock = parseInt(latestHex, 16);
      const syncFrom = lastBlock - 100; // small overlap

      // Scan new blocks (usually just 1-2 chunks for ~1 day of data)
      for (let from = syncFrom; from <= currentBlock; from += CHUNK + 1) {
        const to = Math.min(from + CHUNK, currentBlock);
        try {
          const logs: RawLog[] = await rpc('eth_getLogs', [{
            address: ORACLE_ADDRESS,
            topics: [ANSWER_UPDATED_TOPIC],
            fromBlock: '0x' + from.toString(16),
            toBlock: '0x' + to.toString(16),
          }]);
          if (logs && logs.length > 0) {
            const rows = parseLogs(logs);
            await supabase
              .from('oracle_rounds')
              .upsert(rows, { onConflict: 'round_id' });
          }
        } catch {
          // non-critical: we still return cached data
        }
      }
    }

    // Read all rounds from Supabase in pages (default limit is 1000)
    const allPoints: { round_id: number; rate: number; timestamp: number; block: number; tx_hash: string | null }[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from('oracle_rounds')
        .select('round_id, rate, timestamp, block, tx_hash')
        .order('round_id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (pageError) throw pageError;
      if (!page || page.length === 0) break;
      allPoints.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    // Map to expected format
    const formatted = allPoints.map(p => ({
      roundId: p.round_id,
      rate: p.rate,
      timestamp: p.timestamp,
      block: p.block,
      txHash: p.tx_hash,
    }));

    return NextResponse.json({ points: formatted }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
