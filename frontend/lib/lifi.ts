// LiFi SDK configuration and helpers
import { createConfig, getQuote, getRoutes, getTokens, getChains, getStepTransaction, type LiFiStep } from '@lifi/sdk';
import type { ChainId, Route, RoutesResponse, Token, Step, FeeCost, GasCost, Estimate, ExtendedChain } from '@lifi/types';

// Initialize LiFi SDK once
createConfig({
  integrator: 'volt-protocol',
});

export type { LiFiStep, Route, RoutesResponse, Token, Step, FeeCost, GasCost, Estimate, ExtendedChain };
export { getStepTransaction };

export interface LiFiSwapParams {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  fromChain: ChainId | number;
  toChain?: ChainId | number;
  slippage?: number; // decimal, e.g. 0.005 = 0.5%
}

/**
 * Get a LiFi swap quote via the SDK.
 * Returns a LiFiStep with transactionRequest, estimate, etc.
 */
export async function getLiFiQuote(params: LiFiSwapParams): Promise<LiFiStep> {
  return getQuote({
    fromChain: params.fromChain,
    toChain: params.toChain ?? params.fromChain,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    slippage: params.slippage ?? 0.005,
  });
}

export type RouteOrder = 'RECOMMENDED' | 'CHEAPEST' | 'FASTEST' | 'SAFEST';

/**
 * Get multiple route options for a swap via LiFi.
 * Returns up to `maxRoutes` routes sorted by the specified order.
 * - RECOMMENDED: balanced score (default)
 * - CHEAPEST: best exchange rate (highest output)
 * - FASTEST: lowest execution time
 * - SAFEST: most reliable bridges/DEXes
 */
export async function getLiFiRoutes(
  params: LiFiSwapParams,
  maxRoutes = 3,
  order: RouteOrder = 'RECOMMENDED',
): Promise<RoutesResponse> {
  return getRoutes({
    fromChainId: typeof params.fromChain === 'number' ? params.fromChain : Number(params.fromChain),
    toChainId: typeof (params.toChain ?? params.fromChain) === 'number'
      ? (params.toChain ?? params.fromChain) as number
      : Number(params.toChain ?? params.fromChain),
    fromTokenAddress: params.fromToken,
    toTokenAddress: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    options: {
      slippage: params.slippage ?? 0.005,
      maxPriceImpact: 0.4,
      order,
    },
  });
}

// Module-level caches
const _tokenCacheMap: Record<number, Token[]> = {};
let _chainCache: ExtendedChain[] | null = null;

/**
 * Get all available tokens on a chain. Cached per chain.
 */
export async function getLiFiTokens(chainId = 8453): Promise<Token[]> {
  if (_tokenCacheMap[chainId]) return _tokenCacheMap[chainId];

  const response = await getTokens({ chains: [chainId as ChainId] });
  const tokens = response.tokens[chainId] ?? [];
  _tokenCacheMap[chainId] = tokens;
  return tokens;
}

/**
 * Get all supported chains. Cached after first call.
 */
export async function getLiFiChains(): Promise<ExtendedChain[]> {
  if (_chainCache) return _chainCache;

  const chains = await getChains({ chainTypes: ['EVM' as any] });
  // Sort popular chains first
  const popularIds = new Set([1, 8453, 42161, 10, 137, 56, 43114, 100, 250, 324]);
  chains.sort((a, b) => {
    const aPop = popularIds.has(a.id) ? 0 : 1;
    const bPop = popularIds.has(b.id) ? 0 : 1;
    if (aPop !== bPop) return aPop - bPop;
    return a.name.localeCompare(b.name);
  });
  _chainCache = chains;
  return chains;
}
