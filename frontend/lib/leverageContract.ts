import type { Address } from 'viem';

// LiFi Diamond on Base mainnet
export const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as Address;

// Morpho Blue on Base mainnet
export const MORPHO_ADDRESSES = {
  LEVERAGE_HELPER: '0x0000000000000000000000000000000000000000' as Address, // TODO: deploy and set
  MORPHO_BLUE: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address,
  WSTETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452' as Address,
  WETH: '0x4200000000000000000000000000000000000006' as Address,
} as const;

// Chain ID → Morpho Blue address (same across all chains)
export const MORPHO_BLUE_BY_CHAIN: Record<number, Address> = {
  1: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  8453: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  42161: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  137: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
};

// Dynamic market params type — built from API data
export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

// Full market config passed to leverage/deleverage functions
export interface MarketConfig {
  marketId: string;
  marketParams: MarketParams;
  chainId: number;
}

// Build MarketParams from API market data
export function buildMarketParams(market: {
  loanAddress: string;
  collateralAddress: string;
  oracleAddress: string | null;
  irmAddress: string | null;
  lltvRaw: string;
}): MarketParams {
  return {
    loanToken: market.loanAddress as Address,
    collateralToken: market.collateralAddress as Address,
    oracle: (market.oracleAddress || '0x0000000000000000000000000000000000000000') as Address,
    irm: (market.irmAddress || '0x0000000000000000000000000000000000000000') as Address,
    lltv: BigInt(market.lltvRaw),
  };
}

// Default wstETH/WETH market on Base
export const DEFAULT_MARKET_PARAMS: MarketParams = {
  loanToken: MORPHO_ADDRESSES.WETH,
  collateralToken: MORPHO_ADDRESSES.WSTETH,
  oracle: '0x4A11590e5326138B514E08A9B52202D42077Ca65' as Address,
  irm: '0x46415998764C29aB2a25CbeA6254146D50D22687' as Address,
  lltv: BigInt('945000000000000000'), // 94.5%
};

export const MORPHO_MARKET_ID = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba' as const;

export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// New MorphoLeverageHelper ABI — generic, works with any market + any DEX via swapTarget/swapCalldata
export const MORPHO_LEVERAGE_HELPER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'userDeposit', type: 'uint256' },
      { name: 'flashLoanAmount', type: 'uint256' },
      { name: 'minCollateralFromSwap', type: 'uint256' },
      { name: 'swapTarget', type: 'address' },
      { name: 'swapCalldata', type: 'bytes' },
    ],
    name: 'executeLeverage',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'minLoanTokenFromSwap', type: 'uint256' },
      { name: 'swapTarget', type: 'address' },
      { name: 'swapCalldata', type: 'bytes' },
    ],
    name: 'executeDeleverage',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'hasAuthorization',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'user', type: 'address' },
    ],
    name: 'getUserPosition',
    outputs: [
      { name: 'collateral', type: 'uint256' },
      { name: 'debt', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'approvedSwapTargets',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Morpho Blue Core ABI (minimal)
export const MORPHO_ABI = [
  {
    inputs: [
      { name: 'authorized', type: 'address' },
      { name: 'isAuthorized', type: 'bool' },
    ],
    name: 'setAuthorization',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'authorized', type: 'address' },
    ],
    name: 'isAuthorized',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'bytes32' }],
    name: 'idToMarketParams',
    outputs: [
      {
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'bytes32' }],
    name: 'market',
    outputs: [
      { name: 'totalSupplyAssets', type: 'uint128' },
      { name: 'totalSupplyShares', type: 'uint128' },
      { name: 'totalBorrowAssets', type: 'uint128' },
      { name: 'totalBorrowShares', type: 'uint128' },
      { name: 'lastUpdate', type: 'uint128' },
      { name: 'fee', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'user', type: 'address' },
    ],
    name: 'position',
    outputs: [
      { name: 'supplyShares', type: 'uint128' },
      { name: 'borrowShares', type: 'uint128' },
      { name: 'collateral', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
