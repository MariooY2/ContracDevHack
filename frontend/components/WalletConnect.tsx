'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchChain } from 'wagmi';
import { contractDevMainnet } from '@/lib/wagmi';
import { useEffect } from 'react';

export function WalletConnect() {
  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  // Auto-switch to correct network when wallet connects
  useEffect(() => {
    if (isConnected && chain && chain.id !== contractDevMainnet.id) {
      console.log('Wrong network detected. Current:', chain.id, 'Expected:', contractDevMainnet.id);
      // Attempt to switch automatically
      if (switchChain) {
        switchChain({ chainId: contractDevMainnet.id });
      }
    }
  }, [isConnected, chain, switchChain]);

  const isWrongNetwork = isConnected && chain && chain.id !== contractDevMainnet.id;

  return (
    <div className="flex items-center gap-3">
      {isWrongNetwork && (
        <button
          onClick={() => switchChain?.({ chainId: contractDevMainnet.id })}
          className="px-3 py-1.5 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 hover:bg-[#ef4444]/20 transition-colors cursor-pointer"
        >
          <span className="text-xs text-[#ef4444] font-semibold">Switch to Contract.dev</span>
        </button>
      )}
      <ConnectButton showBalance={true} chainStatus={isWrongNetwork ? "icon" : "full"} accountStatus="address" />
    </div>
  );
}
