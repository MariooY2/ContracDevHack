import { MorphoMarketData } from "./types.js";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

// Load token rates for collateral yields
const TOKEN_RATES_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "frontend",
  "public",
  "data",
  "token_rates_onchain.json"
);

interface TokenRate {
  token: string;
  apy_30d: number;
}

function getTokenYield(symbol: string): number {
  try {
    if (fs.existsSync(TOKEN_RATES_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_RATES_PATH, "utf-8"));
      const rates: TokenRate[] = data.rates || [];
      const normalizedSymbol = symbol.replace(/^w/, "").toLowerCase();

      const tokenRate = rates.find((rate) => {
        const rateSymbol = rate.token.toLowerCase();
        const normalizedRate = rate.token.replace(/^w/, "").toLowerCase();
        return (
          rateSymbol === symbol.toLowerCase() ||
          normalizedRate === normalizedSymbol
        );
      });

      return tokenRate ? tokenRate.apy_30d : 0;
    }
  } catch {}
  return 0;
}

export class MorphoDashboardFormatter {
  displaySimpleDashboard(
    markets: MorphoMarketData[],
    chainName?: string,
    ethPrice: number = 3200
  ): void {
    const header = chainName
      ? `MORPHO BLUE MARKETS DASHBOARD - ${chainName.toUpperCase()}`
      : "MORPHO BLUE MARKETS DASHBOARD";

    console.log("\n" + "=".repeat(160));
    console.log(chalk.bold.cyan(header));
    console.log("=".repeat(160) + "\n");

    if (markets.length === 0) {
      console.log(chalk.gray("  No markets in this category\n"));
      console.log("\n" + "=".repeat(160) + "\n");
      return;
    }

    // Header
    console.log(
      chalk.bold(
        "  Market".padEnd(50) +
          "LLTV".padEnd(10) +
          "TVL".padEnd(16) +
          "Supply APR".padEnd(14) +
          "Borrow APR".padEnd(14) +
          "Coll Yield".padEnd(14) +
          "Oracle"
      )
    );
    console.log("  " + "-".repeat(156));

    // Display each market
    markets.forEach((market) => {
      const collateralYield = getTokenYield(market.collateralTokenSymbol);
      const tvl =
        parseFloat(market.availableLiquidity) +
        parseFloat(market.totalBorrowAssets);
      const pairDisplay = `${market.collateralTokenSymbol}/${market.loanTokenSymbol}`;
      const idShort = market.marketId.substring(0, 10) + "...";
      const marketDisplay = `${pairDisplay} [${idShort}]`;

      const ethTokens = [
        "ETH", "WETH", "stETH", "wstETH", "rETH", "cbETH", "weETH",
        "ezETH", "rsETH", "pufETH", "wrsETH", "ynETHx", "hgETH",
      ];
      const isEthMarket = ethTokens.some((eth) =>
        market.loanTokenSymbol.toUpperCase().includes(eth.toUpperCase())
      );

      let tvlDisplay: string;
      if (isEthMarket) {
        tvlDisplay = `${tvl.toFixed(2)} ETH`;
      } else {
        if (tvl > 1_000_000) tvlDisplay = `$${(tvl / 1_000_000).toFixed(2)}M`;
        else if (tvl > 1000) tvlDisplay = `$${Math.round(tvl / 1000)}K`;
        else tvlDisplay = `$${Math.round(tvl)}`;
      }

      const supplyStr = chalk.green(`+${market.supplyAPY.toFixed(2)}%`);
      const borrowStr = chalk.red(`-${market.borrowAPY.toFixed(2)}%`);
      const yieldStr =
        collateralYield > 0
          ? chalk.cyan(`+${collateralYield.toFixed(2)}%`)
          : chalk.gray("0.00%");

      console.log(
        "  " +
          marketDisplay.padEnd(50) +
          market.lltvPercentage.padEnd(10) +
          tvlDisplay.padEnd(16) +
          padColored(supplyStr, 14) +
          padColored(borrowStr, 14) +
          padColored(yieldStr, 14) +
          market.oracleType
      );
    });

    console.log("\n" + "=".repeat(160) + "\n");
  }
}

/** Pad a chalk-colored string properly */
function padColored(str: string, width: number): string {
  const visibleLength = str.replace(/\u001b\[[0-9;]*m/g, "").length;
  const padding = width - visibleLength;
  return str + " ".repeat(Math.max(0, padding));
}
