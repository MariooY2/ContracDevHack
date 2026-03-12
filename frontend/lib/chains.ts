import type { ChainSlug, ChainMeta } from './types';

export const CHAIN_CONFIG: Record<ChainSlug, ChainMeta> = {
  ethereum: {
    slug: 'ethereum',
    name: 'Ethereum',
    chainId: 1,
    color: '#627EEA',
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorer: 'https://etherscan.io',
  },
  base: {
    slug: 'base',
    name: 'Base',
    chainId: 8453,
    color: '#0052FF',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
  },
  arbitrum: {
    slug: 'arbitrum',
    name: 'Arbitrum',
    chainId: 42161,
    color: '#28A0F0',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
  },
  polygon: {
    slug: 'polygon',
    name: 'Polygon',
    chainId: 137,
    color: '#8247E5',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
  },
};

export const CHAIN_SLUGS: ChainSlug[] = ['ethereum', 'base', 'arbitrum', 'polygon'];

export function getChainBySlug(slug: string): ChainMeta | undefined {
  return CHAIN_CONFIG[slug as ChainSlug];
}

export function isValidChainSlug(slug: string): slug is ChainSlug {
  return slug in CHAIN_CONFIG;
}
