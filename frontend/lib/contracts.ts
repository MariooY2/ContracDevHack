import type { Address } from 'viem';
import type { ChainSlug } from './types';

export interface ChainContracts {
  morphoBlue: Address;
  leverageHelper: Address | null;
}

export const CHAIN_CONTRACTS: Record<ChainSlug, ChainContracts> = {
  ethereum: {
    morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    leverageHelper: null,
  },
  base: {
    morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    leverageHelper: null, // Deploy MorphoLeverageHelper and set address here
  },
  arbitrum: {
    morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    leverageHelper: null,
  },
  polygon: {
    morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    leverageHelper: null,
  },
};

export {
  ERC20_ABI,
  MORPHO_LEVERAGE_HELPER_ABI,
  MORPHO_ABI,
} from './leverageContract';
