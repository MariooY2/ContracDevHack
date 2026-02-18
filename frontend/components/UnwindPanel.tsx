'use client';

import { useState } from 'react';
import { formatEther } from 'viem';
import { useLeverageContract } from '@/hooks/useLeverageContract';
import { useProtocol } from '@/contexts/ProtocolContext';

interface UnwindPanelProps {
  debtBalance: bigint;
  collateralBalance: bigint;
  healthFactor: number;
  exchangeRate: number;
  onSuccess: () => void;
}

export default function UnwindPanel({ debtBalance, collateralBalance, healthFactor, exchangeRate, onSuccess }: UnwindPanelProps) {
  const { isConnected, executeDeleverage } = useLeverageContract();
  const { protocol } = useProtocol();
  const isMorpho = protocol === 'morpho';
  const [executing, setExecuting] = useState(false);
  const [txStatus, setTxStatus] = useState('');

  const hasPosition = debtBalance > 0n;
  // Cross-asset: collateral is wstETH, debt is WETH
  // Estimate wstETH returned: collateral - debt/exchangeRate
  const debtInWsteth = exchangeRate > 0 ? BigInt(Math.floor(Number(debtBalance) / exchangeRate)) : 0n;
  const equity = collateralBalance > debtInWsteth ? collateralBalance - debtInWsteth : 0n;

  const handleUnwind = async () => {
    setExecuting(true);
    setTxStatus(isMorpho ? 'Executing flash loan unwind...' : 'Approving aTokens...');

    try {
      // Empty swap data = contract uses Aerodrome direct swap on Base
      const lifiSwapData = '';

      setTxStatus('Executing flash loan unwind...');
      await executeDeleverage(lifiSwapData);
      setTxStatus('Position closed!');
      onSuccess();
      setTimeout(() => setTxStatus(''), 3000);
    } catch (err: any) {
      const errorMsg = err.message || err.toString();
      setTxStatus(`Error: ${errorMsg.slice(0, 60)}`);
    }
    setExecuting(false);
  };

  if (!hasPosition) {
    return (
      <div className="card-glow p-6">
        <h2 className="text-xl font-bold mb-4 gradient-text">Unwind Position</h2>
        <div className="bg-[#111827] rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">-</div>
          <p className="text-[#64748b]">No active position to unwind</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-glow p-6">
      <h2 className="text-xl font-bold mb-4 gradient-text">Unwind Position</h2>

      <div className="bg-[#111827] rounded-xl p-4 mb-6 space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-[#94a3b8]">Collateral</span>
          <span className="text-sm font-semibold text-[#10b981]">
            {Number(formatEther(collateralBalance)).toFixed(4)} wstETH
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[#94a3b8]">Debt to Repay</span>
          <span className="text-sm font-semibold text-[#ef4444]">
            {Number(formatEther(debtBalance)).toFixed(4)} WETH
          </span>
        </div>
        <div className="border-t border-[#2a3555] pt-3 flex justify-between">
          <span className="text-sm text-[#94a3b8]">You Receive (est.)</span>
          <span className="text-sm font-bold text-[#e2e8f0]">
            ~{Number(formatEther(equity)).toFixed(4)} wstETH
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[#94a3b8]">Flash Loan Fee</span>
          <span className="text-xs text-[#64748b]">{isMorpho ? 'FREE (0%)' : '~0.05% of debt'}</span>
        </div>
      </div>

      <button
        className="btn-danger"
        disabled={!isConnected || executing}
        onClick={handleUnwind}
      >
        {executing ? txStatus : 'Close Entire Position'}
      </button>

      {txStatus && !executing && (
        <p className={`text-sm text-center mt-3 ${txStatus.includes('Error') ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
          {txStatus}
        </p>
      )}
    </div>
  );
}
