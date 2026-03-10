'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardLoader } from '@/components/Loader';
import { getStethData, clearStethCache, StethDataPoint } from '@/lib/stethCache';

const TIME_RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
] as const;

export default function StethDepegChart() {
  const [allPoints, setAllPoints] = useState<StethDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [cacheAgeMin, setCacheAgeMin] = useState(0);
  const [timeRange, setTimeRange] = useState<string>('All');

  const points = useMemo(() => {
    const range = TIME_RANGES.find(r => r.label === timeRange);
    if (!range || range.days === 0 || allPoints.length === 0) return allPoints;
    const cutoff = Math.floor(Date.now() / 1000) - range.days * 86400;
    const filtered = allPoints.filter(p => p.timestamp >= cutoff);
    return filtered.length >= 2 ? filtered : allPoints;
  }, [allPoints, timeRange]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getStethData();
      setFromCache(data.fromCache);
      setCacheAgeMin(Math.round(data.cacheAgeMs / 60000));
      if (data.points.length < 2) {
        setError('Not enough stETH/ETH data');
        setLoading(false);
        return;
      }
      setAllPoints(data.points);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(`Failed: ${msg.slice(0, 60)}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleForceRefresh = async () => {
    clearStethCache();
    setLoading(true);
    try {
      const data = await getStethData(true);
      setFromCache(data.fromCache);
      setCacheAgeMin(Math.round(data.cacheAgeMs / 60000));
      if (data.points.length >= 2) {
        setAllPoints(data.points);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(`Failed: ${msg.slice(0, 60)}`);
    }
    setLoading(false);
  };

  // ── Depeg analysis ──────────────────────────────────────────────
  const prices = points.map(p => p.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0.93;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 1.0;
  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 1.0;

  // Depeg = deviation from 1.0
  const maxDepeg = prices.length > 0 ? (1 - minPrice) * 100 : 0;
  const currentDepeg = (1 - currentPrice) * 100;
  const depegEvents = prices.filter(p => p < 0.995).length;

  // Find worst dip index
  let worstIdx = -1;
  if (prices.length > 0) {
    let worstPrice = Infinity;
    for (let i = 0; i < prices.length; i++) {
      if (prices[i] < worstPrice) {
        worstPrice = prices[i];
        worstIdx = i;
      }
    }
  }

  // ── SVG Chart ───────────────────────────────────────────────────
  const W = 650;
  const H = 300;
  const PAD = { top: 20, right: 20, bottom: 35, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const range = maxPrice - minPrice || 0.01;
  const yMin = minPrice - range * 0.05;
  const yMax = Math.max(maxPrice + range * 0.05, 1.005);

  const toX = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * chartW;
  const toY = (price: number) => PAD.top + (1 - (price - yMin) / (yMax - yMin)) * chartH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.price)}`)
    .join(' ');

  const areaPath = points.length > 1
    ? linePath + ` L ${toX(points.length - 1)} ${toY(yMin)} L ${toX(0)} ${toY(yMin)} Z`
    : '';

  // Y-axis ticks
  const yTickCount = 6;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => yMin + ((yMax - yMin) * i) / (yTickCount - 1));

  // X-axis date labels
  const xLabels: { idx: number; label: string }[] = [];
  if (points.length > 1) {
    const tMin = points[0].timestamp;
    const tMax = points[points.length - 1].timestamp;
    const xLabelCount = 6;
    for (let n = 0; n < xLabelCount; n++) {
      const targetTs = tMin + ((tMax - tMin) * n) / (xLabelCount - 1);
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let j = 0; j < points.length; j++) {
        const dist = Math.abs(points[j].timestamp - targetTs);
        if (dist < bestDist) { bestDist = dist; bestIdx = j; }
      }
      const d = new Date(points[bestIdx].timestamp * 1000);
      xLabels.push({
        idx: bestIdx,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      });
    }
  }

  // Parity line at 1.0
  const parityY = toY(1.0);
  const parityVisible = 1.0 >= yMin && 1.0 <= yMax;

  // Color based on depeg severity
  const getLineColor = () => {
    if (maxDepeg < 0.5) return '#00FFD1';
    if (maxDepeg < 5) return '#f59e0b';
    return '#ef4444';
  };
  const lineColor = getLineColor();

  const getRiskLevel = () => {
    if (maxDepeg === 0) return { level: 'PEGGED', color: '#10b981', text: 'No depeg events detected' };
    if (maxDepeg < 1) return { level: 'STABLE', color: '#10b981', text: 'Minor deviations only' };
    if (maxDepeg < 5) return { level: 'VOLATILE', color: '#f59e0b', text: 'Notable depeg events recorded' };
    return { level: 'HIGH RISK', color: '#ef4444', text: 'Severe depeg events detected' };
  };
  const riskLevel = getRiskLevel();

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-base font-black gradient-text tracking-tight">stETH/ETH Depeg History</h2>
          <p className="text-[10px] text-(--text-muted) font-mono mt-0.5">
            {riskLevel.text}. Chainlink stETH/ETH price feed across {points.length} rounds.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="px-2.5 py-1 rounded-full text-[9px] font-bold flex items-center gap-1.5 font-mono"
            style={{ background: riskLevel.color + '20', color: riskLevel.color, border: `1px solid ${riskLevel.color}30` }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: riskLevel.color }} />
            {riskLevel.level}
          </div>
          {!loading && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono font-bold"
              style={{
                background: fromCache ? 'rgba(245,158,11,0.1)' : 'rgba(0,255,209,0.1)',
                border: `1px solid ${fromCache ? 'rgba(245,158,11,0.2)' : 'rgba(0,255,209,0.2)'}`,
                color: fromCache ? 'var(--accent-warning)' : 'var(--accent-primary)',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: fromCache ? 'var(--accent-warning)' : 'var(--accent-primary)' }}
              />
              {fromCache ? `CACHED · ${cacheAgeMin}m ago` : `LIVE · ${points.length} rounds`}
            </div>
          )}
          <button
            onClick={handleForceRefresh}
            disabled={loading}
            title="Force refresh"
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
          Shows the on-chain stETH/ETH Chainlink price feed. A value of 1.0 means parity. The June 2022 depeg saw stETH drop to ~0.93 ETH during the Terra/3AC crisis. Our Morpho oracle assumes 1 stETH = 1 ETH, so this chart shows the real market risk.
        </p>
      </div>

      {/* Time range selector */}
      {!loading && !error && (
        <div className="flex items-center gap-1.5 mb-4">
          {TIME_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setTimeRange(r.label)}
              className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all"
              style={{
                background: timeRange === r.label ? 'rgba(0,255,209,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${timeRange === r.label ? 'rgba(0,255,209,0.3)' : 'var(--border)'}`,
                color: timeRange === r.label ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <CardLoader label="Fetching stETH/ETH data" />
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
                <linearGradient id="stethGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Y-axis grid + labels */}
              {yTicks.map((val, i) => (
                <g key={i}>
                  <line
                    x1={PAD.left} y1={toY(val)} x2={W - PAD.right} y2={toY(val)}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="4 4"
                  />
                  <text x={PAD.left - 5} y={toY(val) + 4} textAnchor="end" fill="#64748b" fontSize="9">
                    {val.toFixed(4)}
                  </text>
                </g>
              ))}

              {/* Parity line at 1.0 */}
              {parityVisible && (
                <g>
                  <line
                    x1={PAD.left} y1={parityY} x2={W - PAD.right} y2={parityY}
                    stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.6"
                  />
                  <text x={W - PAD.right + 4} y={parityY + 3} fill="#10b981" fontSize="9" fontWeight="bold">
                    1:1
                  </text>
                </g>
              )}

              {/* X-axis date labels */}
              {xLabels.map(({ idx, label }) => (
                <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fill="#64748b" fontSize="8">
                  {label}
                </text>
              ))}

              {/* Area fill */}
              {areaPath && <path d={areaPath} fill="url(#stethGrad)" />}

              {/* Price line */}
              {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />}

              {/* Worst depeg marker */}
              {worstIdx >= 0 && prices[worstIdx] < 0.999 && (
                <>
                  <circle cx={toX(worstIdx)} cy={toY(prices[worstIdx])} r="5" fill="#FF3366" stroke="#05080F" strokeWidth="2" />
                  <text x={toX(worstIdx)} y={toY(prices[worstIdx]) - 10} textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">
                    Worst: {prices[worstIdx].toFixed(4)}
                  </text>
                </>
              )}

              {/* Current price marker */}
              {points.length > 0 && (
                <>
                  <circle cx={toX(points.length - 1)} cy={toY(currentPrice)} r="4" fill="#00FFD1" stroke="#05080F" strokeWidth="2" />
                  <text x={toX(points.length - 1) - 5} y={toY(currentPrice) - 10} textAnchor="end" fill="#00FFD1" fontSize="9" fontWeight="bold">
                    {currentPrice.toFixed(4)}
                  </text>
                </>
              )}

              {/* Axis label */}
              <text x={PAD.left + 5} y={PAD.top + 12} fill="#00FFD1" fontSize="10" fontWeight="600" opacity="0.7">
                stETH/ETH Price
              </text>
            </svg>

            {/* Legend */}
            <div className="mt-4 glass-inner p-3">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Legend</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 rounded" style={{ background: lineColor }} />
                  <span className="text-[10px] font-mono" style={{ color: lineColor }}>stETH/ETH market price</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 rounded bg-[#10b981]" style={{ borderTop: '1px dashed #10b981' }} />
                  <span className="text-[10px] font-mono" style={{ color: '#10b981' }}>1:1 parity (no depeg)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FF3366]" />
                  <span className="text-[10px] font-mono" style={{ color: '#fca5a5' }}>Worst depeg event</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00FFD1]" />
                  <span className="text-[10px] font-mono" style={{ color: '#00FFD1' }}>Current price</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="glass-inner p-4" style={{ borderColor: currentDepeg < 0.5 ? 'rgba(0,255,209,0.3)' : 'rgba(255,51,102,0.3)', borderWidth: '1px', borderStyle: 'solid' }}>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Current Price</p>
              <p className="text-2xl font-black font-mono" style={{ color: currentDepeg < 0.5 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                {currentPrice.toFixed(4)}
              </p>
              <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                {currentDepeg < 0.1 ? 'At parity' : `${currentDepeg.toFixed(2)}% below peg`}
              </p>
            </div>

            <div className="glass-inner p-4" style={{ borderColor: maxDepeg > 5 ? 'rgba(255,51,102,0.3)' : 'rgba(245,158,11,0.3)', borderWidth: '1px', borderStyle: 'solid' }}>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Worst Depeg</p>
              <p className="text-2xl font-black font-mono" style={{ color: maxDepeg > 5 ? 'var(--accent-secondary)' : 'var(--accent-warning)' }}>
                {maxDepeg > 0 ? `-${maxDepeg.toFixed(2)}%` : 'None'}
              </p>
              <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                {minPrice.toFixed(4)} ETH per stETH
              </p>
            </div>

            <div className="glass-inner p-4">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Depeg Stats</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-(--text-muted)">Rounds below 0.995</span>
                  <span className="text-sm font-black font-mono" style={{ color: depegEvents > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)' }}>
                    {depegEvents}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-(--text-muted)">Total Rounds</span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {points.length}
                  </span>
                </div>
                <div className="divider" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-(--text-secondary)">Oracle Assumes</span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--accent-info)' }}>1:1</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
