'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import ChainCard from '@/components/ChainCard';
import GlobalStatsBar from '@/components/GlobalStatsBar';
import PageTransition from '@/components/PageTransition';
import type { ChainSummary, EnrichedMarket } from '@/lib/types';

interface Props {
  chains: ChainSummary[];
  totalMarkets: number;
  topMarkets: EnrichedMarket[];
}

export default function HomeView({ chains, totalMarkets, topMarkets }: Props) {
  const router = useRouter();

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Cinematic Hero */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mb-10 relative"
        >
          {/* Scan line effect */}
          <div className="scan-line-container absolute inset-0 pointer-events-none overflow-hidden rounded-3xl opacity-30">
            <div className="scan-line" />
          </div>

          <div className="text-center sm:text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-3 leading-tight">
              <span className="gradient-text">Morpho Blue</span>
              <br />
              <span className="text-[var(--text-primary)]">Leverage Protocol</span>
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-[var(--text-secondary)] text-base sm:text-lg max-w-2xl leading-relaxed"
            >
              Amplify your staking yield with flash loan-powered leverage across 4 chains.
              <span className="text-[var(--accent-primary)] font-semibold"> ROE analysis </span>
              powered by on-chain oracle depeg data.
            </motion.p>
          </div>
        </motion.div>

        {/* Ticker Tape */}
        {topMarkets.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-8 overflow-hidden relative"
          >
            <div className="ticker-fade-left" />
            <div className="ticker-fade-right" />
            <div className="ticker-tape">
              <div className="ticker-content">
                {[...topMarkets, ...topMarkets].map((m, i) => (
                  <span
                    key={`${m.marketId}-${i}`}
                    className="ticker-item"
                    onClick={() => router.push(`/${m.chainSlug}/${m.marketId}`)}
                  >
                    <span className="text-[var(--text-primary)] font-bold">{m.pair}</span>
                    <span
                      className="font-mono font-bold"
                      style={{
                        color: m.roe.aggressive.roe >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                      }}
                    >
                      {m.roe.aggressive.roe >= 0 ? '+' : ''}{m.roe.aggressive.roe.toFixed(1)}%
                    </span>
                    <span className="text-[var(--text-muted)]">|</span>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-8"
        >
          <GlobalStatsBar chains={chains} totalMarkets={totalMarkets} />
        </motion.div>

        {/* Chain Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {chains.map((chain, i) => (
            <ChainCard key={chain.slug} chain={chain} index={i} />
          ))}
        </div>

        {/* Top Markets Table */}
        {topMarkets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--border), transparent)' }} />
              <h2 className="text-lg font-bold text-[var(--text-primary)] font-mono uppercase tracking-wider whitespace-nowrap">
                Top Markets by ROE
              </h2>
              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, var(--border))' }} />
            </div>
            <div className="card-glow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-left text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <th className="p-4">Market</th>
                      <th className="p-4">Chain</th>
                      <th className="p-4 text-right">Supply APY</th>
                      <th className="p-4 text-right">Borrow APY</th>
                      <th className="p-4 text-right">Yield</th>
                      <th className="p-4 text-right">LLTV</th>
                      <th className="p-4 text-right">Best ROE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMarkets.map((m) => (
                      <tr
                        key={`${m.chainSlug}-${m.marketId}`}
                        className="hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer group"
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onClick={() => router.push(`/${m.chainSlug}/${m.marketId}`)}
                      >
                        <td className="p-4 font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">
                          {m.pair}
                        </td>
                        <td className="p-4">
                          <span className="chain-badge">{m.chainSlug}</span>
                        </td>
                        <td className="p-4 text-right font-mono" style={{ color: 'var(--accent-primary)' }}>
                          {m.supplyAPY.toFixed(2)}%
                        </td>
                        <td className="p-4 text-right font-mono" style={{ color: 'var(--accent-warning)' }}>
                          {m.borrowAPY.toFixed(2)}%
                        </td>
                        <td className="p-4 text-right font-mono" style={{ color: 'var(--accent-info)' }}>
                          {m.collateralYield > 0 ? `${m.collateralYield.toFixed(1)}%` : '--'}
                        </td>
                        <td className="p-4 text-right font-mono text-[var(--text-secondary)]">
                          {m.lltv.toFixed(1)}%
                        </td>
                        <td className="p-4 text-right">
                          <span className={`roe-badge text-sm ${m.roe.aggressive.roe >= 0 ? 'positive' : 'negative'}`}>
                            {m.roe.aggressive.roe >= 0 ? '+' : ''}{m.roe.aggressive.roe.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
