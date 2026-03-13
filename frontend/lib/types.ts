export const BASE_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://rpc.contract.dev/eb48f1e525119201aedb590f162be7bc';

export interface ReserveInfo {
  ltv: number;
  liquidationThreshold: number;
  maxLeverage: number;
  supplyAPY: number;
  borrowAPY: number;
  stakingYield: number;
}

// ── Multi-chain types ──────────────────────────────────────

export type ChainSlug = 'ethereum' | 'base' | 'arbitrum' | 'polygon';

export interface ChainMeta {
  slug: ChainSlug;
  name: string;
  chainId: number;
  color: string;
  rpcUrl: string;
  blockExplorer: string;
}

/** Raw market from morpho_markets_all_chains.json */
export interface RawMarket {
  marketId: string;
  marketParams: {
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: string;
  };
  loanTokenSymbol: string;
  collateralTokenSymbol: string;
  loanTokenDecimals: number;
  collateralTokenDecimals: number;
  totalSupplyAssets: string;
  totalBorrowAssets: string;
  supplyAPY: number;
  borrowAPY: number;
  utilizationRate: number;
  lltv: number;
  lltvPercentage: string;
  oracleType: string;
  availableLiquidity: string;
}

/** Raw token rate from token_rates_onchain.json */
export interface RawTokenRate {
  token: string;
  apy_7d: number;
  apy_30d: number;
  type: string;
  rate?: number;
  source: string;
}

export type OracleCategory = 'EXCHANGE_RATE' | 'VAULT' | 'MARKET_PRICE' | 'STATIC';

/** Raw leverage analysis from eth/stable pairs analysis JSON */
export interface RawLeverageAnalysis {
  market_id: string;
  market_name: string;
  lltv: number;
  chain: string;
  chain_id: number;
  max_leverage: number;
  max_depeg_percentage: number;
  theoretical_max_leverage: number;
  conservative_leverage: number;
  moderate_leverage: number;
  aggressive_leverage: number;
  health_factor_at_max_leverage: number;
  oracle_category?: OracleCategory;
  depeg_method?: string;
}

/** Enriched market after merging all data sources */
export interface EnrichedMarket {
  marketId: string;
  chainSlug: ChainSlug;
  chainId: number;
  pair: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralAddress: string;
  loanAddress: string;
  oracleAddress: string;
  oracleType: string;
  oracleCategory: OracleCategory;
  depegMethod: string;
  irmAddress: string;
  lltv: number;
  maxLeverage: number;
  supplyAPY: number;
  borrowAPY: number;
  collateralYield: number;
  yieldSource: string;
  totalSupply: string;
  totalBorrow: string;
  utilization: number;
  availableLiquidity: string;
  maxDepeg: number;
  roe: {
    conservative: { leverage: number; roe: number; healthFactor: number };
    moderate: { leverage: number; roe: number; healthFactor: number };
    aggressive: { leverage: number; roe: number; healthFactor: number };
  };
}

/** Chain summary for home page */
export interface ChainSummary {
  slug: ChainSlug;
  name: string;
  chainId: number;
  marketCount: number;
  topROE: number;
  totalLiquidity: number;
  avgAPY: number;
  color: string;
}

/** Leverage tier preset */
export interface LeverageTier {
  label: 'Conservative' | 'Moderate' | 'Aggressive';
  leverage: number;
  roe: number;
  healthFactor: number;
  color: string;
}
