import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { mainnet, base, arbitrum, polygon } from 'wagmi/chains';
import { getDefaultConfig } from 'connectkit';
import { BASE_RPC_URL } from './types';
import { CHAIN_CONFIG } from './chains';

// Keep fork chain for development/testing
export const contractDevBase = defineChain({
  id: 18133,
  name: 'Base (Contract.dev)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [BASE_RPC_URL] },
  },
});

export const config = createConfig(
  getDefaultConfig({
    appName: 'VOLT Protocol',
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'your_project_id_here',
    chains: [mainnet, base, arbitrum, polygon, contractDevBase],
    transports: {
      [mainnet.id]: http(CHAIN_CONFIG.ethereum.rpcUrl),
      [base.id]: http(CHAIN_CONFIG.base.rpcUrl),
      [arbitrum.id]: http(CHAIN_CONFIG.arbitrum.rpcUrl),
      [polygon.id]: http(CHAIN_CONFIG.polygon.rpcUrl),
      [contractDevBase.id]: http(BASE_RPC_URL),
    },
  }),
);
