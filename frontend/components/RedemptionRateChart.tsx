'use client';

import { useState, useEffect, useCallback } from 'react';
import { CardLoader } from '@/components/Loader';
import { getOracleData, clearOracleCache, OracleDataPoint } from '@/lib/oracleCache';

export default function RedemptionRateChart() {
  const [oraclePoints, setOraclePoints] = useState<OracleDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const oracleData = await getOracleData();
      if (oracleData.points.length < 2) {
        setError('Not enough oracle data');
        setLoading(false);
        return;
      }
      setOraclePoints(oracleData.points);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(`Failed: ${msg.slice(0, 60)}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, []);

  // ── Compute daily APR from consecutive rounds ──────────────────────────
  const aprPoints: { timestamp: number; date: string; apr: number }[] = [];
  for (let i = 1; i < oraclePoints.length; i++) {
    const prev = oraclePoints[i - 1];
    const curr = oraclePoints[i];
    const dtSec = curr.timestamp - prev.timestamp;
    if (dtSec <= 0) continue;
    const rateChange = (curr.rate - prev.rate) / prev.rate;
    const annualized = (rateChange / dtSec) * 365.25 * 86400 * 100; // APR %
    aprPoints.push({
      timestamp: curr.timestamp,
      date: new Date(curr.timestamp * 1000).toLocaleString('default', { month: 'short', year: '2-digit' }),
      apr: annualized,
    });
  }

  // Stats
  const aprs = aprPoints.map(p => p.apr);
  const avgApr = aprs.length > 0 ? aprs.reduce((a, b) => a + b, 0) / aprs.length : 0;
  const currentApr = aprs.length > 0 ? aprs[aprs.length - 1] : 0;
  const minApr = aprs.length > 0 ? Math.min(...aprs) : 0;
  const maxApr = aprs.length > 0 ? Math.max(...aprs) : 0;

  // Total growth
  const rates = oraclePoints.map(p => p.rate);
  const totalGrowth = rates.length > 1
    ? ((rates[rates.length - 1] - rates[0]) / rates[0]) * 100
    : 0;
  const totalDays = oraclePoints.length > 1
    ? (oraclePoints[oraclePoints.length - 1].timestamp - oraclePoints[0].timestamp) / 86400
    : 1;

  // ── SVG Chart ─────────────────────────────────────────────────────────
  const W = 650;
  const H = 280;
  const PAD = { top: 20, right: 15, bottom: 35, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Clamp extreme outliers for better visualization
  const p5 = [...aprs].sort((a, b) => a - b)[Math.floor(aprs.length * 0.02)] ?? 0;
  const p95 = [...aprs].sort((a, b) => a - b)[Math.floor(aprs.length * 0.98)] ?? 10;
  const yMin = Math.max(0, p5 - (p95 - p5) * 0.1);
  const yMax = p95 + (p95 - p5) * 0.1;

  const toX = (i: number) => PAD.left + (i / Math.max(aprPoints.length - 1, 1)) * chartW;
  const toY = (v: number) => PAD.top + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * chartH;

  const linePath = aprPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.apr)}`)
    .join(' ');

  const areaPath = aprPoints.length > 1
    ? linePath + ` L ${toX(aprPoints.length - 1)} ${toY(yMin)} L ${toX(0)} ${toY(yMin)} Z`
    : '';

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => yMin + ((yMax - yMin) * i) / (yTickCount - 1));

  const xLabels: { idx: number; label: string }[] = [];
  if (aprPoints.length > 1) {
    const tMin = aprPoints[0].timestamp;
    const tMax = aprPoints[aprPoints.length - 1].timestamp;
    const xLabelCount = 6;
    for (let n = 0; n < xLabelCount; n++) {
      const targetTs = tMin + ((tMax - tMin) * n) / (xLabelCount - 1);
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let j = 0; j < aprPoints.length; j++) {
        const dist = Math.abs(aprPoints[j].timestamp - targetTs);
        if (dist < bestDist) { bestDist = dist; bestIdx = j; }
      }
      xLabels.push({ idx: bestIdx, label: aprPoints[bestIdx].date });
    }
  }

  // Average line
  const avgY = toY(avgApr);

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-base font-black gradient-text tracking-tight">Oracle Redemption Rate</h2>
          <p className="text-[10px] text-(--text-muted) font-mono mt-0.5">
            wstETH/stETH annualized yield derived from oracle rate changes
          </p>
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
          Each data point shows the annualized staking yield computed from the oracle rate change between consecutive rounds. This is the base yield that gets multiplied by your leverage.
        </p>
      </div>

      {loading ? (
        <CardLoader label="Loading redemption rate data" />
      ) : error ? (
        <div className="glass-inner p-8 text-center space-y-3">
          <p className="text-sm font-mono" style={{ color: 'var(--accent-secondary)' }}>{error}</p>
          <button
            onClick={() => { clearOracleCache(); fetchData(); }}
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
                <linearGradient id="aprGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00FFD1" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#00FFD1" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Y grid + labels */}
              {yTicks.map((val, i) => (
                <g key={i}>
                  <line
                    x1={PAD.left} y1={toY(val)} x2={W - PAD.right} y2={toY(val)}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="4 4"
                  />
                  <text x={PAD.left - 5} y={toY(val) + 4} textAnchor="end" fill="#64748b" fontSize="9">
                    {val.toFixed(1)}%
                  </text>
                </g>
              ))}

              {/* Average APR line */}
              <line
                x1={PAD.left} y1={avgY} x2={W - PAD.right} y2={avgY}
                stroke="#f59e0b" strokeWidth="1" strokeDasharray="6 3" opacity="0.7"
              />
              <text x={W - PAD.right - 3} y={avgY - 5} textAnchor="end" fill="#f59e0b" fontSize="9" fontWeight="bold">
                Avg {avgApr.toFixed(1)}%
              </text>

              {/* X labels */}
              {xLabels.map(({ idx, label }) => (
                <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fill="#64748b" fontSize="8">
                  {label}
                </text>
              ))}

              {/* Area + line */}
              {areaPath && <path d={areaPath} fill="url(#aprGrad)" />}
              {linePath && <path d={linePath} fill="none" stroke="#00FFD1" strokeWidth="1.5" />}

              {/* Current point */}
              {aprPoints.length > 0 && (
                <circle cx={toX(aprPoints.length - 1)} cy={toY(currentApr)} r="4" fill="#00FFD1" stroke="#05080F" strokeWidth="2" />
              )}

              <text x={PAD.left + 5} y={PAD.top + 12} fill="#00FFD1" fontSize="10" fontWeight="600" opacity="0.7">
                Annualized Yield (APR %)
              </text>
            </svg>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-1">Current APR</p>
              <p className="text-xl font-black font-mono" style={{ color: 'var(--accent-primary)' }}>{currentApr.toFixed(1)}%</p>
            </div>
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-1">Average APR</p>
              <p className="text-xl font-black font-mono" style={{ color: 'var(--accent-warning)' }}>{avgApr.toFixed(1)}%</p>
            </div>
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-1">Total Growth</p>
              <p className="text-xl font-black font-mono" style={{ color: 'var(--accent-info)' }}>+{totalGrowth.toFixed(2)}%</p>
              <p className="text-[9px] font-mono text-(--text-muted)">{Math.round(totalDays)}d</p>
            </div>
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-1">APR Range</p>
              <p className="text-xl font-black font-mono" style={{ color: 'var(--text-secondary)' }}>{minApr.toFixed(1)}–{maxApr.toFixed(1)}%</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
