const STABLECOINS = new Set([
  'USDC', 'USDT', 'DAI', 'sDAI', 'sUSDe', 'USDe', 'FRAX', 'LUSD',
  'crvUSD', 'GHO', 'USDS', 'USDbC', 'USDf', 'sUSDf', 'USDM', 'PYUSD',
  'USD0', 'DOLA', 'MIM', 'BUSD', 'TUSD', 'agEUR', 'EURS', 'EURC',
]);

const ETH_TOKENS = new Set([
  'ETH', 'WETH', 'stETH', 'wstETH', 'rETH', 'cbETH', 'frxETH', 'sfrxETH',
  'mETH', 'swETH', 'weETH', 'ezETH', 'rsETH', 'ETHx', 'osETH', 'eETH',
  'pufETH', 'rswETH', 'OETH', 'wrsETH', 'wsuperOETHb', 'yETH', 'wbrETH',
  'ETH+', 'ETH0', 'hETH', 'LsETH', 'ynETHx', 'agETH', 'hgETH', 'savETH',
  'apxETH', 'tacETH',
]);

export function isStablecoin(symbol: string): boolean {
  return STABLECOINS.has(symbol);
}

export function isEthToken(symbol: string): boolean {
  return ETH_TOKENS.has(symbol) || symbol.toUpperCase().includes('ETH');
}

/**
 * Fetch ETH price from CoinGecko (free API)
 */
export async function getEthPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    return data.ethereum?.usd ?? 3200;
  } catch {
    // Fallback to DeFiLlama
    try {
      const res = await fetch(
        'https://coins.llama.fi/prices/current/coingecko:ethereum',
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
      const data = await res.json();
      return data.coins?.['coingecko:ethereum']?.price ?? 3200;
    } catch {
      return 3200; // sensible fallback
    }
  }
}
