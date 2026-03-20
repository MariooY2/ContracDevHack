'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CardLoader } from '@/components/Loader';
import { getOracleDataByAddress, clearOracleCacheForAddress, OracleDataPoint } from '@/lib/oracleDataCache';
import { getOracleForCollateral } from '@/lib/oracleMap';

const DEFAULT_LLTV = 0.81;
const SAFETY_BUFFER = 0.20;

const TIME_RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
] as const;

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

/** LTTB (Largest Triangle Three Buckets) downsampling */
function lttbDownsample(data: OracleDataPoint[], threshold: number): OracleDataPoint[] {
  const len = data.length;
  if (threshold >= len || threshold <= 2) return data;

  const sampled: OracleDataPoint[] = [data[0]];
  const bucketSize = (len - 2) / (threshold - 2);
  let prevIdx = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const currStart = Math.floor(i * bucketSize) + 1;
    const currEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, len - 1);
    const nextStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, len - 1);

    let avgT = 0, avgR = 0;
    const nextLen = nextEnd - nextStart || 1;
    for (let j = nextStart; j < nextEnd; j++) { avgT += data[j].timestamp; avgR += data[j].rate; }
    avgT /= nextLen;
    avgR /= nextLen;

    const pT = data[prevIdx].timestamp;
    const pR = data[prevIdx].rate;
    let maxArea = -1, bestIdx = currStart;
    for (let j = currStart; j < currEnd; j++) {
      const area = Math.abs((pT - avgT) * (data[j].rate - pR) - (pT - data[j].timestamp) * (avgR - pR));
      if (area > maxArea) { maxArea = area; bestIdx = j; }
    }
    sampled.push(data[bestIdx]);
    prevIdx = bestIdx;
  }

  sampled.push(data[len - 1]);
  return sampled;
}

// Target points per time range — shorter ranges need fewer points
const LTTB_TARGETS: Record<string, number> = {
  '1M': 200,
  '3M': 400,
  '6M': 600,
  '1Y': 800,
  'All': 1000,
};

interface DepegChartProps {
  reserveInfo: { liquidationThreshold: number; maxLeverage: number } | null;
  collateralSymbol?: string;
  chainSlug?: string;
  oracleAddress?: string | null;
}

export default function DepegChart({ reserveInfo, collateralSymbol = 'wstETH', chainSlug, oracleAddress }: DepegChartProps) {
  // Try mapped oracle first, fall back to Morpho's oracleAddress as chainlink on this chain
  const mappedOracle = getOracleForCollateral(collateralSymbol, chainSlug);
  const oracle = mappedOracle || (oracleAddress ? {
    address: oracleAddress,
    pair: `${collateralSymbol}/ETH`,
    type: 'chainlink' as const,
    chainSlug: chainSlug || 'base',
    chainId: chainSlug === 'ethereum' ? 1 : chainSlug === 'arbitrum' ? 42161 : chainSlug === 'polygon' ? 137 : 8453,
  } : null);
  const [allPoints, setAllPoints] = useState<OracleDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [cacheAgeMin, setCacheAgeMin] = useState(0);
  const [timeRange, setTimeRange] = useState<string>('All');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const oraclePoints = useMemo(() => {
    let pts = allPoints;
    const range = TIME_RANGES.find(r => r.label === timeRange);
    if (range && range.days > 0 && pts.length > 0) {
      // Use the latest data point's timestamp as anchor (not Date.now())
      // so time ranges work correctly even when data isn't real-time
      const latestTs = pts[pts.length - 1].timestamp;
      const cutoff = latestTs - range.days * 86400;
      const filtered = pts.filter(p => p.timestamp >= cutoff);
      if (filtered.length >= 2) pts = filtered;
    }
    const target = LTTB_TARGETS[timeRange] || 1000;
    return pts.length > target ? lttbDownsample(pts, target) : pts;
  }, [allPoints, timeRange]);

  const lltv = reserveInfo?.liquidationThreshold
    ? reserveInfo.liquidationThreshold / 100
    : DEFAULT_LLTV;

  // Use latest oracle data point as current rate (not the wstETH exchange rate prop)
  const currentRate = oraclePoints.length > 0
    ? oraclePoints[oraclePoints.length - 1].rate
    : 1.0;

  const fetchData = useCallback(async () => {
    if (!oracle) {
      setError('no-oracle');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const oracleData = await getOracleDataByAddress(oracle.address, false, oracle.chainSlug);
      setFromCache(oracleData.fromCache);
      setCacheAgeMin(Math.round(oracleData.cacheAgeMs / 60000));
      if (oracleData.points.length < 2) {
        setError('Not enough oracle data');
        setLoading(false);
        return;
      }
      setAllPoints(oracleData.points);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(`Failed: ${msg.slice(0, 60)}`);
    }
    setLoading(false);
  }, [oracle, collateralSymbol]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleForceRefresh = async () => {
    if (!oracle) return;
    clearOracleCacheForAddress(oracle.address, oracle.chainSlug);
    setLoading(true);
    try {
      const oracleData = await getOracleDataByAddress(oracle.address, true, oracle.chainSlug);
      setFromCache(oracleData.fromCache);
      setCacheAgeMin(Math.round(oracleData.cacheAgeMs / 60000));
      if (oracleData.points.length >= 2) {
        setAllPoints(oracleData.points);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(`Failed: ${msg.slice(0, 60)}`);
    }
    setLoading(false);
  };

  // ── Compute depeg stats ─────────────────────────────────────────────────
  // Max drawdown: largest % drop from any peak to a subsequent trough
  let maxHistoricalDepeg = 0;
  let worstDrawdownPeakIdx = -1;
  let worstDrawdownTroughIdx = -1;
  let peakRate = oraclePoints.length > 0 ? oraclePoints[0].rate : 0;
  let peakIdx = 0;
  for (let i = 1; i < oraclePoints.length; i++) {
    if (oraclePoints[i].rate > peakRate) {
      peakRate = oraclePoints[i].rate;
      peakIdx = i;
    }
    const drawdown = ((peakRate - oraclePoints[i].rate) / peakRate) * 100;
    if (drawdown > maxHistoricalDepeg) {
      maxHistoricalDepeg = drawdown;
      worstDrawdownPeakIdx = peakIdx;
      worstDrawdownTroughIdx = i;
    }
  }

  // Round-to-round changes (for latest change display)
  const roundChanges: number[] = [];
  for (let i = 1; i < oraclePoints.length; i++) {
    const pct = ((oraclePoints[i].rate - oraclePoints[i - 1].rate) / oraclePoints[i - 1].rate) * 100;
    roundChanges.push(pct);
  }
  const negativeChanges = roundChanges.filter(v => v < 0);
  const latestChange = roundChanges.length > 0 ? roundChanges[roundChanges.length - 1] : 0;

  const calculatedMaxLeverage = maxLeverageFromDepeg(maxHistoricalDepeg, SAFETY_BUFFER, lltv);
  const contractMaxLeverage = reserveInfo?.maxLeverage || 1 / (1 - lltv);
  const maxSafeLeverage = Math.min(calculatedMaxLeverage, contractMaxLeverage);

  const allLeverageLevels = [
    { label: '2x',  leverage: 2,  color: '#2973ff' },
    { label: '4x',  leverage: 4,  color: '#84cc16' },
    { label: '6x',  leverage: 6,  color: '#f59e0b' },
    { label: '8x',  leverage: 8,  color: '#f97316' },
    { label: '10x', leverage: 10, color: '#ef4444' },
    { label: '15x', leverage: 15, color: '#ef4444' },
  ];
  const leverageLevels = allLeverageLevels.filter(l => l.leverage <= contractMaxLeverage);

  // ── SVG Chart: Oracle Rate Over Time ───────────────────────────────────
  const W = 650;
  const H = 300;
  const PAD = { top: 20, right: 55, bottom: 35, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Memoize expensive chart calculations
  const chartData = useMemo(() => {
    const rates = oraclePoints.map(p => p.rate);
    const rateMin = rates.length > 0 ? Math.min(...rates) : 0.99;
    const rateMax = rates.length > 0 ? Math.max(...rates) : 1.01;
    const rateRange = rateMax - rateMin || 0.01;
    const yMin = rateMin - rateRange * 0.05;
    const yMax = rateMax + rateRange * 0.05;

    // Use timestamp-based X positioning (proportional to time, not index)
    const tMin = oraclePoints.length > 0 ? oraclePoints[0].timestamp : 0;
    const tMax = oraclePoints.length > 0 ? oraclePoints[oraclePoints.length - 1].timestamp : 1;
    const tRange = tMax - tMin || 1;

    const _toXByTs = (ts: number) => PAD.left + ((ts - tMin) / tRange) * chartW;
    const _toY = (rate: number) => PAD.top + (1 - (rate - yMin) / (yMax - yMin)) * chartH;

    const ratePath = oraclePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${_toXByTs(p.timestamp)} ${_toY(p.rate)}`)
      .join(' ');

    const areaPath = oraclePoints.length > 1
      ? ratePath + ` L ${_toXByTs(tMax)} ${_toY(yMin)} L ${_toXByTs(tMin)} ${_toY(yMin)} Z`
      : '';

    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount }, (_, i) => yMin + ((yMax - yMin) * i) / (yTickCount - 1));

    const xLabels: { ts: number; label: string }[] = [];
    if (oraclePoints.length > 1) {
      const xLabelCount = 6;
      for (let n = 0; n < xLabelCount; n++) {
        const targetTs = tMin + (tRange * n) / (xLabelCount - 1);
        const d = new Date(targetTs * 1000);
        xLabels.push({
          ts: targetTs,
          label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
        });
      }
    }

    const totalGrowth = rates.length > 1
      ? ((rates[rates.length - 1] - rates[0]) / rates[0]) * 100
      : 0;

    return { rates, yMin, yMax, tMin, tRange, ratePath, areaPath, yTicks, xLabels, totalGrowth };
  }, [oraclePoints, PAD.left, PAD.top, chartW, chartH]);

  const { yMin, yMax, tMin, tRange, ratePath, areaPath, yTicks, xLabels, totalGrowth } = chartData;

  // Timestamp-based X positioning
  const toXByTs = (ts: number) => PAD.left + ((ts - tMin) / tRange) * chartW;
  const toX = (i: number) => oraclePoints[i] ? toXByTs(oraclePoints[i].timestamp) : PAD.left;
  const toY = (rate: number) => PAD.top + (1 - (rate - yMin) / (yMax - yMin)) * chartH;

  // Liquidation rate lines: if rate drops by X% from current, you get liquidated
  const liqLines = leverageLevels.map(level => {
    const threshold = maxDepegAtLeverage(level.leverage, lltv);
    const liqRate = currentRate * (1 - threshold / 100);
    return { ...level, threshold, liqRate };
  }).filter(l => l.liqRate >= yMin && l.liqRate <= yMax);

  // Worst dip = trough of the max drawdown
  const worstDipIdx = worstDrawdownTroughIdx;

  const getRiskLevel = () => {
    if (maxHistoricalDepeg === 0) return { level: 'VERY LOW', color: '#10b981', text: 'No depeg events recorded' };
    const buffer = maxHistoricalDepeg * (1 + SAFETY_BUFFER);
    if (buffer < 0.5) return { level: 'LOW', color: '#10b981', text: 'Historically very stable' };
    if (buffer < 2) return { level: 'MODERATE', color: '#f59e0b', text: 'Some volatility observed' };
    return { level: 'HIGH', color: '#ef4444', text: 'Significant price swings detected' };
  };
  const riskLevel = getRiskLevel();

  // ── Crosshair hover handler ─────────────────────────────────────────
  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || oraclePoints.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    // Map mouseX to timestamp, then find closest data point
    const hoverTs = tMin + ((mouseX - PAD.left) / chartW) * tRange;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let j = 0; j < oraclePoints.length; j++) {
      const dist = Math.abs(oraclePoints[j].timestamp - hoverTs);
      if (dist < bestDist) { bestDist = dist; bestIdx = j; }
    }
    setHoverIdx(bestIdx);
  }, [oraclePoints, W, PAD.left, chartW, tMin, tRange]);

  const handleSvgMouseLeave = useCallback(() => setHoverIdx(null), []);

  // Hovered point data
  const hoveredPoint = hoverIdx !== null ? oraclePoints[hoverIdx] : null;
  const hoveredDate = hoveredPoint ? new Date(hoveredPoint.timestamp * 1000) : null;
  const hoveredDepeg = hoveredPoint && currentRate > 0
    ? ((currentRate - hoveredPoint.rate) / currentRate) * 100
    : 0;

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-base font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Risk Analysis</h2>
          <p className="text-[10px] text-(--text-muted) font-mono mt-0.5">
            {riskLevel.text}. Oracle {oracle?.pair || collateralSymbol} rate across {oraclePoints.length} rounds.
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
                background: fromCache ? 'rgba(245,158,11,0.1)' : 'rgba(57,166,153,0.1)',
                border: `1px solid ${fromCache ? 'rgba(245,158,11,0.2)' : 'rgba(57,166,153,0.2)'}`,
                color: fromCache ? 'var(--accent-warning)' : 'var(--accent-primary)',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: fromCache ? 'var(--accent-warning)' : 'var(--accent-primary)' }}
              />
              {fromCache ? `CACHED · ${cacheAgeMin}m ago` : `LIVE · ${oraclePoints.length} rounds`}
            </div>
          )}
          <button
            onClick={handleForceRefresh}
            disabled={loading}
            title="Force refresh from Dune"
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
        style={{ background: 'rgba(41,115,255,0.05)', border: '1px solid rgba(41,115,255,0.15)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" style={{ color: 'var(--accent-info)' }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p className="text-[10px] leading-relaxed font-mono" style={{ color: 'var(--text-secondary)' }}>
          Shows the on-chain {oracle?.pair || collateralSymbol} oracle exchange rate over time. The rate should only go up as staking rewards accrue. Any dip = depeg event. Dashed lines show where each leverage level would be liquidated.
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
                background: timeRange === r.label ? 'rgba(41,115,255,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${timeRange === r.label ? 'rgba(41,115,255,0.3)' : 'var(--border)'}`,
                color: timeRange === r.label ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <CardLoader label="Fetching oracle data" variant="oracle" />
      ) : error === 'no-oracle' ? (
        <div className="glass-inner p-8 text-center space-y-2">
          <p className="text-sm font-sans" style={{ color: 'var(--text-muted)' }}>
            Oracle rate chart not available for {collateralSymbol} on this chain.
          </p>
          <p className="text-xs font-sans" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            Switch to the Yield Curve tab above to see leverage analytics.
          </p>
        </div>
      ) : error ? (
        <div className="glass-inner p-8 text-center space-y-3">
          <p className="text-sm font-sans" style={{ color: 'var(--text-muted)' }}>
            Could not load oracle data for {collateralSymbol}.
          </p>
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
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={handleSvgMouseMove}
              onMouseLeave={handleSvgMouseLeave}
              style={{ cursor: hoverIdx !== null ? 'crosshair' : 'default' }}
            >
              <defs>
                <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
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
                    {val.toFixed(3)}
                  </text>
                </g>
              ))}

              {/* Liquidation rate lines */}
              {liqLines.map((level) => (
                <g key={level.label}>
                  <line
                    x1={PAD.left} y1={toY(level.liqRate)} x2={W - PAD.right} y2={toY(level.liqRate)}
                    stroke={level.color} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.5"
                  />
                  <text x={W - PAD.right + 4} y={toY(level.liqRate) + 3} fill={level.color} fontSize="9" fontWeight="bold">
                    {level.label} liq
                  </text>
                  <text x={W - PAD.right + 4} y={toY(level.liqRate) + 13} fill="#64748b" fontSize="8">
                    {level.liqRate.toFixed(3)}
                  </text>
                </g>
              ))}

              {/* X-axis date labels */}
              {xLabels.map(({ ts, label }, i) => (
                <text key={i} x={toXByTs(ts)} y={H - 5} textAnchor="middle" fill="#64748b" fontSize="8">
                  {label}
                </text>
              ))}

              {/* Area fill under line */}
              {areaPath && <path d={areaPath} fill="url(#rateGrad)" />}

              {/* Rate line */}
              {ratePath && <path d={ratePath} fill="none" stroke="#8b5cf6" strokeWidth="2" />}

              {/* Worst drawdown marker */}
              {worstDipIdx > 0 && maxHistoricalDepeg > 0 && (
                <>
                  <circle cx={toX(worstDipIdx)} cy={toY(oraclePoints[worstDipIdx].rate)} r="5" fill="#ef4444" stroke="#05080F" strokeWidth="2" />
                  <text x={toX(worstDipIdx)} y={toY(oraclePoints[worstDipIdx].rate) - 10} textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">
                    Max drawdown: -{maxHistoricalDepeg.toFixed(4)}%
                  </text>
                </>
              )}

              {/* Current rate marker */}
              {oraclePoints.length > 0 && (
                <>
                  <circle cx={toX(oraclePoints.length - 1)} cy={toY(oraclePoints[oraclePoints.length - 1].rate)} r="4" fill="#2973ff" stroke="#05080F" strokeWidth="2" />
                  <text x={toX(oraclePoints.length - 1) - 5} y={toY(oraclePoints[oraclePoints.length - 1].rate) - 10} textAnchor="end" fill="#2973ff" fontSize="9" fontWeight="bold">
                    {oraclePoints[oraclePoints.length - 1].rate.toFixed(4)}
                  </text>
                </>
              )}

              {/* Crosshair + tooltip on hover */}
              {hoverIdx !== null && hoveredPoint && (
                <g>
                  {/* Vertical crosshair line */}
                  <line
                    x1={toX(hoverIdx)} y1={PAD.top}
                    x2={toX(hoverIdx)} y2={H - PAD.bottom}
                    stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 3"
                  />
                  {/* Horizontal reference line */}
                  <line
                    x1={PAD.left} y1={toY(hoveredPoint.rate)}
                    x2={toX(hoverIdx)} y2={toY(hoveredPoint.rate)}
                    stroke="rgba(167,139,250,0.3)" strokeWidth="1" strokeDasharray="3 3"
                  />
                  {/* Highlighted dot */}
                  <circle
                    cx={toX(hoverIdx)} cy={toY(hoveredPoint.rate)}
                    r="5" fill="#a78bfa" stroke="#030711" strokeWidth="2"
                  />
                  {/* Tooltip background */}
                  {(() => {
                    const tx = toX(hoverIdx);
                    const ty = toY(hoveredPoint.rate);
                    const tooltipW = 155;
                    const tooltipH = 58;
                    const flipX = tx + tooltipW + 15 > W - PAD.right;
                    const tooltipX = flipX ? tx - tooltipW - 12 : tx + 12;
                    const flipY = ty - tooltipH / 2 < PAD.top;
                    const tooltipY = flipY ? ty + 8 : ty - tooltipH / 2;
                    return (
                      <g>
                        <rect
                          x={tooltipX} y={tooltipY}
                          width={tooltipW} height={tooltipH}
                          rx="8" ry="8"
                          fill="rgba(10,15,31,0.92)" stroke="rgba(167,139,250,0.3)" strokeWidth="1"
                        />
                        <text x={tooltipX + 10} y={tooltipY + 15} fill="#a78bfa" fontSize="9" fontWeight="bold">
                          {hoveredDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </text>
                        <text x={tooltipX + 10} y={tooltipY + 30} fill="#E8EDF5" fontSize="10" fontWeight="bold">
                          Rate: {hoveredPoint.rate.toFixed(5)}
                        </text>
                        <text x={tooltipX + 10} y={tooltipY + 45} fill={hoveredDepeg > 0 ? '#ef4444' : '#2973ff'} fontSize="9">
                          {hoveredDepeg > 0 ? `${hoveredDepeg.toFixed(4)}% below current` : 'At or above current'}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* Axis label */}
              <text x={PAD.left + 5} y={PAD.top + 12} fill="#a78bfa" fontSize="10" fontWeight="600" opacity="0.7">
                {oracle?.pair || collateralSymbol} Exchange Rate
              </text>

              {/* Invisible rect to capture mouse events across entire chart area */}
              <rect
                x={PAD.left} y={PAD.top}
                width={chartW} height={chartH}
                fill="transparent"
              />
            </svg>

            {/* Legend */}
            <div className="mt-4 space-y-3">
              <div className="glass-inner p-3">
                <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">How to Read</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 rounded bg-[#8b5cf6]" />
                    <span className="text-[10px] font-mono" style={{ color: '#a78bfa' }}>Purple line = Oracle exchange rate over time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#2973ff]" />
                    <span className="text-[10px] font-mono" style={{ color: '#2973ff' }}>Green dot = Current rate ({currentRate.toFixed(4)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 rounded bg-[#f59e0b]" style={{ borderTop: '1px dashed #f59e0b' }} />
                    <span className="text-[10px] font-mono" style={{ color: '#f59e0b' }}>Dashed lines = Liquidation rates per leverage</span>
                  </div>
                </div>
              </div>

              <div className="glass-inner p-3">
                <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Liquidation Lines</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {leverageLevels.map(level => {
                    const threshold = maxDepegAtLeverage(level.leverage, lltv);
                    const liqRate = currentRate * (1 - threshold / 100);
                    return (
                      <div key={level.label} className="flex items-center gap-1.5">
                        <div className="w-3 h-0.5 rounded" style={{ background: level.color }} />
                        <span className="text-[10px] font-mono font-bold" style={{ color: level.color }}>
                          {level.label} → {liqRate.toFixed(3)} (-{threshold.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="glass-inner p-4" style={{ borderColor: 'rgba(41,115,255,0.3)', borderWidth: '1px', borderStyle: 'solid' }}>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Current Rate</p>
              <p className="text-2xl font-black font-mono" style={{ color: 'var(--accent-primary)' }}>
                {currentRate.toFixed(4)}
              </p>
              <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                +{totalGrowth.toFixed(2)}% total growth
              </p>
            </div>

            <div className="glass-inner p-4" style={{ borderColor: latestChange >= 0 ? 'rgba(41,115,255,0.3)' : 'rgba(239,68,68,0.3)', borderWidth: '1px', borderStyle: 'solid' }}>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Latest Round Change</p>
              <p className="text-2xl font-black font-mono" style={{ color: latestChange >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                {latestChange >= 0 ? '+' : ''}{latestChange.toFixed(4)}%
              </p>
              <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                {latestChange >= 0 ? 'Normal accrual' : 'Depeg detected'}
              </p>
            </div>

            <div className="glass-inner p-4">
              <p className="text-[9px] text-(--text-muted) uppercase tracking-[0.15em] font-mono font-bold mb-2">Safety Analysis</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-(--text-muted)">Max Drawdown</span>
                  <span className="text-sm font-black font-mono" style={{ color: maxHistoricalDepeg > 0 ? 'var(--accent-secondary)' : 'var(--accent-primary)' }}>
                    {maxHistoricalDepeg > 0 ? `-${maxHistoricalDepeg.toFixed(4)}%` : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-(--text-muted)">Depeg Events</span>
                  <span className="text-sm font-black font-mono" style={{ color: negativeChanges.length > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)' }}>
                    {negativeChanges.length}
                  </span>
                </div>
                <div className="divider" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-(--text-secondary)">Max Safe Leverage</span>
                  <span className="text-lg font-black font-mono" style={{ color: 'var(--accent-info)' }}>{maxSafeLeverage.toFixed(1)}×</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
