'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import LeveragePanel from '@/components/LeveragePanel';
import UnwindPanel from '@/components/UnwindPanel';
import UnwindConfirmModal from '@/components/UnwindConfirmModal';
import SwapModal from '@/components/SwapModal';
import PositionDashboard from '@/components/PositionDashboard';
import YieldBreakdown from '@/components/YieldBreakdown';
import DepegChart from '@/components/DepegChart';
import YieldLeverageChart from '@/components/YieldLeverageChart';
import { PageLoader } from '@/components/Loader';
import { WalletConnect } from '@/components/WalletConnect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StatusBadge, { healthFactorStatus, healthFactorLabel } from '@/components/ui/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { getOracleForCollateral } from '@/lib/oracleMap';
import { getOracleDataByAddress } from '@/lib/oracleDataCache';
import type { ReserveInfo } from '@/lib/types';

interface MarketInfo {
  uniqueKey: string;
  pair: string;
  collateralSymbol: string;
  collateralAddress: string;
  loanSymbol: string;
  loanAddress: string;
  lltv: number;
  supplyApy: number;
  borrowApy: number;
  utilization: number;
  supplyAssets: string;
  borrowAssets: string;
  supplyAssetsUsd: number | null;
  oracleType: string | null;
  oracleAddress?: string | null;
  chainId?: number;
  chainSlug?: string;
}

const CHAIN_BADGE: Record<string, { name: string; color: string }> = {
  ethereum: { name: 'Ethereum', color: '#627EEA' },
  base: { name: 'Base', color: '#0052FF' },
  arbitrum: { name: 'Arbitrum', color: '#28A0F0' },
  polygon: { name: 'Polygon', color: '#8247E5' },
};

type ChartTab = 'yield' | 'oracle';

export default function MarketPage() {
  const params = useParams();
  const marketId = params.marketId as string;

  const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [collateralYield, setCollateralYield] = useState<number>(0);
  const [marketExchangeRate, setMarketExchangeRate] = useState<number | null>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [copiedOracle, setCopiedOracle] = useState(false);
  const [chartTab, setChartTab] = useState<ChartTab>('yield');

  const {
    isConnected,
    mounted,
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
    currentLeverage,
    unwindEquity,
    netAPY,
    lev,
    setActiveTab,
    refreshData,
    showUnwindModal,
    setShowUnwindModal,
    unwindExecuting,
    unwindTxStatus,
    unwindIsError,
    handleUnwindConfirm,
  } = useDashboardData(marketId);

  const fetchMarketInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/markets?id=${marketId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.market) setMarketInfo(data.market);
    } catch { /* silent */ }
    setMarketLoading(false);
  }, [marketId]);

  const fetchCollateralYield = useCallback(async (symbol: string) => {
    try {
      const res = await fetch('/api/yields', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.yields?.[symbol]) setCollateralYield(data.yields[symbol]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchMarketInfo(); }, [fetchMarketInfo]);
  useEffect(() => {
    if (marketInfo?.collateralSymbol) fetchCollateralYield(marketInfo.collateralSymbol);
  }, [marketInfo?.collateralSymbol, fetchCollateralYield]);

  const maxLev = marketInfo ? 1 / (1 - marketInfo.lltv) : reserveInfo?.maxLeverage || 18;
  const tvlEth = marketInfo ? Number(BigInt(marketInfo.supplyAssets)) / 1e18 : 0;

  const SUPPORTED_MARKET_ID = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba';
  const isLeverageSupported = marketId === SUPPORTED_MARKET_ID;

  const marketReserveInfo: ReserveInfo | null = marketInfo ? {
    ltv: marketInfo.lltv * 100,
    liquidationThreshold: marketInfo.lltv * 100,
    maxLeverage: maxLev,
    supplyAPY: marketInfo.supplyApy * 100,
    borrowAPY: marketInfo.borrowApy * 100,
    stakingYield: collateralYield,
  } : reserveInfo;

  useEffect(() => {
    const symbol = marketInfo?.collateralSymbol;
    const chain = marketInfo?.chainSlug;
    if (!symbol) return;
    const oracle = getOracleForCollateral(symbol, chain);
    if (!oracle) return;
    getOracleDataByAddress(oracle.address, false, oracle.chainSlug).then(result => {
      if (result?.points?.length > 0) {
        setMarketExchangeRate(result.points[result.points.length - 1].rate);
      }
    }).catch(() => {});
  }, [marketInfo?.collateralSymbol, marketInfo?.chainSlug]);

  const mStaking = marketReserveInfo?.stakingYield || 0;
  const mSupply = marketReserveInfo?.supplyAPY || 0;
  const mBorrow = marketReserveInfo?.borrowAPY || 0;
  const mLev = debtBalance > 0n ? currentLeverage : 2.0;
  const marketNetAPY = (mStaking + mSupply) * mLev - mBorrow * (mLev - 1);
  const displayExchangeRate = marketExchangeRate ?? (exchangeRate > 1.0 ? exchangeRate : null);

  const hasPosition = debtBalance > 0n;

  if (isInitialLoad) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <PageLoader label="Loading market data" />
      </div>
    );
  }

  return (
    <>
      {/* ── Breadcrumb ── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 mb-4"
        style={{ fontSize: 'var(--text-caption)' }}
      >
        <Link
          href="/markets"
          className="font-sans transition-colors hover:text-[var(--accent-primary)]"
          style={{ color: 'var(--text-muted)' }}
        >
          Markets
        </Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="font-sans font-bold" style={{ color: 'var(--text-primary)' }}>
          {marketInfo?.pair || 'Loading...'}
        </span>
      </motion.nav>

      {/* ── Market Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        {marketInfo && !marketLoading && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(10, 15, 31, 0.7)', border: '1px solid var(--border)' }}
          >
            <div className="h-px" style={{ background: 'var(--grad-card-top)' }} />

            <div className="p-5">
              {/* Row 1: Market name + Net APY hero number */}
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-black gradient-text" style={{ fontSize: 'var(--text-h1)' }}>{marketInfo.pair}</h2>
                    {marketInfo.chainSlug && CHAIN_BADGE[marketInfo.chainSlug] && (
                      <span
                        className="font-mono font-bold px-2 py-0.5 rounded-md"
                        style={{
                          fontSize: 'var(--text-micro)',
                          background: `${CHAIN_BADGE[marketInfo.chainSlug].color}15`,
                          color: CHAIN_BADGE[marketInfo.chainSlug].color,
                          border: `1px solid ${CHAIN_BADGE[marketInfo.chainSlug].color}30`,
                        }}
                      >
                        {CHAIN_BADGE[marketInfo.chainSlug].name}
                      </span>
                    )}
                    {hasPosition && (
                      <StatusBadge
                        status={healthFactorStatus(healthFactor)}
                        label={healthFactorLabel(healthFactor)}
                        size="sm"
                      />
                    )}
                  </div>
                  <p className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                    {marketId.slice(0, 10)}...{marketId.slice(-8)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-sans uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                    Est. Net APY at {mLev.toFixed(1)}x
                  </p>
                  {isMarketLoading && marketLoading ? (
                    <div className="skeleton h-9 w-28 rounded-lg ml-auto" />
                  ) : (
                    <p className="font-black font-mono gradient-text leading-none" style={{ fontSize: 'var(--text-h1)' }}>
                      {marketNetAPY.toFixed(2)}%
                    </p>
                  )}
                </div>
              </div>

              {/* Row 2: Compact inline stats */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono" style={{ fontSize: 'var(--text-caption)' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  LLTV <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{(marketInfo.lltv * 100).toFixed(1)}%</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Max Lev <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>{maxLev.toFixed(1)}x</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  TVL <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{tvlEth >= 1000 ? `${(tvlEth / 1000).toFixed(1)}K` : tvlEth.toFixed(1)} ETH</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Supply <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>+{(marketInfo.supplyApy * 100).toFixed(2)}%</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Borrow <span className="font-bold" style={{ color: 'var(--accent-warning)' }}>-{(marketInfo.borrowApy * 100).toFixed(2)}%</span>
                </span>
                {collateralYield > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Coll Yield <span className="font-bold" style={{ color: 'var(--accent-info)' }}>{collateralYield.toFixed(2)}%</span>
                  </span>
                )}
                <span className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  Util.
                  <span className="font-bold" style={{
                    color: marketInfo.utilization > 0.9 ? 'var(--accent-secondary)' : marketInfo.utilization > 0.7 ? 'var(--accent-warning)' : 'var(--accent-primary)',
                  }}>
                    {(marketInfo.utilization * 100).toFixed(1)}%
                  </span>
                  <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(marketInfo.utilization * 100, 100)}%`,
                        background: marketInfo.utilization > 0.9 ? 'var(--accent-secondary)' : marketInfo.utilization > 0.7 ? 'var(--accent-warning)' : 'var(--accent-primary)',
                      }}
                    />
                  </div>
                </span>
              </div>

              {/* Row 3: Wallet + Position (only when connected) */}
              {mounted && isConnected && (
                <div className="flex flex-wrap items-center gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-purple)' }}>
                      <path d="M21 12V7H5a2 2 0 010-4h14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 5v14a2 2 0 002 2h16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Wallet</span>
                    <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                      {walletBalance > 0n ? Number(formatEther(walletBalance)).toFixed(4) : '0.0000'}
                    </span>
                    <span className="font-mono gradient-text" style={{ fontSize: 'var(--text-micro)' }}>{marketInfo.collateralSymbol}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: hasPosition ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Position</span>
                    {hasPosition ? (
                      <span className="font-mono font-bold gradient-text" style={{ fontSize: 'var(--text-body)' }}>{currentLeverage.toFixed(1)}x</span>
                    ) : (
                      <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>None</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-info)' }}>
                      <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>{marketInfo.collateralSymbol} Rate</span>
                    <span className="font-mono font-bold" style={{ color: 'var(--accent-info)', fontSize: 'var(--text-body)' }}>{displayExchangeRate !== null ? displayExchangeRate.toFixed(4) : '...'}</span>
                  </div>
                  {marketInfo.oracleAddress && (
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#A78BFA' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Oracle</span>
                      <span className="font-mono font-bold" style={{ color: '#A78BFA', fontSize: 'var(--text-caption)' }}>
                        {marketInfo.oracleAddress.slice(0, 6)}...{marketInfo.oracleAddress.slice(-4)}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(marketInfo.oracleAddress!);
                          setCopiedOracle(true);
                          setTimeout(() => setCopiedOracle(false), 1500);
                        }}
                        className="p-1 rounded transition-all hover:bg-[rgba(255,255,255,0.06)]"
                        title="Copy oracle address"
                      >
                        {copiedOracle ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setShowSwapModal(true)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans font-bold uppercase tracking-wider transition-all hover:opacity-80"
                    style={{
                      fontSize: 'var(--text-micro)',
                      background: 'rgba(0,255,209,0.08)',
                      border: '1px solid rgba(0,255,209,0.2)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
                      <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                    </svg>
                    Get {marketInfo.collateralSymbol}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* ── 2-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left column — 3/5 (60%) */}
        <motion.div
          className="lg:col-span-3 space-y-5 order-2 lg:order-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <PositionDashboard
            collateralBalance={collateralBalance}
            debtBalance={debtBalance}
            healthFactor={healthFactor}
            reserveInfo={marketReserveInfo}
            exchangeRate={displayExchangeRate ?? 1.0}
            isLoading={isPositionLoading}
          />

          {/* ── Tabbed Charts ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="section-label" style={{ marginBottom: 0 }}>
                <span>Analytics</span>
              </div>
              <SegmentedControl
                options={[
                  { label: 'Yield Curve', value: 'yield' as ChartTab },
                  { label: 'Oracle Rate', value: 'oracle' as ChartTab },
                ]}
                value={chartTab}
                onChange={setChartTab}
                size="sm"
              />
            </div>

            <AnimatePresence mode="wait">
              {chartTab === 'yield' ? (
                <motion.div
                  key="yield"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <YieldLeverageChart
                    reserveInfo={marketReserveInfo}
                    leverage={hasPosition ? currentLeverage : 2.0}
                    maxLeverage={maxLev}
                    hasPosition={hasPosition}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="oracle"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <DepegChart
                    reserveInfo={marketReserveInfo}
                    collateralSymbol={marketInfo?.collateralSymbol || 'wstETH'}
                    chainSlug={marketInfo?.chainSlug}
                    oracleAddress={marketInfo?.oracleAddress}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Right column — 2/5 (40%) — sticky */}
        <motion.div
          className="lg:col-span-2 space-y-5 order-1 lg:order-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="lg:sticky lg:top-[80px]">
            <div className="space-y-5">
              {/* Connect wallet CTA */}
              {!isConnected && mounted && (
                <div
                  className="glass-inner p-5 text-center"
                  style={{ background: 'rgba(0,255,209,0.03)', border: '1px solid rgba(0,255,209,0.12)' }}
                >
                  <div
                    className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: 'rgba(0,255,209,0.08)' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-primary)' }}>
                      <path d="M21 12V7H5a2 2 0 010-4h14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 5v14a2 2 0 002 2h16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M18 12a1 1 0 100 4h4v-4h-4z" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <p className="font-sans font-bold" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>Connect Wallet</p>
                  <p className="font-sans mt-1 mb-3" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                    to view your position and open leverage
                  </p>
                  <div className="flex justify-center">
                    <WalletConnect />
                  </div>
                </div>
              )}

              {isLeverageSupported ? (
                <>
                  {/* Tab switcher */}
                  <div
                    className="flex p-1 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
                  >
                    {(['leverage', 'unwind'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className="relative flex-1 py-3 font-bold uppercase tracking-widest rounded-xl transition-all duration-200"
                        style={{
                          fontSize: 'var(--text-caption)',
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
                          reserveInfo={marketReserveInfo}
                          exchangeRate={displayExchangeRate ?? 1.0}
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
                          exchangeRate={displayExchangeRate ?? 1.0}
                          isConnected={isConnected}
                          executing={unwindExecuting}
                          txStatus={unwindTxStatus}
                          isError={unwindIsError}
                          onRequestClose={() => setShowUnwindModal(true)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="card-glow p-6 text-center">
                  <div
                    className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-purple)' }}>
                      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="font-black gradient-text mb-2" style={{ fontSize: 'var(--text-h2)' }}>Leverage Coming Soon</h3>
                  <p className="font-sans leading-relaxed" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
                    Flash leverage for {marketInfo?.pair || 'this market'} is under development. Currently available for wstETH/WETH.
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                      onClick={() => setShowSwapModal(true)}
                      className="px-4 py-2 rounded-xl font-sans font-bold uppercase tracking-wider transition-all hover:opacity-80"
                      style={{ fontSize: 'var(--text-micro)', background: 'rgba(0,255,209,0.08)', border: '1px solid rgba(0,255,209,0.2)', color: 'var(--accent-primary)' }}
                    >
                      Get {marketInfo?.collateralSymbol}
                    </button>
                    <span
                      className="px-4 py-2 rounded-xl font-sans font-bold uppercase tracking-wider"
                      style={{ fontSize: 'var(--text-micro)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    >
                      Analytics Below
                    </span>
                  </div>
                </div>
              )}

              <YieldBreakdown
                reserveInfo={marketReserveInfo}
                leverage={hasPosition ? currentLeverage : 2.0}
                exchangeRate={displayExchangeRate ?? 1.0}
                isLoading={marketLoading}
                collateralSymbol={marketInfo?.collateralSymbol || 'wstETH'}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Unwind confirmation modal */}
      <UnwindConfirmModal
        open={showUnwindModal}
        onClose={() => setShowUnwindModal(false)}
        onConfirm={handleUnwindConfirm}
        collateralBalance={collateralBalance}
        debtBalance={debtBalance}
        equity={unwindEquity}
        currentLeverage={currentLeverage}
      />

      {/* Swap modal */}
      {marketInfo && (
        <SwapModal
          open={showSwapModal}
          onClose={() => setShowSwapModal(false)}
          collateralSymbol={marketInfo.collateralSymbol}
          collateralAddress={marketInfo.collateralAddress}
          loanSymbol={marketInfo.loanSymbol}
          loanAddress={marketInfo.loanAddress}
          onSuccess={() => refreshData()}
        />
      )}
    </>
  );
}
