/**
 * rpcClients.ts
 *
 * Shared viem public client factory for server-side RPC calls.
 * Two client types:
 * - getPublicClient(): Alchemy (reliable contract calls like latestRoundData)
 * - getLogsClient(): Free public RPCs (large block ranges for eth_getLogs)
 */

import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet, base, arbitrum, polygon } from 'viem/chains';

export type ChainSlug = 'ethereum' | 'base' | 'arbitrum' | 'polygon';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Alchemy RPCs — reliable for contract calls, but eth_getLogs limited to 10 blocks on free tier
const ALCHEMY_META: Record<ChainSlug, { viemChain: any; envKey: string; fallback: string }> = {
  ethereum: { viemChain: mainnet,  envKey: 'ALCHEMY_ETH_RPC_URL',  fallback: 'https://eth.llamarpc.com' },
  base:     { viemChain: base,     envKey: 'ALCHEMY_BASE_RPC_URL', fallback: 'https://mainnet.base.org' },
  arbitrum: { viemChain: arbitrum, envKey: 'ARBITRUM_RPC_URL',     fallback: 'https://arb1.arbitrum.io/rpc' },
  polygon:  { viemChain: polygon,  envKey: 'POLYGON_RPC_URL',     fallback: 'https://polygon-rpc.com' },
};

// Free public RPCs — allow large block ranges for eth_getLogs (2K-5K blocks)
const PUBLIC_META: Record<ChainSlug, { viemChain: any; url: string }> = {
  ethereum: { viemChain: mainnet,  url: 'https://eth.llamarpc.com' },
  base:     { viemChain: base,     url: 'https://mainnet.base.org' },
  arbitrum: { viemChain: arbitrum, url: 'https://arb1.arbitrum.io/rpc' },
  polygon:  { viemChain: polygon,  url: 'https://polygon-rpc.com' },
};

const alchemyClients = new Map<ChainSlug, PublicClient>();
const logsClients = new Map<ChainSlug, PublicClient>();

/** Alchemy client — use for contract calls (latestRoundData, aggregator, etc.) */
export function getPublicClient(slug: ChainSlug): PublicClient {
  const cached = alchemyClients.get(slug);
  if (cached) return cached;

  const meta = ALCHEMY_META[slug];
  const url = process.env[meta.envKey] || meta.fallback;

  const client = createPublicClient({
    chain: meta.viemChain,
    transport: http(url, { retryCount: 3, retryDelay: 1000, timeout: 30_000 }),
  });

  alchemyClients.set(slug, client as PublicClient);
  return client as PublicClient;
}

/** Free public RPC client — use for eth_getLogs (supports large block ranges) */
export function getLogsClient(slug: ChainSlug): PublicClient {
  const cached = logsClients.get(slug);
  if (cached) return cached;

  const meta = PUBLIC_META[slug];

  const client = createPublicClient({
    chain: meta.viemChain,
    transport: http(meta.url, { retryCount: 3, retryDelay: 2000, timeout: 30_000 }),
  });

  logsClients.set(slug, client as PublicClient);
  return client as PublicClient;
}
