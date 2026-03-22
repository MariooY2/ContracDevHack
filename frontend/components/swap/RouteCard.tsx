'use client';

import { motion } from 'framer-motion';
import type { Route } from '@/lib/lifi';
import { formatUnits } from 'viem';
import { getTokenImageUrl } from '@/lib/tokenImages';

interface RouteCardProps {
  route: Route;
  index: number;
  isSelected: boolean;
  isBest: boolean;
  isFastest: boolean;
  onSelect: () => void;
}

export default function RouteCard({ route, index, isSelected, isBest, isFastest, onSelect }: RouteCardProps) {
  const toAmount = Number(formatUnits(BigInt(route.toAmount), route.toToken.decimals));
  const gasCostUSD = route.gasCostUSD ? parseFloat(route.gasCostUSD) : 0;

  // Calculate total execution duration across all steps
  const totalDuration = route.steps.reduce((sum, step) => {
    return sum + (step.estimate?.executionDuration ?? 0);
  }, 0);

  // Get tool chain for route visualization
  const tools = route.steps.flatMap(step =>
    step.includedSteps?.map(s => ({
      name: s.toolDetails.name,
      logo: s.toolDetails.logoURI,
      type: s.type as string,
    })) ?? [{
      name: step.toolDetails.name,
      logo: step.toolDetails.logoURI,
      type: step.type as string,
    }]
  );

  const hasBridge = tools.some(t => t.type === 'cross');

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
    return `~${Math.round(seconds / 60)}m`;
  };

  return (
    <motion.button
      onClick={onSelect}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="w-full rounded-xl p-3.5 text-left transition-all"
      style={{
        background: isSelected ? 'rgba(41,115,255,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isSelected ? 'rgba(41,115,255,0.3)' : 'var(--border)'}`,
        boxShadow: isSelected ? '0 0 20px rgba(41,115,255,0.08)' : 'none',
        cursor: 'pointer',
      }}
      whileHover={{ borderColor: 'rgba(41,115,255,0.25)' }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: output + tags */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {(() => {
              const img = getTokenImageUrl(route.toToken.symbol, route.toToken.logoURI);
              return img ? <img src={img} alt={route.toToken.symbol} className="w-4 h-4 rounded-full shrink-0" /> : null;
            })()}
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {toAmount.toFixed(6)}
            </span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {route.toToken.symbol}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {route.toAmountUSD && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                ≈${parseFloat(route.toAmountUSD).toFixed(2)}
              </span>
            )}
            {isBest && (
              <span
                className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                Best
              </span>
            )}
            {isFastest && !isBest && (
              <span
                className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider"
                style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}
              >
                Fastest
              </span>
            )}
            {hasBridge && (
              <span
                className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider"
                style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
              >
                Bridge
              </span>
            )}
          </div>
        </div>

        {/* Right: gas + time */}
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1 justify-end mb-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              ${gasCostUSD.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {formatDuration(totalDuration)}
            </span>
          </div>
        </div>
      </div>

      {/* Route visualization: tool chain */}
      <div className="flex items-center gap-1 mt-2.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {tools.map((tool, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" className="shrink-0" style={{ opacity: 0.4 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
              style={{ background: tool.type === 'cross' ? 'rgba(96,165,250,0.06)' : 'rgba(255,255,255,0.03)' }}
              title={tool.name}
            >
              {tool.logo && (
                <img src={tool.logo} alt={tool.name} className="w-3.5 h-3.5 rounded-full" />
              )}
              <span className="text-[9px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                {tool.name}
              </span>
            </div>
          </div>
        ))}
      </div>
    </motion.button>
  );
}

export function RouteCardSkeleton({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="rounded-xl p-3.5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="w-28 h-4 rounded skeleton" />
          <div className="w-16 h-3 rounded skeleton" />
        </div>
        <div className="space-y-1.5">
          <div className="w-12 h-3 rounded skeleton" />
          <div className="w-10 h-3 rounded skeleton" />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2.5">
        <div className="w-16 h-4 rounded skeleton" />
        <div className="w-16 h-4 rounded skeleton" />
      </div>
    </motion.div>
  );
}
