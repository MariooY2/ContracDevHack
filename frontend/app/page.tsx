'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatEther } from 'viem';
import { WalletConnect } from '@/components/WalletConnect';
import LeveragePanel from '@/components/LeveragePanel';
import UnwindPanel from '@/components/UnwindPanel';
import PositionDashboard from '@/components/PositionDashboard';
import YieldBreakdown from '@/components/YieldBreakdown';
import PriceChart from '@/components/PriceChart';
import DepegChart from '@/components/DepegChart';
import { useLeverageContract } from '@/hooks/useLeverageContract';
import type { ReserveInfo } from '@/lib/types';

export default function Home() {
  const {
    isConnected, getATokenBalance, getDebtBalance, getUserPosition,
    getReserveInfo, getExchangeRate, getWstethBalance,
  } = useLeverageContract();

  const [collateralBalance, setCollateralBalance] = useState(0n);
  const [debtBalance, setDebtBalance] = useState(0n);
  const [healthFactor, setHealthFactor] = useState(0);
  const [reserveInfo, setReserveInfo] = useState<ReserveInfo | null>(null);
  const [exchangeRate, setExchangeRate] = useState(1.228);
  const [walletBalance, setWalletBalance] = useState(0n);
  const [activeTab, setActiveTab] = useState<'leverage' | 'unwind'>('leverage');

  const refreshData = useCallback(async () => {
    try {
      const [aBalance, dBalance, position, reserve, rate, wBal] = await Promise.all([
        getATokenBalance(),
        getDebtBalance(),
        getUserPosition(),
        getReserveInfo(),
        getExchangeRate(),
        getWstethBalance(),
      ]);

      setCollateralBalance(aBalance);
      setDebtBalance(dBalance);
      setHealthFactor(position?.healthFactor || 0);
      setReserveInfo(reserve);
      setExchangeRate(rate);
      setWalletBalance(wBal);
    } catch (err) {
      // Try just reserve info and exchange rate (works without wallet)
      try {
        const [reserve, rate] = await Promise.all([getReserveInfo(), getExchangeRate()]);
        if (reserve) setReserveInfo(reserve);
        setExchangeRate(rate);
      } catch {}
    }
  }, [isConnected]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 15000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const currentLeverage = debtBalance > 0n
    ? Number(formatEther(collateralBalance)) / (Number(formatEther(collateralBalance)) - Number(formatEther(debtBalance)))
    : 1;

  return (
    <div className="min-h-screen" style={{ background: '#0a0e17' }}>
      {/* Header */}
      <header className="border-b border-[#2a3555]" style={{ background: 'rgba(26, 32, 53, 0.8)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">wstETH Leverage</h1>
              <p className="text-xs text-[#64748b]">Powered by Aave V3 Flash Loans</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Stats */}
            {reserveInfo && (
              <div className="hidden md:flex items-center gap-4 text-xs">
                <div className="px-3 py-1.5 rounded-lg" style={{ background: '#111827' }}>
                  <span className="text-[#64748b]">LTV </span>
                  <span className="text-[#e2e8f0] font-semibold">{reserveInfo.ltv.toFixed(1)}%</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg" style={{ background: '#111827' }}>
                  <span className="text-[#64748b]">Borrow </span>
                  <span className="text-[#f59e0b] font-semibold">{reserveInfo.borrowAPY.toFixed(3)}%</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg" style={{ background: '#111827' }}>
                  <span className="text-[#64748b]">Staking </span>
                  <span className="text-[#10b981] font-semibold">{reserveInfo.stakingYield}%</span>
                </div>
              </div>
            )}
            <WalletConnect />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Wallet Balance Banner */}
        {isConnected && (
          <div className="card-glow p-4 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                <span className="text-white text-sm font-bold">W</span>
              </div>
              <div>
                <p className="text-xs text-[#64748b]">Wallet Balance</p>
                <p className="text-lg font-bold text-[#e2e8f0]">
                  {Number(formatEther(walletBalance)).toFixed(4)} wstETH
                </p>
              </div>
            </div>
            {debtBalance > 0n && (
              <div className="text-right">
                <p className="text-xs text-[#64748b]">Active Position</p>
                <p className="text-lg font-bold text-[#3b82f6]">{currentLeverage.toFixed(1)}x Leverage</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Position + Chart */}
          <div className="lg:col-span-2 space-y-6">
            <PositionDashboard
              collateralBalance={collateralBalance}
              debtBalance={debtBalance}
              healthFactor={healthFactor}
              reserveInfo={reserveInfo}
              exchangeRate={exchangeRate}
            />
            <PriceChart exchangeRate={exchangeRate} />
            <DepegChart reserveInfo={reserveInfo} />
          </div>

          {/* Right Column: Actions + Yield */}
          <div className="space-y-6">
            {/* Tab Switcher */}
            <div className="flex rounded-xl overflow-hidden" style={{ background: '#111827' }}>
              <button
                onClick={() => setActiveTab('leverage')}
                className={`flex-1 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'leverage'
                    ? 'text-white'
                    : 'text-[#64748b] hover:text-[#94a3b8]'
                }`}
                style={activeTab === 'leverage' ? { background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' } : {}}
              >
                Leverage
              </button>
              <button
                onClick={() => setActiveTab('unwind')}
                className={`flex-1 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'unwind'
                    ? 'text-white'
                    : 'text-[#64748b] hover:text-[#94a3b8]'
                }`}
                style={activeTab === 'unwind' ? { background: 'linear-gradient(135deg, #ef4444, #dc2626)' } : {}}
              >
                Unwind
              </button>
            </div>

            {/* Action Panel */}
            {activeTab === 'leverage' ? (
              <LeveragePanel onSuccess={refreshData} />
            ) : (
              <UnwindPanel
                debtBalance={debtBalance}
                collateralBalance={collateralBalance}
                healthFactor={healthFactor}
                onSuccess={refreshData}
              />
            )}

            {/* Yield Breakdown */}
            <YieldBreakdown
              reserveInfo={reserveInfo}
              leverage={debtBalance > 0n ? currentLeverage : 2.0}
              exchangeRate={exchangeRate}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2a3555] mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-[#64748b]">
          <p>Built with Aave V3 Flash Loans on Contract.dev</p>
          <p>Use at your own risk. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
