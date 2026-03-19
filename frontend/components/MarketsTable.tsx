'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import SegmentedControl from './ui/SegmentedControl';

interface MorphoMarket {
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
  oracleAddress: string | null;
  oracleType: string | null;
  chainId: number;
  chainSlug: string;
}

const CHAIN_FILTERS = [
  { slug: 'all', name: 'All Chains', color: 'var(--accent-primary)' },
  { slug: 'ethereum', name: 'Ethereum', color: '#627EEA' },
  { slug: 'base', name: 'Base', color: '#0052FF' },
  { slug: 'arbitrum', name: 'Arbitrum', color: '#28A0F0' },
  { slug: 'polygon', name: 'Polygon', color: '#8247E5' },
];

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  base: '#0052FF',
  arbitrum: '#28A0F0',
  polygon: '#8247E5',
};

const CHAIN_SHORT: Record<string, string> = {
  ethereum: 'ETH',
  base: 'BASE',
  arbitrum: 'ARB',
  polygon: 'POL',
};

type SortKey = 'pair' | 'lltv' | 'tvl' | 'netApy' | 'utilization';
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'card';
type LeveragePreset = '2' | '5' | '10' | 'max';

const MIN_TVL_ETH = 10;
const FEATURED_MARKET_ID = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba';

const TOKEN_COLORS: Record<string, string> = {
  wstETH: '#00A3FF',
  weETH: '#7C3AED',
  cbETH: '#0052FF',
  rETH: '#CC8833',
  wrsETH: '#FF6B35',
  yoETH: '#10B981',
  wsuperOETHb: '#EC4899',
  bsdETH: '#3B82F6',
  ezETH: '#14B8A6',
  mETH: '#F59E0B',
};

const TOKEN_ICONS: Record<string, string> = {
  wstETH: '/wsteth.png',
  weETH: '/weeth.png',
  cbETH: '/cbeth.png',
  rETH: '/reth.png',
  wrsETH: '/wrseth.png',
  yoETH: '/yoeth.png',
  wsuperOETHb: '/wsuperoethb.png',
  ezETH: '/ezeth.png',
  osETH: '/oseth.png',
  pufETH: '/pufeth.png',
  WETH: '/weth.png',
  ETH: '/weth.png',
};

function getTokenIcon(symbol: string): string | null {
  return TOKEN_ICONS[symbol] || null;
}

function getTokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol] || '#6366F1';
}

function TokenIcon({ symbol, size = 36, className = '' }: { symbol: string; size?: number; className?: string }) {
  const icon = getTokenIcon(symbol);
  const color = getTokenColor(symbol);
  if (icon) {
    return (
      <Image
        src={icon}
        alt={symbol}
        width={size}
        height={size}
        className={`rounded-full ${className}`}
        unoptimized
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full text-[10px] font-black ${className}`}
      style={{
        width: size, height: size,
        background: `${color}15`,
        border: `1.5px solid ${color}40`,
        color,
      }}
    >
      {symbol.replace(/^w/, '').slice(0, 2).toUpperCase()}
    </div>
  );
}

function getTvlEth(supplyAssets: string): number {
  return Number(BigInt(supplyAssets)) / 1e18;
}

function formatTvl(eth: number): string {
  if (eth >= 1000) return `${(eth / 1000).toFixed(1)}K`;
  return eth.toFixed(1);
}

function formatApy(apy: number): string {
  return (apy * 100).toFixed(2);
}

function getNetApy(market: MorphoMarket, leverage: number, tokenYields: Record<string, number>): number {
  const collYieldDecimal = (tokenYields[market.collateralSymbol] || 2.5) / 100;
  return ((market.supplyApy + collYieldDecimal) * leverage - market.borrowApy * (leverage - 1)) * 100;
}

export interface TopMarketInfo {
  pair: string;
  uniqueKey: string;
  netApy: number;
  leverage: number;
  lltv: number;
  tvlEth: number;
  collYield: number;
}

export interface AggStats {
  totalTvl: number;
  marketCount: number;
  avgSupplyApy: number;
  topNetApy: number;
  avgBorrowApy: number;
  topMarket: TopMarketInfo | null;
}

export interface MarketsTableProps {
  onStatsReady?: (stats: AggStats) => void;
  defaultChain?: string;
}

export default function MarketsTable({ onStatsReady, defaultChain }: MarketsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialChain = defaultChain || searchParams.get('chain') || 'all';
  const [markets, setMarkets] = useState<MorphoMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('netApy');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [chainFilter, setChainFilterState] = useState(initialChain);

  const setChainFilter = useCallback((slug: string) => {
    setChainFilterState(slug);
    // Update URL param without navigation
    const params = new URLSearchParams(window.location.search);
    if (slug === 'all') {
      params.delete('chain');
    } else {
      params.set('chain', slug);
    }
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [router]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [leveragePreset, setLeveragePreset] = useState<LeveragePreset>('5');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const fetchMarkets = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const url = force ? '/api/markets?refresh=1' : '/api/markets';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const { markets: data } = await res.json();
      setMarkets(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

  useEffect(() => {
    const interval = setInterval(() => fetchMarkets(), 60000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  const filtered = useMemo(() => {
    return markets.filter(m => {
      if (getTvlEth(m.supplyAssets) < MIN_TVL_ETH) return false;
      if (chainFilter !== 'all' && m.chainSlug !== chainFilter) return false;
      return true;
    });
  }, [markets, chainFilter]);

  const [tokenYields, setTokenYields] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/api/yields')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.yields) setTokenYields(data.yields);
      })
      .catch(() => {});
  }, []);

  // Resolve leverage number from preset
  const getLeverage = useCallback((market: MorphoMarket): number => {
    const maxLev = 1 / (1 - market.lltv);
    if (leveragePreset === 'max') return maxLev;
    const preset = Number(leveragePreset);
    return Math.min(preset, maxLev);
  }, [leveragePreset]);

  // Emit aggregate stats to parent
  useEffect(() => {
    if (!onStatsReady) return;
    if (filtered.length === 0) {
      onStatsReady({ totalTvl: 0, marketCount: 0, avgSupplyApy: 0, topNetApy: 0, avgBorrowApy: 0, topMarket: null });
      return;
    }
    const totalTvl = filtered.reduce((sum, m) => sum + getTvlEth(m.supplyAssets), 0);
    const avgSupplyApy = filtered.reduce((sum, m) => sum + m.supplyApy, 0) / filtered.length;
    const avgBorrowApy = filtered.reduce((sum, m) => sum + m.borrowApy, 0) / filtered.length;

    let topNetApy = 0;
    let bestMarket: (MorphoMarket & { netApy: number; leverage: number }) | null = null;
    let pinnedMarket: (MorphoMarket & { netApy: number; leverage: number }) | null = null;
    for (const m of filtered) {
      const maxLev = 1 / (1 - m.lltv);
      const collYieldDecimal = (tokenYields[m.collateralSymbol] || 2.5) / 100;
      const net = ((m.supplyApy + collYieldDecimal) * maxLev - m.borrowApy * (maxLev - 1)) * 100;
      if (net > topNetApy) {
        topNetApy = net;
        bestMarket = { ...m, netApy: net, leverage: maxLev };
      }
      if (m.uniqueKey === FEATURED_MARKET_ID) {
        pinnedMarket = { ...m, netApy: net, leverage: maxLev };
      }
    }
    const featuredMarket = pinnedMarket || bestMarket;

    onStatsReady({
      totalTvl, marketCount: filtered.length, avgSupplyApy, topNetApy, avgBorrowApy,
      topMarket: featuredMarket ? {
        pair: featuredMarket.pair,
        uniqueKey: featuredMarket.uniqueKey,
        netApy: featuredMarket.netApy,
        leverage: featuredMarket.leverage,
        lltv: featuredMarket.lltv,
        tvlEth: getTvlEth(featuredMarket.supplyAssets),
        collYield: tokenYields[featuredMarket.collateralSymbol] || 0,
      } : null,
    });
  }, [filtered, onStatsReady, tokenYields]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'pair': cmp = a.pair.localeCompare(b.pair); break;
        case 'lltv': cmp = a.lltv - b.lltv; break;
        case 'tvl': cmp = Number(BigInt(a.supplyAssets) - BigInt(b.supplyAssets)); break;
        case 'netApy': cmp = getNetApy(a, getLeverage(a), tokenYields) - getNetApy(b, getLeverage(b), tokenYields); break;
        case 'utilization': cmp = a.utilization - b.utilization; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, sortKey, sortDir, getLeverage, tokenYields]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="opacity-20 ml-1 text-[8px]">&#8597;</span>;
    return <span className="ml-1" style={{ color: 'var(--accent-primary)' }}>{sortDir === 'desc' ? '▾' : '▴'}</span>;
  };

  const copyAddress = (addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  };

  const displayed = useMemo(() => {
    if (!searchTerm.trim()) return sorted;
    const term = searchTerm.toLowerCase();
    return sorted.filter(m =>
      m.collateralSymbol.toLowerCase().includes(term) ||
      m.pair.toLowerCase().includes(term) ||
      m.loanSymbol.toLowerCase().includes(term)
    );
  }, [sorted, searchTerm]);

  // Auto switch to card view on mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    if (mq.matches) setViewMode('card');
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setViewMode('card'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const headerClass = "font-sans uppercase tracking-[0.12em] font-bold cursor-pointer select-none transition-colors hover:text-[var(--accent-primary)]";

  return (
    <div>
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        {/* Left: Chain Filters — navigate via URL */}
        <div className="flex items-center gap-2 flex-wrap">
          {CHAIN_FILTERS.map(cf => {
            const isActive = chainFilter === cf.slug;
            const count = cf.slug === 'all'
              ? markets.filter(m => getTvlEth(m.supplyAssets) >= MIN_TVL_ETH).length
              : markets.filter(m => getTvlEth(m.supplyAssets) >= MIN_TVL_ETH && m.chainSlug === cf.slug).length;
            return (
              <button
                key={cf.slug}
                onClick={() => setChainFilter(cf.slug)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans font-bold transition-all"
                style={{
                  fontSize: 'var(--text-micro)',
                  background: isActive ? `${cf.color}15` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? `${cf.color}40` : 'var(--border)'}`,
                  color: isActive ? cf.color : 'var(--text-muted)',
                }}
              >
                {cf.slug !== 'all' && (
                  <div className="w-2 h-2 rounded-full" style={{ background: cf.color }} />
                )}
                {cf.name}
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Right: View toggle + Leverage selector */}
        <div className="flex items-center gap-3">
          <SegmentedControl
            options={[
              { label: '⊞', value: 'table' as ViewMode },
              { label: '⊟', value: 'card' as ViewMode },
            ]}
            value={viewMode}
            onChange={setViewMode}
            size="sm"
          />
        </div>
      </div>

      {/* Leverage Selector + Header Bar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="live-dot" />
            <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-micro)' }}>LIVE</span>
          </div>
          <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
            {displayed.length} of {filtered.length} markets
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              Net APY at
            </span>
            <SegmentedControl
              options={[
                { label: '2x', value: '2' as LeveragePreset },
                { label: '5x', value: '5' as LeveragePreset },
                { label: '10x', value: '10' as LeveragePreset },
                { label: 'Max', value: 'max' as LeveragePreset },
              ]}
              value={leveragePreset}
              onChange={setLeveragePreset}
              size="sm"
            />
          </div>
          {/* Search */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filter..."
              className="bg-transparent font-sans outline-none w-20 sm:w-28"
              style={{ color: 'var(--text-primary)', fontSize: 'var(--text-micro)' }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="opacity-40 hover:opacity-80">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); fetchMarkets(true); }}
            disabled={loading}
            title="Refresh markets"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans transition-all hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-30"
            style={{ fontSize: 'var(--text-micro)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={loading ? 'animate-spin' : ''}
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0115.36-6.36L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 01-15.36 6.36L3 16" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {loading && markets.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="card-glow p-8 text-center">
          <p className="font-sans mb-3" style={{ color: 'var(--accent-secondary)', fontSize: 'var(--text-caption)' }}>{error}</p>
          <button onClick={() => fetchMarkets(true)} className="font-sans underline" style={{ color: 'var(--accent-info)', fontSize: 'var(--text-caption)' }}>Retry</button>
        </div>
      ) : viewMode === 'table' ? (
        /* ═══════ TABLE VIEW ═══════ */
        <>
          {/* Column Headers */}
          <div
            className="grid gap-3 px-5 py-3 mb-2 rounded-xl"
            style={{
              gridTemplateColumns: '2.2fr 0.7fr 1fr 1.2fr 1.2fr 1fr 0.3fr',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div className={headerClass} style={{ fontSize: 'var(--text-micro)' }} onClick={() => handleSort('pair')}>
              Market <SortIcon col="pair" />
            </div>
            <div className={`${headerClass} text-right`} style={{ fontSize: 'var(--text-micro)' }} onClick={() => handleSort('lltv')}>
              LLTV <SortIcon col="lltv" />
            </div>
            <div className={`${headerClass} text-right`} style={{ fontSize: 'var(--text-micro)' }} onClick={() => handleSort('tvl')}>
              TVL <SortIcon col="tvl" />
            </div>
            <div className={`${headerClass} text-right`} style={{ fontSize: 'var(--text-micro)' }} onClick={() => handleSort('netApy')}>
              Net APY <SortIcon col="netApy" />
            </div>
            <div className="font-sans uppercase tracking-[0.12em] font-bold text-right select-none" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              Supply / Borrow
            </div>
            <div className={`${headerClass} text-right`} style={{ fontSize: 'var(--text-micro)' }} onClick={() => handleSort('utilization')}>
              Utilization <SortIcon col="utilization" />
            </div>
            <div />
          </div>

          {/* Market Rows */}
          <div className="space-y-2">
            <AnimatePresence>
              {displayed.map((market, i) => {
                const color = getTokenColor(market.collateralSymbol);
                const maxLev = 1 / (1 - market.lltv);
                const tvlEth = getTvlEth(market.supplyAssets);
                const leverage = getLeverage(market);
                const netApy = getNetApy(market, leverage, tokenYields);
                const isFeatured = market.uniqueKey === FEATURED_MARKET_ID;
                const isExpanded = expandedKey === market.uniqueKey;

                return (
                  <motion.div
                    key={market.uniqueKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.25 }}
                    className="group"
                  >
                    <div
                      className="cursor-pointer rounded-2xl transition-all duration-300 relative overflow-hidden"
                      style={{
                        background: isExpanded ? '#151516' : '#151516',
                        border: isFeatured ? '1px solid rgba(41,115,255,0.3)' : '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isFeatured) {
                          const el = e.currentTarget;
                          el.style.borderColor = `${color}30`;
                          el.style.background = '#151516';
                          el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                          el.style.transform = 'translateY(-1px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isFeatured) {
                          const el = e.currentTarget;
                          el.style.borderColor = 'var(--border)';
                          el.style.background = isExpanded ? '#151516' : '#151516';
                          el.style.boxShadow = 'none';
                          el.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      {/* Gradient top edge on hover */}
                      <div
                        className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }}
                      />

                      {/* Main Row */}
                      <div
                        className="grid gap-3 px-5 py-4 items-center"
                        style={{ gridTemplateColumns: '2.2fr 0.7fr 1fr 1.2fr 1.2fr 1fr 0.3fr' }}
                        onClick={() => setExpandedKey(isExpanded ? null : market.uniqueKey)}
                      >
                        {/* Market pair */}
                        <div className="flex items-center gap-3">
                          <div className="relative flex items-center shrink-0">
                            <div className="rounded-full ring-2 ring-transparent group-hover:ring-[rgba(255,255,255,0.08)] transition-all duration-300">
                              <TokenIcon symbol={market.collateralSymbol} size={36} />
                            </div>
                            <div className="-ml-3 border-2 rounded-full" style={{ borderColor: '#151516' }}>
                              <TokenIcon symbol={market.loanSymbol} size={24} />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold truncate" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                                {market.collateralSymbol}
                                <span className="font-normal" style={{ color: 'var(--text-muted)' }}> / {market.loanSymbol}</span>
                              </span>
                              <span
                                className="font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0"
                                style={{ fontSize: '8px', background: `${color}12`, color: color, border: `1px solid ${color}25` }}
                              >
                                {maxLev.toFixed(0)}x
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className="font-mono font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  fontSize: '8px',
                                  background: `${CHAIN_COLORS[market.chainSlug] || '#666'}12`,
                                  color: CHAIN_COLORS[market.chainSlug] || '#666',
                                  border: `1px solid ${CHAIN_COLORS[market.chainSlug] || '#666'}25`,
                                }}
                              >
                                {CHAIN_SHORT[market.chainSlug] || market.chainSlug?.toUpperCase()}
                              </span>
                              {isFeatured && (
                                <span
                                  className="font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{
                                    fontSize: '7px',
                                    background: 'rgba(41,115,255,0.1)',
                                    color: 'var(--accent-primary)',
                                    border: '1px solid rgba(41,115,255,0.2)',
                                  }}
                                >
                                  Live Leverage
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* LLTV */}
                        <div className="flex items-center justify-end">
                          <span
                            className="font-mono font-bold px-2 py-1 rounded-lg"
                            style={{
                              fontSize: 'var(--text-caption)',
                              background: market.lltv >= 0.94 ? 'rgba(41,115,255,0.06)' : 'rgba(245,158,11,0.06)',
                              color: market.lltv >= 0.94 ? 'var(--accent-primary)' : 'var(--accent-warning)',
                              border: `1px solid ${market.lltv >= 0.94 ? 'rgba(41,115,255,0.15)' : 'rgba(245,158,11,0.15)'}`,
                            }}
                          >
                            {(market.lltv * 100).toFixed(1)}%
                          </span>
                        </div>

                        {/* TVL */}
                        <div className="flex flex-col items-end justify-center">
                          <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                            {formatTvl(tvlEth)}
                          </span>
                          <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                            ETH
                          </span>
                        </div>

                        {/* Net APY */}
                        <div className="flex flex-col items-end justify-center">
                          <span
                            className="font-mono font-bold"
                            style={{
                              fontSize: 'var(--text-body)',
                              color: netApy >= 0 ? 'var(--color-success)' : 'var(--accent-secondary)',
                            }}
                          >
                            {netApy >= 0 ? '+' : ''}{netApy.toFixed(2)}%
                          </span>
                          <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                            at {leverage.toFixed(1)}x
                          </span>
                        </div>

                        {/* Supply / Borrow APR */}
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-caption)' }}>
                              {formatApy(market.supplyApy)}%
                            </span>
                            <span className="font-mono font-bold" style={{ color: 'var(--accent-warning)', fontSize: 'var(--text-caption)' }}>
                              {formatApy(market.borrowApy)}%
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-sans uppercase" style={{ color: 'var(--text-muted)', fontSize: '7px', letterSpacing: '0.05em' }}>SUP</span>
                            <span className="font-sans uppercase" style={{ color: 'var(--text-muted)', fontSize: '7px', letterSpacing: '0.05em' }}>BOR</span>
                          </div>
                        </div>

                        {/* Utilization */}
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div
                              className="absolute top-0 left-0 h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.min(market.utilization * 100, 100)}%`,
                                background: market.utilization > 0.9
                                  ? 'var(--accent-secondary)'
                                  : market.utilization > 0.7
                                    ? 'var(--accent-warning)'
                                    : 'var(--accent-primary)',
                              }}
                            />
                          </div>
                          <span className="font-mono font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>
                            {(market.utilization * 100).toFixed(1)}%
                          </span>
                        </div>

                        {/* Expand/Collapse Arrow */}
                        <div className="flex items-center justify-end">
                          <motion.svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className="opacity-30 group-hover:opacity-60 transition-opacity duration-300"
                            style={{ color }}
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <path d="M9 18l6-6-6-6" />
                          </motion.svg>
                        </div>
                      </div>

                      {/* Expanded Detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div
                              className="px-5 pb-5 pt-2"
                              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                            >
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                <div className="flex flex-col gap-1">
                                  <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    Collateral Yield
                                  </span>
                                  <span className="font-mono font-bold" style={{ color: '#2973ff', fontSize: 'var(--text-body)' }}>
                                    {tokenYields[market.collateralSymbol]
                                      ? `${tokenYields[market.collateralSymbol].toFixed(2)}%`
                                      : '--'}
                                  </span>
                                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    Staking reward
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    Supply APR
                                  </span>
                                  <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-body)' }}>
                                    {formatApy(market.supplyApy)}%
                                  </span>
                                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    Lending interest
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    Borrow APR
                                  </span>
                                  <span className="font-mono font-bold" style={{ color: 'var(--accent-warning)', fontSize: 'var(--text-body)' }}>
                                    {formatApy(market.borrowApy)}%
                                  </span>
                                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    Borrowing cost
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    Net APY at {leverage.toFixed(1)}x
                                  </span>
                                  <span
                                    className="font-mono font-bold"
                                    style={{
                                      fontSize: 'var(--text-body)',
                                      color: netApy >= 0 ? 'var(--color-success)' : 'var(--accent-secondary)',
                                    }}
                                  >
                                    {netApy >= 0 ? '+' : ''}{netApy.toFixed(2)}%
                                  </span>
                                  <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                                    (supply + yield) × lev − borrow × (lev − 1)
                                  </span>
                                </div>
                              </div>

                              {/* Open Market Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/markets/${market.chainSlug}/${market.uniqueKey}`);
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-sans font-bold transition-all hover:brightness-110"
                                style={{
                                  fontSize: 'var(--text-caption)',
                                  background: `linear-gradient(135deg, ${color}20, ${color}08)`,
                                  border: `1px solid ${color}30`,
                                  color,
                                }}
                              >
                                Open Market
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Hidden markets notice */}
          {markets.length > filtered.length && (
            <p className="text-center font-sans mt-4" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              {markets.length - filtered.length} markets with {'<'}{MIN_TVL_ETH} ETH TVL hidden
            </p>
          )}
        </>
      ) : (
        /* ═══════ CARD VIEW ═══════ */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {displayed.map((market, i) => {
                const color = getTokenColor(market.collateralSymbol);
                const maxLev = 1 / (1 - market.lltv);
                const tvlEth = getTvlEth(market.supplyAssets);
                const leverage = getLeverage(market);
                const netApy = getNetApy(market, leverage, tokenYields);
                const isFeatured = market.uniqueKey === FEATURED_MARKET_ID;

                return (
                  <motion.div
                    key={market.uniqueKey}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    onClick={() => router.push(`/markets/${market.chainSlug}/${market.uniqueKey}`)}
                    className="group cursor-pointer rounded-2xl p-5 transition-all duration-300 relative overflow-hidden"
                    style={{
                      background: '#151516',
                      border: isFeatured ? '1px solid rgba(41,115,255,0.3)' : '1px solid var(--border)',
                    }}
                    whileHover={{ y: -2, scale: 1.01 }}
                  >
                    {/* Top edge glow */}
                    <div
                      className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }}
                    />

                    {/* Header: Icons + Pair */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="relative flex items-center shrink-0">
                        <TokenIcon symbol={market.collateralSymbol} size={40} />
                        <div className="-ml-3 border-2 rounded-full" style={{ borderColor: '#151516' }}>
                          <TokenIcon symbol={market.loanSymbol} size={28} />
                        </div>
                      </div>
                      <div>
                        <span className="font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                          {market.collateralSymbol}
                          <span className="font-normal" style={{ color: 'var(--text-muted)' }}> / {market.loanSymbol}</span>
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className="font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{
                              fontSize: '8px',
                              background: `${CHAIN_COLORS[market.chainSlug] || '#666'}12`,
                              color: CHAIN_COLORS[market.chainSlug] || '#666',
                              border: `1px solid ${CHAIN_COLORS[market.chainSlug] || '#666'}25`,
                            }}
                          >
                            {CHAIN_SHORT[market.chainSlug] || market.chainSlug?.toUpperCase()}
                          </span>
                          <span
                            className="font-mono font-bold px-1.5 py-0.5 rounded-md"
                            style={{ fontSize: '8px', background: `${color}12`, color: color, border: `1px solid ${color}25` }}
                          >
                            {maxLev.toFixed(0)}x max
                          </span>
                          {isFeatured && (
                            <span
                              className="font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{
                                fontSize: '7px',
                                background: 'rgba(41,115,255,0.1)',
                                color: 'var(--accent-primary)',
                                border: '1px solid rgba(41,115,255,0.2)',
                              }}
                            >
                              Live
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Net APY — prominent */}
                    <div className="mb-4">
                      <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                        Net APY at {leverage.toFixed(1)}x
                      </span>
                      <div
                        className="font-mono font-bold mt-1"
                        style={{
                          fontSize: 'var(--text-h2)',
                          color: netApy >= 0 ? 'var(--color-success)' : 'var(--accent-secondary)',
                        }}
                      >
                        {netApy >= 0 ? '+' : ''}{netApy.toFixed(2)}%
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>TVL</span>
                        <div className="font-mono font-bold mt-0.5" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>
                          {formatTvl(tvlEth)} <span style={{ color: 'var(--text-muted)' }}>ETH</span>
                        </div>
                      </div>
                      <div>
                        <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>LLTV</span>
                        <div className="font-mono font-bold mt-0.5" style={{ color: market.lltv >= 0.94 ? 'var(--accent-primary)' : 'var(--accent-warning)', fontSize: 'var(--text-caption)' }}>
                          {(market.lltv * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>Util</span>
                        <div className="font-mono font-bold mt-0.5" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>
                          {(market.utilization * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Utilization bar */}
                    <div className="w-full h-1 rounded-full overflow-hidden mt-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(market.utilization * 100, 100)}%`,
                          background: market.utilization > 0.9
                            ? 'var(--accent-secondary)'
                            : market.utilization > 0.7
                              ? 'var(--accent-warning)'
                              : 'var(--accent-primary)',
                        }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {markets.length > filtered.length && (
            <p className="text-center font-sans mt-4" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              {markets.length - filtered.length} markets with {'<'}{MIN_TVL_ETH} ETH TVL hidden
            </p>
          )}
        </>
      )}
    </div>
  );
}
