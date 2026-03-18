/**
 * oracleSync.ts
 *
 * Shared server-side module for oracle data:
 * - RPC log fetching via viem getLogs (replaces Dune)
 * - Supabase read/write for oracle_rounds + oracle_sync_meta
 * - Incremental sync from last_synced_block
 * - Used by both the cron refresh endpoint and the oracle-data API route
 */

import { type Log, decodeAbiParameters, hexToBigInt, numberToHex } from 'viem';
import { supabase } from './supabase';
import { type OracleConfig } from './oracleMap';
import { getPublicClient, type ChainSlug } from './rpcClients';

// ── Constants ───────────────────────────────────────────────────────────

// Chainlink AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
const CHAINLINK_ANSWER_UPDATED_TOPIC =
  '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f' as const;

// ERC-4626 Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)
const ERC4626_DEPOSIT_TOPIC =
  '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7' as const;

// ERC-4626 Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)
const ERC4626_WITHDRAW_TOPIC =
  '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db' as const;

// Max block range per getLogs call (safe for most RPC providers)
const MAX_BLOCK_RANGE = 10_000;

// Approximate blocks per day per chain (for initial backfill range)
const BLOCKS_PER_DAY: Record<string, number> = {
  ethereum: 7_200,
  base: 43_200,
  arbitrum: 345_600,
  polygon: 43_200,
};

// ── Types ───────────────────────────────────────────────────────────────

export interface OraclePoint {
  roundId: number;
  rate: number;
  timestamp: number;
  block: number;
}

// Known oracle addresses → pair label (for lookups when meta is missing)
export const KNOWN_ORACLES: Record<string, { pair: string }> = {
  // Base
  '0x04030d2f38bc799af9b0aab5757adc98000d7ded': { pair: 'wstETH/stETH' },
  '0x19e6821ee47a4c23e5971febee29f78c2e514dc8': { pair: 'weETH/eETH' },
  '0x16f542bc40723dfe8976a334564ef0c3cfd602fd': { pair: 'cbETH/ETH' },
  '0x484cc23fee336291e3c8803cf27e16b9bee68744': { pair: 'rETH/ETH' },
  '0x222d25e4deacab0ee03e0cb282ab3f602ded6ef2': { pair: 'wrsETH/ETH' },
  '0x233a45bf331b35440d45e9beb1fdf2fbb7b4e3d2': { pair: 'ezETH/ETH' },
  '0x6e879d0ccc85085a709ebf5539224f53d0d396b0': { pair: 'yoETH/ETH' },
  '0x7fcd174e80f264448ebee8c88a7c4476aaf58ea6': { pair: 'wsuperOETHb/ETH' },
  // Ethereum
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { pair: 'wstETH/stETH' },
  '0x308861a430be4cce5502d0a12724771fc6daf216': { pair: 'weETH/eETH' },
  '0x74a09653a083691711cf8215a6ab074bb4e99ef5': { pair: 'ezETH/ETH' },
  '0xd9a442856c234a39a81a089c06451ebaa4306a72': { pair: 'pufETH/ETH' },
  '0x66ac817f997efd114edfcccdce99f3268557b32c': { pair: 'osETH/ETH' },
  '0x2a2658fc208ed00e11d96d3f7470618924466877': { pair: 'rsETH/ETH' },
  // Polygon
  '0x1dc2444b54945064c131145cd6b8701e3454c63a': { pair: 'wstETH/ETH' },
  // Arbitrum
  '0xf287a5725e9e78b55ca3aed614ce9bd8ea6d5583': { pair: 'weETH/eETH' },
};

// ── RPC Log Fetching ────────────────────────────────────────────────────

/**
 * Fetch logs in chunked block ranges to stay within RPC limits.
 */
async function fetchLogsChunked(
  chainSlug: string,
  address: `0x${string}`,
  topics: (`0x${string}` | `0x${string}`[] | null)[],
  fromBlock: bigint,
  toBlock: bigint
): Promise<Log[]> {
  const client = getPublicClient(chainSlug as ChainSlug);
  const allLogs: Log[] = [];

  for (let start = fromBlock; start <= toBlock; start += BigInt(MAX_BLOCK_RANGE)) {
    const end = start + BigInt(MAX_BLOCK_RANGE) - 1n > toBlock
      ? toBlock
      : start + BigInt(MAX_BLOCK_RANGE) - 1n;

    // Use raw eth_getLogs to pass topics directly (viem's typed getLogs doesn't accept raw topics)
    const rawLogs = await client.request({
      method: 'eth_getLogs',
      params: [{
        address,
        topics: topics as `0x${string}`[],
        fromBlock: numberToHex(start),
        toBlock: numberToHex(end),
      }],
    });

    const logs: Log[] = (rawLogs as any[]).map((log: any) => ({
      ...log,
      blockNumber: log.blockNumber ? BigInt(log.blockNumber) : null,
      transactionIndex: log.transactionIndex ? Number(log.transactionIndex) : null,
      logIndex: log.logIndex ? Number(log.logIndex) : null,
    }));

    allLogs.push(...logs);
  }

  return allLogs;
}

// ── Event Decoders ──────────────────────────────────────────────────────

/**
 * Decode Chainlink AnswerUpdated logs.
 * topic1 = int256 current (rate in 18 decimals)
 * topic2 = uint256 roundId
 * data   = uint256 updatedAt (unix timestamp)
 */
function decodeChainlinkLogs(logs: Log[]): OraclePoint[] {
  return logs
    .map(log => {
      try {
        if (!log.topics[1] || !log.topics[2] || !log.data) return null;

        const current = hexToBigInt(log.topics[1] as `0x${string}`, { signed: true });
        const roundId = Number(hexToBigInt(log.topics[2] as `0x${string}`));
        const [updatedAt] = decodeAbiParameters([{ type: 'uint256' }], log.data as `0x${string}`);
        const rate = Number(current) / 1e18;

        if (rate <= 0 || !isFinite(rate)) return null;

        return {
          roundId,
          rate,
          timestamp: Number(updatedAt),
          block: Number(log.blockNumber),
        };
      } catch {
        return null;
      }
    })
    .filter((p): p is OraclePoint => p !== null)
    .sort((a, b) => a.block - b.block);
}

/**
 * Decode ERC-4626 Deposit/Withdraw logs for wsuperOETHb.
 * Deposit data: assets (uint256), shares (uint256)
 * Withdraw data: assets (uint256), shares (uint256)
 * rate = assets / shares
 */
function decodeERC4626Logs(logs: Log[]): Omit<OraclePoint, 'timestamp'>[] {
  return logs
    .map((log, i) => {
      try {
        if (!log.data) return null;

        const [assets, shares] = decodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          log.data as `0x${string}`
        );

        if (shares === 0n) return null;
        const rate = Number(assets) / Number(shares);

        if (rate <= 0 || !isFinite(rate)) return null;

        return {
          roundId: Number(log.blockNumber ?? i),
          rate,
          block: Number(log.blockNumber),
        };
      } catch {
        return null;
      }
    })
    .filter((p): p is Omit<OraclePoint, 'timestamp'> => p !== null)
    .sort((a, b) => a.block - b.block);
}

/**
 * Decode Ethereum universal oracle logs.
 * Each oracle has its own event signature (topic0).
 * For osETH/rsETH: same as Chainlink AnswerUpdated.
 * For others: custom per-event decoding.
 */
function decodeEthereumUniversalLogs(
  logs: Log[],
  topic0: string
): Omit<OraclePoint, 'timestamp'>[] {
  // osETH and rsETH use AnswerUpdated — same decode as Chainlink
  if (topic0 === CHAINLINK_ANSWER_UPDATED_TOPIC) {
    return decodeChainlinkLogs(logs).map(p => ({
      roundId: p.roundId,
      rate: p.rate,
      block: p.block,
    }));
  }

  // pufETH uses ERC-4626 Deposit
  if (topic0 === ERC4626_DEPOSIT_TOPIC) {
    return decodeERC4626Logs(logs);
  }

  // wstETH TokenRebased: topic0 = 0xff08c3ef...
  // data = (uint256 reportTimestamp, uint256 timeElapsed, uint256 preTotalShares,
  //         uint256 preTotalEther, uint256 postTotalShares, uint256 postTotalEther)
  if (topic0 === '0xff08c3ef606d198e316ef5b822193c489965899eb4e3c248cea1a4626c3eda50') {
    return logs
      .map((log, i) => {
        try {
          if (!log.data) return null;
          const decoded = decodeAbiParameters(
            [
              { type: 'uint256' }, // reportTimestamp
              { type: 'uint256' }, // timeElapsed
              { type: 'uint256' }, // preTotalShares
              { type: 'uint256' }, // preTotalEther
              { type: 'uint256' }, // postTotalShares
              { type: 'uint256' }, // postTotalEther
            ],
            log.data as `0x${string}`
          );
          const postTotalShares = decoded[4];
          const postTotalEther = decoded[5];
          if (postTotalShares === 0n) return null;
          const rate = Number(postTotalEther) / Number(postTotalShares);
          if (rate <= 0 || !isFinite(rate)) return null;
          return { roundId: Number(log.blockNumber ?? i), rate, block: Number(log.blockNumber) };
        } catch { return null; }
      })
      .filter((p): p is Omit<OraclePoint, 'timestamp'> => p !== null);
  }

  // weETH (0x11c6bf55...) and ezETH (0x4e2ca051...):
  // Generic fallback — try to decode as (uint256, uint256) = (value, total) → rate = value/total
  return logs
    .map((log, i) => {
      try {
        if (!log.data) return null;
        const [val1, val2] = decodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          log.data as `0x${string}`
        );
        if (val2 === 0n) return null;
        const rate = Number(val1) / Number(val2);
        if (rate <= 0 || !isFinite(rate)) return null;
        return { roundId: Number(log.blockNumber ?? i), rate, block: Number(log.blockNumber) };
      } catch { return null; }
    })
    .filter((p): p is Omit<OraclePoint, 'timestamp'> => p !== null);
}

// ── Timestamp Resolution ────────────────────────────────────────────────

/**
 * Resolve timestamps for points that don't have them (non-Chainlink events).
 * Batches getBlock calls and caches results.
 */
async function resolveTimestamps(
  chainSlug: string,
  points: Omit<OraclePoint, 'timestamp'>[],
  blockTimestampCache: Map<number, number>
): Promise<OraclePoint[]> {
  const client = getPublicClient(chainSlug as ChainSlug);

  // Collect unique blocks that aren't cached
  const uncachedBlocks = [...new Set(points.map(p => p.block))]
    .filter(b => !blockTimestampCache.has(b));

  // Fetch in batches of 20
  for (let i = 0; i < uncachedBlocks.length; i += 20) {
    const batch = uncachedBlocks.slice(i, i + 20);
    const results = await Promise.allSettled(
      batch.map(b => client.getBlock({ blockNumber: BigInt(b) }))
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        const block = (results[j] as PromiseFulfilledResult<{ timestamp: bigint }>).value;
        blockTimestampCache.set(batch[j], Number(block.timestamp));
      }
    }
  }

  return points
    .map(p => ({
      ...p,
      timestamp: blockTimestampCache.get(p.block) || 0,
    }))
    .filter(p => p.timestamp > 0);
}

// ── Outlier Filter ──────────────────────────────────────────────────────

function filterOutliers(points: OraclePoint[]): OraclePoint[] {
  if (points.length < 5) return points;
  const sortedRates = points.map(p => p.rate).sort((a, b) => a - b);
  const median = sortedRates[Math.floor(sortedRates.length / 2)];
  return points.filter(p => Math.abs(p.rate - median) / median < 0.2);
}

// ── Fetch Oracle Logs via RPC ───────────────────────────────────────────

/**
 * Fetch new oracle data points via RPC getLogs for a single oracle.
 * Returns decoded OraclePoint[] from fromBlock+1 to toBlock.
 */
async function fetchOracleLogsRPC(
  config: OracleConfig,
  fromBlock: bigint,
  toBlock: bigint,
  blockTimestampCache: Map<number, number>
): Promise<OraclePoint[]> {
  const addr = config.address.toLowerCase() as `0x${string}`;

  if (config.type === 'chainlink') {
    // Chainlink AnswerUpdated — timestamp is in the event data
    const logs = await fetchLogsChunked(
      config.chainSlug,
      addr,
      [CHAINLINK_ANSWER_UPDATED_TOPIC],
      fromBlock,
      toBlock
    );
    return decodeChainlinkLogs(logs);
  }

  if (config.type === 'custom') {
    // wsuperOETHb — ERC-4626 Deposit + Withdraw events
    const logs = await fetchLogsChunked(
      config.chainSlug,
      addr,
      [[ERC4626_DEPOSIT_TOPIC, ERC4626_WITHDRAW_TOPIC]],
      fromBlock,
      toBlock
    );
    const rawPoints = decodeERC4626Logs(logs);
    return resolveTimestamps(config.chainSlug, rawPoints, blockTimestampCache);
  }

  if (config.type === 'ethereum-universal') {
    const topic0 = config.topic0;
    if (!topic0) throw new Error(`No topic0 for ethereum-universal oracle ${addr}`);

    const logs = await fetchLogsChunked(
      config.chainSlug,
      addr,
      [topic0 as `0x${string}`],
      fromBlock,
      toBlock
    );

    // osETH/rsETH use AnswerUpdated — Chainlink decoder handles timestamps
    if (topic0 === CHAINLINK_ANSWER_UPDATED_TOPIC) {
      return decodeChainlinkLogs(logs);
    }

    const rawPoints = decodeEthereumUniversalLogs(logs, topic0);
    const withTimestamps = await resolveTimestamps(config.chainSlug, rawPoints, blockTimestampCache);
    return filterOutliers(withTimestamps);
  }

  return [];
}

// ── Supabase Read/Write ─────────────────────────────────────────────────

export async function readOraclePoints(
  address: string,
  chainSlug: string
): Promise<{ points: OraclePoint[]; pair: string } | null> {
  const addr = address.toLowerCase();

  const { data: meta } = await supabase
    .from('oracle_sync_meta')
    .select('pair')
    .eq('oracle_address', addr)
    .eq('chain_slug', chainSlug)
    .single();

  const { data, error } = await supabase
    .from('oracle_rounds')
    .select('round_id, rate, timestamp, block_number')
    .eq('oracle_address', addr)
    .eq('chain_slug', chainSlug)
    .order('timestamp', { ascending: true });

  if (error || !data || data.length === 0) return null;

  const points: OraclePoint[] = data.map(row => ({
    roundId: row.round_id,
    rate: row.rate,
    timestamp: row.timestamp,
    block: row.block_number,
  }));

  const pair = meta?.pair || KNOWN_ORACLES[addr]?.pair || address;
  return { points, pair };
}

export async function writeOraclePoints(
  address: string,
  chainSlug: string,
  points: OraclePoint[],
  pair: string,
  oracleType: string,
  lastSyncedBlock?: number
): Promise<void> {
  const addr = address.toLowerCase();
  if (points.length === 0) return;

  const rows = points.map(p => ({
    oracle_address: addr,
    chain_slug: chainSlug,
    round_id: p.roundId,
    rate: p.rate,
    timestamp: p.timestamp,
    block_number: p.block,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('oracle_rounds')
      .upsert(chunk, { onConflict: 'oracle_address,chain_slug,timestamp,block_number' });
    if (error) {
      console.warn(`[oracleSync] Upsert error for ${addr}:`, error.message);
    }
  }

  await supabase
    .from('oracle_sync_meta')
    .upsert({
      oracle_address: addr,
      chain_slug: chainSlug,
      pair,
      oracle_type: oracleType,
      last_sync_ts: Date.now(),
      row_count: points.length,
      last_synced_block: lastSyncedBlock || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'oracle_address,chain_slug' });
}

// ── Sync Orchestration ──────────────────────────────────────────────────

/**
 * Get the starting block for incremental sync.
 * Priority: oracle_sync_meta.last_synced_block → MAX(block_number) from oracle_rounds → headBlock - 30 days
 */
async function getFromBlock(
  address: string,
  chainSlug: string,
  headBlock: bigint
): Promise<bigint> {
  const addr = address.toLowerCase();

  // Check sync meta for last_synced_block
  const { data: meta } = await supabase
    .from('oracle_sync_meta')
    .select('last_synced_block')
    .eq('oracle_address', addr)
    .eq('chain_slug', chainSlug)
    .single();

  if (meta?.last_synced_block && meta.last_synced_block > 0) {
    return BigInt(meta.last_synced_block);
  }

  // Fallback: check max block in oracle_rounds
  const { data: maxBlock } = await supabase
    .from('oracle_rounds')
    .select('block_number')
    .eq('oracle_address', addr)
    .eq('chain_slug', chainSlug)
    .order('block_number', { ascending: false })
    .limit(1)
    .single();

  if (maxBlock?.block_number && maxBlock.block_number > 0) {
    return BigInt(maxBlock.block_number);
  }

  // Fallback: 30 days back
  const blocksPerDay = BLOCKS_PER_DAY[chainSlug] || 43_200;
  return headBlock - BigInt(30 * blocksPerDay);
}

/**
 * Sync a single oracle: fetch new logs via RPC → write to Supabase.
 */
export async function syncSingleOracle(
  config: OracleConfig,
  headBlock?: bigint,
  blockTimestampCache?: Map<number, number>
): Promise<{ address: string; pair: string; pointCount: number; newBlocks: number }> {
  const client = getPublicClient(config.chainSlug as ChainSlug);
  const head = headBlock ?? await client.getBlockNumber();
  const fromBlock = await getFromBlock(config.address, config.chainSlug, head);
  const cache = blockTimestampCache ?? new Map<number, number>();

  if (fromBlock >= head) {
    return { address: config.address, pair: config.pair, pointCount: 0, newBlocks: 0 };
  }

  console.log(`[oracleSync] Syncing ${config.pair} on ${config.chainSlug}: blocks ${fromBlock}→${head}`);

  const points = await fetchOracleLogsRPC(config, fromBlock + 1n, head, cache);

  if (points.length > 0) {
    await writeOraclePoints(config.address, config.chainSlug, points, config.pair, config.type, Number(head));
  } else {
    // Update last_synced_block even if no new points (so we don't re-scan)
    await supabase
      .from('oracle_sync_meta')
      .upsert({
        oracle_address: config.address.toLowerCase(),
        chain_slug: config.chainSlug,
        pair: config.pair,
        oracle_type: config.type,
        last_sync_ts: Date.now(),
        row_count: 0,
        last_synced_block: Number(head),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'oracle_address,chain_slug' });
  }

  return {
    address: config.address,
    pair: config.pair,
    pointCount: points.length,
    newBlocks: Number(head - fromBlock),
  };
}

/**
 * Sync all oracles. Groups by chain for efficiency (shared head block + timestamp cache).
 */
export async function syncAllOracles(
  configs: OracleConfig[]
): Promise<{ synced: number; errors: string[]; results: { address: string; pair: string; pointCount: number }[] }> {
  const results: { address: string; pair: string; pointCount: number }[] = [];
  const errors: string[] = [];

  // Group configs by chain
  const byChain = new Map<string, OracleConfig[]>();
  for (const config of configs) {
    const existing = byChain.get(config.chainSlug) || [];
    existing.push(config);
    byChain.set(config.chainSlug, existing);
  }

  // Process all chains in parallel
  const chainPromises = Array.from(byChain.entries()).map(async ([chainSlug, chainConfigs]) => {
    const client = getPublicClient(chainSlug as ChainSlug);
    const headBlock = await client.getBlockNumber();
    const blockTimestampCache = new Map<number, number>();

    // Process oracles for this chain sequentially (share timestamp cache)
    for (const config of chainConfigs) {
      try {
        const result = await syncSingleOracle(config, headBlock, blockTimestampCache);
        results.push(result);
      } catch (err) {
        const msg = `${config.pair} (${config.chainSlug}): ${err instanceof Error ? err.message : 'Unknown error'}`;
        errors.push(msg);
        console.warn(`[oracleSync] Failed: ${msg}`);
      }
    }
  });

  await Promise.allSettled(chainPromises);

  return { synced: results.length, errors, results };
}
