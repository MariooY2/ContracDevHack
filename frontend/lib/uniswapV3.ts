/**
 * Uniswap V3 swap data generation for Morpho flash loan leverage
 * Constructs swap calldata for WETH ↔ wstETH swaps on Base
 */

import { encodeFunctionData, Address } from 'viem';

// Uniswap V3 Router on Base
export const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as Address;

// Uniswap V3 SwapRouter ABI - exactInputSingle function
const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export interface UniswapV3SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  recipient: Address;
  slippage?: number; // decimal format, e.g., 0.005 = 0.5%
}

/**
 * Generate Uniswap V3 swap calldata for WETH → wstETH or wstETH → WETH
 * Returns ABI-encoded (router, calldata) for the Morpho contract to execute
 * Uses 0.01% fee tier (most liquid for wstETH/WETH on Base)
 */
export function generateUniswapV3SwapData(params: UniswapV3SwapParams): string {
  const slippage = params.slippage || 0.005; // 0.5% default

  // Calculate minimum output amount (apply slippage)
  // For simplicity, assuming ~1:1.2 ratio (wstETH slightly more valuable than WETH)
  // In production, you'd query the pool or use a price oracle
  const amountOutMinimum = (params.amountIn * BigInt(Math.floor((1 - slippage) * 10000))) / 10000n;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes from now

  const swapParams = {
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    fee: 100, // 0.01% fee tier
    recipient: params.recipient,
    deadline,
    amountIn: params.amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96: 0n, // No price limit
  };

  const calldata = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: 'exactInputSingle',
    args: [swapParams],
  });

  console.log('━━━ Uniswap V3 Swap Data ━━━');
  console.log('Router:', UNISWAP_V3_ROUTER);
  console.log('Token In:', params.tokenIn);
  console.log('Token Out:', params.tokenOut);
  console.log('Amount In:', params.amountIn.toString());
  console.log('Amount Out Min:', amountOutMinimum.toString());
  console.log('Slippage:', slippage);
  console.log('Calldata:', calldata.substring(0, 20) + '...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Encode as (address router, bytes calldata) for the contract
  // ABI encode: abi.encode(router, calldata)
  const encoded = encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'encodeRouterCall',
        inputs: [
          { name: 'router', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
        outputs: [{ name: '', type: 'bytes' }],
        stateMutability: 'pure',
      },
    ] as const,
    functionName: 'encodeRouterCall',
    args: [UNISWAP_V3_ROUTER, calldata as `0x${string}`],
  });

  // Remove function selector (first 4 bytes / 8 hex chars after 0x) to get just the encoded params
  return encoded.substring(10);
}
