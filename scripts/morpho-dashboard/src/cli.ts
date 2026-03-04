#!/usr/bin/env node

/**
 * CLI for Morpho Blue Markets Dashboard
 *
 * Usage:
 *   npm run refresh                        Refresh all chains → frontend/public/data/
 *   npm run refresh:ethereum               Refresh Ethereum only
 */

import { MorphoDashboard, runDashboardForAllChains } from "./index.js";
import { getChainConfig, SUPPORTED_CHAINS } from "./chainConfig.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  const command = args.find((arg) => !arg.startsWith("-")) || "run";

  // --chain=<name>
  const chainArg = args.find((arg) => arg.startsWith("--chain="));
  const chainName = chainArg ? chainArg.split("=")[1] : undefined;

  const chainConfig = chainName ? getChainConfig(chainName) : undefined;

  if (chainName && !chainConfig) {
    console.error(`Error: Unsupported chain "${chainName}"`);
    console.error(
      `Supported chains: ${SUPPORTED_CHAINS.map((c) => c.chainName).join(", ")}`
    );
    process.exit(1);
  }

  const dashboard = chainConfig
    ? new MorphoDashboard(
        chainConfig,
        process.env[`${chainConfig.chainName.toUpperCase()}_RPC_URL`]
      )
    : null;

  try {
    switch (command.toLowerCase()) {
      case "run":
      case "dashboard":
      case "show": {
        const exportJson = args.includes("--json") || args.includes("-j");
        const exportExcel = args.includes("--excel") || args.includes("-e");
        const excelArg = args.find((a) => a.startsWith("--output="));
        const excelFilename = excelArg ? excelArg.split("=")[1] : undefined;

        if (dashboard) {
          await dashboard.run(
            undefined,
            exportExcel ? excelFilename || true : undefined,
            exportJson
          );
        } else {
          await runDashboardForAllChains(
            undefined,
            exportExcel ? excelFilename || true : undefined,
            exportJson
          );
        }
        break;
      }

      case "help":
      case "-h":
      case "--help":
        printHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Morpho Blue Markets — Data Refresh CLI

USAGE:
  npm run refresh                             Fetch all chains → JSON
  npm run refresh:ethereum                    Fetch Ethereum only → JSON
  npm run refresh:base                        Fetch Base only → JSON

OPTIONS:
  --chain=<name>       Specify chain (ethereum, base, arbitrum, polygon)
  --json, -j           Export JSON to frontend/public/data/
  --excel, -e          Export Excel (requires exceljs)

ENVIRONMENT VARIABLES (optional custom RPCs):
  ETHEREUM_RPC_URL     Custom Ethereum RPC
  BASE_RPC_URL         Custom Base RPC
  ARBITRUM_RPC_URL     Custom Arbitrum RPC
  POLYGON_RPC_URL      Custom Polygon RPC
`);
}

main();
