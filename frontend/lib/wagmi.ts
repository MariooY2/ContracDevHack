import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { getDefaultConfig } from 'connectkit';
import { BASE_RPC_URL } from './types';

export const contractDevBase = defineChain({
  id: 18133,
  name: 'Base (Contract.dev)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [BASE_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Contract.dev', url: 'https://contract.dev' },
  },
});

export const config = createConfig({
  ...getDefaultConfig({
    appName: 'VOLT Protocol',
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '',
    chains: [contractDevBase],
    transports: {
      [contractDevBase.id]: http(BASE_RPC_URL, {
        retryCount: 3,
        retryDelay: 1000,
      }),
    },
  }),
  syncConnectedChain: false,
  ssr: true,
});
