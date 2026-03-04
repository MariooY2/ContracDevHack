/** On-chain ABIs for token rate fetching */

export const wstETH_ABI = [
  {
    inputs: [],
    name: "stEthPerToken",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const cbETH_ABI = [
  {
    inputs: [],
    name: "exchangeRate",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const rETH_ABI = [
  {
    inputs: [],
    name: "getExchangeRate",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const weETH_ABI = [
  {
    inputs: [],
    name: "getRate",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const rsETH_ORACLE_ABI = [
  {
    inputs: [],
    name: "rsETHPrice",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const ERC4626_ABI = [
  {
    inputs: [],
    name: "totalAssets",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const REBASING_ABI = [
  {
    inputs: [],
    name: "rebasingCreditsPerToken",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const TOTAL_SUPPLY_ABI = [
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const EZETH_RESTAKE_MANAGER_ABI = [
  {
    inputs: [],
    name: "calculateTVLs",
    outputs: [
      { type: "uint256[][]" },
      { type: "uint256[]" },
      { type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const LSETH_ABI = [
  {
    inputs: [],
    name: "totalUnderlyingSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const MAKER_POT_ABI = [
  {
    inputs: [],
    name: "dsr",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const EIGEN_TRACKER_ABI = [
  {
    inputs: [{ name: "_category", type: "string" }],
    name: "categoryTVL",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
