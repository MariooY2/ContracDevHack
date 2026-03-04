'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardLoader } from '@/components/Loader';
import { supabase } from '@/lib/supabase';
import type { EnrichedMarket } from '@/lib/types';

interface DepegPoint {
  date: string;
  timestamp: number;
  oraclePrice: number;
  depegPct: number;
}

function maxDepegAtLeverage(leverage: number, lltv: number): number {
  if (leverage <= 1) return 100;
  const initialLtv = (leverage - 1) / leverage;
  return (1 - initialLtv / lltv) * 100;
}

interface Props {
  market: EnrichedMarket;
}

export default function MarketDepegChart({ market }: Props) {
  const [data, setData] = useState<DepegPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState<'oracle' | 'none'>('none');

  const lltv = market.lltv / 100; // convert 94.5 → 0.945

  const fetchDepegData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // Fetch oracle depeg history directly from Supabase
      const { data: rows, error: dbErr } = await supabase
        .from('oracle_depeg_history')
        .select('timestamp_ms, date, oracle_price, depeg_pct')
        .eq('market_id', market.marketId)
        .order('timestamp_ms', { ascending: true });

      if (dbErr || !rows || rows.length === 0) {
        setError('No oracle depeg data available for this market');
        setLoading(false);
        return;
      }

      const points: DepegPoint[] = rows.map(r => ({
        date: r.date,
        timestamp: r.timestamp_ms,
        oraclePrice: r.oracle_price,
        depegPct: r.depeg_pct,
      }));

      setData(points);
      setDataSource('oracle');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(`Failed to load depeg data: ${msg.slice(0, 80)}`);
    }
    setLoading(false);
  }, [market.marketId]);

  useEffect(() => { fetchDepegData(); }, [fetchDepegData]);

  // ── Statistics ──────────────────────────────────────────────────────
  const depegValues = data.map(d => d.depegPct);
  const absValues = depegValues.map(v => Math.abs(v));
  const maxHistoricalDepeg = absValues.length > 0 ? Math.max(...absValues) : 0;
  const currentDepeg = data.length > 0 ? data[data.length - 1].depegPct : 0;

  const SAFETY_BUFFER = 0.20;
  const safeThreshold = (maxHistoricalDepeg / 100) * (1 + SAFETY_BUFFER);
  const denom = 1 - lltv * (1 - safeThreshold);
  const calculatedMaxLev = denom > 0 ? 1 / denom : 1 / (1 - lltv);
  const maxSafeLeverage = Math.min(calculatedMaxLev, market.maxLeverage);

  const leverageLevels = useMemo(() => {
    const all = [
      { label: '2x',  leverage: 2,  color: '#00FF88' },
      { label: '4x',  leverage: 4,  color: '#84cc16' },
      { label: '6x',  leverage: 6,  color: '#f59e0b' },
      { label: '8x',  leverage: 8,  color: '#f97316' },
      { label: '10x', leverage: 10, color: '#ef4444' },
      { label: '15x', leverage: 15, color: '#FF3366' },
    ];
    return all.filter(l => l.leverage <= market.maxLeverage);
  }, [market.maxLeverage]);

  // ── SVG Chart ──────────────────────────────────────────────────────
  const W = 650, H = 300;
  const PAD = { top: 25, right: 60, bottom: 35, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const dataMax = depegValues.length > 0 ? Math.max(...depegValues) : 1;
  const dataMin = depegValues.length > 0 ? Math.min(...depegValues) : -1;
  const dataRange = Math.max(Math.abs(dataMax), Math.abs(dataMin), 0.01);

  // For low-depeg markets, cap Y-axis at 0.5% so the sinusoidal pattern is visible
  // For higher depeg, scale based on liquidation lines or data range
  const nearestLiq = leverageLevels
    .map(l => maxDepegAtLeverage(l.leverage, lltv))
    .filter(v => v < 50)
    .sort((a, b) => a - b)[0] || 50;

  let maxY: number;
  if (dataRange < 0.5) {
    // Low depeg: tight Y-axis so small movements are visible
    maxY = 0.5;
  } else if (nearestLiq < dataRange * 3) {
    maxY = Math.max(dataRange * 1.5, nearestLiq * 1.1);
  } else {
    maxY = dataRange * 2.5;
  }

  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH / 2 - (v / maxY) * (chartH / 2);
  const zeroY = toY(0);

  const depegPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.depegPct)}`).join(' ');

  const premiumFill = data.length > 1
    ? data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(Math.max(d.depegPct, 0))}`).join(' ')
      + ` L ${toX(data.length - 1)} ${zeroY} L ${toX(0)} ${zeroY} Z`
    : '';

  const discountFill = data.length > 1
    ? data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(Math.min(d.depegPct, 0))}`).join(' ')
      + ` L ${toX(data.length - 1)} ${zeroY} L ${toX(0)} ${zeroY} Z`
    : '';

  const yTicks = [-maxY, -maxY * 0.5, 0, maxY * 0.5, maxY];
  const yFmt = (v: number) => {
    const abs = Math.abs(v);
    const decimals = abs < 0.1 ? 3 : abs < 1 ? 2 : 1;
    return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}%`;
  };

  const riskLevel = (() => {
    const buffer = maxHistoricalDepeg * (1 + SAFETY_BUFFER);
    if (buffer < 2) return { level: 'LOW', color: '#10b981', text: 'Historically very stable' };
    if (buffer < 5) return { level: 'MODERATE', color: '#f59e0b', text: 'Some volatility observed' };
    return { level: 'HIGH', color: '#ef4444', text: 'Significant price swings detected' };
  })();

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-base font-black gradient-text tracking-tight">Oracle Depeg Analysis</h2>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
            {market.collateralSymbol}/{market.loanSymbol} · {riskLevel.text}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="px-2.5 py-1 rounded-full text-[9px] font-bold flex items-center gap-1.5 font-mono"
            style={{ background: riskLevel.color + '20', color: riskLevel.color, border: `1px solid ${riskLevel.color}30` }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: riskLevel.color }} />
            {riskLevel.level} RISK
          </div>
          {!loading && dataSource === 'oracle' && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono font-bold"
              style={{
                background: 'rgba(0,255,136,0.1)',
                border: '1px solid rgba(0,255,136,0.2)',
                color: 'var(--accent-primary)',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-primary)' }} />
              ON-CHAIN · {data.length}d
            </div>
          )}
          <button
            onClick={fetchDepegData}
            disabled={loading}
            title="Refresh"
            className="p-1.5 rounded-lg transition-all hover:opacity-80 disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
          >
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none"
              className={loading ? 'animate-spin' : ''}
              style={{ color: 'var(--text-muted)' }}
            >
              <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Info */}
      <div
        className="rounded-xl p-3 mb-4 flex items-start gap-2.5"
        style={{ background: 'rgba(0,194,255,0.05)', border: '1px solid rgba(0,194,255,0.15)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" style={{ color: 'var(--accent-info)' }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p className="text-[10px] leading-relaxed font-mono" style={{ color: 'var(--text-secondary)' }}>
          On-chain Morpho oracle price sampled daily over 90 days.
          Shows how the oracle-reported {market.collateralSymbol}/{market.loanSymbol} price deviates from its rolling peak.
          Negative values indicate depeg risk — larger drops push leveraged positions closer to liquidation.
        </p>
      </div>

      {loading ? (
        <CardLoader label="Loading oracle depeg data" />
      ) : error ? (
        <div className="glass-inner p-8 text-center space-y-3">
          <p className="text-sm font-mono" style={{ color: 'var(--accent-secondary)' }}>{error}</p>
          <button onClick={fetchDepegData} className="text-xs font-mono underline" style={{ color: 'var(--accent-info)' }}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="glass-inner p-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="dpPremium" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00FF88" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#00FF88" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="dpDiscount" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#FF3366" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#FF3366" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Y grid + labels */}
              {yTicks.map((val, i) => (
                <g key={i}>
                  <line
                    x1={PAD.left} y1={toY(val)} x2={W - PAD.right} y2={toY(val)}
                    stroke={val === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}
                    strokeWidth={val === 0 ? '1' : '0.5'}
                    strokeDasharray={val === 0 ? '' : '4 4'}
                  />
                  <text x={PAD.left - 5} y={toY(val) + 4} textAnchor="end" fill="#64748b" fontSize="9">
                    {yFmt(val)}
                  </text>
                </g>
              ))}

              {/* Liquidation lines */}
              {leverageLevels.map(level => {
                const threshold = maxDepegAtLeverage(level.leverage, lltv);
                const clampedY = threshold > maxY ? PAD.top + chartH - 2 : toY(-threshold);
                const isOff = threshold > maxY;
                return (
                  <g key={level.label}>
                    {!isOff && (
                      <line
                        x1={PAD.left} y1={clampedY} x2={W - PAD.right} y2={clampedY}
                        stroke={level.color} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.6"
                      />
                    )}
                    <text x={W - PAD.right + 4} y={clampedY + 3} fill={level.color} fontSize="9" fontWeight="bold" opacity={isOff ? 0.4 : 1}>
                      {level.label} liq
                    </text>
                    <text x={W - PAD.right + 4} y={clampedY + 13} fill="#64748b" fontSize="8">
                      -{threshold.toFixed(1)}%
                    </text>
                  </g>
                );
              })}

              {/* X labels */}
              {data.filter((_, i) => i % Math.max(Math.floor(data.length / 6), 1) === 0).map(d => {
                const idx = data.indexOf(d);
                return (
                  <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fill="#64748b" fontSize="8">
                    {d.date}
                  </text>
                );
              })}

              {/* Fill areas */}
              {premiumFill && <path d={premiumFill} fill="url(#dpPremium)" />}
              {discountFill && <path d={discountFill} fill="url(#dpDiscount)" />}

              {/* Line */}
              {depegPath && <path d={depegPath} fill="none" stroke="#8b5cf6" strokeWidth="2" />}

              {/* Worst point */}
              {data.length > 0 && (() => {
                const negatives = depegValues.filter(v => v < 0);
                if (negatives.length > 0) {
                  const worst = Math.min(...negatives);
                  const idx = depegValues.indexOf(worst);
                  if (idx >= 0) {
                    return (
                      <>
                        <circle cx={toX(idx)} cy={toY(data[idx].depegPct)} r="6" fill="#FF3366" stroke="#05080F" strokeWidth="2" />
                        <text x={toX(idx)} y={toY(data[idx].depegPct) + 20} textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="bold">
                          Worst: {Math.abs(data[idx].depegPct) < 0.1 ? data[idx].depegPct.toFixed(4) : data[idx].depegPct.toFixed(2)}%
                        </text>
                      </>
                    );
                  }
                }
                return null;
              })()}

              {/* Current point */}
              {data.length > 0 && (
                <circle cx={toX(data.length - 1)} cy={toY(currentDepeg)} r="4" fill="#8b5cf6" stroke="#05080F" strokeWidth="2" />
              )}

              {/* Zone labels */}
              <text x={PAD.left + 5} y={PAD.top + 12} fill="#00FF88" fontSize="10" fontWeight="600" opacity="0.7">Above Fair Value</text>
              <text x={PAD.left + 5} y={H - PAD.bottom - 5} fill="#FF3366" fontSize="10" fontWeight="600" opacity="0.7">Below Fair Value (Risk)</text>
            </svg>

            {/* Legend */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-inner p-3">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold mb-2">Liquidation Lines</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {leverageLevels.map(level => {
                    const threshold = maxDepegAtLeverage(level.leverage, lltv);
                    return (
                      <div key={level.label} className="flex items-center gap-1.5">
                        <div className="w-3 h-0.5 rounded" style={{ background: level.color }} />
                        <span className="text-[10px] font-mono font-bold" style={{ color: level.color }}>
                          {level.label} → -{threshold.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="glass-inner p-3">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold mb-2">How to Read</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 rounded bg-[#8b5cf6]" />
                    <span className="text-[10px] font-mono" style={{ color: '#a78bfa' }}>Purple = oracle depeg % over time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(to bottom, #00FF88 40%, transparent)' }} />
                    <span className="text-[10px] font-mono" style={{ color: '#00FF88' }}>Green = above rolling peak</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(to top, #FF3366 40%, transparent)' }} />
                    <span className="text-[10px] font-mono" style={{ color: '#FF3366' }}>Red = below rolling peak (depeg)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div
              className="glass-inner p-4"
              style={{ borderColor: currentDepeg >= 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)', borderWidth: '1px', borderStyle: 'solid' }}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold">Current Oracle Depeg</p>
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold"
                  style={{
                    background: currentDepeg >= 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                    color: currentDepeg >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                  }}
                >
                  {currentDepeg >= 0 ? 'At Peak' : 'Below Peak'}
                </span>
              </div>
              <p className="text-3xl font-black font-mono mb-1" style={{ color: currentDepeg >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                {currentDepeg >= 0 ? '' : ''}{currentDepeg.toFixed(2)}%
              </p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {currentDepeg >= 0
                  ? `Oracle price at or near rolling peak — no depeg detected`
                  : `Oracle price ${Math.abs(currentDepeg).toFixed(2)}% below its 90-day peak`}
              </p>
            </div>

            <div className="glass-inner p-4">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-mono font-bold mb-3">Safety Analysis</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">Max Oracle Depeg (90d)</span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--accent-secondary)' }}>{maxHistoricalDepeg.toFixed(2)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">Safety Buffer (20%)</span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--accent-warning)' }}>
                    +{(maxHistoricalDepeg * SAFETY_BUFFER).toFixed(2)}%
                  </span>
                </div>
                <div className="divider" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[var(--text-secondary)]">Recommended Max</span>
                  <span className="text-lg font-black font-mono" style={{ color: 'var(--accent-info)' }}>{maxSafeLeverage.toFixed(1)}x</span>
                </div>
              </div>
              <p className="text-[10px] font-mono mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Based on {data.length} days of on-chain oracle data. Stay ≤{maxSafeLeverage.toFixed(1)}x for a 20% safety cushion.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
