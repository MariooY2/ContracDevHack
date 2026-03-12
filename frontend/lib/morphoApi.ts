/**
 * Morpho Blue API utilities
 * Fetches real-time market data from Morpho Blue GraphQL API
 */

const MORPHO_API_URL = process.env.NEXT_PUBLIC_MORPHO_API_URL || 'https://blue-api.morpho.org/graphql';

// wstETH/WETH market on Base
export const MORPHO_MARKET_ID = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba';

interface MorphoMarketState {
  borrowApy: number;
  supplyApy: number;
  avgBorrowApy: number;
  avgSupplyApy: number;
  utilization: number;
}

interface MorphoMarketData {
  uniqueKey: string;
  lltv: string;
  state: MorphoMarketState;
}

/**
 * Fetch market data from Morpho Blue API
 * Note: Using markets query with filter instead of marketByUniqueKey since the latter requires chain context
 */
export async function fetchMorphoMarketData(marketId: string = MORPHO_MARKET_ID): Promise<MorphoMarketData | null> {
  const query = `
    query GetMarket($marketId: [String!]!) {
      markets(where: { uniqueKey_in: $marketId, chainId_in: [8453] }) {
        items {
          uniqueKey
          lltv
          state {
            borrowApy
            supplyApy
            avgBorrowApy
            avgSupplyApy
            utilization
          }
        }
      }
    }
  `;

  try {
    console.log(`🔵 Fetching Morpho market data from API: ${marketId}`);

    const response = await fetch(MORPHO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { marketId: [marketId] },
      }),
    });

    if (!response.ok) {
      throw new Error(`Morpho API request failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error('Morpho API errors:', result.errors);
      return null;
    }

    const markets = result.data?.markets?.items;

    if (!markets || markets.length === 0) {
      console.warn('Market not found in Morpho API response');
      return null;
    }

    const marketData = markets[0];

    console.log(`✅ Morpho market data fetched:`, {
      borrowApy: marketData.state.borrowApy,
      supplyApy: marketData.state.supplyApy,
      utilization: marketData.state.utilization,
    });

    return marketData;
  } catch (error) {
    console.error('Error fetching Morpho market data:', error);
    return null;
  }
}

/**
 * Get borrow and supply APY for Morpho Blue market
 */
export async function getMorphoAPY(marketId: string = MORPHO_MARKET_ID): Promise<{
  borrowAPY: number;
  supplyAPY: number;
  utilization: number;
}> {
  const marketData = await fetchMorphoMarketData(marketId);

  if (!marketData) {
    // Fallback to estimated values
    console.warn('Using fallback APY values for Morpho');
    return {
      borrowAPY: 3.2,
      supplyAPY: 0,
      utilization: 0,
    };
  }

  // Convert from decimal to percentage (API returns values like 0.032 for 3.2%)
  return {
    borrowAPY: marketData.state.borrowApy * 100,
    supplyAPY: marketData.state.supplyApy * 100,
    utilization: marketData.state.utilization * 100,
  };
}
