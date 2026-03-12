import type { ChainSlug, RawMarket, RawTokenRate, RawLeverageAnalysis, EnrichedMarket, ChainSummary, OracleCategory } from './types';
import { CHAIN_CONFIG } from './chains';

/**
 * Mapping from wrapped/derivative token symbols to the base symbol
 * used in token_rates_onchain.json
 */
const WRAPPED_TOKEN_MAP: Record<string, string> = {
  wstETH: 'wstETH',
  weETH: 'weETH',
  cbETH: 'cbETH',
  rETH: 'rETH',
  wrsETH: 'wrsETH',
  wsuperOETHb: 'wsuperOETHb',
  stMATIC: 'stMATIC',
  sUSDe: 'sUSDe',
  sDAI: 'sDAI',
  USDbC: 'USDbC',
  // Fallback: exact match is tried first
};

export function computeROE(
  collateralYield: number,
  supplyAPY: number,
  borrowAPY: number,
  leverage: number
): number {
  return (collateralYield * leverage) + (supplyAPY * leverage) - (borrowAPY * (leverage - 1));
}

export function computeHealthFactor(leverage: number, lltv: number): number {
  if (leverage <= 1) return Infinity;
  return (leverage * lltv) / (leverage - 1) / 100;
}

function findTokenRate(symbol: string, tokenRates: RawTokenRate[]): RawTokenRate | undefined {
  // Direct match
  const direct = tokenRates.find(r => r.token === symbol);
  if (direct) return direct;

  // Wrapped mapping
  const mapped = WRAPPED_TOKEN_MAP[symbol];
  if (mapped && mapped !== symbol) {
    return tokenRates.find(r => r.token === mapped);
  }

  return undefined;
}

function findLeverageAnalysis(
  marketId: string,
  chainSlug: ChainSlug,
  collateralSymbol: string,
  loanSymbol: string,
  ethAnalysis: Record<string, RawLeverageAnalysis[]>,
  stableAnalysis: Record<string, RawLeverageAnalysis[]>
): RawLeverageAnalysis | undefined {
  const chainEth = ethAnalysis[chainSlug] || [];
  const chainStable = stableAnalysis[chainSlug] || [];

  // Try exact market_id match first
  const byId = [...chainEth, ...chainStable].find(a => a.market_id === marketId);
  if (byId) return byId;

  // Fallback: match by pair name pattern
  const pairName = `${collateralSymbol}/${loanSymbol}`;
  return [...chainEth, ...chainStable].find(a => a.market_name === pairName);
}

export function enrichMarkets(
  rawMarkets: Record<string, RawMarket[]>,
  tokenRatesData: { rates: RawTokenRate[] },
  ethAnalysis: Record<string, RawLeverageAnalysis[]>,
  stableAnalysis: Record<string, RawLeverageAnalysis[]>
): EnrichedMarket[] {
  const tokenRates = tokenRatesData.rates;
  const results: EnrichedMarket[] = [];

  for (const [chainSlug, markets] of Object.entries(rawMarkets)) {
    if (!CHAIN_CONFIG[chainSlug as ChainSlug]) continue;

    for (const market of markets) {
      const chain = CHAIN_CONFIG[chainSlug as ChainSlug];
      const lltv = market.lltv * 100; // Convert 0.945 -> 94.5
      const maxLeverage = 100 / (100 - lltv);

      // Find collateral yield
      const rate = findTokenRate(market.collateralTokenSymbol, tokenRates);
      const collateralYield = rate ? rate.apy_7d : 0;
      const yieldSource = rate ? rate.source : 'Unknown';

      // Find leverage analysis
      const analysis = findLeverageAnalysis(
        market.marketId,
        chainSlug as ChainSlug,
        market.collateralTokenSymbol,
        market.loanTokenSymbol,
        ethAnalysis,
        stableAnalysis
      );

      // Leverage tiers
      const conservativeLev = analysis ? analysis.conservative_leverage : Math.min(maxLeverage * 0.3, 3);
      const moderateLev = analysis ? analysis.moderate_leverage : Math.min(maxLeverage * 0.55, 8);
      const aggressiveLev = analysis ? analysis.aggressive_leverage : Math.min(maxLeverage * 0.8, 14);

      const enriched: EnrichedMarket = {
        marketId: market.marketId,
        chainSlug: chainSlug as ChainSlug,
        chainId: chain.chainId,
        pair: `${market.collateralTokenSymbol} / ${market.loanTokenSymbol}`,
        collateralSymbol: market.collateralTokenSymbol,
        loanSymbol: market.loanTokenSymbol,
        collateralAddress: market.marketParams.collateralToken,
        loanAddress: market.marketParams.loanToken,
        oracleAddress: market.marketParams.oracle,
        oracleType: market.oracleType,
        oracleCategory: (analysis?.oracle_category || 'EXCHANGE_RATE') as OracleCategory,
        depegMethod: analysis?.depeg_method || '',
        irmAddress: market.marketParams.irm,
        lltv,
        maxLeverage,
        supplyAPY: market.supplyAPY,
        borrowAPY: market.borrowAPY,
        collateralYield,
        yieldSource,
        totalSupply: market.totalSupplyAssets,
        totalBorrow: market.totalBorrowAssets,
        utilization: market.utilizationRate,
        availableLiquidity: market.availableLiquidity,
        maxDepeg: analysis ? analysis.max_depeg_percentage : 0,
        roe: {
          conservative: {
            leverage: conservativeLev,
            roe: computeROE(collateralYield, market.supplyAPY, market.borrowAPY, conservativeLev),
            healthFactor: computeHealthFactor(conservativeLev, lltv),
          },
          moderate: {
            leverage: moderateLev,
            roe: computeROE(collateralYield, market.supplyAPY, market.borrowAPY, moderateLev),
            healthFactor: computeHealthFactor(moderateLev, lltv),
          },
          aggressive: {
            leverage: aggressiveLev,
            roe: computeROE(collateralYield, market.supplyAPY, market.borrowAPY, aggressiveLev),
            healthFactor: computeHealthFactor(aggressiveLev, lltv),
          },
        },
      };

      results.push(enriched);
    }
  }

  return results;
}

export function getMarketsForChain(markets: EnrichedMarket[], chain: ChainSlug): EnrichedMarket[] {
  return markets.filter(m => m.chainSlug === chain);
}

export function buildChainSummaries(markets: EnrichedMarket[]): ChainSummary[] {
  const grouped: Record<string, EnrichedMarket[]> = {};
  for (const m of markets) {
    if (!grouped[m.chainSlug]) grouped[m.chainSlug] = [];
    grouped[m.chainSlug].push(m);
  }

  return Object.entries(grouped).map(([slug, chainMarkets]) => {
    const chain = CHAIN_CONFIG[slug as ChainSlug];
    const topROE = Math.max(...chainMarkets.map(m => m.roe.aggressive.roe));
    const totalLiquidity = chainMarkets.reduce((sum, m) => sum + parseFloat(m.availableLiquidity || '0'), 0);
    const avgAPY = chainMarkets.reduce((sum, m) => sum + m.supplyAPY, 0) / chainMarkets.length;

    return {
      slug: slug as ChainSlug,
      name: chain.name,
      chainId: chain.chainId,
      marketCount: chainMarkets.length,
      topROE,
      totalLiquidity,
      avgAPY,
      color: chain.color,
    };
  });
}
