'use client';

import { useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import StrategyPanel from '@/components/StrategyPanel';
import MarketDepegChart from '@/components/MarketDepegChart';
import PageTransition from '@/components/PageTransition';
import type { EnrichedMarket, ChainSlug } from '@/lib/types';
import { CHAIN_CONFIG } from '@/lib/chains';
import { computeROE, computeHealthFactor } from '@/lib/dataEnrichment';

interface Props {
  market: EnrichedMarket;
  chainSlug: ChainSlug;
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--border), transparent)' }} />
      <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest font-mono whitespace-nowrap">
        {title}
      </h3>
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, var(--border))' }} />
    </div>
  );
}

function CopyableAddress({ label, value, symbol, explorerUrl }: {
  label: string;
  value: string;
  symbol?: string;
  explorerUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  const short = `${value.slice(0, 6)}...${value.slice(-4)}`;

  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-[var(--text-muted)]">{label} {symbol ? `(${symbol})` : ''}</span>
      <div className="flex items-center gap-2">
        <a
          href={`${explorerUrl}/address/${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-info)] hover:underline"
        >
          {short}
        </a>
        <button
          onClick={(e) => { e.preventDefault(); handleCopy(); }}
          className="p-1 rounded transition-colors hover:bg-[rgba(255,255,255,0.05)]"
          title="Copy address"
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="var(--text-muted)" strokeWidth="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="var(--text-muted)" strokeWidth="2"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default function MarketDetailView({ market, chainSlug }: Props) {
  const chain = CHAIN_CONFIG[chainSlug];
  const [chartHover, setChartHover] = useState<{ x: number; leverage: number; roe: number } | null>(null);

  // Generate ROE curve data
  const roeCurve = useMemo(() => {
    const points: { leverage: number; roe: number; hf: number }[] = [];
    const maxL = Math.min(market.maxLeverage * 0.95, 30);
    for (let l = 1; l <= maxL; l += 0.5) {
      points.push({
        leverage: l,
        roe: computeROE(market.collateralYield, market.supplyAPY, market.borrowAPY, l),
        hf: computeHealthFactor(l, market.lltv),
      });
    }
    return points;
  }, [market]);

  // Find peak ROE
  const peakROE = Math.max(...roeCurve.map(p => p.roe));
  const minROE = Math.min(...roeCurve.map(p => p.roe));

  // SVG chart dimensions
  const chartW = 600;
  const chartH = 200;
  const padding = 40;

  const xScale = (l: number) =>
    padding + ((l - 1) / (roeCurve[roeCurve.length - 1].leverage - 1)) * (chartW - 2 * padding);
  const yScale = (roe: number) =>
    chartH - padding - ((roe - minROE) / (peakROE - minROE + 1)) * (chartH - 2 * padding);

  const pathD = roeCurve
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.leverage).toFixed(1)} ${yScale(p.roe).toFixed(1)}`)
    .join(' ');

  const handleChartMouse = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * chartW;

    if (relX < padding || relX > chartW - padding) {
      setChartHover(null);
      return;
    }

    const maxLev = roeCurve[roeCurve.length - 1].leverage;
    const lev = 1 + ((relX - padding) / (chartW - 2 * padding)) * (maxLev - 1);
    const roe = computeROE(market.collateralYield, market.supplyAPY, market.borrowAPY, lev);
    setChartHover({ x: relX, leverage: lev, roe });
  }, [roeCurve, market, chartW, padding]);

  const stagger = (i: number) => ({ duration: 0.4, delay: 0.1 + i * 0.08 });

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <div className="breadcrumb mb-6">
          <Link href="/">Home</Link>
          <span className="separator">/</span>
          <Link href={`/${chainSlug}`}>{chain.name}</Link>
          <span className="separator">/</span>
          <span className="text-[var(--text-primary)]">{market.pair}</span>
        </div>

        {/* Market Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
        >
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: `${chain.color}20`, border: `1px solid ${chain.color}40` }}
            >
              <Image src={`/icons/${chainSlug}.svg`} alt={chain.name} width={32} height={32} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">{market.pair}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="chain-badge" style={{ borderColor: `${chain.color}60`, color: chain.color }}>
                  {chain.name}
                </span>
                <span className="chain-badge">{market.oracleType.replace('OracleV2', '')}</span>
                <span className="chain-badge">LLTV {market.lltv.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Quick ROE */}
          <div className={`roe-badge text-2xl ${market.roe.aggressive.roe >= 0 ? 'positive' : 'negative'}`}>
            {market.roe.aggressive.roe >= 0 ? '+' : ''}{market.roe.aggressive.roe.toFixed(1)}%
            <span className="text-xs opacity-60 ml-1">ROE</span>
          </div>
        </motion.div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column (2/3) */}
          <div className="lg:col-span-2 space-y-5">
            {/* APY Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(0)}
              className="card-glow p-6"
            >
              <SectionDivider title="APY Breakdown" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass-inner p-4 rounded-xl text-center">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
                    Supply APY
                  </p>
                  <p className="text-2xl font-black font-mono" style={{ color: 'var(--accent-primary)' }}>
                    {market.supplyAPY.toFixed(2)}%
                  </p>
                </div>
                <div className="glass-inner p-4 rounded-xl text-center">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
                    Borrow APY
                  </p>
                  <p className="text-2xl font-black font-mono" style={{ color: 'var(--accent-warning)' }}>
                    {market.borrowAPY.toFixed(2)}%
                  </p>
                </div>
                <div className="glass-inner p-4 rounded-xl text-center">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
                    {market.yieldSource} Yield
                  </p>
                  <p className="text-2xl font-black font-mono" style={{ color: 'var(--accent-info)' }}>
                    {market.collateralYield > 0 ? `${market.collateralYield.toFixed(1)}%` : '--'}
                  </p>
                </div>
                <div className="glass-inner p-4 rounded-xl text-center">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
                    Net Spread
                  </p>
                  <p className="text-2xl font-black font-mono" style={{
                    color: (market.collateralYield + market.supplyAPY - market.borrowAPY) >= 0
                      ? 'var(--accent-primary)'
                      : 'var(--accent-secondary)'
                  }}>
                    {(market.collateralYield + market.supplyAPY - market.borrowAPY).toFixed(2)}%
                  </p>
                </div>
              </div>
            </motion.div>

            {/* ROE vs Leverage Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(1)}
              className="card-glow p-6"
            >
              <SectionDivider title="ROE vs Leverage" />
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full"
                  style={{ minWidth: 400 }}
                  onMouseMove={handleChartMouse}
                  onMouseLeave={() => setChartHover(null)}
                >
                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map(pct => (
                    <line
                      key={pct}
                      x1={padding}
                      x2={chartW - padding}
                      y1={chartH - padding - pct * (chartH - 2 * padding)}
                      y2={chartH - padding - pct * (chartH - 2 * padding)}
                      stroke="rgba(255,255,255,0.05)"
                      strokeDasharray="4 4"
                    />
                  ))}
                  {/* Zero line */}
                  {minROE < 0 && (
                    <line
                      x1={padding}
                      x2={chartW - padding}
                      y1={yScale(0)}
                      y2={yScale(0)}
                      stroke="rgba(255,255,255,0.15)"
                      strokeDasharray="6 4"
                    />
                  )}
                  {/* Curve */}
                  <path d={pathD} fill="none" stroke="url(#roeGrad)" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Gradient fill */}
                  <path
                    d={`${pathD} L ${xScale(roeCurve[roeCurve.length - 1].leverage)} ${chartH - padding} L ${padding} ${chartH - padding} Z`}
                    fill="url(#roeFill)"
                    opacity={0.15}
                  />
                  {/* Tier markers */}
                  {(['conservative', 'moderate', 'aggressive'] as const).map(tier => {
                    const { leverage, roe } = market.roe[tier];
                    const colors = { conservative: '#00FF88', moderate: '#00C2FF', aggressive: '#F59E0B' };
                    return (
                      <g key={tier}>
                        <circle cx={xScale(leverage)} cy={yScale(roe)} r="5" fill={colors[tier]} stroke="#05080F" strokeWidth="2" />
                        <text x={xScale(leverage)} y={yScale(roe) - 12} fill={colors[tier]} fontSize="9" textAnchor="middle" fontFamily="monospace">
                          {leverage.toFixed(0)}x
                        </text>
                      </g>
                    );
                  })}

                  {/* Interactive crosshair tooltip */}
                  {chartHover && (
                    <g>
                      <line
                        x1={chartHover.x}
                        x2={chartHover.x}
                        y1={padding}
                        y2={chartH - padding}
                        stroke="rgba(255,255,255,0.2)"
                        strokeDasharray="3 3"
                      />
                      <circle
                        cx={chartHover.x}
                        cy={yScale(chartHover.roe)}
                        r="4"
                        fill="white"
                        stroke="#05080F"
                        strokeWidth="2"
                      />
                      <rect
                        x={chartHover.x - 45}
                        y={yScale(chartHover.roe) - 30}
                        width="90"
                        height="22"
                        rx="6"
                        fill="rgba(5,8,15,0.9)"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth="1"
                      />
                      <text
                        x={chartHover.x}
                        y={yScale(chartHover.roe) - 15}
                        fill="white"
                        fontSize="10"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {chartHover.leverage.toFixed(1)}x = {chartHover.roe >= 0 ? '+' : ''}{chartHover.roe.toFixed(1)}%
                      </text>
                    </g>
                  )}

                  {/* Gradient defs */}
                  <defs>
                    <linearGradient id="roeGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#00FF88" />
                      <stop offset="100%" stopColor="#00C2FF" />
                    </linearGradient>
                    <linearGradient id="roeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00FF88" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#00FF88" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Axes */}
                  <line x1={padding} x2={chartW - padding} y1={chartH - padding} y2={chartH - padding} stroke="rgba(255,255,255,0.1)" />
                  <text x={chartW / 2} y={chartH - 8} fill="var(--text-muted)" fontSize="10" textAnchor="middle" fontFamily="monospace">Leverage (x)</text>
                  <text x={12} y={chartH / 2} fill="var(--text-muted)" fontSize="10" textAnchor="middle" fontFamily="monospace" transform={`rotate(-90, 12, ${chartH / 2})`}>ROE %</text>
                </svg>
              </div>
            </motion.div>

            {/* Depeg / Oracle Deviation Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(2)}
            >
              <MarketDepegChart market={market} />
            </motion.div>

            {/* Market Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(3)}
              className="card-glow p-6"
            >
              <SectionDivider title="Market Statistics" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Total Supply', value: `${parseFloat(market.totalSupply).toFixed(2)} ${market.loanSymbol}` },
                  { label: 'Total Borrow', value: `${parseFloat(market.totalBorrow).toFixed(2)} ${market.loanSymbol}` },
                  { label: 'Utilization', value: `${market.utilization.toFixed(1)}%` },
                  { label: 'Available Liquidity', value: `${parseFloat(market.availableLiquidity).toFixed(2)} ${market.loanSymbol}` },
                  { label: 'Max Leverage', value: `${market.maxLeverage.toFixed(1)}x` },
                  { label: 'Max Depeg', value: market.maxDepeg > 0 ? `${market.maxDepeg.toFixed(2)}%` : '--' },
                ].map(stat => (
                  <div key={stat.label} className="glass-inner p-3 rounded-xl">
                    <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">
                      {stat.label}
                    </p>
                    <p className="text-sm font-bold font-mono text-[var(--text-primary)]">{stat.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Leverage Tiers Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(4)}
              className="card-glow p-6"
            >
              <SectionDivider title="Leverage Tiers" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono" style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="p-3">Strategy</th>
                      <th className="p-3 text-right">Leverage</th>
                      <th className="p-3 text-right">ROE</th>
                      <th className="p-3 text-right">Health Factor</th>
                      <th className="p-3 text-right">Liq. Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['conservative', 'moderate', 'aggressive'] as const).map(tier => {
                      const data = market.roe[tier];
                      const liqDist = data.healthFactor > 0 ? (1 - 1 / data.healthFactor) * 100 : 0;
                      return (
                        <tr key={tier} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="p-3">
                            <span className={`tier-pill tier-pill--${tier}`}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-[var(--text-primary)]">{data.leverage.toFixed(1)}x</td>
                          <td className="p-3 text-right font-mono font-bold" style={{ color: data.roe >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                            {data.roe >= 0 ? '+' : ''}{data.roe.toFixed(2)}%
                          </td>
                          <td className="p-3 text-right font-mono" style={{
                            color: data.healthFactor > 1.5 ? 'var(--accent-primary)' : data.healthFactor > 1.1 ? 'var(--accent-warning)' : 'var(--accent-secondary)'
                          }}>
                            {data.healthFactor > 100 ? '∞' : data.healthFactor.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                            {liqDist.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Contract Addresses */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(5)}
              className="card-glow p-6"
            >
              <SectionDivider title="Contracts" />
              <div className="space-y-2 text-xs font-mono">
                <CopyableAddress label="Market ID" value={market.marketId} explorerUrl={chain.blockExplorer} />
                <CopyableAddress label="Collateral" value={market.collateralAddress} symbol={market.collateralSymbol} explorerUrl={chain.blockExplorer} />
                <CopyableAddress label="Loan Token" value={market.loanAddress} symbol={market.loanSymbol} explorerUrl={chain.blockExplorer} />
                <CopyableAddress label="Oracle" value={market.oracleAddress} explorerUrl={chain.blockExplorer} />
                <CopyableAddress label="IRM" value={market.irmAddress} explorerUrl={chain.blockExplorer} />
              </div>
            </motion.div>
          </div>

          {/* Right Column (1/3) */}
          <motion.div
            className="space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <StrategyPanel market={market} chainSlug={chainSlug} />
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
