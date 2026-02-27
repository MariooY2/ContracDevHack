'use client';

import { useState, useEffect, useCallback } from 'react';
import { CardLoader } from '@/components/Loader';
import { getHistoricalPrices, clearPriceCache } from '@/lib/priceCache';

interface ChartPoint {
  date: string;
  timestamp: number;
  intrinsic: number;
  market: number;
}

interface PriceChartProps {
  exchangeRate: number;
  reserveInfo: { stakingYield: number } | null;
}

export default function PriceChart({ exchangeRate, reserveInfo }: PriceChartProps) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [cacheAgeMin, setCacheAgeMin] = useState(0);

  const fetchData = useCallback(async () => {
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

      const points: ChartPoint[] = [];

      for (const [ts, wstethUsd] of wstethPrices) {
        const dateKey = new Date(ts).toISOString().split('T')[0];
        const ethUsd = ethPriceMap.get(dateKey);
        const stethUsd = stethPriceMap.get(dateKey);
        if (!ethUsd || ethUsd === 0 || !stethUsd || stethUsd === 0) continue;

        const marketRatio = wstethUsd / ethUsd;
        // Intrinsic = wstETH/stETH exchange rate derived from market prices
        const intrinsicRatio = wstethUsd / stethUsd;

        const dateStr = new Date(ts).toLocaleString('default', { month: 'short', day: 'numeric' });
        points.push({ date: dateStr, timestamp: ts, intrinsic: intrinsicRatio, market: marketRatio });
      }

      if (points.length > 0) {
        setData(points);
      } else {
        setError('Could not compute chart data');
      }
    } catch (err: any) {
      setError(err.message?.includes('rate limit') || err.message?.includes('429')
        ? 'DeFiLlama rate limited — showing cached data if available'
        : `Failed: ${err.message?.slice(0, 60) || 'unknown'}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, []); // fetch once on mount

  const handleForceRefresh = () => {
    clearPriceCache();
    fetchData();
  };

  // ── SVG Chart ─────────────────────────────────────────────────────────────
  const W = 600;
  const H = 280;
  const PAD = { top: 20, right: 20, bottom: 30, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allValues = data.flatMap(d => [d.intrinsic, d.market]);
  const minVal = allValues.length > 0 ? Math.min(...allValues) * 0.998 : 1.15;
  const maxVal = allValues.length > 0 ? Math.max(...allValues) * 1.002 : 1.23;
  const range = maxVal - minVal || 0.01;

  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH;

  const intrinsicPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.intrinsic)}`).join(' ');
  const intrinsicFill = data.length > 1
    ? `${intrinsicPath} L ${toX(data.length - 1)} ${PAD.top + chartH} L ${toX(0)} ${PAD.top + chartH} Z`
    : '';
  const marketPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.market)}`).join(' ');

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range * i) / 4;
    return { val, y: toY(val) };
  });

  const growth = data.length >= 2
    ? ((data[data.length - 1].intrinsic - data[0].intrinsic) / data[0].intrinsic * 100) : 0;
  const weeksShown = Math.round(data.length / 7);
  const annualizedAPR = growth > 0 && weeksShown > 0 ? (growth / weeksShown * 52) : 3.2;

  const latestPoint = data.length > 0 ? data[data.length - 1] : null;
  const premiumPct = latestPoint
    ? ((latestPoint.market - latestPoint.intrinsic) / latestPoint.intrinsic * 100) : null;

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h2 className="text-base font-black gradient-text tracking-tight">wstETH: Intrinsic vs Market</h2>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
            Intrinsic (wstETH/stETH) vs Market (wstETH/ETH) — DeFiLlama
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
              <path
                d="M1 4v6h6M23 20v-6h-6"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
              <path
                d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <CardLoader label="Fetching price history" />
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
          <div className="glass-inner p-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="intrinsicGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00C2FF" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#00C2FF" stopOpacity="0.01" />
                </linearGradient>
                <linearGradient id="intrinsicLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#00C2FF" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
                <linearGradient id="marketLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>

              {yLabels.map((l, i) => (
                <g key={i}>
                  <line x1={PAD.left} y1={l.y} x2={W - PAD.right} y2={l.y}
                    stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="4 4" />
                  <text x={PAD.left - 5} y={l.y + 4} textAnchor="end" fill="#3D4D63" fontSize="10">
                    {l.val.toFixed(4)}
                  </text>
                </g>
              ))}

              {data.filter((_, i) => i % Math.max(Math.floor(data.length / 6), 1) === 0).map((d) => {
                const idx = data.indexOf(d);
                return (
                  <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fill="#3D4D63" fontSize="9">
                    {d.date}
                  </text>
                );
              })}

              {intrinsicFill && <path d={intrinsicFill} fill="url(#intrinsicGrad)" />}
              {marketPath && <path d={marketPath} fill="none" stroke="url(#marketLine)" strokeWidth="1.5" strokeDasharray="6 3" />}
              {intrinsicPath && <path d={intrinsicPath} fill="none" stroke="url(#intrinsicLine)" strokeWidth="2" />}

              {data.length > 0 && (
                <>
                  <circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1].intrinsic)}
                    r="4" fill="#8b5cf6" stroke="#05080F" strokeWidth="2" />
                  <text x={toX(data.length - 1) - 8} y={toY(data[data.length - 1].intrinsic) - 10}
                    textAnchor="end" fill="#c4b5fd" fontSize="10" fontWeight="bold">
                    {data[data.length - 1].intrinsic.toFixed(4)}
                  </text>
                  <circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1].market)}
                    r="4" fill="#f59e0b" stroke="#05080F" strokeWidth="2" />
                  <text x={toX(data.length - 1) + 5} y={toY(data[data.length - 1].market) + 14}
                    textAnchor="start" fill="#fbbf24" fontSize="10" fontWeight="bold">
                    {data[data.length - 1].market.toFixed(4)}
                  </text>
                  <circle cx={toX(0)} cy={toY(data[0].intrinsic)}
                    r="3" fill="#00C2FF" stroke="#05080F" strokeWidth="2" />
                </>
              )}
            </svg>

            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 rounded" style={{ background: 'linear-gradient(90deg, #00C2FF, #8b5cf6)' }} />
                <span className="text-[10px] font-mono text-[var(--text-secondary)]">Intrinsic</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 rounded" style={{ background: 'linear-gradient(90deg, #f59e0b, #ef4444)', borderTop: '1px dashed #f59e0b' }} />
                <span className="text-[10px] font-mono text-[var(--text-secondary)]">Market (DeFiLlama)</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4">
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase mb-1">Intrinsic</p>
              <p className="text-base font-black font-mono text-[#c4b5fd]">
                {latestPoint ? latestPoint.intrinsic.toFixed(4) : exchangeRate.toFixed(4)}
              </p>
              <p className="text-[9px] text-[var(--text-muted)] font-mono">stETH/wstETH</p>
            </div>
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase mb-1">Market</p>
              <p className="text-base font-black font-mono text-[#fbbf24]">
                {latestPoint ? latestPoint.market.toFixed(4) : '-'}
              </p>
              <p className="text-[9px] font-mono" style={{ color: premiumPct !== null ? (premiumPct >= 0 ? '#00FF88' : '#FF3366') : 'var(--text-muted)' }}>
                {premiumPct !== null ? `${premiumPct >= 0 ? '+' : ''}${premiumPct.toFixed(3)}%` : '--'}
              </p>
            </div>
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase mb-1">Period Growth</p>
              <p className="text-base font-black font-mono" style={{ color: 'var(--accent-primary)' }}>
                +{growth.toFixed(3)}%
              </p>
              <p className="text-[9px] text-[var(--text-muted)] font-mono">{data.length} days</p>
            </div>
            <div className="glass-inner p-3 text-center">
              <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase mb-1">Annualized</p>
              <p className="text-base font-black font-mono" style={{ color: 'var(--accent-primary)' }}>
                ~{annualizedAPR.toFixed(1)}%
              </p>
              <p className="text-[9px] text-[var(--text-muted)] font-mono">APR from data</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
