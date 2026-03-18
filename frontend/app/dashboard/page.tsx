'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
import Link from 'next/link';
import Image from 'next/image';
import { useMultiMarketPositions } from '@/hooks/useMultiMarketPositions';
import { WalletConnect } from '@/components/WalletConnect';
import StatusBadge, { healthFactorStatus, healthFactorLabel } from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import type { UserPosition } from '@/lib/types';

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
        unoptimized
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold font-mono"
      style={{ width: size, height: size, background: 'rgba(99,102,241,0.15)', color: '#6366F1', fontSize: '8px' }}
    >
      {symbol.slice(0, 3)}
    </div>
  );
}

interface MarketInput {
  uniqueKey: string;
  pair: string;
  collateralSymbol: string;
  loanSymbol: string;
  lltv: number;
  supplyApy: number;
  borrowApy: number;
}

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const [markets, setMarkets] = useState<MarketInput[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [tokenYields, setTokenYields] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/markets', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setMarkets(data.markets || []);
      } catch { /* silent */ }
      finally { setMarketsLoading(false); }
    }
    load();
  }, []);

  useEffect(() => {
    fetch('/api/yields')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.yields) setTokenYields(data.yields); })
      .catch(() => {});
  }, []);

  const { positions, loading: positionsLoading } = useMultiMarketPositions(markets);
  const loading = marketsLoading || positionsLoading;

  const stats = useMemo(() => {
    if (positions.length === 0) return null;
    const totalCollateral = positions.reduce((s, p) => s + Number(formatEther(p.collateral)), 0);
    const totalDebt = positions.reduce((s, p) => s + Number(formatEther(p.debt)), 0);
    const totalEquity = totalCollateral - totalDebt;
    const weightedHf = positions.reduce((s, p) => s + p.healthFactor, 0) / positions.length;

    // Weighted net APY
    let weightedNetApy = 0;
    for (const pos of positions) {
      const market = markets.find(m => m.uniqueKey === pos.marketId);
      if (!market) continue;
      const collYield = (tokenYields[market.collateralSymbol] || 2.5) / 100;
      const net = ((market.supplyApy + collYield) * pos.leverage - market.borrowApy * (pos.leverage - 1)) * 100;
      weightedNetApy += net;
    }
    weightedNetApy = positions.length > 0 ? weightedNetApy / positions.length : 0;

    return { count: positions.length, totalCollateral, totalDebt, totalEquity, weightedHf, weightedNetApy };
  }, [positions, markets, tokenYields]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="font-black gradient-text tracking-tight mb-1" style={{ fontSize: 'var(--text-h1)' }}>Dashboard</h1>
        <p className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-body)' }}>
          Your portfolio overview across all Morpho Blue markets
        </p>
      </motion.div>

      {/* Not connected */}
      {!isConnected && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-glow p-12 text-center">
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M21 12V7H5a2 2 0 010-4h14v4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 5v14a2 2 0 002 2h16v-5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18 12a1 1 0 100 4h4v-4h-4z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="Connect your wallet"
            subtitle="View your leveraged positions and portfolio stats"
            action={<WalletConnect />}
          />
        </motion.div>
      )}

      {/* Loading */}
      {isConnected && loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-inner p-4 space-y-2">
                <div className="skeleton h-3 w-16 rounded" />
                <div className="skeleton h-7 w-24 rounded-lg" />
              </div>
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {isConnected && !loading && positions.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            title="No active positions"
            subtitle="Browse markets to open a leveraged position"
            action={
              <Link href="/markets" className="btn-primary inline-flex items-center gap-2 px-6">
                Browse Markets
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            }
          />
        </motion.div>
      )}

      {/* Active positions */}
      {isConnected && !loading && positions.length > 0 && (
        <>
          {/* Portfolio summary hero */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"
            >
              {[
                { label: 'Positions', value: stats.count.toString(), color: 'var(--accent-primary)' },
                { label: 'Total Collateral', value: `${stats.totalCollateral.toFixed(4)}`, sub: 'ETH', color: 'var(--text-primary)' },
                { label: 'Total Debt', value: `${stats.totalDebt.toFixed(4)}`, sub: 'WETH', color: 'var(--accent-warning)' },
                { label: 'Net Equity', value: `${stats.totalEquity.toFixed(4)}`, sub: 'ETH', color: 'var(--color-success)' },
                { label: 'Avg Health', value: stats.weightedHf.toFixed(2), color: stats.weightedHf > 1.5 ? '#00FFD1' : stats.weightedHf > 1.1 ? '#F59E0B' : '#FF3366' },
              ].map((item) => (
                <div key={item.label} className="glass-inner p-3">
                  <p className="font-sans uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
                    {item.label}
                  </p>
                  <p className="font-mono font-black" style={{ color: item.color, fontSize: 'var(--text-h2)' }}>
                    {item.value}
                  </p>
                  {'sub' in item && item.sub && (
                    <p className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>{item.sub}</p>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {/* Position cards */}
          <div className="space-y-3">
            <AnimatePresence>
              {positions.map((pos, i) => {
                const collateral = Number(formatEther(pos.collateral));
                const debt = Number(formatEther(pos.debt));
                const market = markets.find(m => m.uniqueKey === pos.marketId);
                const collYield = market ? (tokenYields[market.collateralSymbol] || 2.5) / 100 : 0.025;
                const netApy = market
                  ? ((market.supplyApy + collYield) * pos.leverage - market.borrowApy * (pos.leverage - 1)) * 100
                  : 0;

                return (
                  <motion.div
                    key={pos.marketId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                  >
                    <Link href={`/markets/${pos.marketId}`}>
                      <div
                        className="rounded-2xl p-5 cursor-pointer transition-all duration-200 group relative overflow-hidden"
                        style={{ background: 'rgba(10, 15, 31, 0.6)', border: '1px solid var(--border)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(0,255,209,0.2)';
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
                            <TokenIcon symbol={pos.collateralSymbol} size={36} />
                            <div className="border-2 rounded-full" style={{ borderColor: 'rgba(10, 15, 31, 0.9)' }}>
                              <TokenIcon symbol={pos.loanSymbol} size={24} />
                            </div>
                          </div>

                          {/* Market pair + stats */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                                {pos.pair}
                              </h3>
                              <StatusBadge
                                status={healthFactorStatus(pos.healthFactor)}
                                label={healthFactorLabel(pos.healthFactor)}
                                size="sm"
                              />
                            </div>
                            <div className="flex items-center gap-4 flex-wrap">
                              <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
                                Collateral <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>{collateral.toFixed(4)}</span>
                              </span>
                              <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
                                Debt <span className="font-mono font-bold" style={{ color: 'var(--accent-warning)' }}>{debt.toFixed(4)}</span>
                              </span>
                              <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
                                Leverage <span className="font-mono font-bold" style={{ color: 'var(--accent-info)' }}>{pos.leverage.toFixed(2)}x</span>
                              </span>
                            </div>
                          </div>

                          {/* Net APY + Manage */}
                          <div className="shrink-0 text-right">
                            <div
                              className="font-mono font-bold mb-1"
                              style={{
                                fontSize: 'var(--text-body)',
                                color: netApy >= 0 ? 'var(--color-success)' : 'var(--accent-secondary)',
                              }}
                            >
                              {netApy >= 0 ? '+' : ''}{netApy.toFixed(2)}%
                            </div>
                            <div
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans font-bold uppercase tracking-wider transition-colors"
                              style={{
                                fontSize: 'var(--text-micro)',
                                color: 'var(--accent-primary)',
                                background: 'rgba(0,255,209,0.06)',
                                border: '1px solid rgba(0,255,209,0.12)',
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
              })}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
