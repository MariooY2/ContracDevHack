'use client';

import { useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import MarketsTable from '@/components/MarketsTable';
import type { AggStats } from '@/components/MarketsTable';

export default function MarketsPage() {
  const [stats, setStats] = useState<AggStats | null>(null);

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-140px)]">
      {/* ── Markets Hero Header ── */}
      <div className="w-full relative mb-8">
        {/* Subtle background effects */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 text-center pt-8 pb-6"
        >
          <p className="text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: 'var(--text-muted)' }}>
{'MORPHO BLUE · MULTI-CHAIN'}
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
            Live Markets
          </h1>
          <p className="font-sans max-w-lg mx-auto" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
            Explore LST/ETH leverage markets. Click any market to view analytics and open positions.
          </p>

          {/* Aggregate stats */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-3 sm:gap-4 max-w-md mx-auto mt-6"
            >
              {[
                { label: 'Markets', value: String(stats.marketCount), accent: true, live: true },
                { label: 'Total TVL', value: `${stats.totalTvl >= 1000 ? `${(stats.totalTvl / 1000).toFixed(1)}K` : stats.totalTvl.toFixed(0)} ETH`, accent: false },
                ...(stats.topMarket ? [{ label: 'Top APY', value: `${stats.topNetApy.toFixed(1)}%`, accent: true }] : []),
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="text-center py-3 px-2 rounded-xl"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    {stat.live && <div className="live-dot" style={{ width: 5, height: 5 }} />}
                    <span className="font-sans uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
                      {stat.label}
                    </span>
                  </div>
                  <span
                    className="font-mono font-bold"
                    style={{
                      fontSize: 'clamp(1rem, 3vw, 1.25rem)',
                      color: stat.accent ? 'var(--accent-primary)' : 'var(--text-primary)',
                    }}
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>

        {/* Glow line separator */}
        <div className="glow-line" />
      </div>

      {/* ── Markets Table ── */}
      <div className="w-full max-w-[1200px] mx-auto flex-1">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Suspense fallback={null}>
            <MarketsTable onStatsReady={setStats} />
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}
