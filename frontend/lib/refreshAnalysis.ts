/**
 * Oracle-type-aware depeg analysis for Morpho Blue markets.
 *
 * Detects oracle type on-chain (EXCHANGE_RATE, VAULT, MARKET_PRICE, STATIC)
 * and applies the correct risk metric per type:
 *
 *   EXCHANGE_RATE / VAULT → Max drawdown of oracle.price()
 *     (comparing vs intrinsic is tautological — oracle reads same contract)
 *
 *   MARKET_PRICE → Oracle vs chained intrinsic rate
 *     depeg = (oracle_exchange_rate / true_intrinsic_rate - 1) × 100
 *     Supports chained intrinsic (e.g., hgETH → rsETH → ETH)
 *
 *   STATIC → Skip (no depeg possible)
 *
 * INCREMENTAL: On subsequent runs, only fetches blocks newer than the latest
 * timestamp already in oracle_depeg_history. First run backfills SAMPLE_DAYS.
 *
 * Called by /api/cron/refresh-analysis
 */

import { createPublicClient, http, type Address } from 'viem';
import { mainnet, base, arbitrum, polygon } from 'viem/chains';
import { supabase } from './supabase';
import { getRate, TOKENS, type TokenCfg } from './refreshTokenRates';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = any;

// ── Config ───────────────────────────────────────────────────

type ChainSlug = 'ethereum' | 'base' | 'arbitrum' | 'polygon';

const CHAIN_META: Record<ChainSlug, { chainId: number; viemChain: any; blocksPerDay: number }> = {
  ethereum: { chainId: 1,     viemChain: mainnet,   blocksPerDay: 7_200 },
  base:     { chainId: 8453,  viemChain: base,      blocksPerDay: 43_200 },
  arbitrum: { chainId: 42161, viemChain: arbitrum,   blocksPerDay: 345_600 },
  polygon:  { chainId: 137,   viemChain: polygon,    blocksPerDay: 43_200 },
};

const FALLBACK_RPCS: Record<ChainSlug, string> = {
  ethereum: 'https://eth.llamarpc.com',
  base:     'https://mainnet.base.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  polygon:  'https://polygon-rpc.com',
};

const ORACLE_ABI = [{
  inputs: [], name: 'price', outputs: [{ type: 'uint256' }],
  stateMutability: 'view', type: 'function',
}] as const;

/** ABI for detecting Morpho ChainlinkOracleV2 type (7 immutable view functions) */
const ORACLE_TYPE_ABI = [
  { inputs: [], name: 'BASE_FEED_1', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'BASE_FEED_2', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'QUOTE_FEED_1', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'QUOTE_FEED_2', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'VAULT', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'BASE_VAULT', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'QUOTE_VAULT', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const;

/** ABI for ERC4626 asset() — used to detect intermediate tokens */
const ERC4626_ASSET_ABI = [
  { inputs: [], name: 'asset', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const;

/** ABI for ERC4626 convertToAssets — used for chained intrinsic */
const CONVERT_TO_ASSETS_ABI = [
  { inputs: [{ type: 'uint256' }], name: 'convertToAssets', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

type OracleCategory = 'EXCHANGE_RATE' | 'VAULT' | 'MARKET_PRICE' | 'STATIC';

interface OracleTypeInfo {
  category: OracleCategory;
  baseFeed1: Address;
  quoteFeed1: Address;
  vault: Address;
  baseVault: Address;
  quoteVault: Address;
}

const ZERO_ADDR: Address = '0x0000000000000000000000000000000000000000';

/** WETH addresses per chain — used to detect intermediate tokens */
const WETH_ADDRESSES: Record<string, Set<string>> = {
  ethereum: new Set(['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2']),
  base: new Set(['0x4200000000000000000000000000000000000006']),
  arbitrum: new Set(['0x82af49447d8a07e3bd95bd0d56f35241523fbab1']),
};

/** Reverse lookup: lowercase address → TokenCfg for chained intrinsic */
const TOKEN_BY_ADDRESS = new Map<string, TokenCfg>();
for (const t of TOKENS) TOKEN_BY_ADDRESS.set(t.address.toLowerCase(), t);

/** Max days of history on first run (backfill). */
const SAMPLE_DAYS = 180;

/** Samples per day — higher = less likely to miss intraday depeg events. */
const SAMPLES_PER_DAY = 12; // every 2 hours
const SAMPLE_INTERVAL_SECS = 86400 / SAMPLES_PER_DAY;

/** Build a lookup from token symbol → TokenCfg for intrinsic rate fetching */
const TOKEN_BY_SYMBOL = new Map<string, TokenCfg>();
for (const t of TOKENS) TOKEN_BY_SYMBOL.set(t.symbol, t);
if (TOKEN_BY_SYMBOL.has('superOETHb') && !TOKEN_BY_SYMBOL.has('wsuperOETHb')) {
  TOKEN_BY_SYMBOL.set('wsuperOETHb', TOKEN_BY_SYMBOL.get('superOETHb')!);
}

const ETH_TOKENS = new Set([
  'ETH', 'WETH', 'stETH', 'wstETH', 'rETH', 'cbETH', 'weETH',
  'ezETH', 'rsETH', 'pufETH', 'wrsETH', 'ynETHx', 'hgETH',
  'OETH', 'superOETHb', 'LsETH', 'ETH+', 'savETH', 'wbrETH',
  'ETH0', 'yoETH', 'bsdETH', 'agETH', 'rswETH', 'wsuperOETHb',
]);

// ── Types ────────────────────────────────────────────────────

interface MarketEntry {
  marketId: string;
  collateralTokenSymbol: string;
  collateralTokenDecimals: number;
  loanTokenSymbol: string;
  loanTokenDecimals: number;
  marketParams: { oracle: string };
  lltv: number | string;
}

export interface OracleDepegPoint {
  timestamp: number;
  date: string;
  blockNumber: number;
  oraclePrice: number;
  intrinsicPrice: number;
  depegPct: number;
}

export interface AnalysisSummary {
  market_id: string;
  market_name: string;
  lltv: number;
  chain: string;
  chain_id: number;
  max_leverage: number;
  max_depeg_percentage: number;
  theoretical_max_leverage: number;
  conservative_leverage: number;
  moderate_leverage: number;
  aggressive_leverage: number;
  health_factor_at_max_leverage: number;
  oracle_category: OracleCategory;
  depeg_method: string;
}

export interface DepegHistoryRow {
  market_id: string;
  chain: string;
  timestamp_ms: number;
  date: string;
  block_number: number;
  oracle_price: number;
  intrinsic_price: number;
  depeg_pct: number;
}

interface DualSample {
  block: bigint;
  oraclePrice: bigint;
  collateralIntrinsic: number | null;
  loanIntrinsic: number | null;
  timestamp: number;
}

// ── Helpers ──────────────────────────────────────────────────

function timestampToBlock(targetTs: number, headTs: number, headBlock: bigint, blocksPerDay: number): bigint {
  const secondsPerBlock = 86400 / blocksPerDay;
  const diff = headTs - targetTs;
  const blockDiff = Math.floor(diff / secondsPerBlock);
  const result = headBlock - BigInt(blockDiff);
  return result > 0n ? result : 1n;
}

function parseLltv(lltv: number | string): number {
  if (typeof lltv === 'number') return lltv;
  try { return Number(BigInt(lltv)) / 1e18; } catch { return 0; }
}

function resolveIntrinsicChain(
  tokenCfg: TokenCfg,
  clients: Partial<Record<ChainSlug, AnyClient>>,
  heads: Partial<Record<ChainSlug, bigint>>,
  headTimestamps: Partial<Record<ChainSlug, number>>,
) {
  const chainSlug: ChainSlug = tokenCfg.chain === 'optimism' ? 'ethereum' : tokenCfg.chain as ChainSlug;
  return {
    client: clients[chainSlug] || null,
    headBlock: heads[chainSlug] || null,
    headTs: headTimestamps[chainSlug] || null,
    bpd: CHAIN_META[chainSlug]?.blocksPerDay || null,
  };
}

// ── Oracle type detection ────────────────────────────────────

async function detectOracleType(client: AnyClient, oracleAddr: Address): Promise<OracleTypeInfo> {
  const readField = (name: string) =>
    client.readContract({ address: oracleAddr, abi: ORACLE_TYPE_ABI, functionName: name })
      .catch(() => ZERO_ADDR) as Promise<Address>;

  const [baseFeed1, quoteFeed1, vault, baseVault, quoteVault] = await Promise.all([
    readField('BASE_FEED_1'),
    readField('QUOTE_FEED_1'),
    readField('VAULT'),
    readField('BASE_VAULT'),
    readField('QUOTE_VAULT'),
  ]);

  const hasBaseFeed = baseFeed1 !== ZERO_ADDR;
  const hasQuoteFeed = quoteFeed1 !== ZERO_ADDR;
  const hasVault = vault !== ZERO_ADDR || baseVault !== ZERO_ADDR || quoteVault !== ZERO_ADDR;

  let category: OracleCategory;
  if (hasVault && !hasBaseFeed && !hasQuoteFeed) {
    category = 'VAULT';
  } else if (hasBaseFeed && hasQuoteFeed) {
    category = 'MARKET_PRICE';
  } else if (hasBaseFeed && !hasQuoteFeed) {
    category = 'EXCHANGE_RATE';
  } else {
    category = 'STATIC';
  }

  return { category, baseFeed1, quoteFeed1, vault, baseVault, quoteVault };
}

/**
 * For MARKET_PRICE oracles, detect if the collateral's underlying asset
 * is an intermediate token (e.g., hgETH → rsETH) rather than WETH.
 * Returns the TokenCfg for the intermediate token, or null if direct.
 */
async function detectIntermediateToken(
  client: AnyClient,
  collateralAddr: Address,
  chainSlug: ChainSlug,
): Promise<TokenCfg | null> {
  try {
    const underlyingAsset: Address = await client.readContract({
      address: collateralAddr,
      abi: ERC4626_ASSET_ABI,
      functionName: 'asset',
    });

    const wethSet = WETH_ADDRESSES[chainSlug];
    if (!wethSet || wethSet.has(underlyingAsset.toLowerCase())) {
      return null; // Direct to WETH, no chaining needed
    }

    // Look up the intermediate token
    const cfg = TOKEN_BY_ADDRESS.get(underlyingAsset.toLowerCase());
    return cfg || null;
  } catch {
    // Not an ERC4626 token or doesn't have asset() — no chaining
    return null;
  }
}

// ── The Graph: Chainlink feed history ─────────────────────────

/** Subgraph URLs for Chainlink feeds per chain. Override via env: {CHAIN}_GRAPH_URL */
// Chainlink AnswerUpdated event signature for getLogs
const ANSWER_UPDATED_TOPIC = '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f' as const;

interface FeedUpdate {
  blockNumber: number;
  timestamp: number;
}

/**
 * Fetch Chainlink AnswerUpdated events via getLogs directly from RPC.
 * Chunks block ranges to stay within RPC provider limits.
 * Returns sorted list of { blockNumber, timestamp }.
 */
async function fetchFeedUpdatesViaLogs(
  client: AnyClient,
  feedAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<FeedUpdate[]> {
  const results: FeedUpdate[] = [];
  // Chunk size: 50K blocks per request (safe for most providers)
  const CHUNK = 50_000n;

  try {
    for (let start = fromBlock; start <= toBlock; start += CHUNK) {
      const end = start + CHUNK - 1n > toBlock ? toBlock : start + CHUNK - 1n;

      const logs = await client.getLogs({
        address: feedAddress,
        topics: [ANSWER_UPDATED_TOPIC],
        fromBlock: start,
        toBlock: end,
      });

      for (const log of logs) {
        if (log.blockNumber) {
          // AnswerUpdated has `updatedAt` as 3rd non-indexed param
          // But we can get timestamp from block number approximation
          // or from the `updatedAt` field in the log data
          let timestamp = 0;
          if (log.data && log.data.length >= 66) {
            // updatedAt is the first non-indexed arg (uint256) in data
            timestamp = Number(BigInt('0x' + log.data.slice(2, 66)));
          }
          results.push({
            blockNumber: Number(log.blockNumber),
            timestamp,
          });
        }
      }
    }
  } catch (err) {
    console.warn(`  [getLogs] failed for ${feedAddress.slice(0, 10)}…:`, (err as Error).message?.substring(0, 120));
  }

  results.sort((a, b) => a.blockNumber - b.blockNumber);
  return results;
}

/**
 * Sample oracle.price() at specific block numbers returned by The Graph.
 * Supports optional intrinsic rate fetching for MARKET_PRICE oracles.
 */
async function sampleAtSpecificBlocks(
  oracleClient: AnyClient,
  oracleAddr: Address,
  feedUpdates: FeedUpdate[],
  collateralCfg: TokenCfg | null,
  collateralClient: AnyClient | null,
  collateralHead: bigint | null,
  collateralHeadTs: number | null,
  collateralBpd: number | null,
  loanCfg: TokenCfg | null,
  loanClient: AnyClient | null,
  loanHead: bigint | null,
  loanHeadTs: number | null,
  loanBpd: number | null,
  intermediateTokenCfg?: TokenCfg | null,
  intermediateClient?: AnyClient | null,
  intermediateHead?: bigint | null,
  intermediateHeadTs?: number | null,
  intermediateBpd?: number | null,
  collateralAddr?: Address,
): Promise<DualSample[]> {
  const samples: DualSample[] = [];
  const BATCH = 50;

  const hasCollateralIntrinsic = collateralCfg && collateralClient && collateralHead && collateralHeadTs && collateralBpd;
  const hasLoanIntrinsic = loanCfg && loanClient && loanHead && loanHeadTs && loanBpd;
  const hasIntermediate = intermediateTokenCfg && intermediateClient && intermediateHead && intermediateHeadTs && intermediateBpd && collateralAddr;

  for (let start = 0; start < feedUpdates.length; start += BATCH) {
    const batch = feedUpdates.slice(start, start + BATCH);

    const oraclePricePromises = batch.map(fu =>
      oracleClient.readContract({
        address: oracleAddr, abi: ORACLE_ABI, functionName: 'price',
        blockNumber: BigInt(fu.blockNumber),
      }).catch(() => null) as Promise<bigint | null>
    );

    let collateralPromises: Promise<number | null>[];
    if (hasIntermediate) {
      collateralPromises = batch.map(async (fu) => {
        try {
          const cBlock = timestampToBlock(fu.timestamp, collateralHeadTs!, collateralHead!, collateralBpd!);
          const rawAssets = await collateralClient!.readContract({
            address: collateralAddr!,
            abi: CONVERT_TO_ASSETS_ABI,
            functionName: 'convertToAssets',
            args: [BigInt(1e18)],
            blockNumber: cBlock,
          }) as bigint;
          const directRate = Number(rawAssets) / 1e18;
          const iBlock = timestampToBlock(fu.timestamp, intermediateHeadTs!, intermediateHead!, intermediateBpd!);
          const intermediateRate = await getRate(intermediateTokenCfg!, intermediateClient!, iBlock);
          if (!intermediateRate) return directRate;
          return directRate * intermediateRate;
        } catch { return null; }
      });
    } else if (hasCollateralIntrinsic) {
      collateralPromises = batch.map(fu => {
        const block = timestampToBlock(fu.timestamp, collateralHeadTs!, collateralHead!, collateralBpd!);
        return getRate(collateralCfg!, collateralClient!, block).catch(() => null);
      });
    } else {
      collateralPromises = batch.map(() => Promise.resolve(null));
    }

    const loanPromises = hasLoanIntrinsic
      ? batch.map(fu => {
          const block = timestampToBlock(fu.timestamp, loanHeadTs!, loanHead!, loanBpd!);
          return getRate(loanCfg!, loanClient!, block).catch(() => null);
        })
      : batch.map(() => Promise.resolve(null));

    const [oraclePrices, collateralRates, loanRates] = await Promise.all([
      Promise.all(oraclePricePromises),
      Promise.all(collateralPromises),
      Promise.all(loanPromises),
    ]);

    for (let i = 0; i < batch.length; i++) {
      const price = oraclePrices[i];
      if (price !== null && price > 0n) {
        samples.push({
          block: BigInt(batch[i].blockNumber),
          oraclePrice: price,
          collateralIntrinsic: collateralRates[i],
          loanIntrinsic: loanRates[i],
          timestamp: batch[i].timestamp,
        });
      }
    }
  }

  return samples;
}

// ── RPC client creation ──────────────────────────────────────
// Use viem's built-in retry (retryCount + retryDelay) so individual
// readContract / getBlock calls auto-retry on 429 / transient errors
// instead of silently returning null.

async function createClientWithRetry(
  slug: ChainSlug,
): Promise<{ client: AnyClient; headBlock: bigint; headTs: number } | null> {
  const envKey = `${slug.toUpperCase()}_RPC_URL`;
  const rpcUrl = process.env[envKey] || FALLBACK_RPCS[slug];

  try {
    const c = createPublicClient({
      chain: CHAIN_META[slug].viemChain,
      transport: http(rpcUrl, {
        retryCount: 5,
        retryDelay: 2000,
        timeout: 30_000,
        batch: { batchSize: 50, wait: 20 },  // JSON-RPC batching: 50 calls per HTTP request
      }),
      batch: { multicall: true },
    });
    const blockNum = await c.getBlockNumber();
    const block = await c.getBlock({ blockNumber: blockNum });
    const source = process.env[envKey] ? 'Alchemy' : 'fallback';
    console.log(`[refreshAnalysis] ${slug}: head block ${blockNum} via ${source}`);
    return { client: c, headBlock: blockNum, headTs: Number(block.timestamp) };
  } catch (err) {
    console.error(`[refreshAnalysis] ${slug}: RPC failed:`, (err as Error).message?.substring(0, 120));
    return null;
  }
}

// ── Incremental: find how many days to fetch ─────────────────

/**
 * Query oracle_depeg_history for the latest timestamp per market.
 * Returns a map of market_id → latest timestamp_ms already stored.
 */
async function getExistingLatestTimestamps(): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  // Get the max timestamp_ms per market_id using a simple query
  // (Supabase doesn't support GROUP BY easily, so fetch recent rows)
  const { data, error } = await supabase
    .from('oracle_depeg_history')
    .select('market_id, timestamp_ms')
    .order('timestamp_ms', { ascending: false })
    .limit(1000);

  if (error || !data) return map;

  for (const row of data) {
    const existing = map.get(row.market_id);
    if (!existing || row.timestamp_ms > existing) {
      map.set(row.market_id, row.timestamp_ms);
    }
  }

  return map;
}

/**
 * Compute how many days to sample for an oracle group, given existing data.
 * Returns the number of days to fetch (0 = already up to date).
 */
function computeDaysToFetch(
  existingTimestamps: Map<string, number>,
  marketIds: string[],
  headTs: number, // unix seconds
): number {
  // Find the most recent existing timestamp across all markets in this group
  let latestExisting = 0;
  for (const mid of marketIds) {
    const ts = existingTimestamps.get(mid);
    if (ts && ts > latestExisting) latestExisting = ts;
  }

  if (latestExisting === 0) {
    // No existing data — full backfill
    return SAMPLE_DAYS;
  }

  // latestExisting is in milliseconds, headTs is in seconds
  const latestExistingSec = latestExisting / 1000;
  const daysSinceLastUpdate = Math.ceil((headTs - latestExistingSec) / 86400);

  // Add 1 day overlap to handle partial days, cap at SAMPLE_DAYS
  const daysToFetch = Math.min(Math.max(daysSinceLastUpdate + 1, 1), SAMPLE_DAYS);
  return daysToFetch;
}

// ── Sampling ─────────────────────────────────────────────────

/**
 * Sample oracle price and (optionally) intrinsic rates over time.
 * When `intermediateTokenCfg` is provided, the collateral intrinsic is chained:
 *   intrinsic = convertToAssets(1e18) / 1e18 * getRate(intermediate, block)
 */
async function sampleOracleAndIntrinsic(
  oracleClient: AnyClient,
  oracleAddr: Address,
  oracleHeadBlock: bigint,
  oracleHeadTs: number,
  oracleBpd: number,
  collateralCfg: TokenCfg | null,
  collateralClient: AnyClient | null,
  collateralHead: bigint | null,
  collateralHeadTs: number | null,
  collateralBpd: number | null,
  loanCfg: TokenCfg | null,
  loanClient: AnyClient | null,
  loanHead: bigint | null,
  loanHeadTs: number | null,
  loanBpd: number | null,
  daysToFetch: number,
  intermediateTokenCfg?: TokenCfg | null,
  intermediateClient?: AnyClient | null,
  intermediateHead?: bigint | null,
  intermediateHeadTs?: number | null,
  intermediateBpd?: number | null,
  collateralAddr?: Address,
): Promise<DualSample[]> {
  const samples: DualSample[] = [];
  const BATCH = 50;

  const hasCollateralIntrinsic = collateralCfg && collateralClient && collateralHead && collateralHeadTs && collateralBpd;
  const hasLoanIntrinsic = loanCfg && loanClient && loanHead && loanHeadTs && loanBpd;
  const hasIntermediate = intermediateTokenCfg && intermediateClient && intermediateHead && intermediateHeadTs && intermediateBpd && collateralAddr;

  // Total sample points: SAMPLES_PER_DAY per day
  const totalSamples = daysToFetch * SAMPLES_PER_DAY;
  const blocksPerInterval = oracleBpd / SAMPLES_PER_DAY;

  for (let start = 0; start < totalSamples; start += BATCH) {
    const end = Math.min(start + BATCH, totalSamples);
    const sampleOffsets: number[] = [];
    for (let s = start; s < end; s++) sampleOffsets.push(s);

    // Estimate timestamps from block math — avoids costly getBlock RPC calls
    const targetTimestamps = sampleOffsets.map(s => oracleHeadTs - s * SAMPLE_INTERVAL_SECS);
    const oracleBlocks = sampleOffsets.map(s => {
      const b = oracleHeadBlock - BigInt(Math.round(blocksPerInterval * s));
      return b > 0n ? b : 1n;
    });

    const oraclePricePromises = oracleBlocks.map(b =>
      oracleClient.readContract({
        address: oracleAddr, abi: ORACLE_ABI, functionName: 'price', blockNumber: b,
      }).catch(() => null) as Promise<bigint | null>
    );

    // Collateral intrinsic rates
    let collateralPromises: Promise<number | null>[];
    if (hasIntermediate) {
      // Chained intrinsic: convertToAssets(1e18) * getRate(intermediate)
      collateralPromises = targetTimestamps.map(async (ts) => {
        try {
          const cBlock = timestampToBlock(ts, collateralHeadTs!, collateralHead!, collateralBpd!);
          const rawAssets = await collateralClient!.readContract({
            address: collateralAddr!,
            abi: CONVERT_TO_ASSETS_ABI,
            functionName: 'convertToAssets',
            args: [BigInt(1e18)],
            blockNumber: cBlock,
          }) as bigint;
          const directRate = Number(rawAssets) / 1e18;

          const iBlock = timestampToBlock(ts, intermediateHeadTs!, intermediateHead!, intermediateBpd!);
          const intermediateRate = await getRate(intermediateTokenCfg!, intermediateClient!, iBlock);
          if (!intermediateRate) return directRate;

          return directRate * intermediateRate;
        } catch {
          return null;
        }
      });
    } else if (hasCollateralIntrinsic) {
      collateralPromises = targetTimestamps.map(ts => {
        const block = timestampToBlock(ts, collateralHeadTs!, collateralHead!, collateralBpd!);
        return getRate(collateralCfg!, collateralClient!, block).catch(() => null);
      });
    } else {
      collateralPromises = sampleOffsets.map(() => Promise.resolve(null));
    }

    const loanPromises = hasLoanIntrinsic
      ? targetTimestamps.map(ts => {
          const block = timestampToBlock(ts, loanHeadTs!, loanHead!, loanBpd!);
          return getRate(loanCfg!, loanClient!, block).catch(() => null);
        })
      : sampleOffsets.map(() => Promise.resolve(null));

    const [oraclePrices, collateralRates, loanRates] = await Promise.all([
      Promise.all(oraclePricePromises),
      Promise.all(collateralPromises),
      Promise.all(loanPromises),
    ]);

    for (let i = 0; i < sampleOffsets.length; i++) {
      const price = oraclePrices[i];
      if (price !== null && price > 0n) {
        samples.push({
          block: oracleBlocks[i],
          oraclePrice: price,
          collateralIntrinsic: collateralRates[i],
          loanIntrinsic: loanRates[i],
          timestamp: Math.round(targetTimestamps[i]),
        });
      }
    }

    // No sleep needed — JSON-RPC batching on transport handles rate limiting
  }

  return samples;
}

// ── Depeg computation ────────────────────────────────────────

/**
 * EXCHANGE_RATE / VAULT oracles: compute max drawdown of oracle.price().
 * These oracles read the same staking/vault contracts as getRate(),
 * so comparing oracle vs intrinsic is tautological (always ~0%).
 * Instead, track peak-to-trough drawdown as the risk metric.
 */
function computeMaxDrawdown(
  samples: DualSample[],
  collateralDecimals: number,
  loanDecimals: number,
): { maxDepegPct: number; history: OracleDepegPoint[] } {
  if (samples.length < 3) return { maxDepegPct: 0, history: [] };

  const oracleScale = Math.pow(10, 36 + loanDecimals - collateralDecimals);

  // Sort oldest-first for peak tracking
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  const rates = sorted.map(s => Number(s.oraclePrice) / oracleScale);

  let peak = 0;
  let worstDrawdown = 0;
  const drawdowns: number[] = [];

  for (let i = 0; i < rates.length; i++) {
    if (rates[i] > peak) peak = rates[i];
    const dd = peak > 0 ? ((rates[i] / peak) - 1) * 100 : 0; // negative when below peak
    drawdowns.push(dd);
    if (Math.abs(dd) > Math.abs(worstDrawdown)) worstDrawdown = dd;
  }

  const history: OracleDepegPoint[] = sorted.map((s, i) => {
    const d = new Date(s.timestamp * 1000);
    return {
      timestamp: s.timestamp * 1000,
      date: d.toLocaleString('default', { month: 'short', day: 'numeric' }),
      blockNumber: Number(s.block),
      oraclePrice: Math.round(rates[i] * 1e6) / 1e6,
      intrinsicPrice: 0, // no intrinsic comparison for this type
      depegPct: Math.round(drawdowns[i] * 10000) / 10000,
    };
  });

  return {
    maxDepegPct: Math.round(Math.abs(worstDrawdown) * 10000) / 10000,
    history,
  };
}

/**
 * MARKET_PRICE oracles: compare oracle price vs chained intrinsic rate.
 * Risk metric = max(|worst_discount|, |max_premium|) since both are dangerous.
 */
function computeMarketPriceDepeg(
  samples: DualSample[],
  collateralDecimals: number,
  loanDecimals: number,
): { maxDepegPct: number; history: OracleDepegPoint[] } {
  if (samples.length < 3) return { maxDepegPct: 0, history: [] };

  const oracleScale = Math.pow(10, 36 + loanDecimals - collateralDecimals);

  // Sort oldest-first
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);

  const depegValues: number[] = [];
  const history: OracleDepegPoint[] = [];

  for (const s of sorted) {
    const oracleExchangeRate = Number(s.oraclePrice) / oracleScale;

    let depegPct = 0;
    let trueRate = 0;

    if (s.collateralIntrinsic !== null && s.collateralIntrinsic > 0) {
      const loanRate = (s.loanIntrinsic !== null && s.loanIntrinsic > 0) ? s.loanIntrinsic : 1.0;
      trueRate = s.collateralIntrinsic / loanRate;
      depegPct = ((oracleExchangeRate / trueRate) - 1) * 100;
      depegValues.push(depegPct);
    }

    const d = new Date(s.timestamp * 1000);
    history.push({
      timestamp: s.timestamp * 1000,
      date: d.toLocaleString('default', { month: 'short', day: 'numeric' }),
      blockNumber: Number(s.block),
      oraclePrice: Math.round(oracleExchangeRate * 1e6) / 1e6,
      intrinsicPrice: trueRate > 0 ? Math.round(trueRate * 1e6) / 1e6 : 0,
      depegPct: Math.round(depegPct * 10000) / 10000,
    });
  }

  // Risk = max of |worst discount| and |max premium|
  const worstDiscount = depegValues.length > 0 ? Math.min(...depegValues) : 0;
  const maxPremium = depegValues.length > 0 ? Math.max(...depegValues) : 0;
  const riskMetric = Math.max(Math.abs(worstDiscount), Math.abs(maxPremium));

  return {
    maxDepegPct: Math.round(riskMetric * 10000) / 10000,
    history,
  };
}

// ── Compute max depeg from existing + new rows combined ──────

function computeMaxDepegFromRows(
  existingRows: DepegHistoryRow[],
  newRows: DepegHistoryRow[],
): number {
  const allDepegs: number[] = [];
  for (const r of existingRows) {
    if (r.depeg_pct !== 0) allDepegs.push(r.depeg_pct);
  }
  for (const r of newRows) {
    if (r.depeg_pct !== 0) allDepegs.push(r.depeg_pct);
  }
  if (allDepegs.length === 0) return 0;
  const minDepeg = Math.min(...allDepegs);
  return Math.round(Math.abs(minDepeg) * 10000) / 10000;
}

// ── Leverage tier computation (matches Python exactly) ───────

function computeTiers(lltv: number, maxDepegPct: number) {
  const theoreticalMax = 1 / (1 - lltv);

  const absMaxDepeg = maxDepegPct;
  const safeThreshold = absMaxDepeg * 1.2;
  const safeThresholdDecimal = safeThreshold / 100;
  const denom = 1 - lltv * (1 - safeThresholdDecimal);
  const safeMax = denom > 0 ? Math.min(1 / denom, theoreticalMax) : theoreticalMax;

  const conservative = Math.round(safeMax * 0.60 * 100) / 100;
  const moderate     = Math.round(safeMax * 0.80 * 100) / 100;
  const aggressive   = Math.round(safeMax * 1.00 * 100) / 100;

  const hf = safeMax > 1 ? (safeMax * lltv) / (safeMax - 1) : 999;

  return {
    max_leverage:                    Math.round(safeMax * 100) / 100,
    theoretical_max_leverage:        Math.round(theoreticalMax * 100) / 100,
    conservative_leverage:           conservative,
    moderate_leverage:               moderate,
    aggressive_leverage:             aggressive,
    health_factor_at_max_leverage:   Math.round(hf * 1000) / 1000,
  };
}

// ── Public API ───────────────────────────────────────────────

export async function refreshAllAnalysis(): Promise<{
  ethAnalysis: Record<string, AnalysisSummary[]>;
  stableAnalysis: Record<string, AnalysisSummary[]>;
  depegRows: DepegHistoryRow[];
  summary: { chain: string; ethPairs: number; stablePairs: number }[];
}> {
  // 1. Load current markets from Supabase
  const { data: row } = await supabase
    .from('morpho_data')
    .select('data')
    .eq('key', 'markets_all_chains')
    .single();

  if (!row?.data) {
    throw new Error('No markets data in Supabase — run refresh-markets first');
  }

  const marketsByChain = row.data as Record<string, MarketEntry[]>;

  // 2. Check existing data to determine incremental range
  const existingTimestamps = await getExistingLatestTimestamps();
  const isIncremental = existingTimestamps.size > 0;
  console.log(`[refreshAnalysis] Mode: ${isIncremental ? `incremental (${existingTimestamps.size} markets have data)` : `full backfill (${SAMPLE_DAYS} days)`}`);

  // 3. Create RPC clients with retry
  const clients: Partial<Record<ChainSlug, AnyClient>> = {};
  const heads: Partial<Record<ChainSlug, bigint>> = {};
  const headTimestamps: Partial<Record<ChainSlug, number>> = {};

  for (const slug of Object.keys(CHAIN_META) as ChainSlug[]) {
    const result = await createClientWithRetry(slug);
    if (result) {
      clients[slug] = result.client;
      heads[slug] = result.headBlock;
      headTimestamps[slug] = result.headTs;
    }
  }

  // 4. Deduplicate oracles
  const oracleGroups = new Map<string, {
    chain: ChainSlug;
    oracle: Address;
    markets: (MarketEntry & { chainId: number })[];
  }>();

  for (const [chainSlug, markets] of Object.entries(marketsByChain)) {
    const chainId = CHAIN_META[chainSlug as ChainSlug]?.chainId ?? 0;
    for (const m of markets) {
      const oracleAddr = m.marketParams?.oracle;
      if (!oracleAddr) continue;
      const key = `${chainSlug}:${oracleAddr.toLowerCase()}`;
      if (!oracleGroups.has(key)) {
        oracleGroups.set(key, { chain: chainSlug as ChainSlug, oracle: oracleAddr as Address, markets: [] });
      }
      oracleGroups.get(key)!.markets.push({ ...m, chainId });
    }
  }

  console.log(`[refreshAnalysis] ${oracleGroups.size} unique oracles across ${Object.keys(marketsByChain).length} chains`);

  // 5. Sample oracle + intrinsic prices & compute depeg per oracle group
  const ethAnalysis: Record<string, AnalysisSummary[]> = {};
  const stableAnalysis: Record<string, AnalysisSummary[]> = {};
  const newDepegRows: DepegHistoryRow[] = [];

  let processedOracles = 0;
  let skippedOracles = 0;

  // Process oracle groups in parallel (6 at a time — JSON-RPC batching reduces HTTP load)
  const PARALLEL_GROUPS = 6;
  const groupEntries = Array.from(oracleGroups.entries());

  async function processOracleGroup(key: string, group: typeof oracleGroups extends Map<string, infer V> ? V : never) {
    const oracleClient = clients[group.chain];
    const oracleHead = heads[group.chain];
    const oracleHeadTs = headTimestamps[group.chain];
    if (!oracleClient || !oracleHead || !oracleHeadTs) return null;

    const oracleBpd = CHAIN_META[group.chain].blocksPerDay;
    const firstMarket = group.markets[0];
    const marketIds = group.markets.map(m => m.marketId);
    const collateralSymbol = firstMarket.collateralTokenSymbol;
    const loanSymbol = firstMarket.loanTokenSymbol;
    const collateralDec = firstMarket.collateralTokenDecimals ?? 18;
    const loanDec = firstMarket.loanTokenDecimals ?? 18;

    // Step 1: Detect oracle type on-chain (only at current block — fast)
    const oracleType = await detectOracleType(oracleClient, group.oracle);
    console.log(`  [${key}] ${collateralSymbol}/${loanSymbol} — oracle type: ${oracleType.category}`);

    // STATIC oracles: no depeg possible, return zero risk
    if (oracleType.category === 'STATIC') {
      const results: AnalysisSummary[] = group.markets.map(m => {
        const lltv = parseLltv(m.lltv);
        const tiers = computeTiers(lltv, 0);
        return {
          market_id: m.marketId,
          market_name: `${m.collateralTokenSymbol}/${m.loanTokenSymbol}`,
          lltv: Math.round(lltv * 1000) / 10,
          chain: group.chain,
          chain_id: m.chainId,
          max_depeg_percentage: 0,
          oracle_category: 'STATIC' as OracleCategory,
          depeg_method: 'none',
          ...tiers,
        };
      });
      return { groupNewRows: [], results, chain: group.chain, firstMarket };
    }

    try {
      let samples: DualSample[];
      let depegResult: { maxDepegPct: number; history: OracleDepegPoint[] };
      let methodLabel: string;

      const daysToFetch = computeDaysToFetch(existingTimestamps, marketIds, oracleHeadTs);
      if (daysToFetch <= 0) { skippedOracles++; return null; }

      const fromTimestamp = oracleHeadTs - daysToFetch * 86400;
      const fromBlock = oracleHead - BigInt(daysToFetch) * BigInt(oracleBpd);

      // Fetch Chainlink AnswerUpdated events via getLogs (works on all chains)
      let feedUpdates: FeedUpdate[] = [];
      if (oracleType.baseFeed1 !== ZERO_ADDR) {
        feedUpdates = await fetchFeedUpdatesViaLogs(oracleClient, oracleType.baseFeed1, fromBlock, oracleHead);

        // For MARKET_PRICE, also get quote feed updates
        if (oracleType.category === 'MARKET_PRICE' && oracleType.quoteFeed1 !== ZERO_ADDR) {
          const quoteUpdates = await fetchFeedUpdatesViaLogs(oracleClient, oracleType.quoteFeed1, fromBlock, oracleHead);
          const seen = new Set(feedUpdates.map(u => u.blockNumber));
          for (const qu of quoteUpdates) {
            if (!seen.has(qu.blockNumber)) {
              feedUpdates.push(qu);
              seen.add(qu.blockNumber);
            }
          }
          feedUpdates.sort((a, b) => a.blockNumber - b.blockNumber);
        }

        if (feedUpdates.length > 0) {
          console.log(`    → getLogs: ${feedUpdates.length} AnswerUpdated events`);
        }
      }

      const useEventDriven = feedUpdates.length >= 20;

      if (oracleType.category === 'EXCHANGE_RATE' || oracleType.category === 'VAULT') {
        // ── EXCHANGE_RATE/VAULT: max drawdown of oracle.price() ──
        if (useEventDriven) {
          samples = await sampleAtSpecificBlocks(
            oracleClient, group.oracle, feedUpdates,
            null, null, null, null, null,
            null, null, null, null, null,
          );
          depegResult = computeMaxDrawdown(samples, collateralDec, loanDec);
          methodLabel = `event-driven max-drawdown (${oracleType.category}, ${feedUpdates.length} updates, ${samples.length} pts)`;
        } else {
          samples = await sampleOracleAndIntrinsic(
            oracleClient, group.oracle, oracleHead, oracleHeadTs, oracleBpd,
            null, null, null, null, null,
            null, null, null, null, null,
            daysToFetch,
          );
          depegResult = computeMaxDrawdown(samples, collateralDec, loanDec);
          methodLabel = `fixed-interval max-drawdown (${oracleType.category}, ${samples.length} pts)`;
        }

      } else {
        // ── MARKET_PRICE: oracle vs chained intrinsic rate ──
        const collateralCfg = TOKEN_BY_SYMBOL.get(collateralSymbol) || null;
        let cClient: AnyClient | null = null, cHead: bigint | null = null, cHeadTs: number | null = null, cBpd: number | null = null;
        if (collateralCfg) {
          const r = resolveIntrinsicChain(collateralCfg, clients, heads, headTimestamps);
          cClient = r.client; cHead = r.headBlock; cHeadTs = r.headTs; cBpd = r.bpd;
        }

        const loanCfg = TOKEN_BY_SYMBOL.get(loanSymbol) || null;
        let lClient: AnyClient | null = null, lHead: bigint | null = null, lHeadTs: number | null = null, lBpd: number | null = null;
        if (loanCfg) {
          const r = resolveIntrinsicChain(loanCfg, clients, heads, headTimestamps);
          lClient = r.client; lHead = r.headBlock; lHeadTs = r.headTs; lBpd = r.bpd;
        }

        let intermediateTokenCfg: TokenCfg | null = null;
        let iClient: AnyClient | null = null, iHead: bigint | null = null, iHeadTs: number | null = null, iBpd: number | null = null;
        let collTokenAddr: Address | undefined;

        if (collateralCfg && cClient) {
          collTokenAddr = collateralCfg.address;
          intermediateTokenCfg = await detectIntermediateToken(cClient, collateralCfg.address, collateralCfg.chain as ChainSlug);
          if (intermediateTokenCfg) {
            const r = resolveIntrinsicChain(intermediateTokenCfg, clients, heads, headTimestamps);
            iClient = r.client; iHead = r.headBlock; iHeadTs = r.headTs; iBpd = r.bpd;
            console.log(`    → chained intrinsic: ${collateralSymbol} → ${intermediateTokenCfg.symbol}`);
          }
        }

        if (useEventDriven) {
          samples = await sampleAtSpecificBlocks(
            oracleClient, group.oracle, feedUpdates,
            collateralCfg, cClient, cHead, cHeadTs, cBpd,
            loanCfg, lClient, lHead, lHeadTs, lBpd,
            intermediateTokenCfg, iClient, iHead, iHeadTs, iBpd,
            collTokenAddr,
          );
          depegResult = computeMarketPriceDepeg(samples, collateralDec, loanDec);
          const cHits = samples.filter(s => s.collateralIntrinsic !== null && s.collateralIntrinsic > 0).length;
          const chainLabel = intermediateTokenCfg ? `chained via ${intermediateTokenCfg.symbol}` : 'direct';
          methodLabel = `event-driven market-price (${chainLabel}, c=${cHits}/${samples.length}, ${feedUpdates.length} updates)`;
        } else {
          samples = await sampleOracleAndIntrinsic(
            oracleClient, group.oracle, oracleHead, oracleHeadTs, oracleBpd,
            collateralCfg, cClient, cHead, cHeadTs, cBpd,
            loanCfg, lClient, lHead, lHeadTs, lBpd,
            daysToFetch,
            intermediateTokenCfg, iClient, iHead, iHeadTs, iBpd,
            collTokenAddr,
          );
          depegResult = computeMarketPriceDepeg(samples, collateralDec, loanDec);
          const cHits = samples.filter(s => s.collateralIntrinsic !== null && s.collateralIntrinsic > 0).length;
          const chainLabel = intermediateTokenCfg ? `chained via ${intermediateTokenCfg.symbol}` : 'direct';
          methodLabel = `fixed-interval market-price (${chainLabel}, c=${cHits}/${samples.length})`;
        }
      }

      const { maxDepegPct, history: newHistory } = depegResult;

      const groupNewRows: DepegHistoryRow[] = [];
      for (const m of group.markets) {
        for (const pt of newHistory) {
          groupNewRows.push({
            market_id: m.marketId,
            chain: group.chain,
            timestamp_ms: pt.timestamp,
            date: pt.date,
            block_number: pt.blockNumber,
            oracle_price: pt.oraclePrice,
            intrinsic_price: pt.intrinsicPrice,
            depeg_pct: pt.depegPct,
          });
        }
      }

      // Combine with existing data for overall max depeg
      let existingRows: DepegHistoryRow[] = [];
      if (isIncremental && marketIds.length > 0) {
        const { data: existing } = await supabase
          .from('oracle_depeg_history')
          .select('market_id, depeg_pct')
          .eq('market_id', marketIds[0])
          .neq('depeg_pct', 0);
        if (existing) existingRows = existing as DepegHistoryRow[];
      }

      const combinedMaxDepeg = computeMaxDepegFromRows(existingRows, groupNewRows);
      // Use the larger of combined historical max and current batch max
      const finalMaxDepeg = Math.max(combinedMaxDepeg, maxDepegPct);

      console.log(`  [${key}] ${collateralSymbol}/${loanSymbol} | ${samples.length} pts, risk=${finalMaxDepeg}% (${methodLabel})`);

      const results: AnalysisSummary[] = [];
      for (const m of group.markets) {
        const lltv = parseLltv(m.lltv);
        const tiers = computeTiers(lltv, finalMaxDepeg);
        results.push({
          market_id: m.marketId,
          market_name: `${m.collateralTokenSymbol}/${m.loanTokenSymbol}`,
          lltv: Math.round(lltv * 1000) / 10,
          chain: group.chain,
          chain_id: m.chainId,
          max_depeg_percentage: finalMaxDepeg,
          oracle_category: oracleType.category,
          depeg_method: methodLabel,
          ...tiers,
        });
      }

      return { groupNewRows, results, chain: group.chain, firstMarket };
    } catch (err) {
      console.warn(`  [${key}] oracle sampling failed:`, err);
      return null;
    }
  }

  // Process in parallel batches of PARALLEL_GROUPS
  for (let i = 0; i < groupEntries.length; i += PARALLEL_GROUPS) {
    const batch = groupEntries.slice(i, i + PARALLEL_GROUPS);
    const results = await Promise.all(
      batch.map(([key, group]) => processOracleGroup(key, group))
    );

    for (const res of results) {
      if (!res) continue;
      processedOracles++;
      newDepegRows.push(...res.groupNewRows);
      for (const r of res.results) {
        const isEth = ETH_TOKENS.has(r.market_name.split('/')[0]) && ETH_TOKENS.has(r.market_name.split('/')[1]);
        const target = isEth ? ethAnalysis : stableAnalysis;
        if (!target[r.chain]) target[r.chain] = [];
        target[r.chain].push(r);
      }
    }
  }

  console.log(`[refreshAnalysis] Processed ${processedOracles}/${oracleGroups.size} oracle groups (${skippedOracles} skipped, up to date)`);

  const allChains = new Set([...Object.keys(ethAnalysis), ...Object.keys(stableAnalysis)]);
  const summary = Array.from(allChains).map(c => ({
    chain: c,
    ethPairs: ethAnalysis[c]?.length ?? 0,
    stablePairs: stableAnalysis[c]?.length ?? 0,
  }));

  return { ethAnalysis, stableAnalysis, depegRows: newDepegRows, summary };
}
