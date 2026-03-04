import { MorphoDataFetcher } from "./MorphoDataFetcher.js";
import { MorphoDashboardFormatter } from "./MorphoDashboardFormatter.js";
import { MorphoDashboardFilters, MorphoMarketData } from "./types.js";
import { ChainConfig, SUPPORTED_CHAINS } from "./chainConfig.js";
import { getEthPrice, isStablecoin, isEthToken } from "./priceOracle.js";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

// Output directory for JSON files consumed by the frontend
const FRONTEND_DATA_DIR = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "frontend",
  "public",
  "data"
);

export class MorphoDashboard {
  private dataFetcher: MorphoDataFetcher;
  private formatter: MorphoDashboardFormatter;
  private chainConfig: ChainConfig;

  constructor(chainConfig: ChainConfig, rpcUrl?: string) {
    this.chainConfig = chainConfig;
    this.dataFetcher = new MorphoDataFetcher(chainConfig, rpcUrl);
    this.formatter = new MorphoDashboardFormatter();
  }

  async run(
    _filters?: MorphoDashboardFilters,
    _exportExcel?: boolean | string,
    exportJson?: boolean
  ): Promise<MorphoMarketData[]> {
    console.log(
      chalk.cyan(
        `\n  Fetching Morpho Blue markets from ${this.chainConfig.displayName}...\n`
      )
    );

    try {
      let markets = await this.dataFetcher.getAllMarketsData();
      console.log(chalk.green(`  Fetched ${markets.length} markets\n`));

      // ── Filter out unwanted token types ──────────────────────
      const beforeTokenFilter = markets.length;
      markets = markets.filter((market) => {
        const col = market.collateralTokenSymbol;
        const loan = market.loanTokenSymbol;

        if (col.startsWith("GLV") || loan.startsWith("GLV")) return false;
        if (col.startsWith("GM:") || col.startsWith("GM ") || loan.startsWith("GM:") || loan.startsWith("GM ")) return false;
        if (col.startsWith("LP-") || loan.startsWith("LP-")) return false;
        if (col.startsWith("PT-") || loan.startsWith("PT-")) return false;

        const unwanted = ["ZCHF", "USUAL", "PWRUSDC", "bsdETH", "AA_FALCONXUSDC", "USD0", "mHyperETH"];
        if (unwanted.some((t) => col.toUpperCase().includes(t.toUpperCase()) || loan.toUpperCase().includes(t.toUpperCase()))) return false;

        return true;
      });
      console.log(
        chalk.green(
          `  Filtered out ${beforeTokenFilter - markets.length} unwanted tokens (kept ${markets.length})\n`
        )
      );

      // ── Same-asset filter ────────────────────────────────────
      console.log(chalk.cyan("  Filtering for same-asset markets...\n"));
      markets = markets.filter((market) => {
        const collateral = market.collateralTokenSymbol.toLowerCase();
        const loan = market.loanTokenSymbol.toLowerCase();

        const extractBase = (token: string): string => {
          let base = token.replace(/^w/, "");
          if (base.startsWith("pt-")) {
            const parts = base.split("-");
            if (parts.length >= 3) return parts[1].toLowerCase();
          }
          return base.toLowerCase();
        };

        const colBase = extractBase(collateral);
        const loanBase = extractBase(loan);

        return (
          colBase === loanBase ||
          colBase.includes(loanBase) ||
          loanBase.includes(colBase)
        );
      });
      console.log(
        chalk.green(`  ${markets.length} same-asset markets (zero price risk)\n`)
      );

      // ── TVL filter ───────────────────────────────────────────
      const ethPrice = await getEthPrice();
      console.log(chalk.gray(`  ETH price: $${ethPrice.toFixed(2)}\n`));

      const beforeTvl = markets.length;
      markets = markets.filter((market) => {
        const totalSupply =
          parseFloat(market.availableLiquidity) +
          parseFloat(market.totalBorrowAssets);

        if (isStablecoin(market.loanTokenSymbol)) return totalSupply >= 100_000;
        if (isEthToken(market.loanTokenSymbol)) return totalSupply * ethPrice >= 100_000;
        return totalSupply >= 100_000;
      });
      console.log(
        chalk.green(
          `  Filtered out ${beforeTvl - markets.length} low-TVL markets (kept ${markets.length})\n`
        )
      );

      // ── Display dashboard ────────────────────────────────────
      if (!exportJson) {
        this.formatter.displaySimpleDashboard(
          markets,
          this.chainConfig.displayName,
          ethPrice
        );
      }

      console.log(chalk.bold.green("  Dashboard complete!\n"));
      return markets;
    } catch (error) {
      console.error(chalk.red("\n  Error running dashboard:"), error);
      throw error;
    }
  }
}

/**
 * Run dashboard for all supported chains and optionally export JSON
 * to frontend/public/data/morpho_markets_all_chains.json
 */
export async function runDashboardForAllChains(
  filters?: MorphoDashboardFilters,
  _exportExcel?: boolean | string,
  exportJson?: boolean
): Promise<void> {
  console.log(
    chalk.bold.cyan(
      "\n  Running Morpho Blue Dashboard for ALL supported EVM chains...\n"
    )
  );

  const allChainResults: Record<string, MorphoMarketData[]> = {};

  for (const chainConfig of SUPPORTED_CHAINS) {
    try {
      const dashboard = new MorphoDashboard(chainConfig);
      const markets = await dashboard.run(filters, undefined, exportJson);
      allChainResults[chainConfig.chainName] = markets;
    } catch (error) {
      console.error(
        chalk.red(`\n  Error on ${chainConfig.displayName}:`),
        error
      );
      console.log(chalk.gray(`  Skipping ${chainConfig.displayName}...\n`));
    }
  }

  // ── Write JSON ───────────────────────────────────────────
  if (exportJson) {
    // Ensure output directory exists
    if (!fs.existsSync(FRONTEND_DATA_DIR)) {
      fs.mkdirSync(FRONTEND_DATA_DIR, { recursive: true });
    }

    const outputPath = path.join(FRONTEND_DATA_DIR, "morpho_markets_all_chains.json");

    // Custom replacer to handle BigInt serialization
    const jsonString = JSON.stringify(
      allChainResults,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    );

    fs.writeFileSync(outputPath, jsonString, "utf-8");
    console.log(chalk.green(`\n  JSON saved to: ${outputPath}\n`));

    // Print summary
    let totalMarkets = 0;
    for (const [chain, markets] of Object.entries(allChainResults)) {
      console.log(chalk.cyan(`  ${chain}: ${markets.length} markets`));
      totalMarkets += markets.length;
    }
    console.log(chalk.bold.green(`\n  Total: ${totalMarkets} markets across ${Object.keys(allChainResults).length} chains\n`));
  }

  console.log(chalk.bold.green("\n  All chains processed!\n"));
}

export * from "./types.js";
export { MorphoDataFetcher } from "./MorphoDataFetcher.js";
export { MorphoDashboardFormatter } from "./MorphoDashboardFormatter.js";
export type { ChainConfig } from "./chainConfig.js";
export { SUPPORTED_CHAINS } from "./chainConfig.js";
