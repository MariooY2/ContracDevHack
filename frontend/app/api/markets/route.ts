import { NextResponse } from 'next/server';

const MORPHO_API_URL = 'https://blue-api.morpho.org/graphql';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Known LST collateral symbols across chains
const LST_SYMBOLS = new Set([
  // ETH LSTs (all chains)
  'wstETH', 'weETH', 'cbETH', 'rETH', 'wrsETH',
  'yoETH', 'wsuperOETHb', 'bsdETH', 'ezETH', 'mETH',
  'pufETH', 'osETH', 'swETH', 'ETHx', 'sfrxETH',
  // Polygon-specific
  'stMATIC', 'MaticX',
]);

// WETH addresses per chain
const WETH_ADDRESSES = [
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Ethereum
  '0x4200000000000000000000000000000000000006', // Base
  '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum
  '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // Polygon
];

// All supported chain IDs
const CHAIN_IDS = [1, 8453, 42161, 137];

// Map chain ID → slug
const CHAIN_ID_TO_SLUG: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum',
  137: 'polygon',
};

interface CachedResult {
  markets: MorphoMarket[];
  ts: number;
}

export interface SupplyingVault {
  address: string;
  symbol: string;
  name: string;
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
  irmAddress: string | null;
  oracleType: string | null;
  oraclePrice: number | null;
  lltvRaw: string;
  chainId: number;
  chainSlug: string;
  supplyingVaults: SupplyingVault[];
}

let cachedData: CachedResult | null = null;

const QUERY = `
  query MultiChainWethMarkets($weth: [String!]!, $chainIds: [Int!]!) {
    markets(
      where: { chainId_in: $chainIds, loanAssetAddress_in: $weth }
      first: 200
    ) {
      items {
        uniqueKey
        lltv
        irmAddress
        morphoBlue { chain { id network } }
        collateralAsset { symbol address decimals }
        loanAsset { symbol address }
        state {
          borrowApy supplyApy utilization price
          supplyAssets borrowAssets supplyAssetsUsd
        }
        oracle { address }
        oracleInfo { type }
        supplyingVaults {
          address
          symbol
          name
          metadata { image }
        }
      }
    }
  }
`;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';
    const singleId = searchParams.get('id');
    const chainFilter = searchParams.get('chain'); // optional: 'ethereum', 'base', 'arbitrum', 'polygon'

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
      const filtered = chainFilter
        ? cachedData.markets.filter(m => m.chainSlug === chainFilter)
        : cachedData.markets;

      if (singleId) {
        const market = filtered.find(m => m.uniqueKey === singleId);
        return NextResponse.json({ market: market || null }, {
          headers: { 'Cache-Control': 'public, max-age=60' },
        });
      }
      return NextResponse.json({ markets: filtered }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    const res = await fetch(MORPHO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: { weth: WETH_ADDRESSES, chainIds: CHAIN_IDS },
      }),
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
        oracleAddress: m.oracle?.address || null,
        irmAddress: m.irmAddress || null,
        oracleType: m.oracleInfo?.type || null,
        oraclePrice: m.state.price ? Number(BigInt(m.state.price)) / 1e36 : null,
        lltvRaw: m.lltv,
        chainId: m.morphoBlue?.chain?.id || 0,
        chainSlug: CHAIN_ID_TO_SLUG[m.morphoBlue?.chain?.id] || 'unknown',
        supplyingVaults: (m.supplyingVaults || []).map((v: any) => ({
          address: v.address,
          symbol: v.symbol || '',
          name: v.name || '',
        })),
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

    const filtered = chainFilter
      ? markets.filter(m => m.chainSlug === chainFilter)
      : markets;

    if (singleId) {
      const market = filtered.find(m => m.uniqueKey === singleId);
      return NextResponse.json({ market: market || null }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    return NextResponse.json({ markets: filtered }, {
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
