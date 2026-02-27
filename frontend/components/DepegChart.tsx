'use client';

import { useState, useEffect, useCallback } from 'react';
import { CardLoader } from '@/components/Loader';
import { getHistoricalPrices, clearPriceCache } from '@/lib/priceCache';

interface DepegPoint {
  date: string;
  timestamp: number;
  intrinsic: number;
  market: number;
  depegPct: number;
}

const DEFAULT_LLTV = 0.81;
const SAFETY_BUFFER = 0.20;

function maxDepegAtLeverage(leverage: number, lltv: number): number {
  if (leverage <= 1) return 100;
  const initialLtv = (leverage - 1) / leverage;
  return (1 - initialLtv / lltv) * 100;
}

function maxLeverageFromDepeg(maxDepegPct: number, safetyBuffer: number, lltv: number): number {
  const safeThreshold = (maxDepegPct / 100) * (1 + safetyBuffer);
  const denom = 1 - lltv * (1 - safeThreshold);
  if (denom <= 0) return 1 / (1 - lltv);
  return 1 / denom;
}

interface DepegChartProps {
  reserveInfo: { liquidationThreshold: number; maxLeverage: number } | null;
  exchangeRate: number;
}

export default function DepegChart({ reserveInfo, exchangeRate }: DepegChartProps) {
  const [data, setData] = useState<DepegPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [cacheAgeMin, setCacheAgeMin] = useState(0);

  const lltv = reserveInfo?.liquidationThreshold
    ? reserveInfo.liquidationThreshold / 100
    : DEFAULT_LLTV;

  // On-chain stEthPerToken — the true intrinsic exchange rate (today)
  const currentIntrinsic = exchangeRate || 1.2265;

  const fetchDepegData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const priceData = await getHistoricalPrices();
      setFromCache(priceData.fromCache);
      setCacheAgeMin(Math.round(priceData.cacheAgeMs / 60000));

      const { wstethPrices, ethPrices, stethPrices } = priceData;

      // Build lookup maps by date
      const ethPriceMap = new Map<string, number>();
      for (const [ts, price] of ethPrices) {
        ethPriceMap.set(new Date(ts).toISOString().split('T')[0], price);
      }
      const stethPriceMap = new Map<string, number>();
      for (const [ts, price] of stethPrices) {
        stethPriceMap.set(new Date(ts).toISOString().split('T')[0], price);
      }

      const points: DepegPoint[] = [];
      const todayKey = new Date().toISOString().split('T')[0];

      for (const [ts, wstethUsd] of wstethPrices) {
        const dateKey = new Date(ts).toISOString().split('T')[0];
        const ethUsd = ethPriceMap.get(dateKey);
        const stethUsd = stethPriceMap.get(dateKey);
        if (!ethUsd || ethUsd === 0 || !stethUsd || stethUsd === 0) continue;

        const marketRatio = wstethUsd / ethUsd;
        // Historical intrinsic from DeFiLlama wstETH/stETH (tracks on-chain rate via arb)
        // Today's point uses the actual on-chain exchange rate
        const intrinsicRatio = dateKey === todayKey
          ? currentIntrinsic
          : wstethUsd / stethUsd;
        const depegPct = ((marketRatio - intrinsicRatio) / intrinsicRatio) * 100;

        const dateStr = new Date(ts).toLocaleString('default', { month: 'short', day: 'numeric' });
        points.push({ date: dateStr, timestamp: ts, intrinsic: intrinsicRatio, market: marketRatio, depegPct });
      }

      if (points.length > 0) {
        setData(points);
      } else {
        setError('Could not compute depeg data');
      }
    } catch (err: any) {
      setError(err.message?.includes('rate limit') || err.message?.includes('429')
        ? 'DeFiLlama rate limited — showing cached data if available'
        : `Failed: ${err.message?.slice(0, 60) || 'unknown'}`);
    }
    setLoading(false);
  }, [currentIntrinsic]);

  useEffect(() => { fetchDepegData(); }, []); // fetch once on mount

  const handleForceRefresh = () => {
    clearPriceCache();
    fetchDepegData();
  };

  // ── Statistics ────────────────────────────────────────────────────────────
  const depegValues = data.map(d => d.depegPct);
  const absDepegValues = depegValues.map(v => Math.abs(v));
  const maxHistoricalDepeg = absDepegValues.length > 0 ? Math.max(...absDepegValues) : 0;
  const currentDepeg = data.length > 0 ? data[data.length - 1].depegPct : 0;

  const calculatedMaxLeverage = maxLeverageFromDepeg(maxHistoricalDepeg, SAFETY_BUFFER, lltv);
  const contractMaxLeverage = reserveInfo?.maxLeverage || 1 / (1 - lltv);
  const maxSafeLeverage = Math.min(calculatedMaxLeverage, contractMaxLeverage);

  const allLeverageLevels = [
    { label: '2x',  leverage: 2,  color: '#00FF88' },
    { label: '4x',  leverage: 4,  color: '#84cc16' },
    { label: '6x',  leverage: 6,  color: '#f59e0b' },
    { label: '8x',  leverage: 8,  color: '#f97316' },
    { label: '10x', leverage: 10, color: '#ef4444' },
    { label: '15x', leverage: 15, color: '#FF3366' },
  ];
  const leverageLevels = allLeverageLevels.filter(l => l.leverage <= contractMaxLeverage);

  // ── SVG Chart ─────────────────────────────────────────────────────────────
  const W = 650;
  const H = 300;
  const PAD = { top: 25, right: 60, bottom: 35, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const dataMax = depegValues.length > 0 ? Math.max(...depegValues) : 1;
  const dataMin = depegValues.length > 0 ? Math.min(...depegValues) : -1;
  const dataRange = Math.max(Math.abs(dataMax), Math.abs(dataMin), 0.5);
  const nearestLiq = leverageLevels
    .map(l => maxDepegAtLeverage(l.leverage, lltv))
    .filter(v => v < 50)
    .sort((a, b) => a - b)[0] || 50;
  const maxY = nearestLiq < dataRange * 3
    ? Math.max(dataRange * 1.5, nearestLiq * 1.1)
    : dataRange * 2.5;

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

  const getRiskLevel = () => {
    const buffer = maxHistoricalDepeg * (1 + SAFETY_BUFFER);
    if (buffer < 2) return { level: 'LOW', color: '#10b981', text: 'Historically very stable' };
    if (buffer < 5) return { level: 'MODERATE', color: '#f59e0b', text: 'Some volatility observed' };
    return { level: 'HIGH', color: '#ef4444', text: 'Significant price swings detected' };
  };
  const riskLevel = getRiskLevel();

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-base font-black gradient-text tracking-tight">Risk Analysis</h2>
          <p className="text-[10px] text-(--text-muted) font-mono mt-0.5">
            {riskLevel.text}. Depeg % relative to on-chain stEthPerToken ({currentIntrinsic.toFixed(4)}).
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
          {!loading && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono font-bold"
              style={{
                background: fromCache ? 'rgba(245,158,11,0.1)' : 'rgba(0,255,136,0.1)',
                border: `1px solid ${fromCache ? 'rgba(245,158,11,0.2)' : 'rgba(0,255,136,0.2)'}`,
                color: fromCache ? 'var(--accent-warning)' : 'var(--accent-primary)',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: fromCache ? 'var(--accent-warning)' : 'var(--accent-primary)' }}
              />
              {fromCache ? `CACHED · ${cacheAgeMin}m ago` : `LIVE · ${data.length}d`}
            </div>
          )}
          <button
            onClick={handleForceRefresh}
            disabled={loading}
            title="Force refresh from DeFiLlama"
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

      {/* Info box */}
      <div
        className="rounded-xl p-3 mb-4 flex items-start gap-2.5"
        style={{ background: 'rgba(0,194,255,0.05)', border: '1px solid rgba(0,194,255,0.15)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" style={{ color: 'var(--accent-info)' }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p className="text-[10px] leading-relaxed font-mono" style={{ color: 'var(--text-secondary)' }}>
          Tracks how wstETH market price deviates from its fair (intrinsic) value. Larger negative deviations put leveraged positions closer to liquidation.
        </p>
      </div>

      {loading ? (
        <CardLoader label="Analyzing risk data" />
      ) : error ? (
        <div className="glass-inner p-8 text-center space-y-3">
          <p className="text-sm font-mono" style={{ color: 'var(--accent-secondary)' }}>{error}</p>
          <button
            onClick={handleForceRefresh}
            className="text-xs font-mono underline transition-opacity hover:opacity-70"
            style={{ color: 'var(--accent-info)' }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="glass-inner p-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="premiumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00FF88" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#00FF88" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="discountGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#FF3366" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#FF3366" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {yTicks.map((val, i) => (
                <g key={i}>
                  <line
                    x1={PAD.left} y1={toY(val)} x2={W - PAD.right} y2={toY(val)}
                    stroke={val === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}
                    strokeWidth={val === 0 ? '1' : '0.5'}
                    strokeDasharray={val === 0 ? '' : '4 4'}
                  />
                  <text x={PAD.left - 5} y={toY(val) + 4} textAnchor="end" fill="#64748b" fontSize="9">
                    {val > 0 ? '+' : ''}{val.toFixed(1)}%
                  </text>
                </g>
              ))}

              {leverageLevels.map((level) => {
                const threshold = maxDepegAtLeverage(level.leverage, lltv);
                const clampedY = threshold > maxY ? PAD.top + chartH - 2 : toY(-threshold);
                const isOffChart = threshold > maxY;
                return (
                  <g key={level.label}>
                    {!isOffChart && (
                      <line
                        x1={PAD.left} y1={clampedY} x2={W - PAD.right} y2={clampedY}
                        stroke={level.color} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.6"
                      />
                    )}
                    <text x={W - PAD.right + 4} y={clampedY + 3} fill={level.color} fontSize="9" fontWeight="bold" opacity={isOffChart ? 0.4 : 1}>
                      {level.label} liq
                    </text>
                    <text x={W - PAD.right + 4} y={clampedY + 13} fill="#64748b" fontSize="8">
                      -{threshold.toFixed(1)}%
                    </text>
                  </g>
                );
              })}

              {data.filter((_, i) => i % Math.max(Math.floor(data.length / 6), 1) === 0).map((d) => {
                const idx = data.indexOf(d);
                return (
                  <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fill="#64748b" fontSize="8">
                    {d.date}
                  </text>
                );
              })}

              {premiumFill && <path d={premiumFill} fill="url(#premiumGrad)" />}
              {discountFill && <path d={discountFill} fill="url(#discountGrad)" />}

              {depegPath && <path d={depegPath} fill="none" stroke="#8b5cf6" strokeWidth="2" />}

              {data.length > 0 && (() => {
                const negativeDepegs = depegValues.filter(v => v < 0);
                if (negativeDepegs.length > 0) {
                  const worstDiscount = Math.min(...negativeDepegs);
                  const worstIdx = depegValues.indexOf(worstDiscount);
                  if (worstIdx >= 0 && worstIdx < data.length) {
                    return (
                      <>
                        <circle cx={toX(worstIdx)} cy={toY(data[worstIdx].depegPct)} r="6" fill="#FF3366" stroke="#05080F" strokeWidth="2" />
                        <text x={toX(worstIdx)} y={toY(data[worstIdx].depegPct) + 20} textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="bold">
                          Worst: {data[worstIdx].depegPct.toFixed(2)}%
                        </text>
                      </>
                    );
                  }
                }
                return null;
              })()}

              {data.length > 0 && (
                <circle cx={toX(data.length - 1)} cy={toY(currentDepeg)} r="4" fill="#8b5cf6" stroke="#05080F" strokeWidth="2" />
              )}

              <text x={PAD.left + 5} y={PAD.top + 12} fill="#00FF88" fontSize="10" fontWeight="600" opacity="0.7">
                Safe Zone (Above Fair Value)
              </text>
              <text x={PAD.left + 5} y={H - PAD.bottom - 5} fill="#FF3366" fontSize="10" fontWeight="600" opacity="0.7">
                Risk Zone (Below Fair Value)
              </text>
            </svg>

            {/* Legend */}
            <div className="mt-4 space-y-3">
              <div className="glass-inner p-3">
                <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">How to Read</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 rounded bg-[#8b5cf6]" />
                    <span className="text-[10px] font-mono" style={{ color: '#a78bfa' }}>Purple line = Depeg % over time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(to bottom, #00FF88 40%, transparent)' }} />
                    <span className="text-[10px] font-mono" style={{ color: '#00FF88' }}>Green area = above fair value (good)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(to top, #FF3366 40%, transparent)' }} />
                    <span className="text-[10px] font-mono" style={{ color: '#FF3366' }}>Red area = below fair value (liquidation risk)</span>
                  </div>
                </div>
              </div>

              <div className="glass-inner p-3">
                <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Liquidation Lines</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {leverageLevels.map(level => {
                    const threshold = maxDepegAtLeverage(level.leverage, lltv);
                    const impossible = threshold <= 0;
                    return (
                      <div key={level.label} className="flex items-center gap-1.5">
                        <div className="w-3 h-0.5 rounded" style={{ background: level.color }} />
                        <span className="text-[10px] font-mono font-bold" style={{ color: level.color, opacity: impossible ? 0.4 : 1 }}>
                          {level.label} → {impossible ? 'n/a' : `-${threshold.toFixed(1)}%`}
                        </span>
                      </div>
                    );
                  })}
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
                <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold">Current Depeg</p>
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold"
                  style={{
                    background: currentDepeg >= 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                    color: currentDepeg >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                  }}
                >
                  {currentDepeg >= 0 ? 'Above Fair' : 'Below Fair'}
                </span>
              </div>
              <p className="text-3xl font-black font-mono mb-1" style={{ color: currentDepeg >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                {currentDepeg >= 0 ? '+' : ''}{currentDepeg.toFixed(2)}%
              </p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {currentDepeg >= 0
                  ? 'wstETH trading above intrinsic — good for holders'
                  : 'wstETH trading below intrinsic — liquidation risk elevated'}
              </p>
            </div>

            <div className="glass-inner p-4">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-3">Safety Analysis</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-(--text-muted)">Historical Volatility</span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--accent-secondary)' }}>{maxHistoricalDepeg.toFixed(2)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-(--text-muted)">Safety Buffer (20%)</span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--accent-warning)' }}>
                    +{(maxHistoricalDepeg * SAFETY_BUFFER).toFixed(2)}%
                  </span>
                </div>
                <div className="divider" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-(--text-secondary)">Recommended Max</span>
                  <span className="text-lg font-black font-mono" style={{ color: 'var(--accent-info)' }}>{maxSafeLeverage.toFixed(1)}×</span>
                </div>
              </div>
              <p className="text-[10px] font-mono mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Based on {data.length} days of data — staying ≤{maxSafeLeverage.toFixed(1)}× provides a 20% safety cushion.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
