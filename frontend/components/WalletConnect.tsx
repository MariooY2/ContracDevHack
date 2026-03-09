'use client';

import { ConnectKitButton } from 'connectkit';

export function WalletConnect() {
  return (
    <div className="flex items-center gap-3">
      <ConnectKitButton />
    </div>
  );
}
