/**
 * rpcClients.ts
 *
 * Shared viem public client factory for server-side RPC calls.
 * Caches one client per chain (module-level singleton).
 */

import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet, base, arbitrum, polygon } from 'viem/chains';

export type ChainSlug = 'ethereum' | 'base' | 'arbitrum' | 'polygon';

/* eslint-disable @typescript-eslint/no-explicit-any */
const CHAIN_META: Record<ChainSlug, { viemChain: any; envKey: string; fallback: string }> = {
  ethereum: { viemChain: mainnet,  envKey: 'ETHEREUM_RPC_URL', fallback: 'https://eth.llamarpc.com' },
  base:     { viemChain: base,     envKey: 'BASE_RPC_URL',     fallback: 'https://mainnet.base.org' },
  arbitrum: { viemChain: arbitrum, envKey: 'ARBITRUM_RPC_URL', fallback: 'https://arb1.arbitrum.io/rpc' },
  polygon:  { viemChain: polygon,  envKey: 'POLYGON_RPC_URL', fallback: 'https://polygon-rpc.com' },
};

const clients = new Map<ChainSlug, PublicClient>();

export function getPublicClient(slug: ChainSlug): PublicClient {
  const cached = clients.get(slug);
  if (cached) return cached;

  const meta = CHAIN_META[slug];
  const url = process.env[meta.envKey] || meta.fallback;

  const client = createPublicClient({
    chain: meta.viemChain,
    transport: http(url, { retryCount: 3, retryDelay: 1000, timeout: 30_000 }),
  });

  clients.set(slug, client as PublicClient);
  return client as PublicClient;
}
