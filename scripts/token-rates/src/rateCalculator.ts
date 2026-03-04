/**
 * On-chain token rate calculator.
 * Fetches exchange rates at current block and N days ago,
 * then annualizes the growth into APY.
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Address,
} from "viem";
import { mainnet, base, optimism } from "viem/chains";
import chalk from "chalk";
import {
  wstETH_ABI,
  cbETH_ABI,
  rETH_ABI,
  weETH_ABI,
  rsETH_ORACLE_ABI,
  ERC4626_ABI,
  REBASING_ABI,
  TOTAL_SUPPLY_ABI,
  EZETH_RESTAKE_MANAGER_ABI,
  LSETH_ABI,
  EIGEN_TRACKER_ABI,
} from "./abis.js";
import {
  type TokenConfig,
  type Chain,
  BLOCKS_PER_DAY,
  DEFAULT_RPCS,
  EIGEN_TOKEN,
  EETH_TOKEN,
  OPTIMISM_RESTAKING_TRACKER,
} from "./tokens.js";

const VIEM_CHAINS = { ethereum: mainnet, base, optimism } as const;

export interface TokenRate {
  token: string;
  apy_7d: number;
  apy_30d: number;
  type: string;
  rate?: number;
  source: string;
  chain?: string;
  rewardsApy?: number;
}

export class RateCalculator {
  private clients: Record<Chain, PublicClient>;
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;

    // Create public clients per chain
    this.clients = {} as Record<Chain, PublicClient>;
    for (const chain of ["ethereum", "base", "optimism"] as Chain[]) {
      const rpcUrl =
        process.env[`${chain.toUpperCase()}_RPC_URL`] || DEFAULT_RPCS[chain];
      this.clients[chain] = createPublicClient({
        chain: VIEM_CHAINS[chain],
        transport: http(rpcUrl),
      });
    }
  }

  /** Verify connections */
  async checkConnections(): Promise<void> {
    for (const [chain, client] of Object.entries(this.clients)) {
      try {
        const block = await client.getBlockNumber();
        console.log(chalk.green(`  Connected to ${chain} (block ${block})`));
      } catch {
        console.log(chalk.yellow(`  Warning: ${chain} RPC unavailable`));
      }
    }
  }

  /** Calculate APY for a single token */
  async calculateTokenRate(token: TokenConfig): Promise<TokenRate | null> {
    const client = this.clients[token.chain];
    if (!client) {
      console.log(chalk.yellow(`  Skipping ${token.symbol}: no ${token.chain} client`));
      return null;
    }

    this.log(`  Fetching ${token.symbol} (${token.rateMethod})...`);

    try {
      const currentBlock = await client.getBlockNumber();

      // Get current exchange rate
      const currentRate = await this.getRate(token, client, currentBlock);
      if (currentRate === null || currentRate <= 0) {
        console.log(chalk.yellow(`  ${token.symbol}: could not read rate, using fallback`));
        return this.fallback(token);
      }

      // Calculate 7-day APY
      const apy7d = await this.calculatePeriodApy(
        token, client, currentBlock, currentRate, 7
      );

      // Calculate 30-day APY
      const apy30d = await this.calculatePeriodApy(
        token, client, currentBlock, currentRate, 30
      );

      // Get rewards APY (for weETH EIGEN restaking)
      let rewardsApy: number | undefined;
      if (token.symbol === "weETH") {
        rewardsApy = await this.getEigenRestakingRewards();
      }

      const result: TokenRate = {
        token: token.symbol,
        apy_7d: this.clamp(apy7d ?? token.fallbackApy, 0, token.maxApy),
        apy_30d: this.clamp(apy30d ?? token.fallbackApy, 0, token.maxApy),
        type: token.type,
        rate: currentRate,
        source: token.source,
      };

      if (token.chain !== "ethereum") {
        result.chain = token.chain;
      }

      if (rewardsApy !== undefined && rewardsApy > 0) {
        result.rewardsApy = rewardsApy;
        // Add rewards to base APY for total
        result.apy_7d = this.clamp(result.apy_7d + rewardsApy, 0, token.maxApy);
        result.apy_30d = this.clamp(result.apy_30d + rewardsApy, 0, token.maxApy);
      }

      console.log(
        chalk.green(`  ${token.symbol}: `) +
        `7d=${result.apy_7d.toFixed(2)}%, 30d=${result.apy_30d.toFixed(2)}%, ` +
        `rate=${currentRate.toFixed(6)}` +
        (rewardsApy ? `, rewards=${rewardsApy.toFixed(2)}%` : "")
      );

      return result;

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`  ${token.symbol}: error (${msg.slice(0, 60)}), using fallback`));
      return this.fallback(token);
    }
  }

  // ─── Rate Fetching by Method ──────────────────────────────

  private async getRate(
    token: TokenConfig,
    client: PublicClient,
    blockNumber: bigint
  ): Promise<number | null> {
    try {
      switch (token.rateMethod) {
        case "wstETH":
          return Number(
            await client.readContract({
              address: token.address,
              abi: wstETH_ABI,
              functionName: "stEthPerToken",
              blockNumber,
            })
          ) / 1e18;

        case "cbETH":
          return Number(
            await client.readContract({
              address: token.address,
              abi: cbETH_ABI,
              functionName: "exchangeRate",
              blockNumber,
            })
          ) / 1e18;

        case "rETH":
          return Number(
            await client.readContract({
              address: token.address,
              abi: rETH_ABI,
              functionName: "getExchangeRate",
              blockNumber,
            })
          ) / 1e18;

        case "weETH":
          return Number(
            await client.readContract({
              address: token.address,
              abi: weETH_ABI,
              functionName: "getRate",
              blockNumber,
            })
          ) / 1e18;

        case "rsETH": {
          const oracle = token.helperContract!;
          return Number(
            await client.readContract({
              address: oracle,
              abi: rsETH_ORACLE_ABI,
              functionName: "rsETHPrice",
              blockNumber,
            })
          ) / 1e18;
        }

        case "ezETH": {
          const manager = token.helperContract!;
          const [, , totalTvl] = await client.readContract({
            address: manager,
            abi: EZETH_RESTAKE_MANAGER_ABI,
            functionName: "calculateTVLs",
            blockNumber,
          });
          const supply = await client.readContract({
            address: token.address,
            abi: TOTAL_SUPPLY_ABI,
            functionName: "totalSupply",
            blockNumber,
          });
          if (supply === 0n) return null;
          return Number(totalTvl) / Number(supply);
        }

        case "erc4626": {
          const [assets, supply] = await Promise.all([
            client.readContract({
              address: token.address,
              abi: ERC4626_ABI,
              functionName: "totalAssets",
              blockNumber,
            }),
            client.readContract({
              address: token.address,
              abi: ERC4626_ABI,
              functionName: "totalSupply",
              blockNumber,
            }),
          ]);
          if (supply === 0n) return null;
          return Number(assets) / Number(supply);
        }

        case "rebasing": {
          const credits = await client.readContract({
            address: token.address,
            abi: REBASING_ABI,
            functionName: "rebasingCreditsPerToken",
            blockNumber,
          });
          if (credits === 0n) return null;
          return 1e18 / Number(credits);
        }

        case "lsETH": {
          const [underlying, supply] = await Promise.all([
            client.readContract({
              address: token.address,
              abi: LSETH_ABI,
              functionName: "totalUnderlyingSupply",
              blockNumber,
            }),
            client.readContract({
              address: token.address,
              abi: LSETH_ABI,
              functionName: "totalSupply",
              blockNumber,
            }),
          ]);
          if (supply === 0n) return null;
          return Number(underlying) / Number(supply);
        }

        case "fixed":
          return 1.0;

        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  // ─── APY Calculation ──────────────────────────────────────

  private async calculatePeriodApy(
    token: TokenConfig,
    client: PublicClient,
    currentBlock: bigint,
    currentRate: number,
    days: number
  ): Promise<number | null> {
    try {
      const blocksAgo = BigInt(BLOCKS_PER_DAY[token.chain] * days);
      const pastBlock = currentBlock - blocksAgo;

      if (pastBlock <= 0n) return null;

      const pastRate = await this.getRate(token, client, pastBlock);
      if (pastRate === null || pastRate <= 0) return null;

      // Get actual timestamps for precise calculation
      const [currentBlockData, pastBlockData] = await Promise.all([
        client.getBlock({ blockNumber: currentBlock }),
        client.getBlock({ blockNumber: pastBlock }),
      ]);

      const actualDays =
        Number(currentBlockData.timestamp - pastBlockData.timestamp) / 86400;
      if (actualDays <= 0) return null;

      const growth = currentRate / pastRate;
      const apy = (Math.pow(growth, 365.25 / actualDays) - 1) * 100;

      this.log(
        `    ${days}d: rate ${pastRate.toFixed(6)} → ${currentRate.toFixed(6)}, ` +
        `growth=${((growth - 1) * 100).toFixed(4)}%, apy=${apy.toFixed(2)}%`
      );

      // Sanity check
      if (apy < 0 || apy > token.maxApy) {
        this.log(`    ${days}d: APY ${apy.toFixed(2)}% outside range, returning null`);
        return null;
      }

      return apy;
    } catch {
      return null;
    }
  }

  // ─── EIGEN Restaking Rewards (for weETH) ──────────────────

  private async getEigenRestakingRewards(): Promise<number | undefined> {
    try {
      const opClient = this.clients.optimism;
      const ethClient = this.clients.ethereum;

      // Get weekly EIGEN from Optimism tracker
      const weeklyEigen = Number(
        await opClient.readContract({
          address: OPTIMISM_RESTAKING_TRACKER,
          abi: EIGEN_TRACKER_ABI,
          functionName: "categoryTVL",
          args: [EIGEN_TOKEN],
        })
      ) / 1e18;

      // Get eETH total supply from mainnet
      const eethSupply = Number(
        await ethClient.readContract({
          address: EETH_TOKEN,
          abi: TOTAL_SUPPLY_ABI,
          functionName: "totalSupply",
        })
      ) / 1e18;

      // Get prices from DeFiLlama
      const [eigenPrice, eethPrice] = await Promise.all([
        this.getTokenPrice(EIGEN_TOKEN, "ethereum"),
        this.getTokenPrice(EETH_TOKEN, "ethereum"),
      ]);

      if (!eigenPrice || !eethPrice || eethSupply === 0) return undefined;

      const apy =
        ((weeklyEigen * eigenPrice) / 7 / (eethSupply * eethPrice)) * 365 * 100;

      this.log(`    EIGEN rewards: ${apy.toFixed(2)}% APY`);
      return apy > 0 && apy < 5 ? apy : undefined;
    } catch {
      return undefined;
    }
  }

  private async getTokenPrice(
    address: Address,
    chain: string
  ): Promise<number | null> {
    try {
      const res = await fetch(
        `https://coins.llama.fi/prices/current/${chain}:${address}`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      return data.coins?.[`${chain}:${address}`]?.price ?? null;
    } catch {
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private fallback(token: TokenConfig): TokenRate {
    return {
      token: token.symbol,
      apy_7d: token.fallbackApy,
      apy_30d: token.fallbackApy,
      type: token.type,
      source: token.source,
      ...(token.chain !== "ethereum" ? { chain: token.chain } : {}),
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.round(Math.max(min, Math.min(max, value)) * 100) / 100;
  }

  private log(msg: string) {
    if (this.verbose) console.log(chalk.gray(msg));
  }
}
