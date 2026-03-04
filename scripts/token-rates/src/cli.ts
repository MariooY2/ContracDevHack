#!/usr/bin/env node

/**
 * Token Rates Refresh — On-Chain APY Calculator
 *
 * Fetches exchange rates from Ethereum/Base/Optimism,
 * calculates 7d and 30d APY, writes to frontend/public/data/token_rates_onchain.json
 *
 * Usage:
 *   npm run refresh            Fetch all token rates → JSON
 *   npm run refresh:verbose    With detailed debug output
 */

import chalk from "chalk";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { RateCalculator, type TokenRate } from "./rateCalculator.js";
import { TOKENS } from "./tokens.js";

dotenv.config();

const OUTPUT_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "frontend",
  "public",
  "data",
  "token_rates_onchain.json"
);

async function main() {
  const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");

  console.log(chalk.bold.cyan("\n  Token Rates — On-Chain APY Calculator\n"));

  const calculator = new RateCalculator(verbose);
  await calculator.checkConnections();

  console.log(chalk.cyan(`\n  Calculating rates for ${TOKENS.length} tokens...\n`));

  const rates: TokenRate[] = [];
  let successes = 0;
  let fallbacks = 0;

  for (const token of TOKENS) {
    const rate = await calculator.calculateTokenRate(token);
    if (rate) {
      rates.push(rate);
      // Check if it used fallback (no rate field = fallback)
      if (rate.rate !== undefined) {
        successes++;
      } else {
        fallbacks++;
      }
    }
  }

  // Write output JSON
  const output = {
    timestamp: new Date().toISOString(),
    rates,
  };

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log(chalk.bold.green(`\n  Done!`));
  console.log(chalk.green(`  ${successes} on-chain, ${fallbacks} fallback, ${rates.length} total`));
  console.log(chalk.green(`  Saved to: ${OUTPUT_PATH}\n`));

  // Summary table
  console.log(chalk.bold("  Token           7d APY    30d APY   Type                 Source"));
  console.log("  " + "-".repeat(80));
  for (const r of rates) {
    const sym = r.token.padEnd(16);
    const a7 = `${r.apy_7d.toFixed(2)}%`.padEnd(10);
    const a30 = `${r.apy_30d.toFixed(2)}%`.padEnd(10);
    const typ = r.type.padEnd(21);
    console.log(`  ${sym}${a7}${a30}${typ}${r.source}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
