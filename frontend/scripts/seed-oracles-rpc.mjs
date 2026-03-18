/**
 * seed-oracles-rpc.mjs
 *
 * Seeds oracle_rounds from direct RPC calls (no Dune dependency).
 * Uses viem to fetch historical logs from Base and Ethereum.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-oracles-rpc.mjs
 *
 * Requires env vars:
 *   BASE_RPC_URL, ETHEREUM_RPC_URL (dRPC endpoints)
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
 */

import { createPublicClient, http, decodeAbiParameters, hexToBigInt, numberToHex } from 'viem';
import { mainnet, base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
// Use public RPCs for seeding (no getLogs block range restrictions)
const BASE_RPC = 'https://mainnet.base.org';
const ETH_RPC = 'https://eth.llamarpc.com';

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const baseClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC, { retryCount: 3, retryDelay: 1000, timeout: 30_000 }),
});

const ethClient = createPublicClient({
  chain: mainnet,
  transport: http(ETH_RPC, { retryCount: 3, retryDelay: 1000, timeout: 30_000 }),
});

// ── Event Topics ────────────────────────────────────────────────────────

// Chainlink AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
const CHAINLINK_TOPIC = '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f';

// ERC-4626 Deposit / Withdraw (for wsuperOETHb)
const ERC4626_DEPOSIT = '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7';
const ERC4626_WITHDRAW = '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db';

// yoETH price update event
const YOETH_TOPIC0 = '0x60551cde8ad777c516ddf88d76ba006788da7b927b96c68a5b194da575300260';
const YOETH_TOPIC1 = '0x0000000000000000000000000000000f2eb9f69274678c76222b35eec7588a65';

// ── Oracle Configs ──────────────────────────────────────────────────────

const BASE_ORACLES = [
  // Chainlink AnswerUpdated oracles (start blocks from Dune seed data)
  { address: '0x04030d2F38Bc799aF9B0AaB5757ADC98000D7DeD', pair: 'wstETH/stETH', type: 'chainlink', startBlock: 2_100_000 },
  { address: '0x19e6821Ee47a4c23E5971fEBeE29f78C2e514DC8', pair: 'weETH/eETH', type: 'chainlink', startBlock: 2_100_000 },
  { address: '0x16f542BC40723DfE8976A334564eF0c3CfD602Fd', pair: 'cbETH/ETH', type: 'chainlink', startBlock: 2_100_000 },
  { address: '0x484Cc23Fee336291E3c8803cF27e16B9BEe68744', pair: 'rETH/ETH', type: 'chainlink', startBlock: 2_100_000 },
  { address: '0x222d25e4dEacAb0eE03E0cb282Ab3f602dED6EF2', pair: 'wrsETH/ETH', type: 'chainlink', startBlock: 5_000_000 },
  { address: '0x233A45BF331B35440D45e9BEB1fdF2FbB7B4e3D2', pair: 'ezETH/ETH', type: 'chainlink', startBlock: 5_000_000 },
  // Custom oracles
  { address: '0x6E879d0CcC85085A709eBf5539224f53d0D396B0', pair: 'yoETH/ETH', type: 'yoeth', startBlock: 15_000_000 },
  { address: '0x7FcD174E80f264448ebeE8c88a7C4476AAF58Ea6', pair: 'wsuperOETHb/ETH', type: 'erc4626', startBlock: 18_700_000 },
];

const ETH_ORACLES = [
  { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', pair: 'wstETH/stETH', topic0: '0xff08c3ef606d198e316ef5b822193c489965899eb4e3c248cea1a4626c3eda50', startBlock: 17_000_000 },
  { address: '0x308861A430be4cce5502d0A12724771Fc6DaF216', pair: 'weETH/eETH', topic0: '0x11c6bf55864ff83827df712625d7a80e5583eef0264921025e7cd22003a21511', startBlock: 18_500_000 },
  { address: '0x74a09653A083691711cF8215a6ab074BB4e99ef5', pair: 'ezETH/ETH', topic0: '0x4e2ca0515ed1aef1395f66b5303bb5d6f1bf9d61a353fa53f73f8ac9973fa9f6', startBlock: 18_900_000 },
  { address: '0xD9A442856C234a39a81a089C06451EBAa4306a72', pair: 'pufETH/ETH', topic0: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7', startBlock: 19_100_000 },
  { address: '0x66ac817f997Efd114EDFcccdce99F3268557B32C', pair: 'osETH/ETH', topic0: '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f', startBlock: 18_800_000 },
  { address: '0x2A2658Fc208Ed00e11D96d3F7470618924466877', pair: 'rsETH/ETH', topic0: '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f', startBlock: 19_000_000 },
];

// ── RPC Log Fetching ────────────────────────────────────────────────────

const CHUNK_SIZE = 10_000; // blocks per getLogs call
const REQUEST_DELAY = 200; // ms between requests to avoid rate limits

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchLogsChunked(client, address, topics, fromBlock, toBlock) {
  const allLogs = [];
  const totalChunks = Math.ceil(Number(toBlock - fromBlock) / CHUNK_SIZE);
  let chunkNum = 0;
  let retries = 0;

  for (let start = fromBlock; start <= toBlock; start += BigInt(CHUNK_SIZE)) {
    const end = start + BigInt(CHUNK_SIZE) - 1n > toBlock ? toBlock : start + BigInt(CHUNK_SIZE) - 1n;
    chunkNum++;

    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        const rawLogs = await client.request({
          method: 'eth_getLogs',
          params: [{
            address: address.toLowerCase(),
            topics,
            fromBlock: numberToHex(start),
            toBlock: numberToHex(end),
          }],
        });

        const logs = rawLogs.map(log => ({
          ...log,
          blockNumber: log.blockNumber ? BigInt(log.blockNumber) : null,
        }));

        allLogs.push(...logs);
        success = true;

        if (chunkNum % 50 === 0 || chunkNum === totalChunks) {
          process.stdout.write(`  [${chunkNum}/${totalChunks}] ${allLogs.length} logs | block ${Number(start).toLocaleString()}\n`);
        }
      } catch (err) {
        retries++;
        const isTimeout = err.message?.includes('408') || err.message?.includes('timeout') || err.message?.includes('429');
        if (attempt < 2) {
          const backoff = isTimeout ? 2000 * (attempt + 1) : 500;
          await sleep(backoff);
        } else {
          // Skip this chunk after 3 attempts
          const msg = err.details || err.message || String(err);
          console.warn(`  Skip chunk ${chunkNum} (block ${Number(start)}): ${msg.slice(0, 150)}`);
          // Log full error on first skip for debugging
          if (chunkNum <= 3) console.warn('  Full error:', JSON.stringify({ details: err.details, status: err.status, message: err.message?.slice(0, 300) }));
        }
      }
    }

    // Delay between requests to stay under rate limits
    await sleep(REQUEST_DELAY);
  }

  if (retries > 0) console.log(`  ${retries} retries during fetch`);
  return allLogs;
}

// ── Event Decoders ──────────────────────────────────────────────────────

function decodeChainlinkLogs(logs) {
  return logs
    .map(log => {
      try {
        if (!log.topics?.[1] || !log.topics?.[2] || !log.data) return null;
        const current = hexToBigInt(log.topics[1], { signed: true });
        const roundId = Number(hexToBigInt(log.topics[2]));
        const [updatedAt] = decodeAbiParameters([{ type: 'uint256' }], log.data);
        const rate = Number(current) / 1e18;
        if (rate <= 0 || !isFinite(rate)) return null;
        return { roundId, rate, timestamp: Number(updatedAt), block: Number(log.blockNumber) };
      } catch { return null; }
    })
    .filter(Boolean);
}

function decodeERC4626Logs(logs) {
  return logs
    .map(log => {
      try {
        if (!log.data) return null;
        const [assets, shares] = decodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          log.data
        );
        if (shares === 0n) return null;
        const rate = Number(assets) / Number(shares);
        if (rate <= 0 || !isFinite(rate)) return null;
        return { roundId: Number(log.blockNumber), rate, timestamp: 0, block: Number(log.blockNumber) };
      } catch { return null; }
    })
    .filter(Boolean);
}

function decodeYoETHLogs(logs) {
  return logs
    .map(log => {
      try {
        if (!log.data) return null;
        // data: price_raw (32 bytes) + update_timestamp (32 bytes)
        const [priceRaw, updateTimestamp] = decodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          log.data
        );
        const rate = Number(priceRaw) / 1e6;
        if (rate <= 0 || !isFinite(rate)) return null;
        return { roundId: Number(log.blockNumber), rate, timestamp: Number(updateTimestamp), block: Number(log.blockNumber) };
      } catch { return null; }
    })
    .filter(Boolean);
}

function decodeEthereumUniversalLogs(logs, topic0) {
  // osETH/rsETH use AnswerUpdated — same as Chainlink
  if (topic0 === CHAINLINK_TOPIC) {
    return decodeChainlinkLogs(logs);
  }

  // pufETH uses ERC-4626 Deposit
  if (topic0 === ERC4626_DEPOSIT) {
    return decodeERC4626Logs(logs);
  }

  // wstETH TokenRebased
  if (topic0 === '0xff08c3ef606d198e316ef5b822193c489965899eb4e3c248cea1a4626c3eda50') {
    return logs
      .map(log => {
        try {
          if (!log.data) return null;
          const decoded = decodeAbiParameters(
            [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
             { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
            log.data
          );
          const postTotalShares = decoded[4];
          const postTotalEther = decoded[5];
          if (postTotalShares === 0n) return null;
          const rate = Number(postTotalEther) / Number(postTotalShares);
          if (rate <= 0 || !isFinite(rate)) return null;
          return { roundId: Number(log.blockNumber), rate, timestamp: 0, block: Number(log.blockNumber) };
        } catch { return null; }
      })
      .filter(Boolean);
  }

  // weETH, ezETH: generic (uint256, uint256) = (value, total) → rate
  return logs
    .map(log => {
      try {
        if (!log.data) return null;
        const [val1, val2] = decodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          log.data
        );
        if (val2 === 0n) return null;
        const rate = Number(val1) / Number(val2);
        if (rate <= 0 || !isFinite(rate)) return null;
        return { roundId: Number(log.blockNumber), rate, timestamp: 0, block: Number(log.blockNumber) };
      } catch { return null; }
    })
    .filter(Boolean);
}

// ── Timestamp Resolution ────────────────────────────────────────────────

const blockTimestampCache = new Map();

async function resolveTimestamps(client, points) {
  const needTimestamp = points.filter(p => p.timestamp === 0);
  if (needTimestamp.length === 0) return points;

  const uniqueBlocks = [...new Set(needTimestamp.map(p => p.block))].filter(b => !blockTimestampCache.has(b));
  console.log(`  Resolving timestamps for ${uniqueBlocks.length} unique blocks...`);

  for (let i = 0; i < uniqueBlocks.length; i += 20) {
    const batch = uniqueBlocks.slice(i, i + 20);
    const results = await Promise.allSettled(
      batch.map(b => client.getBlock({ blockNumber: BigInt(b) }))
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        blockTimestampCache.set(batch[j], Number(results[j].value.timestamp));
      }
    }
    if ((i + 20) % 200 === 0) {
      process.stdout.write(`  Resolved ${Math.min(i + 20, uniqueBlocks.length)}/${uniqueBlocks.length} blocks\n`);
    }
  }

  return points
    .map(p => p.timestamp > 0 ? p : { ...p, timestamp: blockTimestampCache.get(p.block) || 0 })
    .filter(p => p.timestamp > 0);
}

// ── Supabase Insert ─────────────────────────────────────────────────────

async function insertPoints(points, chainSlug, oracleAddress) {
  if (!points.length) return 0;

  const rows = points.map(p => ({
    oracle_address: oracleAddress.toLowerCase(),
    chain_slug: chainSlug,
    round_id: p.roundId,
    rate: p.rate,
    timestamp: p.timestamp,
    block_number: p.block,
  }));

  // Deduplicate
  const seen = new Set();
  const deduped = [];
  for (const r of rows) {
    const key = `${r.oracle_address}|${r.chain_slug}|${r.timestamp}|${r.block_number}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(r); }
  }
  if (deduped.length < rows.length) {
    console.log(`  Deduped: ${rows.length} → ${deduped.length}`);
  }

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
  console.log('=== Oracle RPC Seed Script ===\n');

  // Clear tables
  console.log('Clearing oracle_rounds and oracle_sync_meta...');
  await supabase.from('oracle_rounds').delete().neq('id', 0);
  await supabase.from('oracle_sync_meta').delete().neq('last_sync_ts', -1);
  console.log('Tables cleared.\n');

  let totalInserted = 0;

  // ── Base Oracles ──
  const baseHead = await baseClient.getBlockNumber();
  console.log(`Base head block: ${baseHead}\n`);

  console.log('── Base Oracles ──');
  for (const oracle of BASE_ORACLES) {
    console.log(`\n  ${oracle.pair} (${oracle.address}):`);
    const from = BigInt(oracle.startBlock);
    const to = baseHead;

    try {
      let points;

      if (oracle.type === 'chainlink') {
        const logs = await fetchLogsChunked(baseClient, oracle.address, [CHAINLINK_TOPIC], from, to);
        console.log(`  Fetched ${logs.length} logs`);
        points = decodeChainlinkLogs(logs);
      } else if (oracle.type === 'erc4626') {
        const logs = await fetchLogsChunked(baseClient, oracle.address, [[ERC4626_DEPOSIT, ERC4626_WITHDRAW]], from, to);
        console.log(`  Fetched ${logs.length} logs`);
        points = decodeERC4626Logs(logs);
        points = await resolveTimestamps(baseClient, points);
      } else if (oracle.type === 'yoeth') {
        const logs = await fetchLogsChunked(baseClient, oracle.address, [YOETH_TOPIC0, YOETH_TOPIC1], from, to);
        console.log(`  Fetched ${logs.length} logs`);
        points = decodeYoETHLogs(logs);
      }

      if (!points || points.length === 0) {
        console.log(`  No valid points decoded`);
        continue;
      }

      console.log(`  Decoded ${points.length} points (rate sample: ${points[0].rate.toFixed(6)})`);

      const inserted = await insertPoints(points, 'base', oracle.address);
      totalInserted += inserted;

      const maxBlock = Math.max(...points.map(p => p.block));
      await updateSyncMeta(oracle.address, 'base', oracle.pair, oracle.type, inserted, maxBlock);
      console.log(`  Inserted ${inserted} points, max block ${maxBlock}`);
    } catch (err) {
      console.error(`  ${oracle.pair} failed:`, err.message);
    }
  }

  // ── Ethereum Oracles ──
  const ethHead = await ethClient.getBlockNumber();
  console.log(`\n\nEthereum head block: ${ethHead}\n`);

  console.log('── Ethereum Oracles ──');
  for (const oracle of ETH_ORACLES) {
    console.log(`\n  ${oracle.pair} (${oracle.address}):`);
    const from = BigInt(oracle.startBlock);
    const to = ethHead;

    try {
      const logs = await fetchLogsChunked(ethClient, oracle.address, [oracle.topic0], from, to);
      console.log(`  Fetched ${logs.length} logs`);

      let points = decodeEthereumUniversalLogs(logs, oracle.topic0);

      // Resolve timestamps for non-Chainlink events
      if (oracle.topic0 !== CHAINLINK_TOPIC) {
        points = await resolveTimestamps(ethClient, points);
      }

      if (!points || points.length === 0) {
        console.log(`  No valid points decoded`);
        continue;
      }

      // Filter outliers (median ±20%)
      if (points.length > 5) {
        const sortedRates = points.map(p => p.rate).sort((a, b) => a - b);
        const median = sortedRates[Math.floor(sortedRates.length / 2)];
        const before = points.length;
        points = points.filter(p => Math.abs(p.rate - median) / median < 0.2);
        if (points.length < before) {
          console.log(`  Outlier filter: ${before} → ${points.length}`);
        }
      }

      console.log(`  Decoded ${points.length} points (rate sample: ${points[0]?.rate.toFixed(6)})`);

      const inserted = await insertPoints(points, 'ethereum', oracle.address);
      totalInserted += inserted;

      const maxBlock = Math.max(...points.map(p => p.block));
      await updateSyncMeta(oracle.address, 'ethereum', oracle.pair, 'ethereum-universal', inserted, maxBlock);
      console.log(`  Inserted ${inserted} points, max block ${maxBlock}`);
    } catch (err) {
      console.error(`  ${oracle.pair} failed:`, err.message);
    }
  }

  console.log(`\n=== RPC Seed complete: ${totalInserted} total points inserted ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
