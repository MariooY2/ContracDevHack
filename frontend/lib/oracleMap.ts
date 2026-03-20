/**
 * Maps collateral token symbols to their oracle data source, per chain.
 * - type 'chainlink': uses per-chain Dune query with oracle_address parameter (AnswerUpdated events)
 * - type 'custom': uses a dedicated Dune query (queryId) with no parameters
 * - type 'ethereum-universal': uses Dune query 6835721 with oracle_address + topic0 parameters
 */
export interface OracleConfig {
  address: string;  // Oracle contract address (used for caching and Dune query)
  pair: string;
  type: 'chainlink' | 'custom' | 'yoeth' | 'ethereum-universal' | 'tvl-ratio';
  queryId?: number; // Only for custom oracles
  topic0?: string;  // Only for ethereum-universal oracles
  decimals?: number; // Price decimals (default 18 for chainlink, 6 for yoETH)
  chainSlug: string;
  chainId: number;
}

// Chain-specific oracle configs: key is `chainSlug:collateralSymbol`
export const ORACLE_MAP: Record<string, OracleConfig> = {
  // ── Base ── (Chainlink AnswerUpdated via parameterized Dune query 6811071)
  'base:wstETH': { address: '0x04030d2F38Bc799aF9B0AaB5757ADC98000D7DeD', pair: 'wstETH/stETH', type: 'chainlink', chainSlug: 'base', chainId: 8453 },
  'base:weETH':  { address: '0x19e6821Ee47a4c23E5971fEBeE29f78C2e514DC8', pair: 'weETH/eETH', type: 'chainlink', chainSlug: 'base', chainId: 8453 },
  'base:cbETH':  { address: '0x16f542BC40723DfE8976A334564eF0c3CfD602Fd', pair: 'cbETH/ETH', type: 'chainlink', chainSlug: 'base', chainId: 8453 },
  'base:rETH':   { address: '0x484Cc23Fee336291E3c8803cF27e16B9BEe68744', pair: 'rETH/ETH', type: 'chainlink', chainSlug: 'base', chainId: 8453 },
  'base:wrsETH': { address: '0x222d25e4dEacAb0eE03E0cb282Ab3f602dED6EF2', pair: 'wrsETH/ETH', type: 'chainlink', chainSlug: 'base', chainId: 8453 },
  'base:ezETH':  { address: '0x233A45BF331B35440D45e9BEB1fdF2FbB7B4e3D2', pair: 'ezETH/ETH', type: 'chainlink', chainSlug: 'base', chainId: 8453 },
  'base:yoETH':  { address: '0x6E879d0CcC85085A709eBf5539224f53d0D396B0', pair: 'yoETH/ETH', type: 'yoeth', queryId: 6811220, decimals: 6, chainSlug: 'base', chainId: 8453 },
  'base:wsuperOETHb': { address: '0x7FcD174E80f264448ebeE8c88a7C4476AAF58Ea6', pair: 'wsuperOETHb/ETH', type: 'custom', queryId: 6811262, decimals: 18, chainSlug: 'base', chainId: 8453 },

  // ── Ethereum ── (universal Dune query 6835721 with oracle_address + topic0 params)
  'ethereum:wstETH': { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', pair: 'wstETH/stETH', type: 'ethereum-universal', topic0: '0xff08c3ef606d198e316ef5b822193c489965899eb4e3c248cea1a4626c3eda50', chainSlug: 'ethereum', chainId: 1 },
  'ethereum:weETH':  { address: '0x308861A430be4cce5502d0A12724771Fc6DaF216', pair: 'weETH/eETH', type: 'ethereum-universal', topic0: '0x11c6bf55864ff83827df712625d7a80e5583eef0264921025e7cd22003a21511', chainSlug: 'ethereum', chainId: 1 },
  'ethereum:ezETH':  { address: '0x74a09653A083691711cF8215a6ab074BB4e99ef5', pair: 'ezETH/ETH', type: 'tvl-ratio', chainSlug: 'ethereum', chainId: 1 },
  'ethereum:pufETH': { address: '0xD9A442856C234a39a81a089C06451EBAa4306a72', pair: 'pufETH/ETH', type: 'ethereum-universal', topic0: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7', chainSlug: 'ethereum', chainId: 1 },
  'ethereum:osETH':  { address: '0x66ac817f997Efd114EDFcccdce99F3268557B32C', pair: 'osETH/ETH', type: 'ethereum-universal', topic0: '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f', chainSlug: 'ethereum', chainId: 1 },
  'ethereum:rsETH':  { address: '0x2A2658Fc208Ed00e11D96d3F7470618924466877', pair: 'rsETH/ETH', type: 'ethereum-universal', topic0: '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f', chainSlug: 'ethereum', chainId: 1 },

  // ── Polygon ── (Chainlink AnswerUpdated via aggregator)
  'polygon:wstETH': { address: '0x8658c53A6f9d1682A2CaE418eE14Fa3240acE03b', pair: 'wstETH/ETH', type: 'chainlink', chainSlug: 'polygon', chainId: 137 },

  // ── Arbitrum ── (disabled)
  // 'arbitrum:weETH': { address: '0xF287a5725E9e78B55cA3aEd614ce9bD8Ea6d5583', pair: 'weETH/eETH', type: 'chainlink', chainSlug: 'arbitrum', chainId: 42161 },
};

/**
 * Get oracle config for a given collateral symbol on a specific chain.
 * Falls back to any chain if no chain-specific match.
 */
export function getOracleForCollateral(symbol: string, chainSlug?: string): OracleConfig | null {
  // Exact match first (fast path)
  if (chainSlug) {
    const key = `${chainSlug}:${symbol}`;
    if (ORACLE_MAP[key]) return ORACLE_MAP[key];
  }

  // Case-insensitive fallback (handles Morpho API symbol casing differences)
  const symbolLower = symbol.toLowerCase();
  for (const [key, config] of Object.entries(ORACLE_MAP)) {
    const [kChain, kSymbol] = key.split(':');
    if (kSymbol.toLowerCase() === symbolLower && (!chainSlug || kChain === chainSlug)) return config;
  }

  return null;
}
