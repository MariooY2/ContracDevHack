'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import { useAppStore } from '@/store/useAppStore';

/* ─── Constants ──────────────────────────────────────────── */
const LLTV = 0.945;
const SUPPLY_APY = 3.2;
const BORROW_APY = 2.8;

const QUICK_AMOUNTS = [0.1, 0.5, 1, 5, 10];
const LEVERAGE_TICKS = [1, 2, 5, 10, 15, 18];

/* ─── Flow Nodes ─────────────────────────────────────────── */
const FLOW_NODES = [
  {
    label: 'Your Wallet',
    sub: 'Deposit wstETH',
    color: '#2973ff',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 010-4h14v4" />
        <path d="M3 5v14a2 2 0 002 2h16v-5" />
        <path d="M18 12a1 1 0 100 4h4v-4h-4z" />
      </svg>
    ),
  },
  {
    label: 'Flash Loan',
    sub: 'Borrow WETH',
    color: '#a78bfa',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    label: 'DEX Swap',
    sub: 'WETH → wstETH',
    color: '#10B981',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    label: 'Supply',
    sub: 'Add Collateral',
    color: '#F59E0B',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    label: 'Borrow & Repay',
    sub: 'Close Flash Loan',
    color: '#ef4444',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <path d="M22 4L12 14.01l-3-3" />
      </svg>
    ),
  },
];

/* ─── Helpers ────────────────────────────────────────────── */
function getHealthColor(hf: number): string {
  if (hf > 1.5) return '#10B981';
  if (hf > 1.2) return '#F59E0B';
  return '#ef4444';
}

function getRiskLabel(hf: number): string {
  if (hf > 2.0) return 'SAFE';
  if (hf > 1.5) return 'MODERATE';
  if (hf > 1.2) return 'RISKY';
  return 'DANGER';
}

function getRiskZone(hf: number): number {
  if (hf > 2.0) return 0;
  if (hf > 1.5) return 1;
  if (hf > 1.2) return 2;
  return 3;
}

/* ─── Health Arc (simplified from PositionDashboard) ───── */
function SimHealthArc({ healthFactor }: { healthFactor: number }) {
  const R = 48;
  const circumference = Math.PI * R;
  const pct = Math.min(Math.max((healthFactor - 1) / 2, 0), 1);
  const dashOffset = circumference * (1 - pct);
  const color = getHealthColor(healthFactor);

  return (
    <div className="flex flex-col items-center">
      <svg width="110" height="65" viewBox="0 0 110 65" overflow="visible">
        <defs>
          <linearGradient id="simArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        <path
          d={`M 7 60 A ${R} ${R} 0 0 1 103 60`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <motion.path
          d={`M 7 60 A ${R} ${R} 0 0 1 103 60`}
          fill="none"
          stroke="url(#simArcGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
        />
      </svg>
      <div className="text-center -mt-1">
        <AnimatedNumber value={healthFactor} decimals={2} className="text-lg" style={{ color }} />
        <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mt-0.5">
          Health Factor
        </p>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────── */
export default function LeverageSimulator() {
  const exchangeRate = useAppStore((s) => s.exchangeRate);
  const [leverage, setLeverage] = useState(5);
  const [deposit, setDeposit] = useState(1);
  const [simulating, setSimulating] = useState(false);
  const [activeNode, setActiveNode] = useState(-1);
  const [showParticles, setShowParticles] = useState(false);

  // Calculations — exchangeRate is live wstETH/ETH from on-chain
  const wstEthPrice = exchangeRate;
  const totalPosition = deposit * leverage;
  const debtAmount = deposit * (leverage - 1);
  const collateralValueInEth = totalPosition * wstEthPrice;
  const healthFactor = debtAmount > 0 ? (collateralValueInEth * LLTV) / debtAmount : 99;
  const clampedHF = Math.min(healthFactor, 10);
  const netAPY = SUPPLY_APY * leverage - BORROW_APY * (leverage - 1);
  const liquidationPrice = debtAmount > 0
    ? (debtAmount / (totalPosition * LLTV))
    : 0;
  const riskZone = getRiskZone(clampedHF);

  // Simulate flow animation
  const runSimulation = useCallback(() => {
    if (simulating) return;
    setSimulating(true);
    setActiveNode(-1);
    setShowParticles(false);

    // Sequential node illumination
    for (let i = 0; i < FLOW_NODES.length; i++) {
      setTimeout(() => setActiveNode(i), 300 + i * 400);
    }

    // Start particles after all nodes lit
    setTimeout(() => setShowParticles(true), 300 + FLOW_NODES.length * 400);

    // Reset
    setTimeout(() => {
      setSimulating(false);
    }, 300 + FLOW_NODES.length * 400 + 2500);
  }, [simulating]);

  // SVG path for the flow — horizontal line connecting nodes
  const svgW = 900;
  const svgH = 80;
  const nodeSpacing = (svgW - 80) / (FLOW_NODES.length - 1);
  const pathData = `M 40 40 ${FLOW_NODES.map((_, i) => `L ${40 + i * nodeSpacing} 40`).join(' ')}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-10"
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(9,9,9,0.8)', border: '1px solid rgba(41,115,255,0.15)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: '#10B981', animation: 'glow-pulse 2s ease-in-out infinite' }}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: '#10B981' }}>
                Interactive
              </span>
            </div>
            <h2 className="font-black text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Leverage Simulator
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Explore how flash loan leverage works — adjust parameters and watch the flow
            </p>
          </div>
          <motion.button
            onClick={runSimulation}
            disabled={simulating}
            className="px-5 py-2.5 rounded-xl font-mono font-bold text-xs tracking-wider transition-all"
            style={{
              background: simulating ? 'rgba(41,115,255,0.08)' : 'rgba(41,115,255,0.12)',
              border: '1px solid rgba(41,115,255,0.3)',
              color: simulating ? 'var(--text-muted)' : 'var(--accent-primary)',
              cursor: simulating ? 'not-allowed' : 'pointer',
            }}
            whileHover={simulating ? {} : { scale: 1.03 }}
            whileTap={simulating ? {} : { scale: 0.97 }}
          >
            {simulating ? 'SIMULATING...' : 'SIMULATE'}
          </motion.button>
        </div>

        {/* ─── Flow Diagram ─────────────────────────────────── */}
        <div className="px-6 pb-4 overflow-x-auto">
          <div className="relative min-w-[700px]" style={{ height: 110 }}>
            <svg
              width="100%"
              height="80"
              viewBox={`0 0 ${svgW} ${svgH}`}
              fill="none"
              className="absolute top-0 left-0"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Connection line */}
              <motion.path
                d={pathData}
                stroke="rgba(41,115,255,0.1)"
                strokeWidth="2"
                strokeDasharray="6 4"
                fill="none"
              />

              {/* Animated particles */}
              {showParticles && [0, 1, 2].map((i) => (
                <motion.circle
                  key={`particle-${i}`}
                  r="3.5"
                  fill="#2973ff"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 1, 0] }}
                  transition={{ delay: i * 0.6, duration: 2.4, repeat: Infinity, ease: 'linear' }}
                >
                  <animateMotion
                    dur="2.4s"
                    repeatCount="indefinite"
                    begin={`${i * 0.6}s`}
                    path={pathData}
                  />
                </motion.circle>
              ))}

              {/* Particle glow */}
              {showParticles && [0, 1, 2].map((i) => (
                <motion.circle
                  key={`glow-${i}`}
                  r="8"
                  fill="rgba(41,115,255,0.12)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.5, 0.5, 0] }}
                  transition={{ delay: i * 0.6, duration: 2.4, repeat: Infinity, ease: 'linear' }}
                >
                  <animateMotion
                    dur="2.4s"
                    repeatCount="indefinite"
                    begin={`${i * 0.6}s`}
                    path={pathData}
                  />
                </motion.circle>
              ))}
            </svg>

            {/* Nodes */}
            <div className="relative flex justify-between" style={{ top: 8, paddingLeft: 10, paddingRight: 10 }}>
              {FLOW_NODES.map((node, i) => {
                const isActive = activeNode >= i;
                return (
                  <motion.div
                    key={node.label}
                    className="flex flex-col items-center text-center"
                    style={{ width: 120 }}
                    animate={{
                      scale: isActive && simulating ? 1.05 : 1,
                      y: isActive && simulating ? -3 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center mb-1.5 transition-all duration-300"
                      style={{
                        background: isActive && simulating ? `${node.color}20` : 'var(--bg-surface-1)',
                        border: `1px solid ${isActive && simulating ? `${node.color}50` : 'var(--border)'}`,
                        color: isActive && simulating ? node.color : 'var(--text-muted)',
                        boxShadow: isActive && simulating ? `0 0 20px ${node.color}20` : 'none',
                      }}
                    >
                      {node.icon}
                    </div>
                    <p className="font-sans font-bold text-[11px] leading-tight" style={{ color: isActive && simulating ? node.color : 'var(--text-primary)' }}>
                      {node.label}
                    </p>
                    <p className="font-sans text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {node.sub}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Controls ─────────────────────────────────────── */}
        <div className="px-6 pb-5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="grid md:grid-cols-2 gap-6 pt-5">
            {/* Leverage Slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                  Leverage Multiplier
                </label>
                <span className="font-mono font-black text-lg" style={{ color: 'var(--accent-primary)' }}>
                  {leverage.toFixed(1)}x
                </span>
              </div>

              <input
                type="range"
                min="1"
                max="18"
                step="0.1"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #2973ff ${((leverage - 1) / 17) * 100}%, rgba(255,255,255,0.06) ${((leverage - 1) / 17) * 100}%)`,
                  accentColor: '#2973ff',
                }}
              />

              {/* Tick marks */}
              <div className="flex justify-between mt-1.5 px-0.5">
                {LEVERAGE_TICKS.map((tick) => (
                  <button
                    key={tick}
                    onClick={() => setLeverage(tick)}
                    className="font-mono text-[9px] transition-colors hover:text-[var(--accent-primary)]"
                    style={{
                      color: Math.abs(leverage - tick) < 0.5 ? 'var(--accent-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {tick}x
                  </button>
                ))}
              </div>
            </div>

            {/* Deposit Amount */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                  Deposit Amount
                </label>
                <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                  wstETH
                </span>
              </div>

              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  max="1000"
                  step="0.1"
                  value={deposit}
                  onChange={(e) => setDeposit(Math.max(0.01, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 rounded-xl font-mono font-bold text-sm bg-transparent outline-none"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="flex gap-1.5 mt-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setDeposit(amt)}
                    className="flex-1 py-1.5 rounded-lg font-mono text-[10px] font-bold transition-all"
                    style={{
                      background: deposit === amt ? 'rgba(41,115,255,0.12)' : 'rgba(255,255,255,0.03)',
                      border: deposit === amt ? '1px solid rgba(41,115,255,0.3)' : '1px solid var(--border)',
                      color: deposit === amt ? 'var(--accent-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Position Preview ──────────────────────────────── */}
        <div className="px-6 pb-6" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] pt-5 mb-4" style={{ color: 'var(--text-muted)' }}>
            Position Preview
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {/* Total Position */}
            <div className="glass-inner p-3.5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.1em] font-mono mb-1">
                Total Position
              </p>
              <AnimatedNumber
                value={totalPosition}
                decimals={2}
                suffix=" wstETH"
                className="text-base"
                style={{ color: 'var(--accent-primary)' }}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                ~<AnimatedNumber value={totalPosition * wstEthPrice} decimals={2} className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }} /> ETH
              </p>
            </div>

            {/* Debt */}
            <div className="glass-inner p-3.5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.1em] font-mono mb-1">
                Debt
              </p>
              <AnimatedNumber
                value={debtAmount}
                decimals={2}
                suffix=" WETH"
                className="text-base"
                style={{ color: '#F59E0B' }}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                Flash borrowed
              </p>
            </div>

            {/* Net APY */}
            <div className="glass-inner p-3.5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.1em] font-mono mb-1">
                Net APY
              </p>
              <AnimatedNumber
                value={netAPY}
                decimals={1}
                suffix="%"
                className="text-base"
                style={{ color: netAPY > 0 ? '#10B981' : '#ef4444' }}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                {SUPPLY_APY}% supply · {BORROW_APY}% borrow
              </p>
            </div>

            {/* Liquidation Price */}
            <div className="glass-inner p-3.5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.1em] font-mono mb-1">
                Liq. Price
              </p>
              <AnimatedNumber
                value={liquidationPrice}
                decimals={4}
                suffix=" ETH"
                className="text-base"
                style={{ color: '#ef4444' }}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                per wstETH
              </p>
            </div>
          </div>

          {/* Health Arc + Risk Zone */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Health Factor Arc */}
            <div className="glass-inner p-4 flex items-center justify-center">
              <SimHealthArc healthFactor={clampedHF} />
            </div>

            {/* Risk Zone Bar */}
            <div className="glass-inner p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.1em] font-mono">
                  Risk Zone
                </p>
                <span
                  className="px-2.5 py-1 rounded-full font-mono text-[10px] font-bold tracking-wider"
                  style={{
                    background: `${getHealthColor(clampedHF)}12`,
                    border: `1px solid ${getHealthColor(clampedHF)}30`,
                    color: getHealthColor(clampedHF),
                  }}
                >
                  {getRiskLabel(clampedHF)}
                </span>
              </div>

              {/* Segmented risk bar */}
              <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                {[
                  { color: '#10B981', label: 'Safe' },
                  { color: '#F59E0B', label: 'Moderate' },
                  { color: '#ef4444', label: 'Risky' },
                  { color: '#7f1d1d', label: 'Liquidation' },
                ].map((seg, i) => (
                  <motion.div
                    key={seg.label}
                    className="flex-1 rounded-sm"
                    animate={{
                      opacity: riskZone === i ? 1 : 0.2,
                      scale: riskZone === i ? 1 : 0.95,
                    }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    style={{ background: seg.color }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                {['Safe', 'Moderate', 'Risky', 'Liq.'].map((label) => (
                  <span key={label} className="font-mono text-[8px]" style={{ color: 'var(--text-muted)' }}>
                    {label}
                  </span>
                ))}
              </div>

              {/* LTV bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] font-mono mb-1.5">
                  <span style={{ color: 'var(--text-muted)' }}>Current LTV</span>
                  <span style={{ color: getHealthColor(clampedHF) }}>
                    {debtAmount > 0 ? ((debtAmount / collateralValueInEth) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, #2973ff, ${getHealthColor(clampedHF)})` }}
                    animate={{ width: `${debtAmount > 0 ? Math.min((debtAmount / collateralValueInEth) * 100, 100) : 0}%` }}
                    transition={{ type: 'spring', stiffness: 60, damping: 15 }}
                  />
                </div>
                <div className="flex justify-between text-[9px] font-mono mt-1">
                  <span style={{ color: 'var(--text-muted)' }}>0%</span>
                  <span style={{ color: 'var(--text-secondary)' }}>LLTV {(LLTV * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Educational note */}
          <div
            className="rounded-xl p-4 mt-4"
            style={{ background: 'rgba(41,115,255,0.04)', border: '1px solid rgba(41,115,255,0.1)' }}
          >
            <div className="flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2973ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                This simulator uses example rates (Supply APY: {SUPPLY_APY}%, Borrow APY: {BORROW_APY}%). Actual rates vary with market conditions.
                Higher leverage amplifies both yield and risk — the sweet spot is typically 3-10x for most users.
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
