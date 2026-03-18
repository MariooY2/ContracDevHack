'use client';

import { motion } from 'framer-motion';

export type TxStep = 'approve' | 'authorize' | 'execute' | 'confirm';
export type TxStepStatus = 'pending' | 'active' | 'completed' | 'error';

interface StepConfig {
  key: TxStep;
  label: string;
}

const STEPS: StepConfig[] = [
  { key: 'approve', label: 'Approve' },
  { key: 'authorize', label: 'Authorize' },
  { key: 'execute', label: 'Execute' },
  { key: 'confirm', label: 'Confirm' },
];

interface TransactionStepperProps {
  currentStep: TxStep;
  stepStatuses: Record<TxStep, TxStepStatus>;
  className?: string;
}

const STATUS_COLORS: Record<TxStepStatus, { bg: string; border: string; text: string; dot: string }> = {
  pending:   { bg: 'rgba(255,255,255,0.03)', border: 'var(--border)', text: 'var(--text-muted)', dot: 'var(--text-muted)' },
  active:    { bg: 'rgba(0,255,209,0.08)', border: 'rgba(0,255,209,0.3)', text: 'var(--accent-primary)', dot: 'var(--accent-primary)' },
  completed: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', text: '#10B981', dot: '#10B981' },
  error:     { bg: 'rgba(255,51,102,0.08)', border: 'rgba(255,51,102,0.2)', text: '#FF3366', dot: '#FF3366' },
};

export default function TransactionStepper({ currentStep, stepStatuses, className = '' }: TransactionStepperProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {STEPS.map((step, i) => {
        const status = stepStatuses[step.key];
        const colors = STATUS_COLORS[status];
        const isActive = step.key === currentStep && status === 'active';

        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <motion.div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg flex-1 justify-center"
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
              }}
              animate={isActive ? { scale: [1, 1.02, 1] } : {}}
              transition={isActive ? { repeat: Infinity, duration: 1.5 } : {}}
            >
              {/* Step indicator */}
              <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                {status === 'completed' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke={colors.dot} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : status === 'error' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke={colors.dot} strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: colors.dot }}
                    />
                    {isActive && (
                      <motion.span
                        className="absolute inset-0 rounded-full"
                        style={{ border: `1.5px solid ${colors.dot}` }}
                        animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                      />
                    )}
                  </>
                )}
              </span>

              <span
                className="font-mono font-bold uppercase tracking-wider"
                style={{ color: colors.text, fontSize: 'var(--text-micro)' }}
              >
                {step.label}
              </span>
            </motion.div>

            {/* Connector line between steps */}
            {i < STEPS.length - 1 && (
              <div
                className="w-3 h-px shrink-0"
                style={{
                  background: stepStatuses[STEPS[i + 1].key] !== 'pending'
                    ? 'rgba(16,185,129,0.4)'
                    : 'var(--border)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
