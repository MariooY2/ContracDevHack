import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { getDefaultConfig } from 'connectkit';
import { BASE_RPC_URL } from './types';

export const baseMainnet = base;

export const config = createConfig({
  ...getDefaultConfig({
    appName: 'VOLT Protocol',
    walletConnectProjectId: (process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '').trim(),
    chains: [base],
    transports: {
      [base.id]: http(BASE_RPC_URL, {
        retryCount: 3,
        retryDelay: 1000,
      }),
    },
  }),
  syncConnectedChain: false,
  ssr: true,
});
