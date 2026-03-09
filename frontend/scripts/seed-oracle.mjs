/**
 * Seed script: fetches all AnswerUpdated logs from the oracle and inserts into Supabase.
 * Run with: node scripts/seed-oracle.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kcagsgqypafcwkzjhxng.supabase.co';
const SUPABASE_KEY = 'sb_publishable_25QpvOa-NF6xY9Z_L4TmMQ_P8p6mXnO';
const BASE_RPC = 'https://mainnet.base.org';
const ORACLE = '0x04030d2F38Bc799aF9B0AaB5757ADC98000D7DeD';
const TOPIC = '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f';
const CHUNK = 9999;
const FIRST_BLOCK = 10_440_000;
const CONCURRENCY = 10;
const FORCE_FROM_START = true; // ignore existing data, scan from FIRST_BLOCK

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function rpc(method, params) {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function parseLogs(logs) {
  return logs.map(l => ({
    round_id: Number(BigInt(l.topics[2])),
    rate: Number(BigInt(l.topics[1])) / 1e18,
    timestamp: Number(BigInt(l.data)),
    block: parseInt(l.blockNumber, 16),
  }));
}

async function fetchChunk(from, to) {
  try {
    const logs = await rpc('eth_getLogs', [{
      address: ORACLE,
      topics: [TOPIC],
      fromBlock: '0x' + from.toString(16),
      toBlock: '0x' + to.toString(16),
    }]);
    return logs || [];
  } catch {
    return [];
  }
}

async function main() {
  // Check what we already have
  const { data: latestRow } = await supabase
    .from('oracle_rounds')
    .select('block')
    .order('block', { ascending: false })
    .limit(1);

  const startBlock = FORCE_FROM_START
    ? FIRST_BLOCK
    : (latestRow?.length > 0 ? latestRow[0].block - 100 : FIRST_BLOCK);

  const latestHex = await rpc('eth_blockNumber', []);
  const currentBlock = parseInt(latestHex, 16);

  console.log(`Scanning blocks ${startBlock} → ${currentBlock} (${Math.ceil((currentBlock - startBlock) / CHUNK)} chunks)`);

  let totalInserted = 0;
  let chunksProcessed = 0;

  // Build list of all chunk ranges
  const ranges = [];
  for (let from = startBlock; from <= currentBlock; from += CHUNK + 1) {
    ranges.push([from, Math.min(from + CHUNK, currentBlock)]);
  }

  // Process in parallel batches
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(([from, to]) => fetchChunk(from, to))
    );

    const allRows = [];
    for (const logs of results) {
      if (logs.length > 0) allRows.push(...parseLogs(logs));
    }

    if (allRows.length > 0) {
      const { error } = await supabase
        .from('oracle_rounds')
        .upsert(allRows, { onConflict: 'round_id' });
      if (error) {
        console.error('Supabase error:', error.message);
      } else {
        totalInserted += allRows.length;
      }
    }

    chunksProcessed += batch.length;
    if (chunksProcessed % 100 === 0 || allRows.length > 0) {
      const pct = ((chunksProcessed / ranges.length) * 100).toFixed(1);
      console.log(`  ${pct}% (${chunksProcessed}/${ranges.length} chunks, ${totalInserted} rounds stored)`);
    }
  }

  console.log(`\nDone! Inserted ${totalInserted} rounds from ${chunksProcessed} chunks.`);

  // Verify
  const { count } = await supabase
    .from('oracle_rounds')
    .select('*', { count: 'exact', head: true });
  console.log(`Total rounds in Supabase: ${count}`);
}

main().catch(console.error);
