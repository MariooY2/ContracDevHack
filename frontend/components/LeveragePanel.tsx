'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatEther } from 'viem';
import { useLeverageContract } from '@/hooks/useLeverageContract';

interface LeveragePanelProps {
  onSuccess: () => void;
}

export default function LeveragePanel({ onSuccess }: LeveragePanelProps) {
  const { isConnected, getWstethBalance, simulateLeverage, getMaxSafeLeverage, executeLeverage } = useLeverageContract();

  const [deposit, setDeposit] = useState('1');
  const [leverage, setLeverage] = useState(2.0);
  const [maxLeverage, setMaxLeverage] = useState(4.0);
  const [balance, setBalance] = useState('0');
  const [simulation, setSimulation] = useState<{
    totalCollateral: bigint;
    totalDebt: bigint;
    premium: bigint;
    estimatedHealthFactor: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [showError, setShowError] = useState(false);

  // Load balance and max leverage
  useEffect(() => {
    if (!isConnected) return;
    (async () => {
      try {
        const [bal, maxLev] = await Promise.all([
          getWstethBalance(),
          getMaxSafeLeverage(),
        ]);
        setBalance(Number(formatEther(bal)).toFixed(4));
        setMaxLeverage(Math.min(maxLev, 4.5));
      } catch {}
    })();
  }, [isConnected]);

  // Auto-simulate on change
  useEffect(() => {
    if (!isConnected || !deposit || parseFloat(deposit) <= 0 || leverage <= 1) {
      setSimulation(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await simulateLeverage(leverage, parseFloat(deposit));
        setSimulation(result);
      } catch {
        setSimulation(null);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [deposit, leverage, isConnected]);

  const handleExecute = async () => {
    if (!simulation) return;
    setExecuting(true);
    setShowError(false);
    setTxStatus('Step 1/3: Approving wstETH token...');
    try {
      setTxStatus('Step 2/3: Approving credit delegation...');
      await executeLeverage(leverage, parseFloat(deposit));
      setTxStatus('✅ Position opened successfully!');
      onSuccess();
      setTimeout(() => {
        setTxStatus('');
        setShowError(false);
      }, 4000);
    } catch (err: any) {
      console.error('Leverage execution error:', err);
      const errorMsg = err.message || err.toString();
      // Extract the actual revert reason if available
      let displayError = 'Transaction failed';
      if (errorMsg.includes('Insufficient wstETH balance')) {
        displayError = errorMsg; // Use the full balance error message
      } else if (errorMsg.includes('InsufficientDelegation') || errorMsg.includes('delegation')) {
        displayError = 'Credit delegation not approved. Please try again or refresh the page.';
      } else if (errorMsg.includes('InsufficientDeposit')) {
        displayError = 'Deposit amount too small';
      } else if (errorMsg.includes('UnsafeLeverage')) {
        displayError = 'Leverage too high - would result in unsafe position';
      } else if (errorMsg.includes('User rejected') || errorMsg.includes('rejected')) {
        displayError = 'Transaction rejected by user';
      } else if (errorMsg.includes('insufficient funds')) {
        displayError = 'Insufficient ETH for gas fees';
      } else if (errorMsg.includes('gasLimit')) {
        displayError = 'Transaction simulation failed - check balance and approvals';
      } else {
        displayError = errorMsg.slice(0, 150);
      }
      setTxStatus(displayError);
      setShowError(true);
    }
    setExecuting(false);
  };

  const healthColor = simulation
    ? simulation.estimatedHealthFactor > 1.5 ? '#10b981'
    : simulation.estimatedHealthFactor > 1.1 ? '#f59e0b'
    : '#ef4444'
    : '#64748b';

  return (
    <div className="card-glow p-6">
      <h2 className="text-xl font-bold mb-4 gradient-text">Open Leveraged Position</h2>

      {/* Info Box */}
      <div className="bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <span className="text-sm">ℹ️</span>
          <div>
            <p className="text-xs text-[#94a3b8] leading-relaxed">
              This will automatically approve tokens, enable credit delegation, and open your leveraged position in a single transaction.
            </p>
          </div>
        </div>
      </div>

      {/* Deposit Input */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm text-[#94a3b8] font-medium">Deposit Amount (wstETH)</label>
          <button
            onClick={() => setDeposit(balance)}
            className="text-xs text-[#3b82f6] hover:text-[#60a5fa] cursor-pointer"
          >
            Max: {balance}
          </button>
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
          placeholder="0.0"
        />
      </div>

      {/* Leverage Slider */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <label className="text-sm text-[#94a3b8] font-medium">Leverage</label>
          <span className="text-2xl font-bold" style={{ color: healthColor }}>
            {leverage.toFixed(1)}x
          </span>
        </div>
        <input
          type="range"
          min="1.1"
          max={maxLeverage}
          step="0.1"
          value={leverage}
          onChange={(e) => setLeverage(parseFloat(e.target.value))}
        />
        <div className="flex justify-between text-xs text-[#64748b] mt-1">
          <span>1.1x Safe</span>
          <span>{maxLeverage.toFixed(1)}x Max</span>
        </div>
      </div>

      {/* Simulation Results */}
      {simulation && (
        <div className="bg-[#111827] rounded-xl p-4 mb-6 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-[#94a3b8]">Total Collateral</span>
            <span className="text-sm font-semibold text-[#10b981]">
              {Number(formatEther(simulation.totalCollateral)).toFixed(4)} wstETH
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-[#94a3b8]">Total Debt</span>
            <span className="text-sm font-semibold text-[#f59e0b]">
              {Number(formatEther(simulation.totalDebt)).toFixed(4)} wstETH
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-[#94a3b8]">Flash Loan Fee</span>
            <span className="text-sm text-[#64748b]">
              {Number(formatEther(simulation.premium)).toFixed(6)} wstETH
            </span>
          </div>
          <div className="border-t border-[#2a3555] pt-3 flex justify-between items-center">
            <span className="text-sm text-[#94a3b8]">Health Factor</span>
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${simulation.estimatedHealthFactor > 1.5 ? 'pulse-safe' : 'pulse-danger'}`}
                style={{ backgroundColor: healthColor }}
              />
              <span className="text-lg font-bold" style={{ color: healthColor }}>
                {simulation.estimatedHealthFactor.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {loading && !simulation && (
        <div className="bg-[#111827] rounded-xl p-4 mb-6 text-center text-[#64748b] text-sm">
          Simulating...
        </div>
      )}

      {/* Warnings */}
      {parseFloat(deposit) > parseFloat(balance) && (
        <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg p-3 mb-3">
          <p className="text-sm text-[#ef4444] font-semibold">⚠️ Insufficient Balance</p>
          <p className="text-xs text-[#94a3b8] mt-1">
            You're trying to deposit {deposit} wstETH but only have {balance} wstETH in your wallet.
          </p>
        </div>
      )}

      {/* Execute Button */}
      <button
        className="btn-primary"
        disabled={
          !isConnected ||
          !simulation ||
          executing ||
          simulation.estimatedHealthFactor < 1.05 ||
          parseFloat(deposit) > parseFloat(balance) ||
          parseFloat(deposit) <= 0
        }
        onClick={handleExecute}
      >
        {!isConnected
          ? 'Connect Wallet'
          : executing
          ? txStatus
          : parseFloat(deposit) > parseFloat(balance)
          ? 'Insufficient wstETH Balance'
          : parseFloat(deposit) <= 0
          ? 'Enter Deposit Amount'
          : simulation && simulation.estimatedHealthFactor < 1.05
          ? 'Health Factor Too Low'
          : `Open ${leverage.toFixed(1)}x Position`}
      </button>

      {txStatus && !executing && (
        <div className={`mt-3 p-3 rounded-lg text-sm ${showError ? 'bg-[#ef4444]/10 border border-[#ef4444]/30' : 'bg-[#10b981]/10 border border-[#10b981]/30'}`}>
          <p className={`text-center font-semibold ${showError ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
            {showError ? '⚠️ ' : '✅ '}{txStatus}
          </p>
          {showError && (
            <div className="mt-2 text-xs text-[#94a3b8] space-y-1">
              <p className="font-semibold text-[#e2e8f0]">Troubleshooting tips:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Make sure you have enough wstETH in your wallet</li>
                <li>Ensure you have enough ETH for gas fees</li>
                <li>Try refreshing the page and reconnecting your wallet</li>
                <li>Check your wallet for pending transactions</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
