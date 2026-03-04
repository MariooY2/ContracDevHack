import {
  Address,
  createPublicClient,
  http,
  formatUnits,
  keccak256,
  encodeAbiParameters,
} from "viem";
import { MorphoMarketData, MorphoMarketParams } from "./types.js";
import { ChainConfig } from "./chainConfig.js";

// Morpho API endpoint
const MORPHO_API_URL = "https://blue-api.morpho.org/graphql";

interface MorphoApiMarket {
  uniqueKey: string;
  loanAsset: {
    address: string;
    symbol: string;
    decimals: number;
    name: string;
  };
  collateralAsset: {
    address: string;
    symbol: string;
    decimals: number;
    name: string;
  };
  oracle: {
    address: string;
    type?: string;
  };
  irmAddress: string;
  lltv: string;
  state: {
    supplyAssets: string;
    borrowAssets: string;
    supplyShares: string;
    borrowShares: string;
    fee: string;
    timestamp: number;
    supplyApy: number;
    borrowApy: number;
    avgSupplyApy: number;
    avgBorrowApy: number;
    avgNetSupplyApy: number;
    avgNetBorrowApy: number;
    netSupplyApy?: number;
    netBorrowApy?: number;
    rewards?: Array<{
      asset: {
        address: string;
        chain: { id: number };
      };
      supplyApr: number;
      borrowApr: number;
    }>;
  };
}

export class MorphoDataFetcher {
  private publicClient;
  private morphoBlue: Address;
  private chainId: number;
  public readonly chainName: string;

  constructor(chainConfig: ChainConfig, rpcUrl?: string) {
    this.publicClient = createPublicClient({
      chain: chainConfig.viemChain,
      transport: http(rpcUrl || chainConfig.defaultRpc),
    });

    this.morphoBlue = chainConfig.morphoBlueAddress as Address;
    this.chainId = chainConfig.chainId;
    this.chainName = chainConfig.displayName;
  }

  async getAllMarketsData(): Promise<MorphoMarketData[]> {
    console.log("  Fetching markets from Morpho API...");

    try {
      const markets = await this.fetchMarketsFromAPI();
      console.log(`  Found ${markets.length} markets from API`);

      const marketsData: MorphoMarketData[] = [];

      for (const apiMarket of markets) {
        try {
          if (
            !apiMarket.loanAsset ||
            !apiMarket.collateralAsset ||
            !apiMarket.loanAsset.symbol ||
            !apiMarket.collateralAsset.symbol ||
            !apiMarket.oracle ||
            !apiMarket.irmAddress
          ) {
            continue;
          }

          const marketParams: MorphoMarketParams = {
            loanToken: apiMarket.loanAsset.address as Address,
            collateralToken: apiMarket.collateralAsset.address as Address,
            oracle: apiMarket.oracle.address as Address,
            irm: apiMarket.irmAddress as Address,
            lltv: BigInt(apiMarket.lltv),
          };

          const data = this.getMarketDataFromAPI(apiMarket, marketParams);
          marketsData.push(data);
        } catch {
          continue;
        }
      }

      return marketsData;
    } catch (error) {
      console.error("Error fetching from Morpho API:", error);
      return [];
    }
  }

  private async fetchMarketsFromAPI(): Promise<MorphoApiMarket[]> {
    const query = `
      query GetMarkets($chainId: Int!) {
        markets(where: { chainId_in: [$chainId], whitelisted: true }, first: 900) {
          items {
            uniqueKey
            loanAsset {
              address
              symbol
              decimals
              name
            }
            collateralAsset {
              address
              symbol
              decimals
              name
            }
            oracle {
              address
              type
            }
            irmAddress
            lltv
            state {
              supplyAssets
              borrowAssets
              supplyShares
              borrowShares
              fee
              timestamp
              supplyApy
              borrowApy
              avgSupplyApy
              avgBorrowApy
              avgNetSupplyApy
              avgNetBorrowApy
              netSupplyApy
              netBorrowApy
              rewards {
                asset {
                  address
                  chain { id }
                }
                supplyApr
                borrowApr
              }
            }
          }
        }
      }
    `;

    const response = await fetch(MORPHO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { chainId: this.chainId },
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const result = (await response.json()) as any;
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data?.markets?.items || [];
  }

  private getMarketDataFromAPI(
    apiMarket: MorphoApiMarket,
    marketParams: MorphoMarketParams
  ): MorphoMarketData {
    const marketId = this.getMarketId(marketParams);

    const totalSupplyAssets = BigInt(apiMarket.state.supplyAssets || "0");
    const totalBorrowAssets = BigInt(apiMarket.state.borrowAssets || "0");
    const totalSupplyShares = BigInt(apiMarket.state.supplyShares || "0");
    const totalBorrowShares = BigInt(apiMarket.state.borrowShares || "0");
    const fee = BigInt(apiMarket.state.fee || "0");

    const totalSupplyFormatted = formatUnits(totalSupplyAssets, apiMarket.loanAsset.decimals);
    const totalBorrowFormatted = formatUnits(totalBorrowAssets, apiMarket.loanAsset.decimals);
    const availableLiquidity = formatUnits(
      totalSupplyAssets - totalBorrowAssets,
      apiMarket.loanAsset.decimals
    );

    const utilizationRate =
      totalSupplyAssets > 0n
        ? (Number(totalBorrowAssets) / Number(totalSupplyAssets)) * 100
        : 0;

    // Use netSupplyApy/netBorrowApy (includes MORPHO rewards)
    const supplyAPY = (apiMarket.state.netSupplyApy ?? apiMarket.state.supplyApy) * 100;
    const borrowAPY = (apiMarket.state.netBorrowApy ?? apiMarket.state.borrowApy) * 100;

    const oracleType = apiMarket.oracle?.type || "Unknown Oracle";

    const lltv = Number(marketParams.lltv) / 1e18;
    const lltvPercentage = (lltv * 100).toFixed(2) + "%";

    return {
      marketId,
      marketParams,
      loanTokenSymbol: apiMarket.loanAsset.symbol,
      loanTokenName: apiMarket.loanAsset.name,
      loanTokenDecimals: apiMarket.loanAsset.decimals,
      collateralTokenSymbol: apiMarket.collateralAsset.symbol,
      collateralTokenName: apiMarket.collateralAsset.name,
      collateralTokenDecimals: apiMarket.collateralAsset.decimals,
      totalSupplyAssets: totalSupplyFormatted,
      totalBorrowAssets: totalBorrowFormatted,
      totalSupplyShares,
      totalBorrowShares,
      lastUpdate: BigInt(apiMarket.state.timestamp),
      fee,
      supplyAPY,
      borrowAPY,
      utilizationRate,
      lltv,
      lltvPercentage,
      oracleType,
      oraclePrice: 1,
      availableLiquidity,
    };
  }

  private getMarketId(marketParams: MorphoMarketParams): string {
    const encoded = encodeAbiParameters(
      [
        { name: "loanToken", type: "address" },
        { name: "collateralToken", type: "address" },
        { name: "oracle", type: "address" },
        { name: "irm", type: "address" },
        { name: "lltv", type: "uint256" },
      ],
      [
        marketParams.loanToken,
        marketParams.collateralToken,
        marketParams.oracle,
        marketParams.irm,
        marketParams.lltv,
      ]
    );
    return keccak256(encoded);
  }
}
