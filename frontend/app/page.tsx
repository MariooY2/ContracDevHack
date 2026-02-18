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
import { useProtocol } from '@/contexts/ProtocolContext';
import ProtocolSwitcher from '@/components/ProtocolSwitcher';
import { PageLoader } from '@/components/Loader';
import type { ReserveInfo } from '@/lib/types';

export default function Home() {
  const { protocol } = useProtocol();
  const {
    isConnected, getUserPosition,
    getReserveInfo, getExchangeRate, getWstethBalance,
  } = useLeverageContract();

  const [mounted, setMounted] = useState(false);
  const [collateralBalance, setCollateralBalance] = useState(0n);
  const [debtBalance, setDebtBalance] = useState(0n);
  const [healthFactor, setHealthFactor] = useState(0);
  const [reserveInfo, setReserveInfo] = useState<ReserveInfo | null>(null);
  const [exchangeRate, setExchangeRate] = useState(1.228);
  const [walletBalance, setWalletBalance] = useState(0n);
  const [activeTab, setActiveTab] = useState<'leverage' | 'unwind'>('leverage');
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  const refreshData = useCallback(async () => {
    try {
      // Fetch reserve info + exchange rate (works without wallet)
      const [reserve, rate] = await Promise.all([
        getReserveInfo(),
        getExchangeRate(),
      ]);

      if (reserve) setReserveInfo(reserve);
      setExchangeRate(rate);

      // Wallet-specific data only when connected
      if (isConnected) {
        const [position, wBal] = await Promise.all([
          getUserPosition(),
          getWstethBalance(),
        ]);

        // getUserPosition already returns collateral + debt + healthFactor
        // No need to call getATokenBalance/getDebtBalance separately
        if (position) {
          setCollateralBalance(position.totalCollateralBase);
          setDebtBalance(position.totalDebtBase);
          setHealthFactor(position.healthFactor);
        } else {
          setCollateralBalance(0n);
          setDebtBalance(0n);
          setHealthFactor(0);
        }
        setWalletBalance(wBal);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [isConnected, getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance]);

  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      if (isCancelled) return;
      await refreshData();
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [refreshData]);

  // Cross-asset leverage: convert wstETH collateral to ETH terms before dividing
  const collateralEth = Number(formatEther(collateralBalance)) * exchangeRate;
  const debtEth = Number(formatEther(debtBalance)); // WETH = ETH
  const currentLeverage = debtBalance > 0n && collateralEth > debtEth
    ? collateralEth / (collateralEth - debtEth)
    : 1;

  return (
    <div className="min-h-screen bg-grid-pattern">
      {/* Ambient glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-15 blur-[120px]" style={{ background: 'var(--accent-primary)' }} />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-10 blur-[120px]" style={{ background: 'var(--accent-secondary)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5 blur-[150px]" style={{ background: 'var(--accent-info)' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b-2 border-[var(--border)]" style={{ background: 'rgba(13, 13, 13, 0.9)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="logo-mark w-10 h-10 flex items-center justify-center">
              <span className="text-[var(--bg-primary)] font-black text-lg">F</span>
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text tracking-wider">FlashLev</h1>
              <p className="text-xs text-[var(--text-muted)] font-mono">DeFi Leverage Protocol</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Stats */}
            <div className="hidden md:flex items-center gap-1 text-xs relative">
              {reserveInfo ? (
                <>
                  <div className="stat-chip">
                    <span className="stat-label">LTV</span>
                    <span className="stat-value">{reserveInfo.ltv.toFixed(1)}%</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-label">Supply</span>
                    <span className="stat-value text-[var(--accent-success)]">{reserveInfo.supplyAPY.toFixed(3)}%</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-label">Borrow</span>
                    <span className="stat-value text-[var(--accent-warning)]">{reserveInfo.borrowAPY.toFixed(3)}%</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-label">Yield</span>
                    <span className="stat-value text-[var(--accent-primary)]">{reserveInfo.stakingYield}%</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="stat-chip opacity-50">
                    <span className="stat-label">LTV</span>
                    <span className="stat-value">--</span>
                  </div>
                  <div className="stat-chip opacity-50">
                    <span className="stat-label">Supply</span>
                    <span className="stat-value">--</span>
                  </div>
                  <div className="stat-chip opacity-50">
                    <span className="stat-label">Borrow</span>
                    <span className="stat-value">--</span>
                  </div>
                  <div className="stat-chip opacity-50">
                    <span className="stat-label">Yield</span>
                    <span className="stat-value">--</span>
                  </div>
                </div>
              )}
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        {initialLoading ? (
          <PageLoader label="Connecting to Protocol" />
        ) : (
        <>
        {/* Protocol Switcher */}
        <ProtocolSwitcher />

        {/* Wallet Balance Banner */}
        {mounted && isConnected && (
          <div className="card-glow p-4 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center" style={{ background: 'var(--accent-primary)', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
                <span className="text-[var(--bg-primary)] text-xs font-black">$</span>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Wallet Balance</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {walletBalance > 0n ? (
                    <>{Number(formatEther(walletBalance)).toFixed(4)} <span className="text-[var(--accent-primary)]">wstETH</span></>
                  ) : (
                    <span className="opacity-50">0.0000 <span className="text-[var(--accent-primary)]">wstETH</span></span>
                  )}
                </p>
              </div>
            </div>
            {debtBalance > 0n && (
              <div className="text-right">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Active Position</p>
                <p className="text-lg font-bold text-[var(--accent-primary)]">{currentLeverage.toFixed(1)}x Leverage</p>
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
            <PriceChart exchangeRate={exchangeRate} reserveInfo={reserveInfo} />
            <DepegChart reserveInfo={reserveInfo} />
          </div>

          {/* Right Column: Actions + Yield */}
          <div className="space-y-6">
            {/* Tab Switcher */}
            <div className="flex border-2 border-[var(--border)] overflow-hidden">
              <button
                onClick={() => setActiveTab('leverage')}
                className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest transition-all ${
                  activeTab === 'leverage'
                    ? 'text-[var(--bg-primary)] bg-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)]'
                }`}
              >
                Leverage
              </button>
              <button
                onClick={() => setActiveTab('unwind')}
                className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest transition-all ${
                  activeTab === 'unwind'
                    ? 'text-[var(--text-primary)] bg-[var(--accent-secondary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)]'
                }`}
              >
                Unwind
              </button>
            </div>

            {/* Action Panel */}
            {activeTab === 'leverage' ? (
              <LeveragePanel
                onSuccess={refreshData}
                reserveInfo={reserveInfo}
                exchangeRate={exchangeRate}
              />
            ) : (
              <UnwindPanel
                debtBalance={debtBalance}
                collateralBalance={collateralBalance}
                healthFactor={healthFactor}
                exchangeRate={exchangeRate}
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
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[var(--border)] mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
          <p>FlashLev // {protocol === 'aave' ? 'Aave V3' : 'Morpho Blue'} Flash Loans</p>
          <p className="text-[var(--accent-secondary)]">Use at your own risk</p>
        </div>
      </footer>
    </div>
  );
}
