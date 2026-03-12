'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

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
}

type SortKey = 'pair' | 'lltv' | 'tvl' | 'supplyApy' | 'borrowApy' | 'utilization';
type SortDir = 'asc' | 'desc';

const MIN_TVL_ETH = 10;

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

// Token logo URLs — local images in /public
const TOKEN_ICONS: Record<string, string> = {
  wstETH: '/wsteth.png',
  weETH: '/weeth.png',
  cbETH: '/cbeth.png',
  rETH: '/reth.png',
  wrsETH: '/wrseth.png',
  yoETH: '/yoeth.png',
  wsuperOETHb: '/wsuperoethb.png',
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
  // Fallback: colored abbreviation
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
}

export default function MarketsTable({ onStatsReady }: MarketsTableProps) {
  const router = useRouter();
  const [markets, setMarkets] = useState<MorphoMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('tvl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  // Filter out markets with < MIN_TVL_ETH
  const filtered = useMemo(() => {
    return markets.filter(m => getTvlEth(m.supplyAssets) >= MIN_TVL_ETH);
  }, [markets]);

  // Fetch per-token staking yields
  const [tokenYields, setTokenYields] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/api/yields')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.yields) setTokenYields(data.yields);
      })
      .catch(() => {});
  }, []);

  // Emit aggregate stats to parent (including top market for homepage)
  useEffect(() => {
    if (!onStatsReady || filtered.length === 0) return;
    const totalTvl = filtered.reduce((sum, m) => sum + getTvlEth(m.supplyAssets), 0);
    const avgSupplyApy = filtered.reduce((sum, m) => sum + m.supplyApy, 0) / filtered.length;
    const avgBorrowApy = filtered.reduce((sum, m) => sum + m.borrowApy, 0) / filtered.length;

    let topNetApy = 0;
    let bestMarket: (MorphoMarket & { netApy: number; leverage: number }) | null = null;
    const FEATURED_MARKET_ID = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba';
    let pinnedMarket: (MorphoMarket & { netApy: number; leverage: number }) | null = null;
    const FEATURED_LEV = 18;
    for (const m of filtered) {
      // tokenYields is in % (e.g. 2.39), supplyApy/borrowApy are decimals (e.g. 0.0283)
      // net = (supplyApy + collYield) * leverage - borrowApy * (leverage - 1)
      const collYieldDecimal = (tokenYields[m.collateralSymbol] || 2.5) / 100;
      const net = ((m.supplyApy + collYieldDecimal) * FEATURED_LEV - m.borrowApy * (FEATURED_LEV - 1)) * 100;
      if (net > topNetApy) {
        topNetApy = net;
        bestMarket = { ...m, netApy: net, leverage: FEATURED_LEV };
      }
      if (m.uniqueKey === FEATURED_MARKET_ID) {
        pinnedMarket = { ...m, netApy: net, leverage: FEATURED_LEV };
      }
    }
    // Use pinned market if available, otherwise fall back to best market
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
        case 'supplyApy': cmp = a.supplyApy - b.supplyApy; break;
        case 'borrowApy': cmp = a.borrowApy - b.borrowApy; break;
        case 'utilization': cmp = a.utilization - b.utilization; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="opacity-20 ml-1 text-[8px]">&#8597;</span>;
    return <span className="ml-1" style={{ color: 'var(--accent-primary)' }}>{sortDir === 'desc' ? '▾' : '▴'}</span>;
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

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

  const headerClass = "text-[9px] uppercase tracking-[0.12em] font-bold cursor-pointer select-none transition-colors hover:text-[var(--accent-primary)]";

  return (
    <div>
      {/* Table Header Bar */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="live-dot" />
            <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>LIVE</span>
          </div>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {displayed.length} of {filtered.length} markets
          </span>
        </div>
        <div className="flex items-center gap-2">
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
              placeholder="Filter markets..."
              className="bg-transparent text-[10px] font-mono outline-none w-24 sm:w-32"
              style={{ color: 'var(--text-primary)' }}
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-30"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
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
          <p className="text-xs font-mono mb-3" style={{ color: 'var(--accent-secondary)' }}>{error}</p>
          <button onClick={() => fetchMarkets(true)} className="text-xs font-mono underline" style={{ color: 'var(--accent-info)' }}>Retry</button>
        </div>
      ) : (
        <>
          {/* Column Headers */}
          <div
            className="grid gap-3 px-5 py-3 mb-2 font-mono rounded-xl"
            style={{
              gridTemplateColumns: '2.2fr 0.7fr 1fr 0.8fr 1fr 1fr 1fr 0.3fr',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div className={headerClass} onClick={() => handleSort('pair')}>
              Market <SortIcon col="pair" />
            </div>
            <div className={`${headerClass} text-right`} onClick={() => handleSort('lltv')}>
              LLTV <SortIcon col="lltv" />
            </div>
            <div className={`${headerClass} text-right`} onClick={() => handleSort('tvl')}>
              TVL <SortIcon col="tvl" />
            </div>
            <div className="text-[9px] uppercase tracking-[0.12em] font-bold text-right select-none" style={{ color: 'var(--text-muted)' }}>
              Coll Yield
            </div>
            <div className={`${headerClass} text-right`} onClick={() => handleSort('supplyApy')}>
              Supply APR <SortIcon col="supplyApy" />
            </div>
            <div className={`${headerClass} text-right`} onClick={() => handleSort('borrowApy')}>
              Borrow APR <SortIcon col="borrowApy" />
            </div>
            <div className={`${headerClass} text-right`} onClick={() => handleSort('utilization')}>
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

                return (
                  <motion.div
                    key={market.uniqueKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    onClick={() => router.push(`/markets/${market.uniqueKey}`)}
                    className="group cursor-pointer"
                  >
                    <div
                      className="grid gap-3 px-5 py-4 rounded-2xl transition-all duration-300 relative overflow-hidden"
                      style={{
                        gridTemplateColumns: '2.2fr 0.7fr 1fr 0.8fr 1fr 1fr 1fr 0.3fr',
                        background: 'rgba(10, 15, 31, 0.6)',
                        border: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget;
                        el.style.borderColor = `${color}30`;
                        el.style.background = 'rgba(10, 15, 31, 0.9)';
                        el.style.boxShadow = `0 4px 32px ${color}08, 0 0 0 1px ${color}15`;
                        el.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget;
                        el.style.borderColor = 'var(--border)';
                        el.style.background = 'rgba(10, 15, 31, 0.6)';
                        el.style.boxShadow = 'none';
                        el.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Gradient top edge on hover */}
                      <div
                        className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }}
                      />

                      {/* Market pair */}
                      <div className="flex items-center gap-3">
                        <div className="relative flex items-center shrink-0">
                          <div className="rounded-full ring-2 ring-transparent group-hover:ring-[rgba(255,255,255,0.08)] transition-all duration-300">
                            <TokenIcon symbol={market.collateralSymbol} size={36} />
                          </div>
                          <div className="-ml-3 border-2 rounded-full" style={{ borderColor: 'rgba(10, 15, 31, 0.9)' }}>
                            <TokenIcon symbol={market.loanSymbol} size={24} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                              {market.collateralSymbol}
                              <span className="font-normal" style={{ color: 'var(--text-muted)' }}> / {market.loanSymbol}</span>
                            </span>
                            <span
                              className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0"
                              style={{ background: `${color}12`, color: color, border: `1px solid ${color}25` }}
                            >
                              {maxLev.toFixed(0)}x
                            </span>
                          </div>
                          <span className="text-[9px] font-mono block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {market.uniqueKey.slice(0, 6)}...{market.uniqueKey.slice(-4)}
                          </span>
                        </div>
                      </div>

                      {/* LLTV */}
                      <div className="flex items-center justify-end">
                        <span
                          className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg"
                          style={{
                            background: market.lltv >= 0.94 ? 'rgba(0,255,209,0.06)' : 'rgba(245,158,11,0.06)',
                            color: market.lltv >= 0.94 ? 'var(--accent-primary)' : 'var(--accent-warning)',
                            border: `1px solid ${market.lltv >= 0.94 ? 'rgba(0,255,209,0.15)' : 'rgba(245,158,11,0.15)'}`,
                          }}
                        >
                          {(market.lltv * 100).toFixed(1)}%
                        </span>
                      </div>

                      {/* TVL */}
                      <div className="flex flex-col items-end justify-center">
                        <span className="text-[13px] font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                          {formatTvl(tvlEth)}
                        </span>
                        <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          ETH
                        </span>
                      </div>

                      {/* Collateral Yield */}
                      <div className="flex items-center justify-end">
                        {tokenYields[market.collateralSymbol] ? (
                          <span className="text-[13px] font-mono font-bold" style={{ color: '#A78BFA' }}>
                            {tokenYields[market.collateralSymbol].toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>--</span>
                        )}
                      </div>

                      {/* Supply APR */}
                      <div className="flex items-center justify-end">
                        <span className="text-[13px] font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>
                          {formatApy(market.supplyApy)}%
                        </span>
                      </div>

                      {/* Borrow APR */}
                      <div className="flex items-center justify-end">
                        <span className="text-[13px] font-mono font-bold" style={{ color: 'var(--accent-warning)' }}>
                          {formatApy(market.borrowApy)}%
                        </span>
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
                        <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                          {(market.utilization * 100).toFixed(1)}%
                        </span>
                      </div>

                      {/* Arrow */}
                      <div className="flex items-center justify-end">
                        <svg
                          width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className="opacity-0 group-hover:opacity-60 transition-all duration-300 group-hover:translate-x-1"
                          style={{ color }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Hidden markets notice */}
          {markets.length > filtered.length && (
            <p className="text-center text-[10px] font-mono mt-4" style={{ color: 'var(--text-muted)' }}>
              {markets.length - filtered.length} markets with {'<'}{MIN_TVL_ETH} ETH TVL hidden
            </p>
          )}
        </>
      )}
    </div>
  );
}
