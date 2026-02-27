'use client';

import { motion } from 'framer-motion';
import type { ReserveInfo } from '@/lib/types';

interface YieldBreakdownProps {
  reserveInfo: ReserveInfo | null;
  leverage: number;
  exchangeRate: number;
  isLoading?: boolean;
}

function YieldBar({
  label, value, pct, color, delay = 0, negative = false
}: {
  label: string; value: string; pct: number; color: string; delay?: number; negative?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: negative ? 8 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          <span className="text-xs text-(--text-secondary) font-mono">{label}</span>
        </div>
        <span className="text-xs font-bold font-mono" style={{ color }}>
          {negative ? '-' : '+'}{value}
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: '0%' }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: delay + 0.1 }}
        />
      </div>
    </motion.div>
  );
}

export default function YieldBreakdown({ reserveInfo, leverage, exchangeRate, isLoading }: YieldBreakdownProps) {
  if (isLoading) {
    return (
      <div className="card-glow p-6">
        <div className="skeleton h-5 w-36 rounded-lg mb-5" />
        <div className="glass-inner p-6 mb-5 text-center space-y-3">
          <div className="skeleton h-3 w-28 rounded mx-auto" />
          <div className="skeleton h-12 w-32 rounded-xl mx-auto" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="skeleton h-2.5 w-32 rounded" />
                <div className="skeleton h-2.5 w-16 rounded" />
              </div>
              <div className="skeleton h-1 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stakingYield = reserveInfo?.stakingYield || 3.2;
  const supplyAPY = reserveInfo?.supplyAPY || 0.001;
  const borrowAPY = reserveInfo?.borrowAPY || 0.05;

  const effectiveStaking = stakingYield * leverage;
  const effectiveSupply = supplyAPY * leverage;
  const effectiveBorrowCost = borrowAPY * (leverage - 1);
  const netAPY = effectiveStaking + effectiveSupply - effectiveBorrowCost;
  const unleveragedAPY = stakingYield + supplyAPY;
  const boost = leverage > 1 ? netAPY / unleveragedAPY : 1;

  // For bar widths — normalise against the biggest value
  const maxVal = Math.max(effectiveStaking, effectiveSupply, effectiveBorrowCost, 0.01);

  return (
    <div className="card-glow p-6">
      <h2 className="text-base font-black gradient-text tracking-tight mb-5">Yield Breakdown</h2>

      {/* Net APY hero */}
      <div
        className="glass-inner p-5 mb-5 text-center relative overflow-hidden"
        style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.1)' }}
      >
        {/* Subtle glow behind number */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(0,255,136,0.08) 0%, transparent 70%)' }}
        />
        <p className="text-[10px] text-(--text-muted) uppercase tracking-[0.2em] font-mono mb-2">
          Net APY at {leverage.toFixed(1)}x Leverage
        </p>
        <motion.p
          className="text-5xl font-black gradient-text font-mono leading-none"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
        >
          {netAPY.toFixed(2)}%
        </motion.p>
        {leverage > 1 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xs font-mono mt-2"
            style={{ color: 'var(--accent-info)' }}
          >
            {boost.toFixed(1)}× boost vs unleveraged ({unleveragedAPY.toFixed(2)}%)
          </motion.p>
        )}
      </div>

      {/* Earnings section */}
      <div className="space-y-3 mb-4">
        <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.2em] font-mono font-bold">
          Earning
        </p>
        <YieldBar
          label={`ETH Staking (${stakingYield}% × ${leverage.toFixed(1)}x)`}
          value={`${effectiveStaking.toFixed(2)}%`}
          pct={(effectiveStaking / maxVal) * 100}
          color="var(--accent-primary)"
          delay={0.05}
        />
        <YieldBar
          label={`Morpho Supply APY (× ${leverage.toFixed(1)})`}
          value={`${effectiveSupply.toFixed(4)}%`}
          pct={(effectiveSupply / maxVal) * 100}
          color="var(--accent-info)"
          delay={0.1}
        />
      </div>

      {/* Costs section */}
      {leverage > 1 && (
        <div className="space-y-3 mb-4">
          <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.2em] font-mono font-bold">
            Paying
          </p>
          <YieldBar
            label={`WETH Borrow (${borrowAPY.toFixed(3)}% × ${(leverage - 1).toFixed(1)}x)`}
            value={`${effectiveBorrowCost.toFixed(4)}%`}
            pct={(effectiveBorrowCost / maxVal) * 100}
            color="var(--accent-secondary)"
            delay={0.15}
            negative
          />
        </div>
      )}

      {/* Divider + net */}
      <div className="divider mb-3" />
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-(--text-secondary) font-mono uppercase tracking-wider">
          Net Annual Yield
        </span>
        <span className="text-lg font-black gradient-text font-mono">
          +{netAPY.toFixed(2)}%
        </span>
      </div>

      {/* wstETH rate */}
      <div
        className="glass-inner mt-4 p-3.5"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-(--text-muted) font-mono">wstETH Exchange Rate</span>
          <span className="text-xs font-bold font-mono text-(--text-primary)">
            1 wstETH = {exchangeRate.toFixed(4)} stETH
          </span>
        </div>
        <p className="text-[10px] text-(--text-muted) mt-1.5 leading-relaxed">
          wstETH value grows as staking rewards accrue — the rate only ever increases.
        </p>
      </div>
    </div>
  );
}
