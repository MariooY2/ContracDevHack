// LiFi SDK configuration and helpers
import { createConfig, getQuote, type LiFiStep } from '@lifi/sdk';
import type { ChainId } from '@lifi/types';

// Initialize LiFi SDK once
createConfig({
  integrator: 'volt-protocol',
});

export type { LiFiStep };

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
