/**
 * Quick diagnostic: test oracle + intrinsic sampling for the wstETH/WETH Base market.
 * Run: npx tsx scripts/debug-depeg.ts
 */
import { createPublicClient, http, type Address } from 'viem';
import { mainnet, base } from 'viem/chains';
import { getRate, TOKENS, type TokenCfg } from '../lib/refreshTokenRates';

const ORACLE_ABI = [{
  inputs: [], name: 'price', outputs: [{ type: 'uint256' }],
  stateMutability: 'view', type: 'function',
}] as const;

async function main() {
  const ethRpc = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
  const baseRpc = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

  console.log('ETH RPC:', ethRpc.substring(0, 50) + '...');
  console.log('BASE RPC:', baseRpc.substring(0, 50) + '...');

  const ethClient = createPublicClient({ chain: mainnet, transport: http(ethRpc) });
  const baseClient = createPublicClient({ chain: base, transport: http(baseRpc) });

  // Get head blocks
  const ethBlock = await ethClient.getBlockNumber();
  const baseBlock = await baseClient.getBlockNumber();
  const ethHead = await ethClient.getBlock({ blockNumber: ethBlock });
  const baseHead = await baseClient.getBlock({ blockNumber: baseBlock });

  console.log(`\nETH head: block ${ethBlock}, ts ${ethHead.timestamp}`);
  console.log(`BASE head: block ${baseBlock}, ts ${baseHead.timestamp}`);

  // wstETH config
  const wstETHCfg = TOKENS.find(t => t.symbol === 'wstETH')!;
  console.log(`\nwstETH config:`, { address: wstETHCfg.address, method: wstETHCfg.method, chain: wstETHCfg.chain });

  // The Morpho oracle for wstETH/WETH on Base
  // Market: 0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba
  // We need the oracle address from the market data
  // Let's just test the intrinsic rate first

  // Test 1: Current intrinsic rate
  const currentRate = await getRate(wstETHCfg, ethClient, ethBlock);
  console.log(`\n[Current] wstETH intrinsic rate: ${currentRate}`);

  // Test 2: Rate 30 days ago on Ethereum
  const ethBpd = 7200;
  const block30d = ethBlock - BigInt(ethBpd * 30);
  const rate30d = await getRate(wstETHCfg, ethClient, block30d);
  console.log(`[30d ago] wstETH intrinsic rate at block ${block30d}: ${rate30d}`);

  // Test 3: Rate 90 days ago
  const block90d = ethBlock - BigInt(ethBpd * 90);
  const rate90d = await getRate(wstETHCfg, ethClient, block90d);
  console.log(`[90d ago] wstETH intrinsic rate at block ${block90d}: ${rate90d}`);

  // Test 4: Rate 180 days ago
  const block180d = ethBlock - BigInt(ethBpd * 180);
  const rate180d = await getRate(wstETHCfg, ethClient, block180d);
  console.log(`[180d ago] wstETH intrinsic rate at block ${block180d}: ${rate180d}`);

  // Test 5: Oracle price on Base (we need to know the oracle address)
  // Let's try reading the oracle for this market from Morpho
  // The Morpho Blue contract on Base
  const morphoBase: Address = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
  const marketId = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba';

  // Read market params from Morpho
  const idToMarketParamsAbi = [{
    inputs: [{ type: 'bytes32' }],
    name: 'idToMarketParams',
    outputs: [
      { name: 'loanToken', type: 'address' },
      { name: 'collateralToken', type: 'address' },
      { name: 'oracle', type: 'address' },
      { name: 'irm', type: 'address' },
      { name: 'lltv', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  }] as const;

  try {
    const params = await baseClient.readContract({
      address: morphoBase,
      abi: idToMarketParamsAbi,
      functionName: 'idToMarketParams',
      args: [marketId as `0x${string}`],
    });
    console.log(`\nMarket params:`, {
      loanToken: params[0],
      collateralToken: params[1],
      oracle: params[2],
      lltv: Number(params[4]) / 1e18,
    });

    const oracleAddr = params[2] as Address;

    // Read current oracle price
    const currentPrice = await baseClient.readContract({
      address: oracleAddr,
      abi: ORACLE_ABI,
      functionName: 'price',
    });
    console.log(`\n[Current] Oracle price (raw): ${currentPrice}`);

    // Both wstETH and WETH are 18 decimals
    const scale = Math.pow(10, 36 + 18 - 18); // 10^36
    const oracleExchangeRate = Number(currentPrice) / scale;
    console.log(`[Current] Oracle exchange rate: ${oracleExchangeRate}`);
    console.log(`[Current] Intrinsic rate: ${currentRate}`);
    console.log(`[Current] Depeg: ${((oracleExchangeRate / currentRate!) - 1) * 100}%`);

    // Test historical oracle price (30 days ago on Base)
    const baseBpd = 43200;
    const baseBlock30d = baseBlock - BigInt(baseBpd * 30);
    const price30d = await baseClient.readContract({
      address: oracleAddr,
      abi: ORACLE_ABI,
      functionName: 'price',
      blockNumber: baseBlock30d,
    });
    const oracleRate30d = Number(price30d) / scale;
    console.log(`\n[30d ago] Oracle exchange rate: ${oracleRate30d}`);
    console.log(`[30d ago] Intrinsic rate: ${rate30d}`);
    if (rate30d) console.log(`[30d ago] Depeg: ${((oracleRate30d / rate30d) - 1) * 100}%`);

    // Test 90 days ago
    const baseBlock90d = baseBlock - BigInt(baseBpd * 90);
    try {
      const price90d = await baseClient.readContract({
        address: oracleAddr,
        abi: ORACLE_ABI,
        functionName: 'price',
        blockNumber: baseBlock90d,
      });
      const oracleRate90d = Number(price90d) / scale;
      console.log(`\n[90d ago] Oracle exchange rate: ${oracleRate90d}`);
      console.log(`[90d ago] Intrinsic rate: ${rate90d}`);
      if (rate90d) console.log(`[90d ago] Depeg: ${((oracleRate90d / rate90d) - 1) * 100}%`);
    } catch (e) {
      console.log(`\n[90d ago] Oracle read FAILED:`, (e as Error).message?.substring(0, 100));
    }

  } catch (e) {
    console.error('Failed to read market params:', (e as Error).message?.substring(0, 200));
  }
}

main().catch(console.error);
