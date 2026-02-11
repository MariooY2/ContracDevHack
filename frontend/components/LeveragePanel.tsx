'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatEther } from 'viem';
import { useLeverageContract } from '@/hooks/useLeverageContract';
import { Loader } from '@/components/Loader';
import type { ReserveInfo } from '@/lib/types';

interface LeveragePanelProps {
  onSuccess: () => void;
  reserveInfo: ReserveInfo | null;
  exchangeRate: number;
}

export default function LeveragePanel({ onSuccess, reserveInfo, exchangeRate }: LeveragePanelProps) {
  const { isConnected, getWstethBalance, simulateLeverage, getMaxSafeLeverage, executeLeverage } = useLeverageContract();

  const [deposit, setDeposit] = useState('1');
  const [leverage, setLeverage] = useState(2.0);
  const [maxLeverage, setMaxLeverage] = useState(4.0);
  const [balance, setBalance] = useState('0');
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

  // Load balance and max leverage - use same pattern as page.tsx
  const loadData = useCallback(async () => {
    if (!isConnected) return;

    try {
      const [bal, maxLev] = await Promise.all([
        getWstethBalance(),
        getMaxSafeLeverage(),
      ]);

      console.log('✅ Balance loaded:', Number(formatEther(bal)).toFixed(4), 'wstETH');
      setBalance(Number(formatEther(bal)).toFixed(4));
      setMaxLeverage(Math.min(maxLev, 4.5));
    } catch (err) {
      console.error('❌ Failed to load balance:', err);
      setBalance('0');
    }
  }, [isConnected, getWstethBalance, getMaxSafeLeverage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-simulate on change
  const runSimulation = useCallback(async () => {
    if (!isConnected || !deposit || parseFloat(deposit) <= 0 || leverage <= 1) {
      setSimulation(null);
      return;
    }

    setLoading(true);
    try {
      const result = await simulateLeverage(leverage, parseFloat(deposit));
      setSimulation(result);
    } catch (err) {
      console.error('❌ Simulation failed:', err);
      setSimulation(null);
    }
    setLoading(false);
  }, [isConnected, deposit, leverage, simulateLeverage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runSimulation();
    }, 300);
    return () => clearTimeout(timer);
  }, [runSimulation]);

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

  // Calculate dynamic yield based on leverage
  const calculateYield = () => {
    if (!reserveInfo) return null;

    const stakingYield = reserveInfo.stakingYield; // Already in %
    const supplyAPY = reserveInfo.supplyAPY; // Already in %
    const borrowAPY = reserveInfo.borrowAPY; // Already in %

    // wstETH collateral earns both staking yield and Aave supply APY
    const collateralAPY = stakingYield + supplyAPY;

    // Earnings: collateral APY * leverage
    const totalEarnings = collateralAPY * leverage;

    // Costs: borrow APY * borrowed amount
    // Borrowed amount = (leverage - 1) * initial deposit
    const totalCosts = borrowAPY * (leverage - 1);

    // Net APY
    const netAPY = totalEarnings - totalCosts;

    return {
      stakingYield,
      supplyAPY,
      collateralAPY,
      borrowAPY,
      totalEarnings,
      totalCosts,
      netAPY,
    };
  };

  const yieldData = calculateYield();

  return (
    <div className="card-glow p-6">
      <h2 className="text-xl font-bold mb-4 gradient-text">Open Leveraged Position</h2>

      {/* Info Box */}
      <div className="bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <span className="text-sm">ℹ️</span>
          <div>
            <p className="text-xs text-[#94a3b8] leading-relaxed">
              Deposits wstETH as collateral and borrows WETH via flash loan. Swaps WETH to wstETH for amplified staking yield exposure.
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
              {Number(formatEther(simulation.totalDebt)).toFixed(4)} WETH
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

      {/* Dynamic Yield Breakdown */}
      {yieldData && (
        <div className="bg-[#111827] rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#e2e8f0]">Expected Yield at {leverage.toFixed(1)}x</h3>
            <span
              className="text-xl font-bold"
              style={{ color: yieldData.netAPY > 0 ? '#10b981' : '#ef4444' }}
            >
              {yieldData.netAPY > 0 ? '+' : ''}{yieldData.netAPY.toFixed(2)}%
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Earnings */}
            <div className="bg-[#10b981]/10 rounded-lg p-2">
              <div className="flex justify-between mb-1">
                <span className="text-[#94a3b8]">📈 Earnings</span>
                <span className="font-semibold text-[#10b981]">+{yieldData.totalEarnings.toFixed(2)}%</span>
              </div>
              <div className="space-y-0.5 text-[10px] text-[#64748b]">
                <div className="flex justify-between pl-3">
                  <span>• Staking Yield ({leverage.toFixed(1)}x)</span>
                  <span>{(yieldData.stakingYield * leverage).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between pl-3">
                  <span>• Supply APY ({leverage.toFixed(1)}x)</span>
                  <span>{(yieldData.supplyAPY * leverage).toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {/* Costs */}
            {leverage > 1 && (
              <div className="bg-[#ef4444]/10 rounded-lg p-2">
                <div className="flex justify-between">
                  <span className="text-[#94a3b8]">📉 Borrow Cost ({(leverage - 1).toFixed(1)}x debt)</span>
                  <span className="font-semibold text-[#ef4444]">-{yieldData.totalCosts.toFixed(2)}%</span>
                </div>
              </div>
            )}

            {/* Net Result */}
            <div className="border-t border-[#2a3555] pt-2 flex justify-between items-center">
              <span className="font-semibold text-[#e2e8f0]">Net APY</span>
              <span
                className="text-base font-bold"
                style={{ color: yieldData.netAPY > 0 ? '#10b981' : '#ef4444' }}
              >
                {yieldData.netAPY > 0 ? '+' : ''}{yieldData.netAPY.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {loading && !simulation && (
        <div className="bg-[var(--bg-secondary)] p-6 mb-6 flex items-center justify-center gap-3">
          <Loader variant="bars" size="sm" label="Simulating position" />
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
