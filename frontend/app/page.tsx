'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import { WalletConnect } from '@/components/WalletConnect';
import LeveragePanel from '@/components/LeveragePanel';
import UnwindPanel from '@/components/UnwindPanel';
import PositionDashboard from '@/components/PositionDashboard';
import YieldBreakdown from '@/components/YieldBreakdown';
// import PriceChart from '@/components/PriceChart';
import DepegChart from '@/components/DepegChart';
import YieldLeverageChart from '@/components/YieldLeverageChart';
import { useLeverageContract } from '@/hooks/useLeverageContract';
import { PageLoader } from '@/components/Loader';
import { useAppStore } from '@/store/useAppStore';

// Lightning bolt icon for VOLT logo
function VoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13 2L4.09 12.37A1 1 0 0 0 5 14H11L11 22L19.91 11.63A1 1 0 0 0 19 10H13L13 2Z"
        fill="#05080F"
        stroke="#05080F"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const {
    isConnected,
    getUserPosition,
    getReserveInfo,
    getExchangeRate,
    getWstethBalance,
  } = useLeverageContract();

  const {
    collateralBalance,
    debtBalance,
    healthFactor,
    reserveInfo,
    exchangeRate,
    walletBalance,
    activeTab,
    isInitialLoad,
    isMarketLoading,
    isPositionLoading,
    setMarketData,
    setPositionData,
    clearPositionData,
    setActiveTab,
    setInitialLoadDone,
    startRefresh,
  } = useAppStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Use refs so the interval callback always sees the latest functions
  // without causing the effect to re-run and restart the interval.
  const fnRef = useRef({ getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance });
  const connectedRef = useRef(isConnected);
  useEffect(() => {
    fnRef.current = { getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance };
  }, [getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance]);
  useEffect(() => { connectedRef.current = isConnected; }, [isConnected]);

  const refreshData = useCallback(async (showLoading = false) => {
    if (showLoading) startRefresh(connectedRef.current);
    try {
      const fns = fnRef.current;
      const [reserve, rate] = await Promise.all([fns.getReserveInfo(), fns.getExchangeRate()]);
      setMarketData({ reserveInfo: reserve ?? null, exchangeRate: rate });

      if (connectedRef.current) {
        const [position, wBal] = await Promise.all([fns.getUserPosition(), fns.getWstethBalance()]);
        if (position) {
          setPositionData({
            collateralBalance: position.totalCollateralBase,
            debtBalance: position.totalDebtBase,
            healthFactor: position.healthFactor,
            walletBalance: wBal,
          });
        } else {
          setPositionData({ collateralBalance: 0n, debtBalance: 0n, healthFactor: 0, walletBalance: wBal });
        }
      } else {
        clearPositionData();
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setInitialLoadDone();
    }
  }, [setMarketData, setPositionData, clearPositionData, setInitialLoadDone, startRefresh]);

  // Initial fetch (with loading skeletons) + silent background polling
  useEffect(() => {
    let cancelled = false;
    const run = async (showLoading: boolean) => { if (!cancelled) await refreshData(showLoading); };
    run(true); // initial load shows skeletons
    const interval = setInterval(() => run(false), 15000); // background refresh — no skeletons
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshData]);

  // Re-fetch when wallet connection changes (with loading)
  useEffect(() => { refreshData(true); }, [isConnected, refreshData]);

  const collateralEth = Number(formatEther(collateralBalance)) * exchangeRate;
  const debtEth = Number(formatEther(debtBalance));
  const currentLeverage = debtBalance > 0n && collateralEth > debtEth
    ? collateralEth / (collateralEth - debtEth) : 1;

  // Full-screen initial loader
  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-grid-pattern flex items-center justify-center relative overflow-hidden">
        <div className="ambient-orb-1" />
        <div className="ambient-orb-2" />
        <div className="ambient-orb-3" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative z-10 flex flex-col items-center gap-6"
        >
          <div className="volt-logo w-16 h-16">
            <VoltIcon />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-black gradient-text tracking-tight">VOLT</h1>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-[0.3em] mt-1 font-mono">
              Protocol · Flash Leverage
            </p>
          </div>
          <PageLoader label="Connecting to Morpho Blue" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid-pattern overflow-x-hidden">
      {/* Ambient background */}
      <div className="ambient-orb-1" />
      <div className="ambient-orb-2" />
      <div className="ambient-orb-3" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          borderColor: 'var(--border)',
          background: 'rgba(5, 8, 15, 0.85)',
          backdropFilter: 'blur(24px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="volt-logo">
              <VoltIcon />
            </div>
            <div>
              <h1 className="text-lg font-black gradient-text tracking-tight leading-none">VOLT</h1>
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.25em] font-mono mt-0.5">
                Flash Leverage
              </p>
            </div>
          </div>

          {/* Live stats */}
          <div className="hidden lg:flex items-center gap-1.5">
            {isMarketLoading ? (
              ['LTV', 'Supply', 'Borrow', 'Yield'].map((label) => (
                <div key={label} className="stat-chip gap-2">
                  <span className="stat-label">{label}</span>
                  <span className="skeleton inline-block w-10 h-3 rounded-full" />
                </div>
              ))
            ) : reserveInfo ? (
              <>
                <div className="stat-chip">
                  <span className="stat-label">LTV</span>
                  <span className="stat-value">{reserveInfo.ltv.toFixed(1)}%</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-label">Supply APY</span>
                  <span className="stat-value" style={{ color: 'var(--accent-primary)' }}>
                    {reserveInfo.supplyAPY.toFixed(3)}%
                  </span>
                </div>
                <div className="stat-chip">
                  <span className="stat-label">Borrow APY</span>
                  <span className="stat-value" style={{ color: 'var(--accent-warning)' }}>
                    {reserveInfo.borrowAPY.toFixed(3)}%
                  </span>
                </div>
                <div className="stat-chip">
                  <span className="stat-label">Staking</span>
                  <span className="stat-value" style={{ color: 'var(--accent-info)' }}>
                    {reserveInfo.stakingYield}%
                  </span>
                </div>
              </>
            ) : (
              ['LTV', 'Supply APY', 'Borrow APY', 'Staking'].map((label) => (
                <div key={label} className="stat-chip opacity-40">
                  <span className="stat-label">{label}</span>
                  <span className="stat-value">--</span>
                </div>
              ))
            )}
          </div>

          <WalletConnect />
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        {/* Wallet Balance Banner */}
        <AnimatePresence>
          {mounted && isConnected && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="card-glow p-4 mb-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--grad-brand)', boxShadow: '0 0 16px rgba(0,255,136,0.3)' }}
                  >
                    <VoltIcon />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">
                      Wallet Balance
                    </p>
                    {isPositionLoading ? (
                      <div className="skeleton h-5 w-36 rounded-lg" />
                    ) : (
                      <p className="text-lg font-bold text-[var(--text-primary)] font-mono">
                        {walletBalance > 0n ? (
                          <>
                            {Number(formatEther(walletBalance)).toFixed(4)}
                            <span className="gradient-text ml-1.5">wstETH</span>
                          </>
                        ) : (
                          <span className="opacity-40">0.0000 <span className="gradient-text">wstETH</span></span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Protocol badge */}
                  <div className="hidden sm:block text-right">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">
                      Protocol
                    </p>
                    <p className="text-sm font-bold font-mono" style={{ color: 'var(--accent-info)' }}>
                      Morpho Blue · Base
                    </p>
                  </div>

                  {/* Active position */}
                  {!isPositionLoading && debtBalance > 0n ? (
                    <div
                      className="px-4 py-2 rounded-xl text-center"
                      style={{
                        background: 'rgba(0,255,136,0.08)',
                        border: '1px solid rgba(0,255,136,0.2)',
                      }}
                    >
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono">
                        Active
                      </p>
                      <p className="text-lg font-black gradient-text leading-none">
                        {currentLeverage.toFixed(1)}x
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Grid Layout ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column — 2/3 width */}
          <motion.div
            className="lg:col-span-2 space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <PositionDashboard
              collateralBalance={collateralBalance}
              debtBalance={debtBalance}
              healthFactor={healthFactor}
              reserveInfo={reserveInfo}
              exchangeRate={exchangeRate}
              isLoading={isPositionLoading}
            />
            <YieldLeverageChart
              reserveInfo={reserveInfo}
              leverage={debtBalance > 0n ? currentLeverage : 2.0}
              maxLeverage={reserveInfo?.maxLeverage || 18.0}
              hasPosition={debtBalance > 0n}
            />
            {/* <PriceChart exchangeRate={exchangeRate} reserveInfo={reserveInfo} /> */}
            <DepegChart reserveInfo={reserveInfo} exchangeRate={exchangeRate} />
          </motion.div>

          {/* Right column — 1/3 width */}
          <motion.div
            className="space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            {/* Tab switcher */}
            <div
              className="flex p-1 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            >
              {(['leverage', 'unwind'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="relative flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-xl transition-all duration-200"
                  style={{
                    color: activeTab === tab ? '#05080F' : 'var(--text-muted)',
                    fontFamily: 'var(--font-geist-mono)',
                  }}
                >
                  {activeTab === tab && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: tab === 'leverage'
                          ? 'linear-gradient(135deg, #00FF88 0%, #00C2FF 100%)'
                          : 'linear-gradient(135deg, #FF3366 0%, #FF5555 100%)',
                        boxShadow: tab === 'leverage'
                          ? '0 4px 16px rgba(0,255,136,0.3)'
                          : '0 4px 16px rgba(255,51,102,0.3)',
                      }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{tab}</span>
                </button>
              ))}
            </div>

            {/* Action panel */}
            <AnimatePresence mode="wait">
              {activeTab === 'leverage' ? (
                <motion.div
                  key="leverage"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <LeveragePanel
                    onSuccess={refreshData}
                    reserveInfo={reserveInfo}
                    exchangeRate={exchangeRate}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="unwind"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <UnwindPanel
                    debtBalance={debtBalance}
                    collateralBalance={collateralBalance}
                    healthFactor={healthFactor}
                    exchangeRate={exchangeRate}
                    onSuccess={refreshData}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <YieldBreakdown
              reserveInfo={reserveInfo}
              leverage={debtBalance > 0n ? currentLeverage : 2.0}
              exchangeRate={exchangeRate}
              isLoading={isMarketLoading}
            />
          </motion.div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer
        className="mt-12 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="volt-logo w-6 h-6 !rounded-lg">
              <VoltIcon />
            </div>
            <span style={{ color: 'var(--text-muted)' }}>
              VOLT Protocol · Morpho Blue · Base
            </span>
          </div>
          <span style={{ color: 'var(--text-muted)' }}>Use at your own risk</span>
        </div>
      </footer>
    </div>
  );
}
