import { Chain } from "viem";
import { mainnet, base, arbitrum, polygon } from "viem/chains";

export interface ChainConfig {
  chainId: number;
  chainName: string;
  displayName: string;
  viemChain: Chain;
  morphoBlueAddress: string;
  defaultRpc?: string;
}

// Morpho Blue contract address (same across all supported chains)
const MORPHO_BLUE_ADDRESS = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    chainName: "ethereum",
    displayName: "Ethereum",
    viemChain: mainnet,
    morphoBlueAddress: MORPHO_BLUE_ADDRESS,
  },
  {
    chainId: 8453,
    chainName: "base",
    displayName: "Base",
    viemChain: base,
    morphoBlueAddress: MORPHO_BLUE_ADDRESS,
  },
  {
    chainId: 42161,
    chainName: "arbitrum",
    displayName: "Arbitrum",
    viemChain: arbitrum,
    morphoBlueAddress: MORPHO_BLUE_ADDRESS,
  },
  {
    chainId: 137,
    chainName: "polygon",
    displayName: "Polygon",
    viemChain: polygon,
    morphoBlueAddress: MORPHO_BLUE_ADDRESS,
  },
];

export function getChainConfig(chainIdOrName: number | string): ChainConfig | undefined {
  if (typeof chainIdOrName === "number") {
    return SUPPORTED_CHAINS.find((c) => c.chainId === chainIdOrName);
  }
  return SUPPORTED_CHAINS.find(
    (c) => c.chainName.toLowerCase() === chainIdOrName.toLowerCase()
  );
}
