/**
 * Fetch Morpho Blue markets from the GraphQL API, filter for same-asset
 * markets with >$100k TVL, and return the result grouped by chain.
 *
 * Called by /api/cron/refresh-markets
 */

const MORPHO_API = 'https://blue-api.morpho.org/graphql';

const SUPPORTED_CHAINS = [
  { chainId: 1, name: 'ethereum' },
  { chainId: 8453, name: 'base' },
  { chainId: 42161, name: 'arbitrum' },
  { chainId: 137, name: 'polygon' },
];

const UNWANTED_PREFIXES = ['GLV', 'GM:', 'GM ', 'LP-', 'PT-'];
const UNWANTED_TOKENS = [
  'ZCHF', 'USUAL', 'PWRUSDC', 'bsdETH',
  'AA_FALCONXUSDC', 'USD0', 'mHyperETH',
];

const ETH_TOKENS = new Set([
  'ETH', 'WETH', 'stETH', 'wstETH', 'rETH', 'cbETH', 'weETH',
  'ezETH', 'rsETH', 'pufETH', 'wrsETH', 'ynETHx', 'hgETH',
]);

const STABLECOINS = new Set([
  'USDC', 'USDT', 'DAI', 'sDAI', 'sUSDe', 'USDe', 'FRAX', 'LUSD',
  'crvUSD', 'GHO', 'USDS', 'USDbC', 'USDf', 'sUSDf', 'USDM', 'PYUSD',
]);

// ── GraphQL query ───────────────────────────────────────────

const MARKETS_QUERY = `
  query GetMarkets($chainId: Int!) {
    markets(where: { chainId_in: [$chainId], whitelisted: true }, first: 900) {
      items {
        uniqueKey
        loanAsset { address symbol decimals name }
        collateralAsset { address symbol decimals name }
        oracle { address type }
        irmAddress
        lltv
        state {
          supplyAssets borrowAssets supplyShares borrowShares
          fee timestamp supplyApy borrowApy
          netSupplyApy netBorrowApy
        }
      }
    }
  }
`;

// ── Types ───────────────────────────────────────────────────

interface ApiMarket {
  uniqueKey: string;
  loanAsset: { address: string; symbol: string; decimals: number; name: string };
  collateralAsset: { address: string; symbol: string; decimals: number; name: string };
  oracle: { address: string; type?: string };
  irmAddress: string;
  lltv: string;
  state: {
    supplyAssets: string; borrowAssets: string;
    supplyShares: string; borrowShares: string;
    fee: string; timestamp: number;
    supplyApy: number; borrowApy: number;
    netSupplyApy?: number; netBorrowApy?: number;
  };
}

// ── Core logic ──────────────────────────────────────────────

async function fetchChainMarkets(chainId: number): Promise<ApiMarket[]> {
  const res = await fetch(MORPHO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: MARKETS_QUERY, variables: { chainId } }),
  });
  if (!res.ok) throw new Error(`Morpho API ${res.status}`);
  const json = await res.json();
  return json.data?.markets?.items ?? [];
}

function formatMarket(m: ApiMarket) {
  const supplyAssets = BigInt(m.state.supplyAssets || '0');
  const borrowAssets = BigInt(m.state.borrowAssets || '0');
  const lltv = Number(BigInt(m.lltv)) / 1e18;
  const decimals = m.loanAsset.decimals;

  const fmt = (v: bigint) => {
    const s = v.toString();
    if (decimals >= s.length) return '0.' + '0'.repeat(decimals - s.length) + s;
    return s.slice(0, s.length - decimals) + '.' + s.slice(s.length - decimals);
  };

  return {
    marketId: m.uniqueKey,
    marketParams: {
      loanToken: m.loanAsset.address,
      collateralToken: m.collateralAsset.address,
      oracle: m.oracle.address,
      irm: m.irmAddress,
      lltv: m.lltv,
    },
    loanTokenSymbol: m.loanAsset.symbol,
    loanTokenName: m.loanAsset.name,
    loanTokenDecimals: decimals,
    collateralTokenSymbol: m.collateralAsset.symbol,
    collateralTokenName: m.collateralAsset.name,
    collateralTokenDecimals: m.collateralAsset.decimals,
    totalSupplyAssets: fmt(supplyAssets),
    totalBorrowAssets: fmt(borrowAssets),
    totalSupplyShares: m.state.supplyShares,
    totalBorrowShares: m.state.borrowShares,
    lastUpdate: String(m.state.timestamp),
    fee: m.state.fee,
    supplyAPY: (m.state.netSupplyApy ?? m.state.supplyApy) * 100,
    borrowAPY: (m.state.netBorrowApy ?? m.state.borrowApy) * 100,
    utilizationRate: supplyAssets > 0n
      ? (Number(borrowAssets) / Number(supplyAssets)) * 100
      : 0,
    lltv,
    lltvPercentage: `${(lltv * 100).toFixed(2)}%`,
    oracleType: m.oracle?.type || 'Unknown Oracle',
    oraclePrice: 1,
    availableLiquidity: fmt(supplyAssets - borrowAssets),
  };
}

function isUnwanted(symbol: string): boolean {
  if (UNWANTED_PREFIXES.some(p => symbol.startsWith(p))) return true;
  if (UNWANTED_TOKENS.some(t => symbol.toUpperCase().includes(t.toUpperCase()))) return true;
  return false;
}

function isSameAsset(col: string, loan: string): boolean {
  const extract = (t: string) => {
    let b = t.replace(/^w/, '').toLowerCase();
    if (b.startsWith('pt-')) {
      const parts = b.split('-');
      if (parts.length >= 3) return parts[1];
    }
    return b;
  };
  const c = extract(col);
  const l = extract(loan);
  return c === l || c.includes(l) || l.includes(c);
}

function isEthToken(symbol: string): boolean {
  return ETH_TOKENS.has(symbol) || symbol.toUpperCase().includes('ETH');
}

async function getEthPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://coins.llama.fi/prices/current/coingecko:ethereum',
      { headers: { Accept: 'application/json' } },
    );
    const data = await res.json();
    return data.coins?.['coingecko:ethereum']?.price ?? 2000;
  } catch {
    return 2000;
  }
}

// ── Public API ──────────────────────────────────────────────

export async function refreshAllMarkets(): Promise<{
  data: Record<string, ReturnType<typeof formatMarket>[]>;
  summary: { chain: string; count: number }[];
}> {
  const ethPrice = await getEthPrice();
  const result: Record<string, ReturnType<typeof formatMarket>[]> = {};
  const summary: { chain: string; count: number }[] = [];

  for (const chain of SUPPORTED_CHAINS) {
    try {
      const raw = await fetchChainMarkets(chain.chainId);

      let markets = raw
        .filter(m => m.loanAsset?.symbol && m.collateralAsset?.symbol && m.oracle && m.irmAddress)
        .map(formatMarket);

      // Filter unwanted tokens
      markets = markets.filter(m =>
        !isUnwanted(m.collateralTokenSymbol) && !isUnwanted(m.loanTokenSymbol)
      );

      // Same-asset only
      markets = markets.filter(m =>
        isSameAsset(m.collateralTokenSymbol, m.loanTokenSymbol)
      );

      // TVL >= $100k
      markets = markets.filter(m => {
        const tvl = parseFloat(m.availableLiquidity) + parseFloat(m.totalBorrowAssets);
        if (STABLECOINS.has(m.loanTokenSymbol)) return tvl >= 100_000;
        if (isEthToken(m.loanTokenSymbol)) return tvl * ethPrice >= 100_000;
        return tvl >= 100_000;
      });

      result[chain.name] = markets;
      summary.push({ chain: chain.name, count: markets.length });
    } catch (err) {
      console.error(`refreshMarkets: ${chain.name} failed`, err);
      result[chain.name] = [];
      summary.push({ chain: chain.name, count: 0 });
    }
  }

  return { data: result, summary };
}
