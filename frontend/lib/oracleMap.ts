/**
 * Maps collateral token symbols to their oracle data source.
 * - type 'chainlink': uses Dune query 6811071 with oracle_address parameter
 * - type 'custom': uses a dedicated Dune query (queryId) with no parameters
 */
export interface OracleConfig {
  address: string;  // Key used for caching and API routing
  pair: string;
  type: 'chainlink' | 'custom';
  queryId?: number; // Only for custom oracles
  decimals?: number; // Price decimals (default 18 for chainlink, 6 for yoETH)
}

export const COLLATERAL_ORACLE_MAP: Record<string, OracleConfig> = {
  wstETH: { address: '0x04030d2F38Bc799aF9B0AaB5757ADC98000D7DeD', pair: 'wstETH/stETH', type: 'chainlink' },
  weETH:  { address: '0x19e6821Ee47a4c23E5971fEBeE29f78C2e514DC8', pair: 'weETH/eETH', type: 'chainlink' },
  cbETH:  { address: '0x16f542BC40723DfE8976A334564eF0c3CfD602Fd', pair: 'cbETH/ETH', type: 'chainlink' },
  wrsETH: { address: '0x222d25e4dEacAb0eE03E0cb282Ab3F602dED6EF2', pair: 'wrsETH/ETH', type: 'chainlink' },
  rETH:   { address: '0x484Cc23Fee336291E3c8803cF27e16B9BEe68744', pair: 'rETH/ETH', type: 'chainlink' },
  yoETH:  { address: '0x6E879d0CcC85085A709eBf5539224f53d0D396B0', pair: 'yoETH/ETH', type: 'custom', queryId: 6811220, decimals: 6 },
  wsuperOETHb: { address: '0x7FcD174E80f264448ebeE8c88a7C4476AAF58Ea6', pair: 'wsuperOETHb/ETH', type: 'custom', queryId: 6811262, decimals: 18 },
};

/**
 * Get oracle config for a given collateral symbol.
 */
export function getOracleForCollateral(symbol: string): OracleConfig | null {
  return COLLATERAL_ORACLE_MAP[symbol] || null;
}
