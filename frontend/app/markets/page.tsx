'use client';

import { useState, useEffect } from 'react';
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
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
          <div className="markets-hero-glow" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 text-center pt-8 pb-6"
        >
          <p className="text-[10px] font-mono tracking-[0.25em] uppercase mb-3" style={{ color: 'var(--text-muted)' }}>
            {'// MORPHO BLUE · BASE L2'}
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
            <span className="gradient-text-animated">Live Markets</span>
          </h1>
          <p className="text-sm font-mono max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Explore LST/ETH leverage markets. Click any market to view analytics and open positions.
          </p>

          {/* Aggregate stats bar */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center items-center gap-3 sm:gap-5 mt-5 flex-wrap"
            >
              <div className="stat-chip stat-chip-live">
                <span className="stat-label">Markets</span>
                <span className="stat-value" style={{ color: 'var(--accent-primary)' }}>{stats.marketCount}</span>
              </div>
              <div className="stat-chip">
                <span className="stat-label">Total TVL</span>
                <span className="stat-value">
                  {stats.totalTvl >= 1000 ? `${(stats.totalTvl / 1000).toFixed(1)}K` : stats.totalTvl.toFixed(0)} ETH
                </span>
              </div>
              {stats.topMarket && (
                <div className="stat-chip">
                  <span className="stat-label">Top APY</span>
                  <span className="stat-value" style={{ color: 'var(--accent-primary)' }}>{stats.topNetApy.toFixed(1)}%</span>
                </div>
              )}
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
          <MarketsTable onStatsReady={setStats} />
        </motion.div>
      </div>
    </div>
  );
}
