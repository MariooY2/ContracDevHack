'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';

interface UnwindConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  collateralBalance: bigint;
  debtBalance: bigint;
  equity: bigint;
  currentLeverage: number;
}

export default function UnwindConfirmModal({
  open, onClose, onConfirm, collateralBalance, debtBalance, equity, currentLeverage,
}: UnwindConfirmModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(3,7,17,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{
              background: 'rgba(10, 15, 31, 0.98)',
              border: '1px solid rgba(255,51,102,0.3)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 60px rgba(255,51,102,0.1)',
            }}
          >
            {/* Warning icon */}
            <div className="flex justify-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.2)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-secondary)' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-lg font-black font-mono" style={{ color: 'var(--text-primary)' }}>
                Close Position?
              </h3>
              <p className="text-xs font-mono mt-2" style={{ color: 'var(--text-secondary)' }}>
                This will close your entire {currentLeverage.toFixed(1)}x leveraged position.
              </p>
            </div>

            {/* Summary */}
            <div
              className="rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
            >
              <div className="flex justify-between text-[10px] font-mono">
                <span style={{ color: 'var(--text-muted)' }}>Collateral returned</span>
                <span style={{ color: 'var(--accent-primary)' }}>{Number(formatEther(collateralBalance)).toFixed(4)} wstETH</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span style={{ color: 'var(--text-muted)' }}>Debt repaid</span>
                <span style={{ color: 'var(--accent-secondary)' }}>{Number(formatEther(debtBalance)).toFixed(4)} WETH</span>
              </div>
              <div className="divider" />
              <div className="flex justify-between text-xs font-mono font-bold">
                <span style={{ color: 'var(--text-secondary)' }}>You receive</span>
                <span style={{ color: 'var(--text-primary)' }}>~{Number(formatEther(equity)).toFixed(4)} wstETH</span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-widest transition-all hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-widest transition-all hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, #FF3366 0%, #FF5555 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(255,51,102,0.3)',
                }}
              >
                Confirm Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
