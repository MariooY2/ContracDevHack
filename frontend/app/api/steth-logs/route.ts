import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const ETH_RPC = process.env.ETHEREUM_RPC_URL || 'https://eth.drpc.org';
const STETH_ETH_FEED = '0xC9c8Efa84eaB332d1950e5Ba0a913b090775825c';
const ANSWER_UPDATED_TOPIC = '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f';
const CHUNK = 9999;

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(ETH_RPC, {
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
  return logs.map(l => {
    // topic1 = int256 current (stETH/ETH price in 18 decimals)
    // topic2 = uint256 roundId
    // data = uint256 updatedAt timestamp
    const priceRaw = BigInt(l.topics[1]);
    // Handle signed int256: if top bit set, it's negative (shouldn't happen for price)
    const price = priceRaw > BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      ? Number(priceRaw - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000')) / 1e18
      : Number(priceRaw) / 1e18;
    return {
      round_id: Number(BigInt(l.topics[2])),
      price,
      timestamp: Number(BigInt(l.data)),
      block: parseInt(l.blockNumber, 16),
    };
  });
}

/**
 * GET /api/steth-logs
 *
 * 1. Syncs new rounds from Ethereum mainnet into Supabase
 * 2. Returns all stETH/ETH depeg rounds
 */
export async function GET() {
  try {
    const { data: latestRow } = await supabase
      .from('steth_depeg_rounds')
      .select('block')
      .order('block', { ascending: false })
      .limit(1);

    const lastBlock = latestRow && latestRow.length > 0 ? latestRow[0].block : 0;

    // Incremental sync from on-chain
    if (lastBlock > 0) {
      try {
        const latestHex = await rpc('eth_blockNumber', []);
        const currentBlock = parseInt(latestHex, 16);
        const syncFrom = lastBlock - 100;

        for (let from = syncFrom; from <= currentBlock; from += CHUNK + 1) {
          const to = Math.min(from + CHUNK, currentBlock);
          try {
            const logs: RawLog[] = await rpc('eth_getLogs', [{
              address: STETH_ETH_FEED,
              topics: [ANSWER_UPDATED_TOPIC],
              fromBlock: '0x' + from.toString(16),
              toBlock: '0x' + to.toString(16),
            }]);
            if (logs && logs.length > 0) {
              const rows = parseLogs(logs);
              await supabase
                .from('steth_depeg_rounds')
                .upsert(rows, { onConflict: 'round_id' });
            }
          } catch {
            // non-critical
          }
        }
      } catch {
        // RPC unavailable — still return cached data
      }
    }

    // Read all rounds from Supabase
    const allPoints: { round_id: number; price: number; timestamp: number; block: number }[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from('steth_depeg_rounds')
        .select('round_id, price, timestamp, block')
        .order('round_id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (pageError) throw pageError;
      if (!page || page.length === 0) break;
      allPoints.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const formatted = allPoints.map(p => ({
      roundId: p.round_id,
      price: p.price,
      timestamp: p.timestamp,
      block: p.block,
    }));

    return NextResponse.json({ points: formatted }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
