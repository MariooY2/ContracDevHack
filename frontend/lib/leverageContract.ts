import type { Address } from 'viem';

// Morpho Blue on Base
export const MORPHO_ADDRESSES = {
  LEVERAGE_HELPER: '0xef11D2f7df1390A14f30F22Ed15f99471fc80414' as Address,
  MORPHO_BLUE: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address,
  WSTETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452' as Address,
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  UNISWAP_V3_POOL: '0x20E068D76f9E90b90604500B84c7e19dCB923e7e' as Address,
} as const;

// Morpho Market ID for wstETH/WETH on Base
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

// Morpho Flash Loan Helper ABI
export const MORPHO_FLASH_LOAN_HELPER_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserPosition',
    outputs: [
      { name: 'collateral', type: 'uint256' },
      { name: 'debt', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'targetLeverage', type: 'uint256' },
      { name: 'userDeposit', type: 'uint256' },
    ],
    name: 'simulateLeverage',
    outputs: [
      { name: 'flashWethAmount', type: 'uint256' },
      { name: 'totalCollateralWsteth', type: 'uint256' },
      { name: 'totalDebtWeth', type: 'uint256' },
      { name: 'estimatedHealthFactor', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getMaxSafeLeverage',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'targetLeverage', type: 'uint256' },
      { name: 'userDeposit', type: 'uint256' },
    ],
    name: 'executeLeverage',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
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
    inputs: [],
    name: 'getExchangeRates',
    outputs: [
      { name: 'poolWstethPerWeth', type: 'uint256' },
      { name: 'poolWethPerWsteth', type: 'uint256' },
      { name: 'oracleWethPerWsteth', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Aerodrome Pool ABI (minimal)
export const AERODROME_POOL_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
    ],
    name: 'getAmountOut',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { name: 'reserve0', type: 'uint256' },
      { name: 'reserve1', type: 'uint256' },
      { name: 'blockTimestampLast', type: 'uint256' },
    ],
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
] as const;
