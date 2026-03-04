'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import type { ChainSummary } from '@/lib/types';

export default function ChainCard({ chain, index }: { chain: ChainSummary; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/${chain.slug}`}>
        <div
          className="perspective-card card-glow p-6 h-full cursor-pointer group relative overflow-hidden"
        >
          {/* Chain-colored glow on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 0%, ${chain.color}15 0%, transparent 70%)`,
            }}
          />

          {/* Ghost watermark number */}
          <div
            className="absolute -right-2 -bottom-4 text-[80px] font-black leading-none pointer-events-none select-none opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500 font-mono"
            style={{ color: chain.color }}
          >
            {chain.marketCount}
          </div>

          {/* Header */}
          <div className="flex items-center justify-between mb-5 relative z-10">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                style={{ background: `${chain.color}20`, border: `1px solid ${chain.color}40` }}
              >
                <Image
                  src={`/icons/${chain.slug}.svg`}
                  alt={chain.name}
                  width={24}
                  height={24}
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-white transition-colors">
                  {chain.name}
                </h3>
                <p className="text-xs font-mono text-[var(--text-muted)]">
                  {chain.marketCount} market{chain.marketCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 relative z-10">
            <div className="glass-inner p-3 rounded-xl">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
                Best ROE
              </p>
              <p
                className="text-xl font-black font-mono"
                style={{ color: chain.topROE >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}
              >
                {chain.topROE >= 0 ? '+' : ''}{chain.topROE.toFixed(1)}%
              </p>
            </div>
            <div className="glass-inner p-3 rounded-xl">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
                Liquidity
              </p>
              <p className="text-xl font-black font-mono text-[var(--text-primary)]">
                {chain.totalLiquidity >= 1000
                  ? `${(chain.totalLiquidity / 1000).toFixed(1)}K`
                  : chain.totalLiquidity.toFixed(0)}
              </p>
            </div>
          </div>

          {/* Chain-colored border-top accent on hover */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{ background: `linear-gradient(90deg, transparent, ${chain.color}, transparent)` }}
          />
        </div>
      </Link>
    </motion.div>
  );
}
