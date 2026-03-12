/**
 * On-chain token APY calculator.
 * Fetches exchange rates at current block and N days ago,
 * annualizes the growth into 7d and 30d APY.
 *
 * Called by /api/cron/refresh-rates
 */

import { createPublicClient, http, type Address } from 'viem';
import { mainnet, base, optimism } from 'viem/chains';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Using `any` for AnyClient because viem generates different types per chain,
// which are incompatible when stored in a single Record<RateChain, AnyClient>.
type AnyClient = any;

// ── Types ───────────────────────────────────────────────────

export type RateMethod = 'wstETH' | 'cbETH' | 'rETH' | 'weETH' | 'rsETH' | 'ezETH' | 'erc4626' | 'rebasing' | 'lsETH';
export type RateChain = 'ethereum' | 'base' | 'optimism';

export interface TokenCfg {
  symbol: string;
  address: Address;
  method: RateMethod;
  helper?: Address;
  type: string;
  source: string;
  chain: RateChain;
  fallback: number;
  max: number;
}

export interface TokenRateResult {
  token: string;
  apy_7d: number;
  apy_30d: number;
  type: string;
  rate?: number;
  source: string;
  chain?: string;
}

// ── ABIs (minimal) ──────────────────────────────────────────

export const tokenAbi = {
  stEthPerToken: [{ inputs: [], name: 'stEthPerToken', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
  exchangeRate: [{ inputs: [], name: 'exchangeRate', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
  getExchangeRate: [{ inputs: [], name: 'getExchangeRate', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
  getRate: [{ inputs: [], name: 'getRate', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
  rsETHPrice: [{ inputs: [], name: 'rsETHPrice', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
  erc4626: [
    { inputs: [], name: 'totalAssets', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  ] as const,
  rebasing: [{ inputs: [], name: 'rebasingCreditsPerToken', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
  lsETH: [
    { inputs: [], name: 'totalUnderlyingSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  ] as const,
  totalSupply: [{ inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
  calculateTVLs: [{ inputs: [], name: 'calculateTVLs', outputs: [{ type: 'uint256[][]' }, { type: 'uint256[]' }, { type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
};

// ── Token Registry ──────────────────────────────────────────

export const TOKENS: TokenCfg[] = [
  // LSTs
  { symbol: 'wstETH', address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', method: 'wstETH', type: 'Liquid Staking', source: 'Lido', chain: 'ethereum', fallback: 3.0, max: 10 },
  { symbol: 'cbETH', address: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704', method: 'cbETH', type: 'Liquid Staking', source: 'Coinbase', chain: 'ethereum', fallback: 2.8, max: 10 },
  { symbol: 'rETH', address: '0xae78736Cd615f374D3085123A210448E74Fc6393', method: 'rETH', type: 'Liquid Staking', source: 'RocketPool', chain: 'ethereum', fallback: 3.0, max: 10 },
  { symbol: 'LsETH', address: '0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549', method: 'lsETH', type: 'Liquid Staking', source: 'Liquid Collective', chain: 'ethereum', fallback: 3.0, max: 10 },
  // LRTs
  { symbol: 'weETH', address: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee', method: 'weETH', type: 'Liquid Restaking', source: 'EtherFi', chain: 'ethereum', fallback: 3.5, max: 10 },
  { symbol: 'ezETH', address: '0xbf5495Efe5DB9ce00f80364C8B423567e58d2110', method: 'ezETH', helper: '0x74a09653A083691711cF8215a6ab074BB4e99ef5', type: 'Liquid Restaking', source: 'Renzo', chain: 'ethereum', fallback: 3.2, max: 10 },
  { symbol: 'rsETH', address: '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7', method: 'rsETH', helper: '0x349A73444b1a310BAe67ef67973022020d70020d', type: 'Liquid Restaking', source: 'Kelp DAO', chain: 'ethereum', fallback: 3.3, max: 10 },
  { symbol: 'pufETH', address: '0xD9A442856C234a39a81a089C06451EBAa4306a72', method: 'erc4626', type: 'Liquid Restaking', source: 'Puffer Finance', chain: 'ethereum', fallback: 3.0, max: 15 },
  { symbol: 'rswETH', address: '0xfae103dc9cf190ed75350761e95403b7b8afa6c0', method: 'erc4626', type: 'Liquid Restaking', source: 'Swell', chain: 'ethereum', fallback: 3.2, max: 10 },
  { symbol: 'agETH', address: '0xe1B4d34E8754600962Cd944B535180Bd758E6c2e', method: 'erc4626', type: 'Liquid Restaking', source: 'Kelp DAO', chain: 'ethereum', fallback: 3.3, max: 10 },
  // Yield ETH
  { symbol: 'OETH', address: '0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3', method: 'rebasing', type: 'Yield ETH', source: 'Origin Protocol', chain: 'ethereum', fallback: 3.5, max: 15 },
  { symbol: 'ynETHx', address: '0x657d9ABA1DBb59e53f9F3eCAA878447dCfC96dCb', method: 'erc4626', type: 'Liquid Restaking', source: 'YieldNest', chain: 'ethereum', fallback: 3.5, max: 15 },
  { symbol: 'hgETH', address: '0xc824a08db624942c5e5f330d56530cd1598859fd', method: 'erc4626', type: 'Yield ETH', source: 'High Growth ETH', chain: 'ethereum', fallback: 3.5, max: 15 },
  { symbol: 'ETH+', address: '0xe72b141df173b999ae7c1adcbf60cc9833ce56a8', method: 'erc4626', type: 'Yield ETH', source: 'Reserve Protocol', chain: 'ethereum', fallback: 3.0, max: 10 },
  { symbol: 'savETH', address: '0xDA06eE2dACF9245Aa80072a4407deBDea0D7e341', method: 'erc4626', type: 'Yield ETH', source: 'Stakehouse', chain: 'ethereum', fallback: 3.0, max: 10 },
  { symbol: 'wbrETH', address: '0x91094D333e018f81874D62E27522479BEC131b5f', method: 'erc4626', type: 'Yield ETH', source: 'Bracket Finance', chain: 'ethereum', fallback: 3.0, max: 10 },
  { symbol: 'ETH0', address: '0x734eec7930bc84ec5732022b9eb949a81fb89abe', method: 'rebasing', type: 'Yield ETH', source: 'Infrared / Usual', chain: 'ethereum', fallback: 3.0, max: 15 },
  // Stablecoins
  { symbol: 'sUSDe', address: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', method: 'erc4626', type: 'Staked Stablecoin', source: 'Ethena', chain: 'ethereum', fallback: 15.0, max: 30 },
  { symbol: 'sDAI', address: '0x83F20F44975D03b1b09e64809B757c47f942BEeA', method: 'erc4626', type: 'Savings Token', source: 'MakerDAO', chain: 'ethereum', fallback: 5.0, max: 15 },
  { symbol: 'sUSDS', address: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD', method: 'erc4626', type: 'Savings Token', source: 'Sky (MakerDAO)', chain: 'ethereum', fallback: 4.5, max: 10 },
  { symbol: 'sUSDf', address: '0xc8CF6D7991f15525488b2A83Df53468D682Ba4B0', method: 'erc4626', type: 'Staked Stablecoin', source: 'Falcon Finance', chain: 'ethereum', fallback: 8.0, max: 25 },
  { symbol: 'wstUSR', address: '0x1202F5C7b4B9E47a1A484E8B270be34dbbC75055', method: 'erc4626', type: 'Staked Stablecoin', source: 'Resolv', chain: 'ethereum', fallback: 4.0, max: 15 },
  { symbol: 'wsrUSD', address: '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094', method: 'erc4626', type: 'Staked Stablecoin', source: 'Resolv', chain: 'ethereum', fallback: 4.0, max: 15 },
  { symbol: 'syrupUSDC', address: '0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b', method: 'erc4626', type: 'Lending Vault', source: 'Maple Finance', chain: 'ethereum', fallback: 8.0, max: 20 },
  // Base chain
  { symbol: 'superOETHb', address: '0xDBFeFD2e8460a6Ee4955A68582F85708BAEA60A3', method: 'rebasing', type: 'Yield ETH', source: 'Origin Protocol', chain: 'base', fallback: 3.8, max: 20 },
  { symbol: 'yoETH', address: '0x3A43AEC53490CB9Fa922847385D82fe25d0E9De7', method: 'erc4626', type: 'Yield ETH', source: 'YO Protocol', chain: 'base', fallback: 4.0, max: 25 },
  { symbol: 'bsdETH', address: '0xCb327b99fF831bF8223cCEd12B1338FF3aA322Ff', method: 'erc4626', type: 'Yield ETH', source: 'Based ETH', chain: 'base', fallback: 3.5, max: 15 },
];

export const RATE_BLOCKS_PER_DAY: Record<RateChain, number> = { ethereum: 7200, base: 43200, optimism: 43200 };

const DEFAULT_RPCS: Record<RateChain, string> = {
  ethereum: 'https://eth.llamarpc.com',
  base: 'https://mainnet.base.org',
  optimism: 'https://mainnet.optimism.io',
};

const VIEM_CHAINS = { ethereum: mainnet, base, optimism } as const;

// ── Rate fetching ───────────────────────────────────────────

export async function getRate(t: TokenCfg, c: AnyClient, block: bigint): Promise<number | null> {
  try {
    switch (t.method) {
      case 'wstETH':
        return Number(await c.readContract({ address: t.address, abi: tokenAbi.stEthPerToken, functionName: 'stEthPerToken', blockNumber: block })) / 1e18;
      case 'cbETH':
        return Number(await c.readContract({ address: t.address, abi: tokenAbi.exchangeRate, functionName: 'exchangeRate', blockNumber: block })) / 1e18;
      case 'rETH':
        return Number(await c.readContract({ address: t.address, abi: tokenAbi.getExchangeRate, functionName: 'getExchangeRate', blockNumber: block })) / 1e18;
      case 'weETH':
        return Number(await c.readContract({ address: t.address, abi: tokenAbi.getRate, functionName: 'getRate', blockNumber: block })) / 1e18;
      case 'rsETH':
        return Number(await c.readContract({ address: t.helper!, abi: tokenAbi.rsETHPrice, functionName: 'rsETHPrice', blockNumber: block })) / 1e18;
      case 'ezETH': {
        const [, , tvl] = await c.readContract({ address: t.helper!, abi: tokenAbi.calculateTVLs, functionName: 'calculateTVLs', blockNumber: block });
        const supply = await c.readContract({ address: t.address, abi: tokenAbi.totalSupply, functionName: 'totalSupply', blockNumber: block });
        return supply === 0n ? null : Number(tvl) / Number(supply);
      }
      case 'erc4626': {
        const [assets, supply] = await Promise.all([
          c.readContract({ address: t.address, abi: tokenAbi.erc4626, functionName: 'totalAssets', blockNumber: block }),
          c.readContract({ address: t.address, abi: tokenAbi.erc4626, functionName: 'totalSupply', blockNumber: block }),
        ]);
        return supply === 0n ? null : Number(assets) / Number(supply);
      }
      case 'rebasing': {
        const credits = await c.readContract({ address: t.address, abi: tokenAbi.rebasing, functionName: 'rebasingCreditsPerToken', blockNumber: block });
        return credits === 0n ? null : 1e18 / Number(credits);
      }
      case 'lsETH': {
        const [underlying, supply] = await Promise.all([
          c.readContract({ address: t.address, abi: tokenAbi.lsETH, functionName: 'totalUnderlyingSupply', blockNumber: block }),
          c.readContract({ address: t.address, abi: tokenAbi.lsETH, functionName: 'totalSupply', blockNumber: block }),
        ]);
        return supply === 0n ? null : Number(underlying) / Number(supply);
      }
    }
  } catch { return null; }
}

async function calcApy(t: TokenCfg, c: AnyClient, curBlock: bigint, curRate: number, days: number): Promise<number | null> {
  try {
    const pastBlock = curBlock - BigInt(RATE_BLOCKS_PER_DAY[t.chain] * days);
    if (pastBlock <= 0n) return null;
    const pastRate = await getRate(t, c, pastBlock);
    if (!pastRate || pastRate <= 0) return null;
    const [curB, pastB] = await Promise.all([
      c.getBlock({ blockNumber: curBlock }),
      c.getBlock({ blockNumber: pastBlock }),
    ]);
    const actualDays = Number(curB.timestamp - pastB.timestamp) / 86400;
    if (actualDays <= 0) return null;
    const apy = (Math.pow(curRate / pastRate, 365.25 / actualDays) - 1) * 100;
    return apy >= 0 && apy <= t.max ? apy : null;
  } catch { return null; }
}

// ── Public API ──────────────────────────────────────────────

export async function refreshAllTokenRates(): Promise<{
  timestamp: string;
  rates: TokenRateResult[];
}> {
  // Create clients
  const clients: Partial<Record<RateChain, AnyClient>> = {};
  for (const chain of ['ethereum', 'base', 'optimism'] as RateChain[]) {
    const rpc = process.env[`${chain.toUpperCase()}_RPC_URL`] || DEFAULT_RPCS[chain];
    try {
      clients[chain] = createPublicClient({ chain: VIEM_CHAINS[chain], transport: http(rpc) });
    } catch { /* skip chain */ }
  }

  const rates: TokenRateResult[] = [];

  for (const token of TOKENS) {
    const client = clients[token.chain];
    if (!client) {
      rates.push({ token: token.symbol, apy_7d: token.fallback, apy_30d: token.fallback, type: token.type, source: token.source });
      continue;
    }

    try {
      const block = await client.getBlockNumber();
      const curRate = await getRate(token, client, block);

      if (!curRate || curRate <= 0) {
        rates.push({ token: token.symbol, apy_7d: token.fallback, apy_30d: token.fallback, type: token.type, source: token.source });
        continue;
      }

      const apy7 = await calcApy(token, client, block, curRate, 7);
      const apy30 = await calcApy(token, client, block, curRate, 30);

      const clamp = (v: number | null, fb: number, mx: number) =>
        Math.round(Math.max(0, Math.min(mx, v ?? fb)) * 100) / 100;

      const result: TokenRateResult = {
        token: token.symbol,
        apy_7d: clamp(apy7, token.fallback, token.max),
        apy_30d: clamp(apy30, token.fallback, token.max),
        type: token.type,
        rate: Math.round(curRate * 1e6) / 1e6,
        source: token.source,
      };
      if (token.chain !== 'ethereum') result.chain = token.chain;

      rates.push(result);
    } catch {
      rates.push({ token: token.symbol, apy_7d: token.fallback, apy_30d: token.fallback, type: token.type, source: token.source });
    }
  }

  return { timestamp: new Date().toISOString(), rates };
}
