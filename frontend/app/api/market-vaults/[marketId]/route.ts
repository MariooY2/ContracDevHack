import { NextResponse } from 'next/server';

const MORPHO_API_URL = 'https://blue-api.morpho.org/graphql';

const CHAIN_IDS = [1, 8453, 42161, 137];

const QUERY = `
  query MarketVaults($marketId: String!, $chainIds: [Int!]!) {
    markets(where: { uniqueKey_in: [$marketId], chainId_in: $chainIds }, first: 1) {
      items {
        uniqueKey
        morphoBlue { chain { id } }
        supplyingVaults {
          address
          name
          symbol
          metadata {
            image
            curators { name image }
          }
          state {
            allocation {
              market { uniqueKey }
              supplyAssets
              supplyAssetsUsd
            }
          }
        }
      }
    }
  }
`;

export interface VaultAllocation {
  address: string;
  name: string;
  symbol: string;
  image: string | null;
  curatorName: string | null;
  curatorImage: string | null;
  supplyAssets: string;
  supplyAssetsUsd: number;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ marketId: string }> }
) {
  try {
    const { marketId } = await params;

    const res = await fetch(MORPHO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: { marketId, chainIds: CHAIN_IDS },
      }),
    });

    if (!res.ok) throw new Error(`Morpho API ${res.status}`);

    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error');

    const market = json.data?.markets?.items?.[0];
    if (!market) {
      return NextResponse.json({ vaults: [] }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    const vaults: VaultAllocation[] = (market.supplyingVaults || [])
      .map((v: any) => {
        // Find allocation for this specific market
        const alloc = (v.state?.allocation || []).find(
          (a: any) => a.market?.uniqueKey === marketId
        );
        const curator = v.metadata?.curators?.[0] || null;
        return {
          address: v.address,
          name: v.name || '',
          symbol: v.symbol || '',
          image: v.metadata?.image || null,
          curatorName: curator?.name || null,
          curatorImage: curator?.image || null,
          supplyAssets: alloc?.supplyAssets?.toString() || '0',
          supplyAssetsUsd: alloc?.supplyAssetsUsd || 0,
        };
      })
      .filter((v: VaultAllocation) => v.supplyAssetsUsd > 0)
      .sort((a: VaultAllocation, b: VaultAllocation) => b.supplyAssetsUsd - a.supplyAssetsUsd);

    return NextResponse.json({ vaults }, {
      headers: { 'Cache-Control': 'public, max-age=120' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message, vaults: [] }, { status: 500 });
  }
}
