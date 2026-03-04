import type { Address } from "viem";

export type RateMethod =
  | "wstETH"       // stEthPerToken
  | "cbETH"        // exchangeRate
  | "rETH"         // getExchangeRate
  | "weETH"        // getRate
  | "rsETH"        // rsETHPrice via LRTOracle
  | "ezETH"        // calculateTVLs via RestakeManager + totalSupply
  | "erc4626"      // totalAssets / totalSupply
  | "rebasing"     // 1 / rebasingCreditsPerToken
  | "lsETH"        // totalUnderlyingSupply / totalSupply
  | "fixed";       // hardcoded fallback (no on-chain rate)

export type Chain = "ethereum" | "base" | "optimism";

export interface TokenConfig {
  symbol: string;
  address: Address;
  rateMethod: RateMethod;
  /** For rsETH: the LRTOracle address. For ezETH: the RestakeManager. */
  helperContract?: Address;
  type: string;
  source: string;
  chain: Chain;
  /** Fallback APY if on-chain calc fails */
  fallbackApy: number;
  /** Max plausible APY (sanity check) */
  maxApy: number;
}

// ─── Ethereum Mainnet Tokens ──────────────────────────────────

export const TOKENS: TokenConfig[] = [
  // ── Liquid Staking ─────────────────────────────
  {
    symbol: "wstETH",
    address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    rateMethod: "wstETH",
    type: "Liquid Staking",
    source: "Lido",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 10,
  },
  {
    symbol: "cbETH",
    address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    rateMethod: "cbETH",
    type: "Liquid Staking",
    source: "Coinbase",
    chain: "ethereum",
    fallbackApy: 2.8,
    maxApy: 10,
  },
  {
    symbol: "rETH",
    address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    rateMethod: "rETH",
    type: "Liquid Staking",
    source: "RocketPool",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 10,
  },
  {
    symbol: "LsETH",
    address: "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549",
    rateMethod: "lsETH",
    type: "Liquid Staking",
    source: "Liquid Collective",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 10,
  },

  // ── Liquid Restaking ───────────────────────────
  {
    symbol: "weETH",
    address: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
    rateMethod: "weETH",
    type: "Liquid Restaking",
    source: "EtherFi",
    chain: "ethereum",
    fallbackApy: 3.5,
    maxApy: 10,
  },
  {
    symbol: "ezETH",
    address: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
    rateMethod: "ezETH",
    helperContract: "0x74a09653A083691711cF8215a6ab074BB4e99ef5", // RestakeManager
    type: "Liquid Restaking",
    source: "Renzo",
    chain: "ethereum",
    fallbackApy: 3.2,
    maxApy: 10,
  },
  {
    symbol: "rsETH",
    address: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7",
    rateMethod: "rsETH",
    helperContract: "0x349A73444b1a310BAe67ef67973022020d70020d", // LRTOracle
    type: "Liquid Restaking",
    source: "Kelp DAO",
    chain: "ethereum",
    fallbackApy: 3.3,
    maxApy: 10,
  },
  {
    symbol: "pufETH",
    address: "0xD9A442856C234a39a81a089C06451EBAa4306a72",
    rateMethod: "erc4626",
    type: "Liquid Restaking",
    source: "Puffer Finance",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 15,
  },
  {
    symbol: "rswETH",
    address: "0xfae103dc9cf190ed75350761e95403b7b8afa6c0",
    rateMethod: "erc4626",
    type: "Liquid Restaking",
    source: "Swell",
    chain: "ethereum",
    fallbackApy: 3.2,
    maxApy: 10,
  },
  {
    symbol: "agETH",
    address: "0xe1B4d34E8754600962Cd944B535180Bd758E6c2e",
    rateMethod: "erc4626",
    type: "Liquid Restaking",
    source: "Kelp DAO",
    chain: "ethereum",
    fallbackApy: 3.3,
    maxApy: 10,
  },

  // ── Yield-bearing ETH ──────────────────────────
  {
    symbol: "OETH",
    address: "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3",
    rateMethod: "rebasing",
    type: "Yield ETH",
    source: "Origin Protocol",
    chain: "ethereum",
    fallbackApy: 3.5,
    maxApy: 15,
  },
  {
    symbol: "ynETHx",
    address: "0x657d9ABA1DBb59e53f9F3eCAA878447dCfC96dCb",
    rateMethod: "erc4626",
    type: "Liquid Restaking",
    source: "YieldNest",
    chain: "ethereum",
    fallbackApy: 3.5,
    maxApy: 15,
  },
  {
    symbol: "hgETH",
    address: "0xc824a08db624942c5e5f330d56530cd1598859fd",
    rateMethod: "erc4626",
    type: "Yield ETH",
    source: "High Growth ETH",
    chain: "ethereum",
    fallbackApy: 3.5,
    maxApy: 15,
  },
  {
    symbol: "ETH+",
    address: "0xe72b141df173b999ae7c1adcbf60cc9833ce56a8",
    rateMethod: "erc4626",
    type: "Yield ETH",
    source: "Reserve Protocol",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 10,
  },
  {
    symbol: "savETH",
    address: "0xDA06eE2dACF9245Aa80072a4407deBDea0D7e341",
    rateMethod: "erc4626",
    type: "Yield ETH",
    source: "Stakehouse",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 10,
  },
  {
    symbol: "wbrETH",
    address: "0x91094D333e018f81874D62E27522479BEC131b5f",
    rateMethod: "erc4626",
    type: "Yield ETH",
    source: "Bracket Finance",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 10,
  },
  {
    symbol: "ETH0",
    address: "0x734eec7930bc84ec5732022b9eb949a81fb89abe",
    rateMethod: "rebasing",
    type: "Yield ETH",
    source: "Infrared / Usual",
    chain: "ethereum",
    fallbackApy: 3.0,
    maxApy: 15,
  },

  // ── Stablecoins with yield ─────────────────────
  {
    symbol: "sUSDe",
    address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
    rateMethod: "erc4626",
    type: "Staked Stablecoin",
    source: "Ethena",
    chain: "ethereum",
    fallbackApy: 15.0,
    maxApy: 30,
  },
  {
    symbol: "sDAI",
    address: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
    rateMethod: "erc4626",
    type: "Savings Token",
    source: "MakerDAO",
    chain: "ethereum",
    fallbackApy: 5.0,
    maxApy: 15,
  },
  {
    symbol: "sUSDS",
    address: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
    rateMethod: "erc4626",
    type: "Savings Token",
    source: "Sky (MakerDAO)",
    chain: "ethereum",
    fallbackApy: 4.5,
    maxApy: 10,
  },
  {
    symbol: "sUSDf",
    address: "0xc8CF6D7991f15525488b2A83Df53468D682Ba4B0",
    rateMethod: "erc4626",
    type: "Staked Stablecoin",
    source: "Falcon Finance",
    chain: "ethereum",
    fallbackApy: 8.0,
    maxApy: 25,
  },
  {
    symbol: "wstUSR",
    address: "0x1202F5C7b4B9E47a1A484E8B270be34dbbC75055",
    rateMethod: "erc4626",
    type: "Staked Stablecoin",
    source: "Resolv",
    chain: "ethereum",
    fallbackApy: 4.0,
    maxApy: 15,
  },
  {
    symbol: "wsrUSD",
    address: "0xd3fD63209FA2D55B07A0f6db36C2f43900be3094",
    rateMethod: "erc4626",
    type: "Staked Stablecoin",
    source: "Resolv",
    chain: "ethereum",
    fallbackApy: 4.0,
    maxApy: 15,
  },
  {
    symbol: "syrupUSDC",
    address: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b",
    rateMethod: "erc4626",
    type: "Lending Vault",
    source: "Maple Finance",
    chain: "ethereum",
    fallbackApy: 8.0,
    maxApy: 20,
  },

  // ── Base chain tokens ──────────────────────────
  {
    symbol: "superOETHb",
    address: "0xDBFeFD2e8460a6Ee4955A68582F85708BAEA60A3",
    rateMethod: "rebasing",
    type: "Yield ETH",
    source: "Origin Protocol",
    chain: "base",
    fallbackApy: 3.8,
    maxApy: 20,
  },
  {
    symbol: "yoETH",
    address: "0x3A43AEC53490CB9Fa922847385D82fe25d0E9De7",
    rateMethod: "erc4626",
    type: "Yield ETH",
    source: "YO Protocol",
    chain: "base",
    fallbackApy: 4.0,
    maxApy: 25,
  },
  {
    symbol: "bsdETH",
    address: "0xCb327b99fF831bF8223cCEd12B1338FF3aA322Ff",
    rateMethod: "erc4626",
    type: "Yield ETH",
    source: "Based ETH",
    chain: "base",
    fallbackApy: 3.5,
    maxApy: 15,
  },
];

// ─── RPC Endpoints ──────────────────────────────────────────

export const DEFAULT_RPCS: Record<Chain, string> = {
  ethereum: "https://eth-mainnet.g.alchemy.com/v2/qDSWAyTS5MGZU9kIsOWpQh5TWW2jxICs",
  base: "https://base-mainnet.g.alchemy.com/v2/qDSWAyTS5MGZU9kIsOWpQh5TWW2jxICs",
  optimism: "https://opt-mainnet.g.alchemy.com/v2/qDSWAyTS5MGZU9kIsOWpQh5TWW2jxICs",
};

export const BLOCKS_PER_DAY: Record<Chain, number> = {
  ethereum: 7200,   // ~12 sec/block
  base: 43200,      // ~2 sec/block
  optimism: 43200,  // ~2 sec/block
};

// ─── Special Addresses ──────────────────────────────────────

export const EIGEN_TOKEN: Address = "0xec53bf9167f50cdeb3ae105f56099aaab9061f83";
export const EETH_TOKEN: Address = "0x35fA164735182de50811E8e2E824cFb9B6118ac2";
export const OPTIMISM_RESTAKING_TRACKER: Address = "0xAB7590CeE3Ef1A863E9A5877fBB82D9bE11504da";
