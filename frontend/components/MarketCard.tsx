'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import type { EnrichedMarket } from '@/lib/types';
import { CHAIN_CONFIG } from '@/lib/chains';

/** Tiny SVG sparkline showing conservative -> moderate -> aggressive ROE */
function ROESparkline({ market }: { market: EnrichedMarket }) {
  const values = [
    market.roe.conservative.roe,
    market.roe.moderate.roe,
    market.roe.aggressive.roe,
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 48;
  const h = 20;
  const pad = 2;

  const points = values.map((v, i) => {
    const x = pad + (i / 2) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });

  const isPositive = values[2] >= 0;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={isPositive ? 'var(--accent-primary)' : 'var(--accent-secondary)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* Dot on aggressive (last) value */}
      <circle
        cx={pad + (w - 2 * pad)}
        cy={h - pad - ((values[2] - min) / range) * (h - 2 * pad)}
        r="2"
        fill={isPositive ? 'var(--accent-primary)' : 'var(--accent-secondary)'}
      />
    </svg>
  );
}

export default function MarketCard({ market, index }: { market: EnrichedMarket; index: number }) {
  const chain = CHAIN_CONFIG[market.chainSlug];
  const bestROE = market.roe.aggressive.roe;

  // Dynamic ROE badge intensity
  const roeIntensity = Math.min(Math.abs(bestROE) / 30, 1);
  const roeBg = bestROE >= 0
    ? `rgba(0,255,136,${0.06 + roeIntensity * 0.1})`
    : `rgba(255,51,102,${0.06 + roeIntensity * 0.1})`;
  const roeBorder = bestROE >= 0
    ? `rgba(0,255,136,${0.15 + roeIntensity * 0.2})`
    : `rgba(255,51,102,${0.15 + roeIntensity * 0.2})`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
    >
      <Link href={`/${market.chainSlug}/${market.marketId}`}>
        <div className="card-glow p-5 h-full cursor-pointer group">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                style={{ background: `${chain.color}20`, border: `1px solid ${chain.color}30` }}
              >
                <Image
                  src={`/icons/${chain.slug}.svg`}
                  alt={chain.name}
                  width={18}
                  height={18}
                />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight group-hover:text-white transition-colors">
                  {market.pair}
                </h3>
                <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                  {chain.name} · {market.oracleType.replace('OracleV2', '')}
                </p>
              </div>
            </div>

            {/* ROE Badge with sparkline */}
            <div className="flex items-center gap-2">
              <ROESparkline market={market} />
              <div
                className="roe-badge"
                style={{ background: roeBg, border: `1px solid ${roeBorder}`, color: bestROE >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}
              >
                {bestROE >= 0 ? '+' : ''}{bestROE.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* APY Row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="glass-inner p-2.5 rounded-lg text-center">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">Supply</p>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--accent-primary)' }}>
                {market.supplyAPY.toFixed(2)}%
              </p>
            </div>
            <div className="glass-inner p-2.5 rounded-lg text-center">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">Borrow</p>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--accent-warning)' }}>
                {market.borrowAPY.toFixed(2)}%
              </p>
            </div>
            <div className="glass-inner p-2.5 rounded-lg text-center">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">Yield</p>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--accent-info)' }}>
                {market.collateralYield > 0 ? `${market.collateralYield.toFixed(1)}%` : '--'}
              </p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between mb-3 text-xs font-mono">
            <span className="text-[var(--text-muted)]">
              LLTV <span className="text-[var(--text-secondary)]">{market.lltv.toFixed(1)}%</span>
            </span>
            <span className="text-[var(--text-muted)]">
              Util <span className="text-[var(--text-secondary)]">{market.utilization.toFixed(0)}%</span>
            </span>
            <span className="text-[var(--text-muted)]">
              Max <span className="text-[var(--text-secondary)]">{market.maxLeverage.toFixed(1)}x</span>
            </span>
          </div>

          {/* Leverage Tier Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="tier-pill tier-pill--conservative">
              {market.roe.conservative.leverage.toFixed(1)}x
            </span>
            <span className="tier-pill tier-pill--moderate">
              {market.roe.moderate.leverage.toFixed(1)}x
            </span>
            <span className="tier-pill tier-pill--aggressive">
              {market.roe.aggressive.leverage.toFixed(1)}x
            </span>
            {market.maxDepeg > 0 && (
              <span className="text-[10px] font-mono text-[var(--text-muted)] ml-auto">
                depeg {market.maxDepeg.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
