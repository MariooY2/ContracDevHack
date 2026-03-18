'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import { useLeverageContract } from '@/hooks/useLeverageContract';
import { useAppStore } from '@/store/useAppStore';
import type { ReserveInfo } from '@/lib/types';
import Tooltip from '@/components/Tooltip';
import TransactionStepper, { type TxStep, type TxStepStatus } from '@/components/ui/TransactionStepper';

interface LeveragePanelProps {
  onSuccess: () => void;
  reserveInfo: ReserveInfo | null;
  exchangeRate: number;
}

const LEVERAGE_PRESETS = [2, 5, 10] as const;

export default function LeveragePanel({ onSuccess, reserveInfo, exchangeRate }: LeveragePanelProps) {
  const { isConnected, simulateLeverage, getMaxSafeLeverage, executeLeverage, address } = useLeverageContract();

  const walletBalance = useAppStore((s) => s.walletBalance);
  const isPositionLoading = useAppStore((s) => s.isPositionLoading);
  const balance = Number(formatEther(walletBalance)).toFixed(4);

  const [deposit, setDeposit] = useState('');
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
  const [txStep, setTxStep] = useState<TxStep | null>(null);

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
    setTxStep('approve');
    setTxStatus('Approving wstETH...');
    try {
      setTxStep('authorize');
      setTxStatus('Authorizing Morpho...');
      await executeLeverage(leverage, parseFloat(deposit));
      setTxStep('confirm');
      setTxStatus('Position opened!');
      onSuccess();
      setTimeout(() => { setTxStatus(''); setShowError(false); setTxStep(null); }, 4000);
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
      setTxStep(null);
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

  const isOverBalance = !isPositionLoading && parseFloat(deposit) > parseFloat(balance);

  return (
    <div className="card-glow p-6">
      <h2 className="font-black gradient-text tracking-tight mb-4" style={{ fontSize: 'var(--text-h2)' }}>Open Position</h2>

      {/* Info banner */}
      <div
        className="rounded-xl p-3 mb-5 flex items-start gap-2.5"
        style={{ background: 'rgba(0,194,255,0.05)', border: '1px solid rgba(0,194,255,0.15)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" style={{ color: 'var(--accent-info)' }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p className="font-sans leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-micro)' }}>
          Deposits wstETH as collateral, borrows WETH via flash loan, swaps for amplified staking exposure.
        </p>
      </div>

      {/* Deposit input */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <label className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
            Deposit (wstETH)
          </label>
          <button
            onClick={() => setDeposit(balance)}
            className="font-mono font-bold transition-colors hover:opacity-80"
            style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-micro)' }}
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
          <p className="font-sans mt-1.5" style={{ color: 'var(--accent-secondary)', fontSize: 'var(--text-micro)' }}>
            Exceeds wallet balance
          </p>
        )}
      </div>

      {/* Leverage section */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-3">
          <Tooltip
            label="Leverage"
            tip="Multiplier on your wstETH exposure. Higher = more yield but closer to liquidation."
            className="font-sans uppercase tracking-wider font-bold"
            style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}
          />
          <motion.span
            key={leverage.toFixed(1)}
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-black font-mono"
            style={{ color: healthColor, fontSize: 'var(--text-h1)' }}
          >
            {leverage.toFixed(1)}×
          </motion.span>
        </div>

        {/* Preset buttons */}
        <div className="flex items-center gap-2 mb-3">
          {LEVERAGE_PRESETS.map(preset => (
            <button
              key={preset}
              onClick={() => setLeverage(Math.min(preset, maxLeverage))}
              className="flex-1 py-1.5 rounded-lg font-mono font-bold transition-all"
              style={{
                fontSize: 'var(--text-caption)',
                background: Math.abs(leverage - preset) < 0.1 ? 'rgba(0,255,209,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${Math.abs(leverage - preset) < 0.1 ? 'rgba(0,255,209,0.25)' : 'var(--border)'}`,
                color: Math.abs(leverage - preset) < 0.1 ? 'var(--accent-primary)' : 'var(--text-muted)',
                opacity: preset > maxLeverage ? 0.3 : 1,
              }}
              disabled={preset > maxLeverage}
            >
              {preset}x
            </button>
          ))}
          <button
            onClick={() => setLeverage(maxLeverage)}
            className="flex-1 py-1.5 rounded-lg font-mono font-bold transition-all"
            style={{
              fontSize: 'var(--text-caption)',
              background: Math.abs(leverage - maxLeverage) < 0.1 ? 'rgba(0,255,209,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${Math.abs(leverage - maxLeverage) < 0.1 ? 'rgba(0,255,209,0.25)' : 'var(--border)'}`,
              color: Math.abs(leverage - maxLeverage) < 0.1 ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
          >
            Max
          </button>
        </div>

        <input
          type="range"
          min="1.1"
          max={maxLeverage}
          step="0.5"
          value={leverage}
          onChange={(e) => setLeverage(parseFloat(e.target.value))}
          className="slider-fill"
          style={{ '--slider-pct': `${((leverage - 1.1) / (maxLeverage - 1.1)) * 100}%` } as React.CSSProperties}
        />
        <div className="flex justify-between font-mono mt-1.5" style={{ fontSize: 'var(--text-micro)' }}>
          <span style={{ color: 'var(--text-muted)' }}>1.1× Safe</span>
          <span style={{ color: 'var(--accent-primary)' }}>{maxLeverage.toFixed(1)}× Max</span>
        </div>
      </div>

      {/* Inline yield preview */}
      {yieldData && (
        <div
          className="rounded-xl p-3 mb-4 flex items-center justify-between"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div>
            <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              Net APY at {leverage.toFixed(1)}×
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: 'var(--text-h2)',
                  color: yieldData.netAPY > 0 ? 'var(--color-success)' : 'var(--accent-secondary)',
                }}
              >
                {yieldData.netAPY > 0 ? '+' : ''}{yieldData.netAPY.toFixed(2)}%
              </span>
              {deposit && parseFloat(deposit) > 0 && (
                <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                  ≈ {((yieldData.netAPY / 100) * parseFloat(deposit) * exchangeRate).toFixed(4)} ETH/yr
                </span>
              )}
            </div>
          </div>
          {/* Mini health indicator */}
          {simulation && (
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full mb-1 ${simulation.estimatedHealthFactor > 1.5 ? 'pulse-safe' : 'pulse-danger'}`}
                style={{ background: healthColor }}
              />
              <span className="font-mono font-bold" style={{ color: healthColor, fontSize: 'var(--text-caption)' }}>
                {simulation.estimatedHealthFactor.toFixed(2)}
              </span>
              <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: '7px' }}>HF</span>
            </div>
          )}
        </div>
      )}

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
            <p className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              Position Preview
            </p>
            <div className="flex justify-between">
              <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>Total Collateral</span>
              <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-caption)' }}>
                {Number(formatEther(simulation.totalCollateral)).toFixed(4)} wstETH
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>Total Debt</span>
              <span className="font-mono font-bold" style={{ color: 'var(--accent-warning)', fontSize: 'var(--text-caption)' }}>
                {Number(formatEther(simulation.totalDebt)).toFixed(4)} WETH
              </span>
            </div>
            {(() => {
              const collateralWeth = Number(formatEther(simulation.totalCollateral)) * exchangeRate;
              const debtWeth = Number(formatEther(simulation.totalDebt));
              const equity = collateralWeth - debtWeth;
              const finLev = equity > 0 ? collateralWeth / equity : 0;
              return (
                <div className="flex justify-between">
                  <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>Financial Leverage</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--accent-info)', fontSize: 'var(--text-caption)' }}>
                    {finLev.toFixed(2)}×
                  </span>
                </div>
              );
            })()}
            <div className="divider" />
            <p className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              Exchange Rate
            </p>
            <div className="flex justify-between">
              <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>1 wstETH</span>
              <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>
                {exchangeRate.toFixed(4)} WETH
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>Swap via</span>
              <span className="font-mono" style={{ color: 'var(--accent-info)', fontSize: 'var(--text-caption)' }}>
                LiFi (best route)
              </span>
            </div>
            <div className="divider" />
            <div className="flex justify-between items-center">
              <Tooltip label="Health Factor" tip="Below 1.0 triggers liquidation. Keep above 1.5 for safety." className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }} />
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${simulation.estimatedHealthFactor > 1.5 ? 'pulse-safe' : 'pulse-danger'}`}
                  style={{ background: healthColor }}
                />
                <span className="font-black font-mono" style={{ color: healthColor, fontSize: 'var(--text-h2)' }}>
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
          <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Simulating...</span>
        </div>
      )}

      {/* Low HF warning */}
      {simulation && simulation.estimatedHealthFactor < 1.2 && simulation.estimatedHealthFactor > 0 && (
        <div
          className="rounded-xl p-3 mb-4"
          style={{ background: 'rgba(255,51,102,0.07)', border: '1px solid rgba(255,51,102,0.2)' }}
        >
          <p className="font-sans font-bold" style={{ color: 'var(--accent-secondary)', fontSize: 'var(--text-caption)' }}>
            {simulation.estimatedHealthFactor < 1.05 ? 'Extremely Low HF — High Liquidation Risk' : 'Low Health Factor — Be Careful'}
          </p>
          <p className="font-sans mt-1" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-micro)' }}>
            Health factor {simulation.estimatedHealthFactor.toFixed(3)} is near liquidation threshold (1.0)
          </p>
        </div>
      )}

      {/* Transaction Stepper (during execution) */}
      <AnimatePresence>
        {executing && txStep && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <TransactionStepper
              currentStep={txStep}
              stepStatuses={(() => {
                const steps: TxStep[] = ['approve', 'authorize', 'execute', 'confirm'];
                const currentIdx = steps.indexOf(txStep);
                const statuses: Record<TxStep, TxStepStatus> = {
                  approve: 'pending', authorize: 'pending', execute: 'pending', confirm: 'pending',
                };
                for (let i = 0; i < steps.length; i++) {
                  if (i < currentIdx) statuses[steps[i]] = 'completed';
                  else if (i === currentIdx) statuses[steps[i]] = txStep === 'confirm' ? 'completed' : 'active';
                }
                return statuses;
              })()}
            />
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* TX status (post-execution) */}
      <AnimatePresence>
        {txStatus && !executing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-3 p-3 rounded-xl text-center"
            style={{
              background: showError ? 'rgba(255,51,102,0.07)' : 'rgba(0,255,209,0.07)',
              border: `1px solid ${showError ? 'rgba(255,51,102,0.2)' : 'rgba(0,255,209,0.2)'}`,
            }}
          >
            <p className="font-sans font-bold" style={{ color: showError ? 'var(--accent-secondary)' : 'var(--accent-primary)', fontSize: 'var(--text-caption)' }}>
              {txStatus}
            </p>
            {showError && (
              <ul className="font-sans mt-2 space-y-0.5 text-left list-disc list-inside" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
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
