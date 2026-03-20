'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther, getAddress } from 'viem';
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
import { buildMarketParams } from '@/lib/leverageContract';
import type { MarketConfig } from '@/lib/leverageContract';
import type { ReserveInfo } from '@/lib/types';

interface SupplyingVault {
  address: string;
  symbol: string;
  name: string;
}

interface VaultAllocation {
  address: string;
  name: string;
  symbol: string;
  image: string | null;
  curatorName: string | null;
  curatorImage: string | null;
  supplyAssets: string;
  supplyAssetsUsd: number;
}

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
  irmAddress?: string | null;
  oraclePrice?: number | null;
  lltvRaw?: string;
  chainId?: number;
  chainSlug?: string;
  supplyingVaults?: SupplyingVault[];
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function checksumAddr(addr: string): string {
  try { return getAddress(addr); } catch { return addr; }
}

interface CuratorGroup {
  curatorKey: string;
  label: string;
  image: string | null;
  totalUsd: number;
  vaults: VaultAllocation[];
}

function groupByCurator(vaults: VaultAllocation[]): CuratorGroup[] {
  const groups = new Map<string, CuratorGroup>();
  for (const v of vaults) {
    // Use the actual curator name from the API, fall back to vault name
    const key = (v.curatorName || v.name).toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.vaults.push(v);
      existing.totalUsd += v.supplyAssetsUsd;
    } else {
      groups.set(key, {
        curatorKey: key,
        label: v.curatorName || v.name,
        image: v.curatorImage || v.image,
        totalUsd: v.supplyAssetsUsd,
        vaults: [v],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.totalUsd - a.totalUsd);
}

function CuratorIcon({ group, chain }: { group: CuratorGroup; chain: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <a
        href={`https://app.morpho.org/${chain}/vault/${group.vaults[0]?.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: hovered ? '2px solid var(--accent-primary)' : '2px solid var(--border)',
        }}
      >
        {group.image ? (
          <img
            src={group.image}
            alt={group.label}
            className="w-6 h-6 rounded-full object-cover"
          />
        ) : (
          <span className="font-mono font-bold" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {group.label.charAt(0).toUpperCase()}
          </span>
        )}
      </a>

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[200px]"
          style={{ pointerEvents: 'auto' }}
        >
          <div
            className="rounded-xl p-3 shadow-xl"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Curator header */}
            <div className="flex items-center gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
              {group.image && (
                <img src={group.image} alt={group.label} className="w-5 h-5 rounded-full object-cover" />
              )}
              <span className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: '12px' }}>
                {group.label}
              </span>
            </div>

            {/* Individual vault allocations */}
            <div className="space-y-1.5">
              {group.vaults.map((v) => (
                <a
                  key={v.address}
                  href={`https://app.morpho.org/${chain}/vault/${v.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 py-1 px-1 rounded-lg transition-all hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-1.5">
                    {v.image && (
                      <img src={v.image} alt="" className="w-4 h-4 rounded-full object-cover" />
                    )}
                    <span className="font-sans whitespace-nowrap" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                      {v.name}
                    </span>
                  </div>
                  <span className="font-mono font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)', fontSize: '11px' }}>
                    {formatUsd(v.supplyAssetsUsd)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
  const chain = params.chain as string;
  const marketId = params.marketId as string;

  const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [collateralYield, setCollateralYield] = useState<number>(0);
  const [marketExchangeRate, setMarketExchangeRate] = useState<number | null>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [copiedOracle, setCopiedOracle] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedIrm, setCopiedIrm] = useState(false);
  const [copiedCollateral, setCopiedCollateral] = useState(false);
  const [copiedLoan, setCopiedLoan] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [chartTab, setChartTab] = useState<ChartTab>('yield');
  const [vaultAllocations, setVaultAllocations] = useState<VaultAllocation[]>([]);

  // Build dynamic MarketConfig from API data
  const marketConfig: MarketConfig | null = useMemo(() => {
    if (!marketInfo?.oracleAddress || !marketInfo?.irmAddress || !marketInfo?.lltvRaw) return null;
    return {
      marketId,
      marketParams: buildMarketParams({
        loanAddress: marketInfo.loanAddress,
        collateralAddress: marketInfo.collateralAddress,
        oracleAddress: marketInfo.oracleAddress,
        irmAddress: marketInfo.irmAddress,
        lltvRaw: marketInfo.lltvRaw,
      }),
      chainId: marketInfo.chainId || 8453,
    };
  }, [marketId, marketInfo]);

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
  } = useDashboardData(marketId, marketConfig);

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

  // Fetch per-market vault allocations
  useEffect(() => {
    if (!marketId) return;
    fetch(`/api/market-vaults/${marketId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data.vaults) setVaultAllocations(data.vaults); })
      .catch(() => {});
  }, [marketId]);

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
    getOracleDataByAddress(oracle.address, true, oracle.chainSlug).then(result => {
      const latest = result?.points?.[result.points.length - 1];
      console.log('[oracle] fetched:', result.points.length, 'points, latest rate:', latest?.rate, 'ts:', latest?.timestamp);
      if (result?.points?.length > 0 && latest) {
        setMarketExchangeRate(latest.rate);
      }
    }).catch((err) => { console.warn('[oracle] fetch failed:', err); });
  }, [marketInfo?.collateralSymbol, marketInfo?.chainSlug]);

  const mStaking = marketReserveInfo?.stakingYield || 0;
  const mSupply = marketReserveInfo?.supplyAPY || 0;
  const mBorrow = marketReserveInfo?.borrowAPY || 0;
  const mLev = debtBalance > 0n ? currentLeverage : 2.0;
  const marketNetAPY = (mStaking + mSupply) * mLev - mBorrow * (mLev - 1);
  const displayExchangeRate = marketExchangeRate ?? marketInfo?.oraclePrice ?? (exchangeRate > 1.0 ? exchangeRate : null);

  // Resolve the aggregator address (Chainlink feed) from ORACLE_MAP — this is what the chart uses
  const mappedOracle = useMemo(() =>
    marketInfo ? getOracleForCollateral(marketInfo.collateralSymbol, marketInfo.chainSlug) : null,
    [marketInfo?.collateralSymbol, marketInfo?.chainSlug]
  );

  const hasPosition = debtBalance > 0n;

  if (isInitialLoad) {
    return (
      <div className="space-y-5 animate-pulse">
        {/* Skeleton header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-48 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-6 w-14 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-4 w-28 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
              <div className="h-4 w-20 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          </div>
          <div className="h-10 w-32 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>

        {/* Skeleton metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="h-3 w-24 rounded mb-3" style={{ background: 'rgba(255,255,255,0.04)' }} />
              <div className="h-7 w-28 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 w-20 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
            </div>
          ))}
        </div>

        {/* Skeleton market attributes */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="h-3.5 w-20 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="h-3.5 w-16 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>
              ))}
            </div>
            <div style={{ borderLeft: '1px solid var(--border)' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4" style={{ borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div className="h-3.5 w-20 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="h-3.5 w-24 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center justify-center pt-4">
          <div className="flex items-center gap-3">
            <div className="loader-bars"><span /><span /><span /><span /></div>
            <span className="loading-text">Loading market data</span>
          </div>
        </div>
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
        <Link
          href={`/markets?chain=${chain}`}
          className="font-sans font-medium transition-colors hover:opacity-80"
          style={{ color: CHAIN_BADGE[chain]?.color || 'var(--text-secondary)' }}
        >
          {CHAIN_BADGE[chain]?.name || chain}
        </Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="font-sans font-bold" style={{ color: 'var(--text-primary)' }}>
          {marketInfo?.pair || 'Loading...'}
        </span>
      </motion.nav>

      {/* ── Market Header ── */}
      {marketInfo && !marketLoading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 space-y-5"
        >
          {/* ── Header Row ── */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="font-black" style={{ fontSize: '2rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {marketInfo.pair}
                </h1>
                <span
                  className="font-mono font-bold px-2.5 py-1 rounded-lg"
                  style={{
                    fontSize: 'var(--text-micro)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {(marketInfo.lltv * 100).toFixed(1)}%
                </span>
                {hasPosition && (
                  <StatusBadge
                    status={healthFactorStatus(healthFactor)}
                    label={healthFactorLabel(healthFactor)}
                    size="sm"
                  />
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono flex items-center gap-1.5" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
                  {marketId.slice(0, 6)}...{marketId.slice(-4)}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(marketId);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 1500);
                    }}
                    className="p-1 rounded-md transition-all hover:bg-white/[0.06]"
                    title="Copy market ID"
                  >
                    {copiedId ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                </span>
                {marketInfo.chainSlug && CHAIN_BADGE[marketInfo.chainSlug] && (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ background: CHAIN_BADGE[marketInfo.chainSlug].color }}
                    />
                    <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>
                      {CHAIN_BADGE[marketInfo.chainSlug].name}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowSwapModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-sans font-bold transition-all hover:opacity-80"
              style={{
                fontSize: 'var(--text-caption)',
                background: 'var(--accent-primary)',
                color: '#030711',
              }}
            >
              Get {marketInfo.collateralSymbol}
            </button>
          </div>

          {/* ── 4 Metric Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Market Size */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <p className="font-sans mb-2" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                Total Market Size
              </p>
              <p className="font-black font-mono" style={{ fontSize: '1.5rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {marketInfo.supplyAssetsUsd != null ? formatUsd(marketInfo.supplyAssetsUsd) : `${tvlEth >= 1000 ? `${(tvlEth / 1000).toFixed(0)}K` : tvlEth.toFixed(0)} ETH`}
              </p>
              <p className="font-mono mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                {tvlEth >= 1000 ? `${(tvlEth / 1000).toFixed(0)}K` : tvlEth.toFixed(1)} {marketInfo.loanSymbol}
              </p>
            </div>

            {/* Total Liquidity */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <p className="font-sans mb-2" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                Total Liquidity
              </p>
              {(() => {
                const supplyBig = BigInt(marketInfo.supplyAssets);
                const borrowBig = BigInt(marketInfo.borrowAssets);
                const liqEth = Number(supplyBig - borrowBig) / 1e18;
                const liqUsd = marketInfo.supplyAssetsUsd != null
                  ? marketInfo.supplyAssetsUsd * (1 - marketInfo.utilization)
                  : null;
                return (
                  <>
                    <p className="font-black font-mono" style={{ fontSize: '1.5rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                      {liqUsd != null ? formatUsd(liqUsd) : `${liqEth >= 1000 ? `${(liqEth / 1000).toFixed(1)}K` : liqEth.toFixed(1)} ETH`}
                    </p>
                    <p className="font-mono mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                      {liqEth >= 1000 ? `${(liqEth / 1000).toFixed(1)}K` : liqEth.toFixed(1)} {marketInfo.loanSymbol}
                    </p>
                  </>
                );
              })()}
            </div>

            {/* Rate */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <p className="font-sans mb-2" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                Rate
              </p>
              <p className="font-black font-mono" style={{ fontSize: '1.5rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {(marketInfo.borrowApy * 100).toFixed(2)}%
              </p>
              <p className="font-mono mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                Borrow APY
              </p>
            </div>

            {/* Trusted By */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <p className="font-sans mb-2" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                Trusted By
              </p>
              {vaultAllocations.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {groupByCurator(vaultAllocations).map((group) => (
                    <CuratorIcon key={group.curatorKey} group={group} chain={chain} />
                  ))}
                </div>
              ) : (
                <p className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>—</p>
              )}
            </div>
          </div>

          {/* ── Market Attributes ── */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Left column */}
              <div>
                <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Collateral</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>{marketInfo.collateralSymbol}</span>
                    {collateralYield > 0 && (
                      <span className="font-mono px-1.5 py-0.5 rounded" style={{ fontSize: 'var(--text-micro)', background: 'rgba(0,255,209,0.08)', color: 'var(--accent-primary)' }}>
                        {collateralYield.toFixed(2)}%
                      </span>
                    )}
                    <span className="font-mono flex items-center gap-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                      {checksumAddr(marketInfo.collateralAddress).slice(0, 6)}...{checksumAddr(marketInfo.collateralAddress).slice(-4)}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(checksumAddr(marketInfo.collateralAddress));
                          setCopiedCollateral(true);
                          setTimeout(() => setCopiedCollateral(false), 1500);
                        }}
                        className="p-0.5 rounded transition-all hover:bg-white/[0.06]"
                        title="Copy collateral address"
                      >
                        {copiedCollateral ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                        )}
                      </button>
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Loan</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>{marketInfo.loanSymbol}</span>
                    <span className="font-mono flex items-center gap-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                      {checksumAddr(marketInfo.loanAddress).slice(0, 6)}...{checksumAddr(marketInfo.loanAddress).slice(-4)}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(checksumAddr(marketInfo.loanAddress));
                          setCopiedLoan(true);
                          setTimeout(() => setCopiedLoan(false), 1500);
                        }}
                        className="p-0.5 rounded transition-all hover:bg-white/[0.06]"
                        title="Copy loan address"
                      >
                        {copiedLoan ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                        )}
                      </button>
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Liquidation LTV</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>{(marketInfo.lltv * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 md:border-b-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Max Leverage</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-caption)' }}>{maxLev.toFixed(1)}x</span>
                </div>
              </div>
              {/* Right column */}
              <div style={{ borderLeft: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Oracle price</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>
                    {marketInfo.collateralSymbol} / {marketInfo.loanSymbol} = {displayExchangeRate !== null ? displayExchangeRate.toFixed(4) : '...'}
                  </span>
                </div>
                {mappedOracle && (
                  <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Oracle Feed</span>
                    <span className="font-mono flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>
                      {checksumAddr(mappedOracle.address).slice(0, 6)}...{checksumAddr(mappedOracle.address).slice(-4)}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(checksumAddr(mappedOracle.address));
                          setCopiedFeed(true);
                          setTimeout(() => setCopiedFeed(false), 1500);
                        }}
                        className="p-0.5 rounded transition-all hover:bg-white/[0.06]"
                        title="Copy oracle feed address"
                      >
                        {copiedFeed ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                        )}
                      </button>
                    </span>
                  </div>
                )}
                {marketInfo.oracleAddress && (
                  <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Morpho Oracle</span>
                    <span className="font-mono flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>
                      {checksumAddr(marketInfo.oracleAddress).slice(0, 6)}...{checksumAddr(marketInfo.oracleAddress).slice(-4)}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(checksumAddr(marketInfo.oracleAddress!));
                          setCopiedOracle(true);
                          setTimeout(() => setCopiedOracle(false), 1500);
                        }}
                        className="p-0.5 rounded transition-all hover:bg-white/[0.06]"
                        title="Copy Morpho oracle address"
                      >
                        {copiedOracle ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                        )}
                      </button>
                    </span>
                  </div>
                )}
                {marketInfo.irmAddress && (
                  <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>IRM</span>
                    <span className="font-mono flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>
                      {checksumAddr(marketInfo.irmAddress).slice(0, 6)}...{checksumAddr(marketInfo.irmAddress).slice(-4)}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(checksumAddr(marketInfo.irmAddress!));
                          setCopiedIrm(true);
                          setTimeout(() => setCopiedIrm(false), 1500);
                        }}
                        className="p-0.5 rounded transition-all hover:bg-white/[0.06]"
                        title="Copy IRM address"
                      >
                        {copiedIrm ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                        )}
                      </button>
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>Utilization</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold" style={{
                      color: marketInfo.utilization > 0.9 ? 'var(--accent-secondary)' : marketInfo.utilization > 0.7 ? 'var(--accent-warning)' : 'var(--text-primary)',
                      fontSize: 'var(--text-caption)',
                    }}>
                      {(marketInfo.utilization * 100).toFixed(2)}%
                    </span>
                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(marketInfo.utilization * 100, 100)}%`,
                          background: marketInfo.utilization > 0.9 ? 'var(--accent-secondary)' : marketInfo.utilization > 0.7 ? 'var(--accent-warning)' : 'var(--accent-primary)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

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
                  style={{ background: 'rgba(41,115,255,0.03)', border: '1px solid rgba(41,115,255,0.12)' }}
                >
                  <div
                    className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: 'rgba(41,115,255,0.08)' }}
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
                                ? '#2973ff'
                                : '#ef4444',
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
                          marketConfig={marketConfig}
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
                  <h3 className="font-black mb-2" style={{ fontSize: 'var(--text-h2)', color: 'var(--accent-primary)' }}>Leverage Coming Soon</h3>
                  <p className="font-sans leading-relaxed" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
                    Flash leverage for {marketInfo?.pair || 'this market'} is under development. Currently available for wstETH/WETH.
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                      onClick={() => setShowSwapModal(true)}
                      className="px-4 py-2 rounded-xl font-sans font-bold uppercase tracking-wider transition-all hover:opacity-80"
                      style={{ fontSize: 'var(--text-micro)', background: 'rgba(41,115,255,0.08)', border: '1px solid rgba(41,115,255,0.2)', color: 'var(--accent-primary)' }}
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
