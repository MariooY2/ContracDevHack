'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import { useLeverageContract } from '@/hooks/useLeverageContract';
import { useAppStore } from '@/store/useAppStore';
import type { ReserveInfo } from '@/lib/types';

interface LeveragePanelProps {
  onSuccess: () => void;
  reserveInfo: ReserveInfo | null;
  exchangeRate: number;
}

export default function LeveragePanel({ onSuccess, reserveInfo, exchangeRate }: LeveragePanelProps) {
  const { isConnected, simulateLeverage, getMaxSafeLeverage, executeLeverage, address, getMorphoExchangeRates } = useLeverageContract();

  const walletBalance = useAppStore((s) => s.walletBalance);
  const balance = Number(formatEther(walletBalance)).toFixed(4);

  const [deposit, setDeposit] = useState('1');
  const [leverage, setLeverage] = useState(2.0);
  const [maxLeverage, setMaxLeverage] = useState(18.0);
  const [simulation, setSimulation] = useState<{
    flashWethAmount: bigint;
    totalCollateral: bigint;
    totalDebt: bigint;
    estimatedHealthFactor: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [showError, setShowError] = useState(false);
  const [morphoRates, setMorphoRates] = useState<{
    poolWstethPerWeth: number;
    poolWethPerWsteth: number;
    oracleWethPerWsteth: number;
    premiumPct: number;
  } | null>(null);

  const loadMaxLeverage = useCallback(async () => {
    if (!isConnected) return;
    try {
      const maxLev = await getMaxSafeLeverage();
      setMaxLeverage(Math.min(maxLev, 18.0));
    } catch {
      setMaxLeverage(18.0);
    }
  }, [isConnected, getMaxSafeLeverage]);

  useEffect(() => { loadMaxLeverage(); }, [loadMaxLeverage]);
  useEffect(() => { if (leverage > maxLeverage) setLeverage(maxLeverage); }, [maxLeverage]);

  // Fetch Morpho pool exchange rates
  useEffect(() => {
    if (!isConnected) return;
    getMorphoExchangeRates().then(r => r && setMorphoRates(r)).catch(() => {});
  }, [isConnected, getMorphoExchangeRates]);

  const runSimulation = useCallback(async () => {
    if (!isConnected || !deposit || parseFloat(deposit) <= 0 || leverage <= 1) {
      setSimulation(null);
      return;
    }
    setLoading(true);
    try {
      const result = await simulateLeverage(leverage, parseFloat(deposit));
      setSimulation(result);
    } catch {
      setSimulation(null);
    }
    setLoading(false);
  }, [isConnected, deposit, leverage, simulateLeverage]);

  useEffect(() => {
    const timer = setTimeout(runSimulation, 300);
    return () => clearTimeout(timer);
  }, [runSimulation]);

  const handleExecute = async () => {
    if (!simulation || !address) return;
    setExecuting(true);
    setShowError(false);
    setTxStatus('Approving wstETH...');
    try {
      setTxStatus('Authorizing Morpho...');
      await executeLeverage(leverage, parseFloat(deposit));
      setTxStatus('Position opened!');
      onSuccess();
      setTimeout(() => { setTxStatus(''); setShowError(false); }, 4000);
    } catch (err: any) {
      const msg = err.message || err.toString();
      let display = 'Transaction failed';
      if (msg.includes('Insufficient wstETH balance')) display = msg;
      else if (msg.includes('InsufficientDeposit')) display = 'Deposit amount too small';
      else if (msg.includes('UnsafeLeverage')) display = 'Leverage too high — unsafe position';
      else if (msg.includes('User rejected') || msg.includes('rejected')) display = 'Transaction rejected';
      else if (msg.includes('insufficient funds')) display = 'Insufficient ETH for gas';
      else display = msg.slice(0, 150);
      setTxStatus(display);
      setShowError(true);
    }
    setExecuting(false);
  };

  const healthColor = simulation
    ? simulation.estimatedHealthFactor > 1.5 ? 'var(--accent-primary)'
    : simulation.estimatedHealthFactor > 1.1 ? 'var(--accent-warning)'
    : 'var(--accent-secondary)'
    : 'var(--text-muted)';

  const calculateYield = () => {
    if (!reserveInfo) return null;
    const { stakingYield, supplyAPY, borrowAPY } = reserveInfo;
    const collateralAPY = stakingYield + supplyAPY;
    const totalEarnings = collateralAPY * leverage;
    const totalCosts = borrowAPY * (leverage - 1);
    return { stakingYield, supplyAPY, collateralAPY, borrowAPY, totalEarnings, totalCosts, netAPY: totalEarnings - totalCosts };
  };
  const yieldData = calculateYield();

  const isOverBalance = parseFloat(deposit) > parseFloat(balance);

  return (
    <div className="card-glow p-6">
      <h2 className="text-base font-black gradient-text tracking-tight mb-4">Open Position</h2>

      {/* Info banner */}
      <div
        className="rounded-xl p-3 mb-5 flex items-start gap-2.5"
        style={{ background: 'rgba(0,194,255,0.05)', border: '1px solid rgba(0,194,255,0.15)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" style={{ color: 'var(--accent-info)' }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p className="text-[10px] leading-relaxed font-mono" style={{ color: 'var(--text-secondary)' }}>
          Deposits wstETH as collateral, borrows WETH via flash loan, swaps for amplified staking exposure.
        </p>
      </div>

      {/* Deposit input */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">
            Deposit (wstETH)
          </label>
          <button
            onClick={() => setDeposit(balance)}
            className="text-[10px] font-mono font-bold transition-colors hover:opacity-80"
            style={{ color: 'var(--accent-primary)' }}
          >
            MAX: {balance}
          </button>
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
          placeholder="0.0"
          style={{ borderColor: isOverBalance ? 'rgba(255,51,102,0.5)' : undefined }}
        />
        {isOverBalance && (
          <p className="text-[10px] font-mono mt-1.5" style={{ color: 'var(--accent-secondary)' }}>
            Exceeds wallet balance
          </p>
        )}
      </div>

      {/* Leverage slider */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-3">
          <label className="text-[10px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">
            Leverage
          </label>
          <motion.span
            key={leverage.toFixed(1)}
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-2xl font-black font-mono"
            style={{ color: healthColor }}
          >
            {leverage.toFixed(1)}×
          </motion.span>
        </div>
        <input
          type="range"
          min="1.1"
          max={maxLeverage}
          step="0.5"
          value={leverage}
          onChange={(e) => setLeverage(parseFloat(e.target.value))}
        />
        <div className="flex justify-between text-[10px] font-mono mt-1.5">
          <span style={{ color: 'var(--text-muted)' }}>1.1× Safe</span>
          <span style={{ color: 'var(--accent-primary)' }}>{maxLeverage.toFixed(1)}× Max</span>
        </div>
      </div>

      {/* Simulation results */}
      <AnimatePresence>
        {simulation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="glass-inner p-4 mb-4 space-y-3 overflow-hidden"
          >
            <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.2em] font-mono font-bold">
              Position Preview
            </p>
            <div className="flex justify-between">
              <span className="text-xs text-(--text-secondary) font-mono">Total Collateral</span>
              <span className="text-xs font-bold font-mono" style={{ color: 'var(--accent-primary)' }}>
                {Number(formatEther(simulation.totalCollateral)).toFixed(4)} wstETH
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-(--text-secondary) font-mono">Total Debt</span>
              <span className="text-xs font-bold font-mono" style={{ color: 'var(--accent-warning)' }}>
                {Number(formatEther(simulation.totalDebt)).toFixed(4)} WETH
              </span>
            </div>
            {/* Financial leverage computed from simulation + oracle price */}
            {(() => {
              const collateralWeth = Number(formatEther(simulation.totalCollateral)) * exchangeRate;
              const debtWeth = Number(formatEther(simulation.totalDebt));
              const equity = collateralWeth - debtWeth;
              const finLev = equity > 0 ? collateralWeth / equity : 0;
              return (
                <div className="flex justify-between">
                  <span className="text-xs text-(--text-secondary) font-mono">Financial Leverage</span>
                  <span className="text-xs font-bold font-mono" style={{ color: 'var(--accent-info)' }}>
                    {finLev.toFixed(2)}×
                  </span>
                </div>
              );
            })()}
            {/* Aerodrome exchange rate */}
            {morphoRates && (
              <>
                <div className="divider" />
                <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">
                  Aerodrome Pool Rate
                </p>
                <div className="flex justify-between">
                  <span className="text-xs text-(--text-secondary) font-mono">1 wstETH → WETH</span>
                  <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {morphoRates.poolWethPerWsteth.toFixed(4)} WETH
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-(--text-secondary) font-mono">Oracle price</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {morphoRates.oracleWethPerWsteth.toFixed(4)} WETH
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-(--text-secondary) font-mono">Pool vs Oracle</span>
                  <span
                    className="text-xs font-bold font-mono"
                    style={{ color: morphoRates.premiumPct >= 0 ? 'var(--accent-primary)' : 'var(--accent-warning)' }}
                  >
                    {morphoRates.premiumPct >= 0 ? '+' : ''}{morphoRates.premiumPct.toFixed(2)}%
                  </span>
                </div>
              </>
            )}
            <div className="divider" />
            <div className="flex justify-between items-center">
              <span className="text-xs text-(--text-secondary) font-mono">Health Factor</span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${simulation.estimatedHealthFactor > 1.5 ? 'pulse-safe' : 'pulse-danger'}`}
                  style={{ background: healthColor }}
                />
                <span className="text-base font-black font-mono" style={{ color: healthColor }}>
                  {simulation.estimatedHealthFactor.toFixed(3)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading sim */}
      {loading && !simulation && (
        <div className="glass-inner p-5 mb-4 flex items-center justify-center gap-3">
          <div className="loader-bars"><span/><span/><span/><span/></div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Simulating...</span>
        </div>
      )}

      {/* Yield preview */}
      <AnimatePresence>
        {yieldData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-inner p-4 mb-4"
          >
            <div className="flex justify-between items-center mb-3">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.2em] font-mono font-bold">
                Expected at {leverage.toFixed(1)}×
              </p>
              <span
                className="text-base font-black font-mono"
                style={{ color: yieldData.netAPY > 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}
              >
                {yieldData.netAPY > 0 ? '+' : ''}{yieldData.netAPY.toFixed(2)}%
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-mono">
                <span style={{ color: 'var(--text-muted)' }}>Staking yield ({leverage.toFixed(1)}×)</span>
                <span style={{ color: 'var(--accent-primary)' }}>+{(yieldData.stakingYield * leverage).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span style={{ color: 'var(--text-muted)' }}>Supply APY ({leverage.toFixed(1)}×)</span>
                <span style={{ color: 'var(--accent-info)' }}>+{(yieldData.supplyAPY * leverage).toFixed(4)}%</span>
              </div>
              {leverage > 1 && (
                <div className="flex justify-between text-[10px] font-mono">
                  <span style={{ color: 'var(--text-muted)' }}>Borrow cost ({(leverage - 1).toFixed(1)}×)</span>
                  <span style={{ color: 'var(--accent-secondary)' }}>-{yieldData.totalCosts.toFixed(4)}%</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Low HF warning */}
      {simulation && simulation.estimatedHealthFactor < 1.2 && simulation.estimatedHealthFactor > 0 && (
        <div
          className="rounded-xl p-3 mb-4"
          style={{ background: 'rgba(255,51,102,0.07)', border: '1px solid rgba(255,51,102,0.2)' }}
        >
          <p className="text-xs font-bold font-mono" style={{ color: 'var(--accent-secondary)' }}>
            {simulation.estimatedHealthFactor < 1.05 ? 'Extremely Low HF — High Liquidation Risk' : 'Low Health Factor — Be Careful'}
          </p>
          <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-secondary)' }}>
            Health factor {simulation.estimatedHealthFactor.toFixed(3)} is near liquidation threshold (1.0)
          </p>
        </div>
      )}

      {/* CTA */}
      <button
        className="btn-primary"
        disabled={!isConnected || !simulation || executing || isOverBalance || parseFloat(deposit) <= 0}
        onClick={handleExecute}
      >
        {!isConnected ? 'Connect Wallet'
          : executing ? txStatus
          : isOverBalance ? 'Insufficient Balance'
          : parseFloat(deposit) <= 0 ? 'Enter Deposit Amount'
          : `Open ${leverage.toFixed(1)}× Position`}
      </button>

      {/* TX status */}
      <AnimatePresence>
        {txStatus && !executing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-3 p-3 rounded-xl text-center"
            style={{
              background: showError ? 'rgba(255,51,102,0.07)' : 'rgba(0,255,136,0.07)',
              border: `1px solid ${showError ? 'rgba(255,51,102,0.2)' : 'rgba(0,255,136,0.2)'}`,
            }}
          >
            <p className="text-xs font-bold font-mono" style={{ color: showError ? 'var(--accent-secondary)' : 'var(--accent-primary)' }}>
              {showError ? '' : ''}{txStatus}
            </p>
            {showError && (
              <ul className="text-[10px] font-mono mt-2 text-(--text-muted) space-y-0.5 text-left list-disc list-inside">
                <li>Ensure sufficient wstETH in wallet</li>
                <li>Ensure sufficient ETH for gas</li>
                <li>Check wallet for pending transactions</li>
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
