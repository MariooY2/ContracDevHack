'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import { WalletConnect } from '../components/WalletConnect';
import LeveragePanel from '../components/LeveragePanel';
import UnwindPanel from '../components/UnwindPanel';
import UnwindConfirmModal from '../components/UnwindConfirmModal';
import PositionDashboard from '../components/PositionDashboard';
import YieldBreakdown from '../components/YieldBreakdown';
import DepegChart from '../components/DepegChart';
import YieldLeverageChart from '../components/YieldLeverageChart';
import { useLeverageContract } from '../hooks/useLeverageContract';
import { PageLoader } from '../components/Loader';
import { useAppStore } from '../store/useAppStore';

function VoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13 2L4.09 12.37A1 1 0 0 0 5 14H11L11 22L19.91 11.63A1 1 0 0 0 19 10H13L13 2Z"
        fill="#030711"
        stroke="#030711"
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
    executeDeleverage,
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

  // Unwind modal state (rendered at page root level)
  const [showUnwindModal, setShowUnwindModal] = useState(false);
  const [unwindExecuting, setUnwindExecuting] = useState(false);
  const [unwindTxStatus, setUnwindTxStatus] = useState('');
  const [unwindIsError, setUnwindIsError] = useState(false);

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

  const handleUnwindConfirm = useCallback(async () => {
    setShowUnwindModal(false);
    setUnwindExecuting(true);
    setUnwindIsError(false);
    setUnwindTxStatus('Executing flash loan unwind...');
    try {
      await executeDeleverage();
      setUnwindTxStatus('Position closed successfully!');
      refreshData();
      setTimeout(() => setUnwindTxStatus(''), 4000);
    } catch (err: any) {
      const errorMsg = err.message || err.toString();
      setUnwindTxStatus(errorMsg.slice(0, 80));
      setUnwindIsError(true);
    }
    setUnwindExecuting(false);
  }, [executeDeleverage, refreshData]);

  useEffect(() => {
    let cancelled = false;
    const run = async (showLoading: boolean) => { if (!cancelled) await refreshData(showLoading); };
    run(true);
    const interval = setInterval(() => run(false), 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshData]);

  useEffect(() => { refreshData(true); }, [isConnected, refreshData]);

  const collateralEth = Number(formatEther(collateralBalance)) * exchangeRate;
  const debtEth = Number(formatEther(debtBalance));
  const currentLeverage = debtBalance > 0n && collateralEth > debtEth
    ? collateralEth / (collateralEth - debtEth) : 1;
  const debtInWsteth = exchangeRate > 0 ? BigInt(Math.floor(Number(debtBalance) / exchangeRate)) : 0n;
  const unwindEquity = collateralBalance > debtInWsteth ? collateralBalance - debtInWsteth : 0n;

  // Net APY calculation for hero
  const stakingYield = reserveInfo?.stakingYield || 0;
  const supplyAPY = reserveInfo?.supplyAPY || 0;
  const borrowAPY = reserveInfo?.borrowAPY || 0;
  const lev = debtBalance > 0n ? currentLeverage : 2.0;
  const netAPY = (stakingYield + supplyAPY) * lev - borrowAPY * (lev - 1);

  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-grid-pattern flex items-center justify-center relative overflow-hidden">
        <div className="aurora-bg" />
        <div className="ambient-orb-1" />
        <div className="ambient-orb-2" />
        <div className="ambient-orb-3" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative z-10 flex flex-col items-center gap-6"
        >
          <div className="volt-logo w-16 h-16">
            <VoltIcon />
          </div>
          <div className="text-center">
            <h1 className="text-5xl font-black gradient-text tracking-tight">VOLT</h1>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-[0.3em] mt-1.5 font-mono">
              Flash Leverage Protocol
            </p>
          </div>
          <PageLoader label="Connecting to Morpho Blue" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid-pattern overflow-x-hidden">
      {/* Aurora + Ambient background */}
      <div className="aurora-bg" />
      <div className="ambient-orb-1" />
      <div className="ambient-orb-2" />
      <div className="ambient-orb-3" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          borderColor: 'var(--border)',
          background: 'rgba(3, 7, 17, 0.8)',
          backdropFilter: 'blur(24px) saturate(1.5)',
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
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

          {/* Center — Live stats */}
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

      {/* Glow separator under header */}
      <div className="glow-line" />

      {/* ── Main Content ───────────────────────────────────────── */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 relative z-10">

        {/* ── Hero Metrics Row ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
        >
          {/* Net APY */}
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,255,209,0.1)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-primary)' }}>
                  <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M17 6h6v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">
                Est. Net APY
              </p>
            </div>
            {isMarketLoading ? (
              <div className="skeleton h-8 w-24 rounded-lg" />
            ) : (
              <motion.p
                key={netAPY.toFixed(2)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-black font-mono gradient-text"
              >
                {netAPY.toFixed(2)}%
              </motion.p>
            )}
            <p className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
              at {lev.toFixed(1)}x leverage
            </p>
          </div>

          {/* Exchange Rate */}
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,194,255,0.1)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-info)' }}>
                  <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">
                wstETH Rate
              </p>
            </div>
            {isMarketLoading ? (
              <div className="skeleton h-8 w-24 rounded-lg" />
            ) : (
              <motion.p
                key={exchangeRate.toFixed(4)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-black font-mono"
                style={{ color: 'var(--accent-info)' }}
              >
                {exchangeRate.toFixed(4)}
              </motion.p>
            )}
            <p className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
              ETH per wstETH
            </p>
          </div>

          {/* Wallet Balance */}
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.1)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-purple)' }}>
                  <path d="M21 12V7H5a2 2 0 010-4h14v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 5v14a2 2 0 002 2h16v-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18 12a1 1 0 100 4h4v-4h-4z" stroke="currentColor" strokeWidth="2.5"/>
                </svg>
              </div>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">
                Wallet Balance
              </p>
            </div>
            {isPositionLoading || !mounted ? (
              <div className="skeleton h-8 w-24 rounded-lg" />
            ) : isConnected ? (
              <motion.p
                key={walletBalance.toString()}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-black font-mono"
                style={{ color: 'var(--text-primary)' }}
              >
                {walletBalance > 0n ? Number(formatEther(walletBalance)).toFixed(4) : '0.0000'}
              </motion.p>
            ) : (
              <p className="text-2xl font-black font-mono" style={{ color: 'var(--text-muted)' }}>--</p>
            )}
            <p className="text-[9px] font-mono mt-1 gradient-text">wstETH</p>
          </div>

          {/* Active Position */}
          <div className="metric-card" style={debtBalance > 0n ? { borderColor: 'rgba(0,255,209,0.15)' } : {}}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: debtBalance > 0n ? 'rgba(0,255,209,0.1)' : 'rgba(255,255,255,0.04)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: debtBalance > 0n ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">
                Position
              </p>
            </div>
            {isPositionLoading || !mounted ? (
              <div className="skeleton h-8 w-24 rounded-lg" />
            ) : debtBalance > 0n ? (
              <motion.p
                key={currentLeverage.toFixed(1)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-black font-mono gradient-text"
              >
                {currentLeverage.toFixed(1)}x
              </motion.p>
            ) : (
              <p className="text-2xl font-black font-mono" style={{ color: 'var(--text-muted)' }}>None</p>
            )}
            <p className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
              {debtBalance > 0n ? 'Active' : 'No open position'}
            </p>
          </div>
        </motion.div>

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
              maxLeverage={reserveInfo?.maxLeverage || 18.18}
              hasPosition={debtBalance > 0n}
            />

            {/* Analytics section label */}
            <div className="section-label">
              <span>Analytics</span>
            </div>

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
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
            >
              {(['leverage', 'unwind'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="relative flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-xl transition-all duration-200"
                  style={{
                    color: activeTab === tab ? '#030711' : 'var(--text-muted)',
                    fontFamily: 'var(--font-geist-mono)',
                  }}
                >
                  {activeTab === tab && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: tab === 'leverage'
                          ? 'linear-gradient(135deg, #00FFD1 0%, #00C2FF 100%)'
                          : 'linear-gradient(135deg, #FF3366 0%, #FF5555 100%)',
                        boxShadow: tab === 'leverage'
                          ? '0 4px 20px rgba(0,255,209,0.3)'
                          : '0 4px 20px rgba(255,51,102,0.3)',
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
                    isConnected={isConnected}
                    executing={unwindExecuting}
                    txStatus={unwindTxStatus}
                    isError={unwindIsError}
                    onRequestClose={() => setShowUnwindModal(true)}
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
      <footer className="mt-12 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="glow-line" />
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-3">
              <div className="volt-logo w-6 h-6 rounded-lg!">
                <VoltIcon />
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>VOLT Protocol</span>
            </div>
            <span style={{ color: 'var(--text-muted)' }} className="text-[10px]">Use at your own risk</span>
          </div>
        </div>
      </footer>

      {/* Unwind confirmation modal — rendered at page root */}
      <UnwindConfirmModal
        open={showUnwindModal}
        onClose={() => setShowUnwindModal(false)}
        onConfirm={handleUnwindConfirm}
        collateralBalance={collateralBalance}
        debtBalance={debtBalance}
        equity={unwindEquity}
        currentLeverage={currentLeverage}
      />
    </div>
  );
}
