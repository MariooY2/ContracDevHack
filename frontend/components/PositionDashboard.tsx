'use client';

import { formatEther } from 'viem';
import type { ReserveInfo } from '@/lib/types';

interface PositionDashboardProps {
  collateralBalance: bigint;
  debtBalance: bigint;
  healthFactor: number;
  reserveInfo: ReserveInfo | null;
  exchangeRate: number;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[#111827] rounded-xl p-4">
      <p className="text-xs text-[#64748b] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: color || '#e2e8f0' }}>{value}</p>
      {sub && <p className="text-xs text-[#64748b] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PositionDashboard({
  collateralBalance, debtBalance, healthFactor, reserveInfo, exchangeRate
}: PositionDashboardProps) {
  const hasPosition = debtBalance > 0n;
  const collateral = Number(formatEther(collateralBalance));
  const debt = Number(formatEther(debtBalance));
  const equity = collateral - debt;
  const currentLeverage = equity > 0 ? collateral / equity : 0;

  const hfColor = healthFactor > 1.5 ? '#10b981' : healthFactor > 1.1 ? '#f59e0b' : '#ef4444';

  // APY calculations
  const stakingYield = reserveInfo?.stakingYield || 3.2;
  const borrowCost = reserveInfo?.borrowAPY || 0.05;
  const netAPY = hasPosition ? (stakingYield * currentLeverage) - (borrowCost * (currentLeverage - 1)) : stakingYield;

  return (
    <div className="card-glow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold gradient-text">Your Position</h2>
        {hasPosition && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ backgroundColor: `${hfColor}20` }}>
            <div
              className={`w-2 h-2 rounded-full ${healthFactor > 1.5 ? 'pulse-safe' : 'pulse-danger'}`}
              style={{ backgroundColor: hfColor }}
            />
            <span className="text-sm font-semibold" style={{ color: hfColor }}>
              HF {healthFactor.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {!hasPosition ? (
        <div className="bg-[#111827] rounded-xl p-8 text-center">
          <p className="text-3xl mb-2">0x</p>
          <p className="text-[#64748b]">No active leveraged position</p>
          <p className="text-xs text-[#64748b] mt-1">Open a position to see stats here</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard
              label="Collateral"
              value={`${collateral.toFixed(4)}`}
              sub="wstETH on Aave"
              color="#10b981"
            />
            <StatCard
              label="Debt"
              value={`${debt.toFixed(4)}`}
              sub="wstETH borrowed"
              color="#f59e0b"
            />
            <StatCard
              label="Net Equity"
              value={`${equity.toFixed(4)}`}
              sub="wstETH"
              color="#e2e8f0"
            />
            <StatCard
              label="Leverage"
              value={`${currentLeverage.toFixed(1)}x`}
              sub={`${(currentLeverage * 100 - 100).toFixed(0)}% amplified`}
              color="#3b82f6"
            />
          </div>

          {/* Leverage Bar Visual */}
          <div className="bg-[#111827] rounded-xl p-4">
            <div className="flex justify-between text-xs text-[#64748b] mb-2">
              <span>Debt / Collateral Ratio</span>
              <span>{((debt / collateral) * 100).toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-[#1a2035] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((debt / collateral) * 100, 100)}%`,
                  background: `linear-gradient(90deg, #10b981, ${hfColor})`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs mt-2">
              <span className="text-[#64748b]">Safe Zone</span>
              <span style={{ color: hfColor }}>
                LTV {reserveInfo?.ltv.toFixed(1)}% | Liq {reserveInfo?.liquidationThreshold.toFixed(1)}%
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
