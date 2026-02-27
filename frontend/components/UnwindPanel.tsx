'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import { useLeverageContract } from '@/hooks/useLeverageContract';

interface UnwindPanelProps {
  debtBalance: bigint;
  collateralBalance: bigint;
  healthFactor: number;
  exchangeRate: number;
  onSuccess: () => void;
}

export default function UnwindPanel({
  debtBalance, collateralBalance, healthFactor, exchangeRate, onSuccess,
}: UnwindPanelProps) {
  const { isConnected, executeDeleverage } = useLeverageContract();
  const [executing, setExecuting] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [isError, setIsError] = useState(false);

  const debtInWsteth = exchangeRate > 0 ? BigInt(Math.floor(Number(debtBalance) / exchangeRate)) : 0n;
  const equity = collateralBalance > debtInWsteth ? collateralBalance - debtInWsteth : 0n;

  const hfColor = healthFactor > 1.5 ? 'var(--accent-primary)' : healthFactor > 1.1 ? 'var(--accent-warning)' : 'var(--accent-secondary)';

  const handleUnwind = async () => {
    setExecuting(true);
    setIsError(false);
    setTxStatus('Executing flash loan unwind...');
    try {
      await executeDeleverage();
      setTxStatus('Position closed successfully!');
      onSuccess();
      setTimeout(() => setTxStatus(''), 4000);
    } catch (err: any) {
      const errorMsg = err.message || err.toString();
      setTxStatus(errorMsg.slice(0, 80));
      setIsError(true);
    }
    setExecuting(false);
  };

  if (debtBalance === 0n) {
    return (
      <div className="card-glow p-6">
        <h2 className="text-base font-black gradient-text tracking-tight mb-4">Unwind Position</h2>
        <div className="glass-inner p-10 text-center space-y-3">
          <div
            className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 12l2 2 4-4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="10" stroke="var(--text-muted)" strokeWidth="1.5"/>
            </svg>
          </div>
          <p className="text-sm text-(--text-secondary) font-medium">No active position</p>
          <p className="text-xs text-(--text-muted)">Open a position in the Leverage tab first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-glow p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-black gradient-text tracking-tight">Unwind Position</h2>
        {healthFactor > 0 && (
          <div
            className="px-3 py-1.5 rounded-full text-[10px] font-bold font-mono tracking-widest"
            style={{
              background: 'rgba(0,255,136,0.08)',
              color: hfColor,
              border: `1px solid rgba(255,255,255,0.1)`,
            }}
          >
            HF {healthFactor.toFixed(2)}
          </div>
        )}
      </div>

      {/* Summary card */}
      <div className="glass-inner p-4 mb-5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-(--text-secondary) font-mono">Collateral</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--accent-primary)' }}>
            {Number(formatEther(collateralBalance)).toFixed(4)} wstETH
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-(--text-secondary) font-mono">Debt to Repay</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--accent-secondary)' }}>
            {Number(formatEther(debtBalance)).toFixed(4)} WETH
          </span>
        </div>

        <div className="divider" />

        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-(--text-secondary) font-mono">You Receive (est.)</span>
          <span className="text-base font-black font-mono" style={{ color: 'var(--text-primary)' }}>
            ~{Number(formatEther(equity)).toFixed(4)} wstETH
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-(--text-muted) font-mono">Flash Loan Fee</span>
          <span
            className="text-xs font-bold font-mono px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(0,255,136,0.1)',
              color: 'var(--accent-primary)',
              border: '1px solid rgba(0,255,136,0.2)',
            }}
          >
            FREE (0%)
          </span>
        </div>
      </div>

      {/* Unwind button */}
      <button
        className="btn-danger"
        disabled={!isConnected || executing}
        onClick={handleUnwind}
      >
        {executing ? txStatus : 'Close Entire Position'}
      </button>

      {/* Status message */}
      <AnimatePresence>
        {txStatus && !executing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-3 p-3 rounded-xl text-center"
            style={{
              background: isError ? 'rgba(255,51,102,0.07)' : 'rgba(0,255,136,0.07)',
              border: `1px solid ${isError ? 'rgba(255,51,102,0.2)' : 'rgba(0,255,136,0.2)'}`,
            }}
          >
            <p
              className="text-xs font-bold font-mono"
              style={{ color: isError ? 'var(--accent-secondary)' : 'var(--accent-primary)' }}
            >
              {txStatus}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
