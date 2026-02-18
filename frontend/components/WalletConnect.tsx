'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function WalletConnect() {
  return (
    <div className="flex items-center gap-3">
      <ConnectButton showBalance={true} chainStatus="full" accountStatus="address" />
    </div>
  );
}
