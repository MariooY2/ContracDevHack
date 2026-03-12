import { NextResponse } from 'next/server';

const MORPHO_API_URL = 'https://blue-api.morpho.org/graphql';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Known LST collateral symbols on Base (ETH-correlated)
const LST_SYMBOLS = new Set([
  'wstETH', 'weETH', 'cbETH', 'rETH', 'wrsETH',
  'yoETH', 'wsuperOETHb', 'bsdETH', 'ezETH', 'mETH',
  'pufETH', 'osETH', 'swETH', 'ETHx', 'sfrxETH',
]);

// WETH address on Base
const WETH_BASE = '0x4200000000000000000000000000000000000006';

interface CachedResult {
  markets: MorphoMarket[];
  ts: number;
}

export interface MorphoMarket {
  uniqueKey: string;
  pair: string;
  collateralSymbol: string;
  collateralAddress: string;
  loanSymbol: string;
  loanAddress: string;
  lltv: number;
  supplyApy: number;
  borrowApy: number;
  utilization: number;
  supplyAssets: string;
  borrowAssets: string;
  supplyAssetsUsd: number | null;
  oracleAddress: string | null;
  oracleType: string | null;
}

let cachedData: CachedResult | null = null;

const QUERY = `
  query BaseWethMarkets($weth: [String!]!) {
    markets(
      where: { chainId_in: [8453], loanAssetAddress_in: $weth }
      first: 50
    ) {
      items {
        uniqueKey
        lltv
        collateralAsset { symbol address decimals }
        loanAsset { symbol address }
        state {
          borrowApy supplyApy utilization
          supplyAssets borrowAssets supplyAssetsUsd
        }
        oracleAddress
        oracleInfo { type }
      }
    }
  }
`;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';
    const singleId = searchParams.get('id');

    // If requesting a single market and we have cache, return from cache
    if (singleId && cachedData) {
      const market = cachedData.markets.find(m => m.uniqueKey === singleId);
      if (market) {
        return NextResponse.json({ market }, {
          headers: { 'Cache-Control': 'public, max-age=60' },
        });
      }
    }

    if (!forceRefresh && cachedData && Date.now() - cachedData.ts < CACHE_TTL) {
      if (singleId) {
        const market = cachedData.markets.find(m => m.uniqueKey === singleId);
        return NextResponse.json({ market: market || null }, {
          headers: { 'Cache-Control': 'public, max-age=60' },
        });
      }
      return NextResponse.json({ markets: cachedData.markets }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    const res = await fetch(MORPHO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { weth: [WETH_BASE] } }),
    });

    if (!res.ok) throw new Error(`Morpho API ${res.status}`);

    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error');

    const items = json.data?.markets?.items || [];

    // Filter to only LST/WETH markets with meaningful TVL
    const markets: MorphoMarket[] = items
      .filter((m: any) => {
        if (!m.collateralAsset) return false;
        const sym = m.collateralAsset.symbol;
        if (!LST_SYMBOLS.has(sym)) return false;
        // Filter out dust markets (< 0.01 ETH supply)
        const supply = BigInt(m.state.supplyAssets || '0');
        return supply > BigInt('10000000000000000'); // 0.01 ETH
      })
      .map((m: any) => ({
        uniqueKey: m.uniqueKey,
        pair: `${m.collateralAsset.symbol}/${m.loanAsset.symbol}`,
        collateralSymbol: m.collateralAsset.symbol,
        collateralAddress: m.collateralAsset.address,
        loanSymbol: m.loanAsset.symbol,
        loanAddress: m.loanAsset.address,
        lltv: Number(m.lltv) / 1e18,
        supplyApy: m.state.supplyApy,
        borrowApy: m.state.borrowApy,
        utilization: m.state.utilization,
        supplyAssets: m.state.supplyAssets,
        borrowAssets: m.state.borrowAssets,
        supplyAssetsUsd: m.state.supplyAssetsUsd,
        oracleAddress: m.oracleAddress || null,
        oracleType: m.oracleInfo?.type || null,
      }))
      .sort((a: MorphoMarket, b: MorphoMarket) => {
        // Sort by TVL descending
        const aSupply = BigInt(a.supplyAssets);
        const bSupply = BigInt(b.supplyAssets);
        if (bSupply > aSupply) return 1;
        if (bSupply < aSupply) return -1;
        return 0;
      });

    cachedData = { markets, ts: Date.now() };

    if (singleId) {
      const market = markets.find(m => m.uniqueKey === singleId);
      return NextResponse.json({ market: market || null }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    return NextResponse.json({ markets }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (err) {
    if (cachedData) {
      return NextResponse.json({ markets: cachedData.markets }, {
        headers: { 'Cache-Control': 'public, max-age=30' },
      });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
