import { Address } from "viem";

export interface MorphoMarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

export interface MorphoMarketData {
  marketId: string;
  marketParams: MorphoMarketParams;
  loanTokenSymbol: string;
  loanTokenName: string;
  loanTokenDecimals: number;
  collateralTokenSymbol: string;
  collateralTokenName: string;
  collateralTokenDecimals: number;
  totalSupplyAssets: string;
  totalBorrowAssets: string;
  totalSupplyShares: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
  supplyAPY: number;
  borrowAPY: number;
  utilizationRate: number;
  lltv: number;
  lltvPercentage: string;
  oracleType: string;
  oraclePrice: number;
  availableLiquidity: string;
}

export interface MorphoDashboardFilters {
  minTvl?: number;
  maxTvl?: number;
  minSupplyAPY?: number;
  loanTokenSymbol?: string;
  collateralTokenSymbol?: string;
}

export interface MorphoMarketRiskAnalysis {
  marketId: string;
  loanTokenSymbol: string;
  collateralTokenSymbol: string;
  lltv: number;
  maxLeverage: number;
  recommendedMaxLeverage: number;
  healthFactorAtMaxLeverage: number;
  riskScore: number;
  riskLevel: string;
  liquidationRisk: string;
  oracleRisk: string;
  isSameAssetStrategy: boolean;
  supplyAPY: number;
  borrowAPY: number;
  collateralYield: number;
  netAPY: number;
  totalAPY: number;
  availableLiquidity: string;
  totalBorrowed: string;
  utilizationRate: number;
  oracleType: string;
  notes: string[];
  recommendedForLeverage: boolean;
}

export interface MorphoLeverageSimulation {
  marketId: string;
  loanTokenSymbol: string;
  collateralTokenSymbol: string;
  initialDeposit: number;
  targetLeverage: number;
  finalCollateral: number;
  finalDebt: number;
  healthFactor: number;
  estimatedAPY: number;
  liquidationPrice: number;
  priceDropToLiquidation: number;
}
