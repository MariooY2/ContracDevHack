// LiFi swap data generation for Morpho flash loan leverage
// LiFi provides cross-DEX routing for optimal swap execution

const LIFI_API_URL = 'https://li.quest/v1';

export interface LiFiSwapParams {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress: string;
  chainId: number;
  slippage?: number; // decimal format, e.g., 0.005 = 0.5%
}

export interface LiFiQuote {
  transactionRequest: {
    data: string;
    to: string;
    value: string;
    from: string;
    chainId: number;
    gasLimit: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string;
    gasCosts: {
      type: string;
      price: string;
      estimate: string;
      limit: string;
      amount: string;
      amountUSD: string;
      token: {
        address: string;
        symbol: string;
        decimals: number;
        chainId: number;
        name: string;
      };
    }[];
  };
  includedSteps: any[];
  action: any;
  type: string;
  id: string;
  tool: string;
  toolDetails: any;
}

// Generate LiFi swap data for WETH -> wstETH swap (leverage)
export async function getLiFiSwapDataLeverage(params: LiFiSwapParams): Promise<string> {
  try {
    // LiFi might not support Contract.dev fork chains
    // Map fork chain IDs to real chain IDs for LiFi API
    const realChainId = params.chainId === 18133 ? 8453 : params.chainId === 13957 ? 1 : params.chainId;

    // Build query parameters for GET request
    const queryParams = new URLSearchParams({
      fromChain: realChainId.toString(),
      toChain: realChainId.toString(),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: (params.slippage || 0.005).toString(),
    });

    const url = `${LIFI_API_URL}/quote?${queryParams.toString()}`;

    console.log('━━━ LiFi Swap Request ━━━');
    console.log('Original Chain ID:', params.chainId);
    console.log('LiFi Chain ID:', realChainId);
    console.log('From Token:', params.fromToken);
    console.log('To Token:', params.toToken);
    console.log('Amount:', params.fromAmount);
    console.log('Slippage:', params.slippage || 0.005);
    console.log('URL:', url);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('❌ LiFi API Error Response:', responseText);
      let errorMessage = `LiFi API error (${response.status})`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        errorMessage = responseText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const quote: LiFiQuote = JSON.parse(responseText);

    console.log('✅ LiFi swap route generated successfully');
    console.log('Route Tool:', quote.tool || 'unknown');
    console.log('Router Address:', quote.transactionRequest.to);
    console.log('To Amount:', quote.estimate?.toAmount || 'unknown');

    // IMPORTANT: Contract expects abi.encode(address router, bytes calldata)
    // Encode as (address, bytes) for contract to decode
    const { encodeAbiParameters } = await import('viem');

    const encoded = encodeAbiParameters(
      [
        { name: 'router', type: 'address' },
        { name: 'data', type: 'bytes' }
      ],
      [
        quote.transactionRequest.to as `0x${string}`,
        quote.transactionRequest.data as `0x${string}`
      ]
    );

    console.log('Encoded swap data length:', encoded.length);

    // Remove '0x' prefix for contract call
    return encoded.substring(2);
  } catch (error) {
    console.error('❌ Failed to generate LiFi swap data:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate swap route: ${error.message}`);
    }
    throw new Error('Failed to generate swap data. Please try again.');
  }
}

// Generate LiFi swap data for wstETH -> WETH swap (deleverage)
export async function getLiFiSwapDataDeleverage(params: LiFiSwapParams): Promise<string> {
  // Same logic as leverage, just reversed tokens
  return getLiFiSwapDataLeverage(params);
}

// Helper to estimate output amount without generating swap data
export async function estimateLiFiSwap(params: Omit<LiFiSwapParams, 'fromAddress' | 'toAddress'>): Promise<{
  toAmount: string;
  toAmountMin: string;
  gasCosts: string;
}> {
  try {
    const realChainId = params.chainId === 18133 ? 8453 : params.chainId === 13957 ? 1 : params.chainId;

    const queryParams = new URLSearchParams({
      fromChain: realChainId.toString(),
      toChain: realChainId.toString(),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: '0x0000000000000000000000000000000000000000', // Dummy address for estimation
      slippage: (params.slippage || 0.005).toString(),
    });

    const response = await fetch(`${LIFI_API_URL}/quote?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`LiFi API error: ${response.statusText}`);
    }

    const quote: LiFiQuote = await response.json();

    return {
      toAmount: quote.estimate.toAmount,
      toAmountMin: quote.estimate.toAmountMin,
      gasCosts: quote.estimate.gasCosts[0]?.amount || '0',
    };
  } catch (error) {
    console.error('Failed to estimate LiFi swap:', error);
    throw new Error('Failed to estimate swap. Please try again.');
  }
}
