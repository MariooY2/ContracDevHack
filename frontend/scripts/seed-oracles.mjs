/**
 * seed-oracles.mjs
 *
 * One-time script to seed oracle_rounds from Dune queries.
 * Uses query 6811071 (parameterized by oracle_address) for Base chainlink markets.
 * Uses query 6835721 (parameterized by oracle_address + topic0) for Ethereum.
 * Uses dedicated queries for custom oracles (yoETH: 6811220, wsuperOETHb: 6811262).
 *
 * Usage:
 *   node --env-file=.env scripts/seed-oracles.mjs              # full seed (clears + re-inserts all)
 *   node --env-file=.env scripts/seed-oracles.mjs --only=yoETH/ETH,wsuperOETHb/ETH  # selective seed
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

// ── CLI Args ────────────────────────────────────────────────────────────

const ONLY_ARG = process.argv.find(a => a.startsWith('--only='));
const ONLY_PAIRS = ONLY_ARG ? ONLY_ARG.split('=')[1].split(',').map(s => s.trim()) : null;
const FRESH = process.argv.includes('--fresh');

if (ONLY_PAIRS) {
  console.log(`Selective seed mode: only seeding ${ONLY_PAIRS.join(', ')}`);
}
if (FRESH) {
  console.log(`Fresh mode: executing all queries fresh (skipping cache)`);
}
console.log();

// ── Query IDs ───────────────────────────────────────────────────────────

// Base oracle query (parameterized by oracle_address)
const BASE_QUERY_ID = 6811071;

// Ethereum universal query (parameterized by oracle_address + topic0)
const ETH_UNIVERSAL_QUERY_ID = 6835721;

// All Base oracles to seed
const BASE_ORACLES = [
  { address: '0x04030d2F38Bc799aF9B0AaB5757ADC98000D7DeD', pair: 'wstETH/stETH', type: 'chainlink', chainSlug: 'base' },
  { address: '0x19e6821Ee47a4c23E5971fEBeE29f78C2e514DC8', pair: 'weETH/eETH', type: 'chainlink', chainSlug: 'base' },
  { address: '0x16f542BC40723DfE8976A334564eF0c3CfD602Fd', pair: 'cbETH/ETH', type: 'chainlink', chainSlug: 'base' },
  { address: '0x484Cc23Fee336291E3c8803cF27e16B9BEe68744', pair: 'rETH/ETH', type: 'chainlink', chainSlug: 'base' },
  { address: '0x222d25e4dEacAb0eE03E0cb282Ab3f602dED6EF2', pair: 'wrsETH/ETH', type: 'chainlink', chainSlug: 'base' },
  { address: '0x233A45BF331B35440D45e9BEB1fdF2FbB7B4e3D2', pair: 'ezETH/ETH', type: 'chainlink', chainSlug: 'base' },
  { address: '0x6E879d0CcC85085A709eBf5539224f53d0D396B0', pair: 'yoETH/ETH', type: 'custom', queryId: 6811220, chainSlug: 'base' },
  { address: '0x7FcD174E80f264448ebeE8c88a7C4476AAF58Ea6', pair: 'wsuperOETHb/ETH', type: 'custom', queryId: 6811262, chainSlug: 'base' },
];

// Ethereum oracles to seed
const ETH_ORACLES = [
  { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', pair: 'wstETH/stETH', topic0: '0xff08c3ef606d198e316ef5b822193c489965899eb4e3c248cea1a4626c3eda50', chainSlug: 'ethereum' },
  { address: '0x308861A430be4cce5502d0A12724771Fc6DaF216', pair: 'weETH/eETH', topic0: '0x11c6bf55864ff83827df712625d7a80e5583eef0264921025e7cd22003a21511', chainSlug: 'ethereum' },
  { address: '0x74a09653A083691711cF8215a6ab074BB4e99ef5', pair: 'ezETH/ETH', topic0: '0x4e2ca0515ed1aef1395f66b5303bb5d6f1bf9d61a353fa53f73f8ac9973fa9f6', chainSlug: 'ethereum' },
  { address: '0xD9A442856C234a39a81a089C06451EBAa4306a72', pair: 'pufETH/ETH', topic0: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7', chainSlug: 'ethereum' },
];

// Polygon oracles to seed (dedicated query per oracle)
const POLYGON_ORACLES = [
  { address: '0x8658c53A6f9d1682A2CaE418eE14Fa3240acE03b', pair: 'wstETH/ETH', type: 'custom', queryId: 6873065, chainSlug: 'polygon' },
];

const ALL_ORACLES = [...BASE_ORACLES, ...ETH_ORACLES, ...POLYGON_ORACLES];

// ── Dune API ────────────────────────────────────────────────────────────

const PAGE_SIZE = 30000; // Dune caps at ~32k per request

async function fetchDuneResultsPaginated(url, headers) {
  const allRows = [];
  let offset = 0;

  while (true) {
    const pageUrl = `${url}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) break;
    const json = await res.json();
    const rows = json.result?.rows || [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
    console.log(`  Paginating... fetched ${allRows.length} rows so far`);
  }

  return allRows;
}

async function fetchDuneResults(queryId, params) {
  const headers = { 'X-Dune-API-Key': DUNE_API_KEY };

  // Build query params string for Dune API
  const cacheParams = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      cacheParams.set(`params.${k}`, v);
    }
  }

  // Try cached results first (free) — unless --fresh flag is set
  if (!FRESH) {
    console.log(`  Trying cached results for query ${queryId}...`);
    const baseUrl = `https://api.dune.com/api/v1/query/${queryId}/results?${cacheParams.toString()}`;
    const cachedRows = await fetchDuneResultsPaginated(baseUrl, headers);

    if (cachedRows.length > 0) {
      console.log(`  Got ${cachedRows.length} cached rows`);
      return cachedRows;
    }
  }

  // Execute fresh query
  console.log(`  Executing query ${queryId} fresh...`);
  const body = params && Object.keys(params).length > 0 ? { query_parameters: params } : {};
  const execRes = await fetch(`https://api.dune.com/api/v1/query/${queryId}/execute`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!execRes.ok) {
    const err = await execRes.text().catch(() => '');
    throw new Error(`Dune execute error: ${execRes.status} ${err}`);
  }

  const { execution_id } = await execRes.json();
  console.log(`  Execution started: ${execution_id}`);

  // Poll for completion
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(
      `https://api.dune.com/api/v1/execution/${execution_id}/status`,
      { headers }
    );
    if (!statusRes.ok) continue;
    const json = await statusRes.json();
    if (json.state === 'QUERY_STATE_COMPLETED') {
      // Fetch all results with pagination
      const resultUrl = `https://api.dune.com/api/v1/execution/${execution_id}/results?`;
      const rows = await fetchDuneResultsPaginated(resultUrl, headers);
      console.log(`  Query completed: ${rows.length} rows`);
      return rows;
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
      rate: Number(row.rate || row.redemption_rate || row.answer || row.price || 0),
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

// ── Clear helpers ────────────────────────────────────────────────────────

async function clearAllTables() {
  console.log('Clearing all oracle_rounds and oracle_sync_meta...');
  await supabase.from('oracle_rounds').delete().gte('timestamp', 0);
  await supabase.from('oracle_sync_meta').delete().gte('last_sync_ts', 0);
  console.log('Tables cleared.\n');
}

async function clearOracleData(address, chainSlug) {
  const addr = address.toLowerCase();
  console.log(`  Clearing existing data for ${addr} on ${chainSlug}...`);
  await supabase.from('oracle_rounds').delete().eq('oracle_address', addr).eq('chain_slug', chainSlug);
  await supabase.from('oracle_sync_meta').delete().eq('oracle_address', addr).eq('chain_slug', chainSlug);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Oracle Seed Script ===\n');

  // Determine which oracles to seed
  const targetOracles = ONLY_PAIRS
    ? ALL_ORACLES.filter(o => ONLY_PAIRS.includes(o.pair))
    : ALL_ORACLES;

  if (targetOracles.length === 0) {
    console.error('No matching oracles found for --only filter');
    process.exit(1);
  }

  // Clear: full clear if no --only, per-oracle clear if selective
  if (!ONLY_PAIRS) {
    await clearAllTables();
  } else {
    for (const oracle of targetOracles) {
      await clearOracleData(oracle.address, oracle.chainSlug);
    }
    console.log();
  }

  let totalInserted = 0;

  // Seed Base oracles
  const baseTargets = targetOracles.filter(o => o.chainSlug === 'base');
  if (baseTargets.length > 0) {
    console.log('── Base Oracles ──');
    for (const oracle of baseTargets) {
      console.log(`\n  ${oracle.pair} (${oracle.address}):`);
      try {
        // Custom oracles use their own dedicated query (no params), chainlink uses BASE_QUERY_ID
        const queryId = oracle.queryId || BASE_QUERY_ID;
        const params = oracle.queryId ? {} : { oracle_address: oracle.address };
        const rows = await fetchDuneResults(queryId, params);
        const inserted = await insertPoints(rows, 'base', oracle.address);
        totalInserted += inserted;

        const maxBlock = Math.max(...rows.map(r => Number(r.block_number || 0)), 0);
        await updateSyncMeta(oracle.address, 'base', oracle.pair, oracle.type, inserted, maxBlock);
        console.log(`  ✓ Done: ${inserted} points, max block ${maxBlock}`);
      } catch (err) {
        console.error(`  ✗ ${oracle.pair} seed failed:`, err.message);
      }
    }
  }

  // Seed Ethereum oracles
  const ethTargets = targetOracles.filter(o => o.chainSlug === 'ethereum');
  if (ethTargets.length > 0) {
    console.log('\n\n── Ethereum Oracles ──');
    for (const oracle of ethTargets) {
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
        console.log(`  ✓ Done: ${inserted} points, max block ${maxBlock}`);
      } catch (err) {
        console.error(`  ✗ ${oracle.pair} seed failed:`, err.message);
      }
    }
  }

  // Seed Polygon oracles
  const polyTargets = targetOracles.filter(o => o.chainSlug === 'polygon');
  if (polyTargets.length > 0) {
    console.log('\n\n── Polygon Oracles ──');
    for (const oracle of polyTargets) {
      console.log(`\n  ${oracle.pair} (${oracle.address}):`);
      try {
        const rows = await fetchDuneResults(oracle.queryId, {});
        const inserted = await insertPoints(rows, 'polygon', oracle.address);
        totalInserted += inserted;

        const maxBlock = Math.max(...rows.map(r => Number(r.block_number || 0)), 0);
        await updateSyncMeta(oracle.address, 'polygon', oracle.pair, 'chainlink', inserted, maxBlock);
        console.log(`  ✓ Done: ${inserted} points, max block ${maxBlock}`);
      } catch (err) {
        console.error(`  ✗ ${oracle.pair} seed failed:`, err.message);
      }
    }
  }

  console.log(`\n=== Seed complete: ${totalInserted} total points inserted ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
