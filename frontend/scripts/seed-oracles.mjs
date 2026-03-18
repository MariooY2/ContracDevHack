/**
 * seed-oracles.mjs
 *
 * One-time script to seed oracle_rounds from Dune queries.
 * Uses query 6811071 (parameterized by oracle_address) for all Base markets.
 * Uses query 6835721 (parameterized by oracle_address + topic0) for Ethereum.
 *
 * Usage:
 *   node scripts/seed-oracles.mjs
 *
 * Requires env vars: DUNE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────

const DUNE_API_KEY = process.env.DUNE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!DUNE_API_KEY) { console.error('Missing DUNE_API_KEY'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Base oracle query (parameterized by oracle_address)
const BASE_QUERY_ID = 6811071;

// Ethereum universal query (parameterized by oracle_address + topic0)
const ETH_UNIVERSAL_QUERY_ID = 6835721;

// All Base oracles to seed
const BASE_ORACLES = [
  { address: '0x04030d2F38Bc799aF9B0AaB5757ADC98000D7DeD', pair: 'wstETH/stETH', type: 'chainlink' },
  { address: '0x19e6821Ee47a4c23E5971fEBeE29f78C2e514DC8', pair: 'weETH/eETH', type: 'chainlink' },
  { address: '0x16f542BC40723DfE8976A334564eF0c3CfD602Fd', pair: 'cbETH/ETH', type: 'chainlink' },
  { address: '0x484Cc23Fee336291E3c8803cF27e16B9BEe68744', pair: 'rETH/ETH', type: 'chainlink' },
  { address: '0x222d25e4dEacAb0eE03E0cb282Ab3f602dED6EF2', pair: 'wrsETH/ETH', type: 'chainlink' },
  { address: '0x233A45BF331B35440D45e9BEB1fdF2FbB7B4e3D2', pair: 'ezETH/ETH', type: 'chainlink' },
  { address: '0x6E879d0CcC85085A709eBf5539224f53d0D396B0', pair: 'yoETH/ETH', type: 'custom' },
  { address: '0x7FcD174E80f264448ebeE8c88a7C4476AAF58Ea6', pair: 'wsuperOETHb/ETH', type: 'custom' },
];

// Ethereum oracles to seed
const ETH_ORACLES = [
  { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', pair: 'wstETH/stETH', topic0: '0xff08c3ef606d198e316ef5b822193c489965899eb4e3c248cea1a4626c3eda50' },
  { address: '0x308861A430be4cce5502d0A12724771Fc6DaF216', pair: 'weETH/eETH', topic0: '0x11c6bf55864ff83827df712625d7a80e5583eef0264921025e7cd22003a21511' },
  { address: '0x74a09653A083691711cF8215a6ab074BB4e99ef5', pair: 'ezETH/ETH', topic0: '0x4e2ca0515ed1aef1395f66b5303bb5d6f1bf9d61a353fa53f73f8ac9973fa9f6' },
  { address: '0xD9A442856C234a39a81a089C06451EBAa4306a72', pair: 'pufETH/ETH', topic0: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7' },
  { address: '0x66ac817f997Efd114EDFcccdce99F3268557B32C', pair: 'osETH/ETH', topic0: '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f' },
  { address: '0x2A2658Fc208Ed00e11D96d3F7470618924466877', pair: 'rsETH/ETH', topic0: '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f' },
];

// ── Dune API ────────────────────────────────────────────────────────────

async function fetchDuneResults(queryId, params) {
  // Try cached results first (free)
  const cacheParams = new URLSearchParams({ limit: '50000' });
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      cacheParams.set(`params.${k}`, v);
    }
  }

  console.log(`  Trying cached results for query ${queryId}...`);
  const cachedRes = await fetch(
    `https://api.dune.com/api/v1/query/${queryId}/results?${cacheParams.toString()}`,
    { headers: { 'X-Dune-API-Key': DUNE_API_KEY } }
  );

  if (cachedRes.ok) {
    const json = await cachedRes.json();
    if (json.result?.rows?.length > 0) {
      console.log(`  Got ${json.result.rows.length} cached rows`);
      return json.result.rows;
    }
  }

  // Execute fresh query
  console.log(`  No cache, executing query ${queryId}...`);
  const body = params ? { query_parameters: params } : {};
  const execRes = await fetch(`https://api.dune.com/api/v1/query/${queryId}/execute`, {
    method: 'POST',
    headers: { 'X-Dune-API-Key': DUNE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!execRes.ok) {
    const err = await execRes.text().catch(() => '');
    throw new Error(`Dune execute error: ${execRes.status} ${err}`);
  }

  const { execution_id } = await execRes.json();
  console.log(`  Execution started: ${execution_id}`);

  // Poll for results
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const resultRes = await fetch(
      `https://api.dune.com/api/v1/execution/${execution_id}/results`,
      { headers: { 'X-Dune-API-Key': DUNE_API_KEY } }
    );
    if (!resultRes.ok) continue;
    const json = await resultRes.json();
    if (json.state === 'QUERY_STATE_COMPLETED') {
      console.log(`  Query completed: ${json.result?.rows?.length || 0} rows`);
      return json.result?.rows || [];
    }
    if (json.state === 'QUERY_STATE_FAILED') {
      throw new Error(`Dune query failed: ${JSON.stringify(json.error)}`);
    }
    process.stdout.write('.');
  }
  throw new Error('Dune query timed out');
}

// ── Supabase Insert ─────────────────────────────────────────────────────

async function insertPoints(rows, chainSlug, oracleAddress) {
  if (!rows.length) return 0;

  // Log first row columns for debugging
  console.log(`  Sample row keys: ${Object.keys(rows[0]).join(', ')}`);
  console.log(`  Sample row:`, JSON.stringify(rows[0]).slice(0, 300));

  const points = rows.map(row => {
    // Try multiple column names for timestamp
    let ts = 0;
    if (row.timestamp) {
      ts = typeof row.timestamp === 'string'
        ? Math.floor(new Date(row.timestamp).getTime() / 1000)
        : Number(row.timestamp);
    } else if (row.block_time) {
      ts = typeof row.block_time === 'string'
        ? Math.floor(new Date(row.block_time).getTime() / 1000)
        : Number(row.block_time);
    } else if (row.evt_block_time) {
      ts = typeof row.evt_block_time === 'string'
        ? Math.floor(new Date(row.evt_block_time).getTime() / 1000)
        : Number(row.evt_block_time);
    }

    return {
      oracle_address: oracleAddress.toLowerCase(),
      chain_slug: chainSlug,
      round_id: Number(row.round_id || row.block_number || 0),
      rate: Number(row.rate || row.redemption_rate || row.answer || 0),
      timestamp: ts,
      block_number: Number(row.block_number || row.evt_block_number || 0),
    };
  }).filter(p => p.rate > 0 && p.oracle_address && p.timestamp > 0);

  console.log(`  Valid points after filter: ${points.length} / ${rows.length}`);

  // Deduplicate by composite key
  const seen = new Set();
  const deduped = [];
  for (const p of points) {
    const key = `${p.oracle_address}|${p.chain_slug}|${p.timestamp}|${p.block_number}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }
  if (deduped.length < points.length) {
    console.log(`  Deduped: ${points.length} → ${deduped.length} (removed ${points.length - deduped.length} duplicates)`);
  }

  console.log(`  Inserting ${deduped.length} points into Supabase...`);

  let inserted = 0;
  for (let i = 0; i < deduped.length; i += 500) {
    const chunk = deduped.slice(i, i + 500);
    const { error } = await supabase
      .from('oracle_rounds')
      .upsert(chunk, { onConflict: 'oracle_address,chain_slug,timestamp,block_number' });
    if (error) {
      console.warn(`  Upsert error at chunk ${i}: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
  }

  return inserted;
}

async function updateSyncMeta(address, chainSlug, pair, oracleType, rowCount, maxBlock) {
  await supabase
    .from('oracle_sync_meta')
    .upsert({
      oracle_address: address.toLowerCase(),
      chain_slug: chainSlug,
      pair,
      oracle_type: oracleType,
      last_sync_ts: Date.now(),
      row_count: rowCount,
      last_synced_block: maxBlock,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'oracle_address,chain_slug' });
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Oracle Seed Script ===\n');

  // Clear tables first
  console.log('Clearing oracle_rounds and oracle_sync_meta...');
  await supabase.from('oracle_rounds').delete().neq('id', 0);
  await supabase.from('oracle_sync_meta').delete().neq('last_sync_ts', -1);
  console.log('Tables cleared.\n');

  let totalInserted = 0;

  // Step 1: Seed all Base oracles (query 6811071, parameterized by oracle_address)
  console.log('── Base Oracles (query 6811071) ──');
  for (const oracle of BASE_ORACLES) {
    console.log(`\n  ${oracle.pair} (${oracle.address}):`);
    try {
      const rows = await fetchDuneResults(BASE_QUERY_ID, {
        oracle_address: oracle.address,
      });
      const inserted = await insertPoints(rows, 'base', oracle.address);
      totalInserted += inserted;

      const maxBlock = Math.max(...rows.map(r => Number(r.block_number || 0)), 0);
      await updateSyncMeta(oracle.address, 'base', oracle.pair, oracle.type, inserted, maxBlock);
      console.log(`  Done: ${inserted} points, max block ${maxBlock}`);
    } catch (err) {
      console.error(`  ${oracle.pair} seed failed:`, err.message);
    }
  }

  // Step 2: Seed Ethereum oracles (query 6835721, parameterized by oracle_address + topic0)
  console.log('\n\n── Ethereum Oracles (query 6835721) ──');
  for (const oracle of ETH_ORACLES) {
    console.log(`\n  ${oracle.pair} (${oracle.address}):`);
    try {
      const rows = await fetchDuneResults(ETH_UNIVERSAL_QUERY_ID, {
        oracle_address: oracle.address,
        topic0: oracle.topic0,
      });
      const inserted = await insertPoints(rows, 'ethereum', oracle.address);
      totalInserted += inserted;

      const maxBlock = Math.max(...rows.map(r => Number(r.block_number || 0)), 0);
      await updateSyncMeta(oracle.address, 'ethereum', oracle.pair, 'ethereum-universal', inserted, maxBlock);
      console.log(`  Done: ${inserted} points, max block ${maxBlock}`);
    } catch (err) {
      console.error(`  ${oracle.pair} seed failed:`, err.message);
    }
  }

  console.log(`\n=== Seed complete: ${totalInserted} total points inserted ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
