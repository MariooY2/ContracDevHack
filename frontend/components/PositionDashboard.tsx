'use client';

import { motion } from 'framer-motion';
import { formatEther } from 'viem';
import type { ReserveInfo } from '@/lib/types';

interface PositionDashboardProps {
  collateralBalance: bigint;
  debtBalance: bigint;
  healthFactor: number;
  reserveInfo: ReserveInfo | null;
  exchangeRate: number;
  isLoading?: boolean;
}

function HealthArc({ healthFactor, color }: { healthFactor: number; color: string }) {
  const R = 52;
  const circumference = Math.PI * R;
  const pct = Math.min(Math.max((healthFactor - 1) / 2, 0), 1);
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="70" viewBox="0 0 120 70" overflow="visible">
        <defs>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF3366" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#00FF88" />
          </linearGradient>
        </defs>
        <path
          d={`M 8 65 A ${R} ${R} 0 0 1 112 65`}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <motion.path
          d={`M 8 65 A ${R} ${R} 0 0 1 112 65`}
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      <div className="text-center -mt-1">
        <p className="text-xl font-black font-mono" style={{ color }}>
          {healthFactor.toFixed(2)}
        </p>
        <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mt-0.5">
          Health Factor
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, delay = 0 }: {
  label: string; value: string; sub?: string; color?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="glass-inner p-4"
    >
      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.1em] font-mono mb-1.5">
        {label}
      </p>
      <p className="text-xl font-black font-mono" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">{sub}</p>}
    </motion.div>
  );
}

export default function PositionDashboard({
  collateralBalance, debtBalance, healthFactor, reserveInfo, exchangeRate, isLoading,
}: PositionDashboardProps) {
  const hasPosition = debtBalance > 0n;
  const collateral = Number(formatEther(collateralBalance));
  const debt = Number(formatEther(debtBalance));
  // Both Aave and Morpho now return raw wstETH amounts (18 dec) — multiply by exchangeRate to get ETH.
  const collateralInEth = collateral * exchangeRate;
  const equity = collateralInEth - debt;
  const currentLeverage = equity > 0 ? collateralInEth / equity : 0;

  const hfColor = healthFactor > 1.5 ? '#00FF88' : healthFactor > 1.1 ? '#F59E0B' : '#FF3366';
  const hfLabel = healthFactor > 1.5 ? 'SAFE' : healthFactor > 1.1 ? 'CAUTION' : 'DANGER';

  const stakingYield = reserveInfo?.stakingYield || 3.2;
  const borrowCost = reserveInfo?.borrowAPY || 0.05;
  const netAPY = hasPosition
    ? (stakingYield * currentLeverage) - (borrowCost * (currentLeverage - 1))
    : stakingYield;

  if (isLoading) {
    return (
      <div className="card-glow p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="skeleton h-5 w-32 rounded-lg" />
          <div className="skeleton h-7 w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-inner p-4 space-y-2">
              <div className="skeleton h-2.5 w-16 rounded" />
              <div className="skeleton h-6 w-24 rounded-lg" />
              <div className="skeleton h-2 w-12 rounded" />
            </div>
          ))}
        </div>
        <div className="glass-inner p-4">
          <div className="skeleton h-2.5 w-full rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="card-glow p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-black gradient-text tracking-tight">Your Position</h2>
        {hasPosition && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: `${hfColor}15`, border: `1px solid ${hfColor}30` }}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${healthFactor > 1.5 ? 'pulse-safe' : 'pulse-danger'}`}
              style={{ background: hfColor }}
            />
            <span className="text-[10px] font-bold font-mono tracking-widest" style={{ color: hfColor }}>
              {hfLabel}
            </span>
          </div>
        )}
      </div>

      {!hasPosition ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-inner p-10 text-center space-y-3"
        >
          <div
            className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-sm text-[var(--text-secondary)] font-medium">No active position</p>
          <p className="text-xs text-[var(--text-muted)]">Open a leveraged position to see stats here</p>
        </motion.div>
      ) : (
        <>
          {/* Stats grid + HF arc */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="col-span-2 grid grid-cols-2 gap-3">
              <StatCard label="Collateral" value={`${collateral.toFixed(4)}`} sub="wstETH on Morpho" color="var(--accent-primary)" delay={0.05} />
              <StatCard label="Debt" value={`${debt.toFixed(4)}`} sub="WETH borrowed" color="var(--accent-warning)" delay={0.1} />
              <StatCard label="Net Equity" value={`${equity.toFixed(4)}`} sub="in ETH terms" color="var(--text-primary)" delay={0.15} />
              <StatCard label="Leverage" value={`${currentLeverage.toFixed(2)}x`} sub={`${(currentLeverage * 100 - 100).toFixed(0)}% amplified`} color="var(--accent-info)" delay={0.2} />
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="glass-inner p-3 flex items-center justify-center"
            >
              <HealthArc healthFactor={healthFactor} color={hfColor} />
            </motion.div>
          </div>

          {/* LTV progress bar */}
          <div className="glass-inner p-4">
            <div className="flex justify-between text-[10px] font-mono mb-2">
              <span style={{ color: 'var(--text-muted)' }}>Debt / Collateral</span>
              <span style={{ color: hfColor }}>
                {collateralInEth > 0 ? ((debt / collateralInEth) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, var(--accent-primary), ${hfColor})` }}
                initial={{ width: '0%' }}
                animate={{ width: `${collateralInEth > 0 ? Math.min((debt / collateralInEth) * 100, 100) : 0}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.35 }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono mt-1.5">
              <span style={{ color: 'var(--text-muted)' }}>Safe Zone</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                LTV {reserveInfo?.ltv.toFixed(1)}% · Liq {reserveInfo?.liquidationThreshold.toFixed(1)}%
              </span>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
