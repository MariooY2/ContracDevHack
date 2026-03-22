'use client';

import { motion } from 'framer-motion';

export type SwapPhase = 'idle' | 'approving' | 'sending' | 'confirming' | 'done' | 'error';

interface SwapProgressProps {
  phase: SwapPhase;
  error?: string;
  needsApproval: boolean;
  txHash?: string | null;
}

const PHASES = [
  { key: 'approving', label: 'Approve Token', icon: 'shield' },
  { key: 'sending', label: 'Send Transaction', icon: 'send' },
  { key: 'confirming', label: 'Confirming', icon: 'check' },
] as const;

type PhaseKey = (typeof PHASES)[number]['key'];

function getNodeState(nodeKey: PhaseKey, currentPhase: SwapPhase, needsApproval: boolean): 'pending' | 'active' | 'done' | 'error' {
  const order: PhaseKey[] = needsApproval ? ['approving', 'sending', 'confirming'] : ['sending', 'confirming'];
  const currentIdx = order.indexOf(currentPhase as PhaseKey);
  const nodeIdx = order.indexOf(nodeKey);

  if (currentPhase === 'error') {
    if (nodeIdx <= currentIdx) return nodeIdx === currentIdx ? 'error' : 'done';
    return 'pending';
  }
  if (currentPhase === 'done') return nodeIdx <= order.length - 1 ? 'done' : 'pending';
  if (nodeIdx < currentIdx) return 'done';
  if (nodeIdx === currentIdx) return 'active';
  return 'pending';
}

const icons: Record<string, React.ReactNode> = {
  shield: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  send: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
};

export default function SwapProgress({ phase, error, needsApproval, txHash }: SwapProgressProps) {
  if (phase === 'idle') return null;

  const visiblePhases = needsApproval ? PHASES : PHASES.filter(p => p.key !== 'approving');

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
    >
      <div className="p-3.5 space-y-2">
        {visiblePhases.map((p, i) => {
          const state = getNodeState(p.key, phase, needsApproval);
          const color = state === 'done' ? '#10B981' : state === 'active' ? '#2973ff' : state === 'error' ? '#ef4444' : 'var(--text-muted)';
          const bgColor = state === 'done' ? 'rgba(16,185,129,0.08)' : state === 'active' ? 'rgba(41,115,255,0.08)' : state === 'error' ? 'rgba(239,68,68,0.08)' : 'transparent';

          return (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.25 }}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{ background: bgColor }}
            >
              {/* Status indicator */}
              <div className="relative shrink-0">
                <motion.div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{
                    background: state === 'pending' ? 'rgba(255,255,255,0.04)' : `${color}15`,
                    border: `1.5px solid ${state === 'pending' ? 'var(--border)' : color}`,
                    color,
                  }}
                  animate={state === 'active' ? { scale: [1, 1.1, 1] } : {}}
                  transition={state === 'active' ? { repeat: Infinity, duration: 1.5 } : {}}
                >
                  {state === 'done' ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : state === 'error' ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  ) : (
                    icons[p.icon]
                  )}
                </motion.div>
                {/* Pulse ring for active */}
                {state === 'active' && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ border: `1.5px solid ${color}` }}
                    animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span
                  className="text-xs font-mono font-bold block"
                  style={{ color: state === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}
                >
                  {p.label}
                </span>
                {state === 'active' && (
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {p.key === 'approving' ? 'Sign in wallet...' : p.key === 'sending' ? 'Sign transaction...' : 'Waiting for confirmation...'}
                  </span>
                )}
                {state === 'error' && error && (
                  <span className="text-[10px] font-mono truncate block" style={{ color: '#ef4444' }}>
                    {error}
                  </span>
                )}
                {state === 'done' && p.key === 'confirming' && txHash && (
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {txHash.slice(0, 10)}...{txHash.slice(-6)}
                  </span>
                )}
              </div>

              {/* Spinner for active state */}
              {state === 'active' && (
                <motion.svg
                  className="shrink-0"
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </motion.svg>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
