'use client';

import { formatEther } from 'viem';
import type { ReserveInfo } from '@/lib/types';

interface YieldBreakdownProps {
  reserveInfo: ReserveInfo | null;
  leverage: number;
  exchangeRate: number;
}

export default function YieldBreakdown({ reserveInfo, leverage, exchangeRate }: YieldBreakdownProps) {
  const stakingYield = reserveInfo?.stakingYield || 3.2;
  const supplyAPY = reserveInfo?.supplyAPY || 0.001;
  const borrowAPY = reserveInfo?.borrowAPY || 0.05;

  const effectiveStaking = stakingYield * leverage;
  const effectiveBorrowCost = borrowAPY * (leverage - 1);
  const netAPY = effectiveStaking + (supplyAPY * leverage) - effectiveBorrowCost;
  const unleveragedAPY = stakingYield + supplyAPY;
  const boost = leverage > 1 ? netAPY / unleveragedAPY : 1;

  return (
    <div className="card-glow p-6">
      <h2 className="text-xl font-bold mb-6 gradient-text">Yield Breakdown</h2>

      {/* Net APY Hero */}
      <div className="bg-[#111827] rounded-xl p-6 mb-6 text-center">
        <p className="text-xs text-[#64748b] uppercase tracking-wider mb-1">Net APY at {leverage.toFixed(1)}x</p>
        <p className="text-5xl font-bold text-[#10b981]">{netAPY.toFixed(2)}%</p>
        {leverage > 1 && (
          <p className="text-sm text-[#3b82f6] mt-2">
            {boost.toFixed(1)}x yield boost vs unleveraged ({unleveragedAPY.toFixed(2)}%)
          </p>
        )}
      </div>

      {/* Breakdown */}
      <div className="space-y-4">
        {/* Earning */}
        <div>
          <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">Earning</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                <span className="text-sm text-[#94a3b8]">ETH Staking Yield</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-[#10b981]">+{effectiveStaking.toFixed(2)}%</span>
                <span className="text-xs text-[#64748b] ml-1">({stakingYield}% x {leverage.toFixed(1)})</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#06b6d4]" />
                <span className="text-sm text-[#94a3b8]">Aave Supply APY</span>
              </div>
              <span className="text-sm font-semibold text-[#06b6d4]">+{(supplyAPY * leverage).toFixed(4)}%</span>
            </div>
          </div>
        </div>

        {/* Paying */}
        <div>
          <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">Paying</p>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
              <span className="text-sm text-[#94a3b8]">WETH Borrow Interest</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-[#ef4444]">-{effectiveBorrowCost.toFixed(4)}%</span>
              <span className="text-xs text-[#64748b] ml-1">({borrowAPY.toFixed(3)}% x {(leverage - 1).toFixed(1)})</span>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-[#2a3555] pt-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-[#e2e8f0]">Net Annual Yield</span>
            <span className="text-lg font-bold text-[#10b981]">+{netAPY.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* wstETH Info */}
      <div className="bg-[#111827] rounded-xl p-4 mt-6">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#94a3b8]">wstETH Exchange Rate</span>
          <span className="text-sm font-semibold text-[#e2e8f0]">1 wstETH = {exchangeRate.toFixed(4)} stETH</span>
        </div>
        <p className="text-xs text-[#64748b] mt-2">
          wstETH value grows as staking rewards accrue. The rate only goes up over time.
        </p>
      </div>
    </div>
  );
}
