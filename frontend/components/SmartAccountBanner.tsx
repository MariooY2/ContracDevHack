'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useSendCalls } from 'wagmi';
import { useBatchingSupport } from '@/hooks/useBatchingSupport';

export default function SmartAccountBanner() {
  const { isConnected, address } = useAccount();
  const { supportsBatching, isLoading } = useBatchingSupport();
  const { sendCallsAsync } = useSendCalls();
  const [dismissed, setDismissed] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  // Trigger MetaMask's EIP-7702 smart account upgrade via wallet_sendCalls
  const handleUpgrade = async () => {
    if (!address) return;
    setUpgrading(true);
    try {
      await sendCallsAsync({
        calls: [{ to: address, value: 0n }],
      });
    } catch (err) {
      console.error('Smart account upgrade failed:', err);
    }
    setUpgrading(false);
  };

  const show = isConnected && !isLoading && !supportsBatching && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden relative z-40"
          style={{
            background: 'linear-gradient(90deg, rgba(0,194,255,0.06) 0%, rgba(0,255,136,0.06) 100%)',
            borderBottom: '1px solid rgba(0,194,255,0.12)',
          }}
        >
          <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,194,255,0.1)', border: '1px solid rgba(0,194,255,0.2)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M13 2L4.09 12.37A1 1 0 005 14h6v8l8.91-10.37A1 1 0 0019 10h-6V2z"
                    stroke="var(--accent-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </div>
              {/* Copy */}
              <div>
                <p className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                  Upgrade to Smart Account
                </p>
                <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  Bundle approve + authorize + execute into a single transaction via EIP-7702
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="px-4 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,194,255,0.15), rgba(0,255,136,0.15))',
                  border: '1px solid rgba(0,194,255,0.3)',
                  color: 'var(--accent-info)',
                  opacity: upgrading ? 0.6 : 1,
                }}
              >
                {upgrading ? 'Upgrading...' : 'Upgrade Now'}
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
