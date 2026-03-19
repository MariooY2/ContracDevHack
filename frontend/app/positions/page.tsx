'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import Link from 'next/link';
import Image from 'next/image';
import { useMultiMarketPositions } from '@/hooks/useMultiMarketPositions';
import { WalletConnect } from '@/components/WalletConnect';
import type { UserPosition } from '@/lib/types';

// Token icons (same as MarketsTable)
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

function TokenIcon({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const icon = TOKEN_ICONS[symbol];
  if (icon) {
    return (
      <Image
        src={icon}
        alt={symbol}
        width={size}
        height={size}
        className="rounded-full"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-[8px] font-bold font-mono"
      style={{ width: size, height: size, background: 'rgba(99,102,241,0.15)', color: '#6366F1' }}
    >
      {symbol.slice(0, 3)}
    </div>
  );
}

function hfColor(hf: number): string {
  return hf > 1.5 ? '#2973ff' : hf > 1.1 ? '#F59E0B' : '#ef4444';
}

function hfLabel(hf: number): string {
  return hf > 1.5 ? 'SAFE' : hf > 1.1 ? 'CAUTION' : 'DANGER';
}

interface MarketInput {
  uniqueKey: string;
  pair: string;
  collateralSymbol: string;
  loanSymbol: string;
  lltv: number;
  supplyApy: number;
  borrowApy: number;
  chainSlug?: string;
}

export default function PositionsPage() {
  const { isConnected } = useAccount();
  const [markets, setMarkets] = useState<MarketInput[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);

  // Fetch all markets from API
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/markets', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setMarkets(data.markets || []);
      } catch {
        // silent
      } finally {
        setMarketsLoading(false);
      }
    }
    load();
  }, []);

  const { positions, loading: positionsLoading } = useMultiMarketPositions(markets);
  const loading = marketsLoading || positionsLoading;

  // Aggregate stats
  const stats = useMemo(() => {
    if (positions.length === 0) return null;
    const totalCollateral = positions.reduce((s, p) => s + Number(formatEther(p.collateral)), 0);
    const totalDebt = positions.reduce((s, p) => s + Number(formatEther(p.debt)), 0);
    const avgHf = positions.reduce((s, p) => s + p.healthFactor, 0) / positions.length;
    return { count: positions.length, totalCollateral, totalDebt, avgHf };
  }, [positions]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-black tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>Your Positions</h1>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          Active leveraged positions across all Morpho Blue markets
        </p>
      </motion.div>

      {/* Not connected state */}
      {!isConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card-glow p-12 text-center"
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21 12V7H5a2 2 0 010-4h14v4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 5v14a2 2 0 002 2h16v-5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18 12a1 1 0 100 4h4v-4h-4z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-secondary)] font-medium mb-2">Connect your wallet</p>
          <p className="text-xs text-[var(--text-muted)] mb-5">to view your leveraged positions</p>
          <WalletConnect />
        </motion.div>
      )}

      {/* Loading state */}
      {isConnected && loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-glow p-5">
              <div className="flex items-center gap-4">
                <div className="skeleton w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-32 rounded-lg" />
                  <div className="skeleton h-3 w-48 rounded" />
                </div>
                <div className="skeleton h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isConnected && !loading && positions.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card-glow p-12 text-center"
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-sm text-[var(--text-secondary)] font-medium mb-2">No active positions</p>
          <p className="text-xs text-[var(--text-muted)] mb-5">Browse markets to open a leveraged position</p>
          <Link href="/markets" className="btn-primary inline-flex items-center gap-2 px-6">
            Browse Markets
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </motion.div>
      )}

      {/* Active positions */}
      {isConnected && !loading && positions.length > 0 && (
        <>
          {/* Summary bar */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
            >
              <div className="glass-inner p-3 text-center">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold mb-1">Positions</p>
                <p className="text-lg font-black font-mono" style={{ color: 'var(--accent-primary)' }}>{stats.count}</p>
              </div>
              <div className="glass-inner p-3 text-center">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold mb-1">Collateral</p>
                <p className="text-lg font-black font-mono" style={{ color: 'var(--text-primary)' }}>{stats.totalCollateral.toFixed(4)}</p>
              </div>
              <div className="glass-inner p-3 text-center">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold mb-1">Total Debt</p>
                <p className="text-lg font-black font-mono" style={{ color: 'var(--accent-warning)' }}>{stats.totalDebt.toFixed(4)}</p>
              </div>
              <div className="glass-inner p-3 text-center">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold mb-1">Avg Health</p>
                <p className="text-lg font-black font-mono" style={{ color: hfColor(stats.avgHf) }}>{stats.avgHf.toFixed(2)}</p>
              </div>
            </motion.div>
          )}

          {/* Position cards */}
          <div className="space-y-3">
            <AnimatePresence>
              {positions.map((pos, i) => (
                <PositionCard key={pos.marketId} position={pos} index={i} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

function PositionCard({ position: pos, index }: { position: UserPosition; index: number }) {
  const collateral = Number(formatEther(pos.collateral));
  const debt = Number(formatEther(pos.debt));
  const color = hfColor(pos.healthFactor);
  const label = hfLabel(pos.healthFactor);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link href={`/markets/${pos.chainSlug || 'base'}/${pos.marketId}`}>
        <div
          className="card-glow p-5 cursor-pointer transition-all duration-200 group"
          style={{ border: '1px solid var(--border)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(41,115,255,0.2)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div className="flex items-center gap-4">
            {/* Token icons */}
            <div className="flex items-center -space-x-2 shrink-0">
              <TokenIcon symbol={pos.collateralSymbol} />
              <TokenIcon symbol={pos.loanSymbol} size={22} />
            </div>

            {/* Market pair + stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {pos.pair}
                </h3>
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                  style={{ background: `${color}15`, border: `1px solid ${color}30` }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-[9px] font-bold font-mono tracking-wider" style={{ color }}>
                    {label}
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  Collateral <span style={{ color: 'var(--accent-primary)' }}>{collateral.toFixed(4)} {pos.collateralSymbol}</span>
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  Debt <span style={{ color: 'var(--accent-warning)' }}>{debt.toFixed(4)} {pos.loanSymbol}</span>
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  Leverage <span style={{ color: 'var(--accent-info)' }}>{pos.leverage.toFixed(2)}x</span>
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  HF <span style={{ color }}>{pos.healthFactor.toFixed(2)}</span>
                </span>
              </div>
            </div>

            {/* Manage arrow */}
            <div className="shrink-0">
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                style={{
                  color: 'var(--accent-primary)',
                  background: 'rgba(41,115,255,0.06)',
                  border: '1px solid rgba(41,115,255,0.12)',
                }}
              >
                Manage
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
