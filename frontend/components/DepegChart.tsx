'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatEther } from 'viem';
import { RPC_URL } from '@/lib/types';
import { WSTETH_ABI, ADDRESSES } from '@/lib/leverageContract';
import { contractDevMainnet } from '@/lib/wagmi';
import { CardLoader } from '@/components/Loader';

interface DepegPoint {
  date: string;
  timestamp: number;
  intrinsic: number;   // reconstructed intrinsic wstETH/ETH value
  market: number;       // actual market wstETH/ETH ratio from CoinGecko
  depegPct: number;     // (market - intrinsic) / intrinsic * 100
}

// Aave V3 wstETH liquidation threshold
const DEFAULT_LLTV = 0.81;
const SAFETY_BUFFER = 0.20;
const DEFAULT_STAKING_APY = 0.032; // Fallback ~3.2% annual yield for wstETH

// Max depeg before liquidation at leverage L:
// max_depeg = 1 - (L-1)/(L * LLTV)
function maxDepegAtLeverage(leverage: number, lltv: number): number {
  if (leverage <= 1) return 100;
  const initialLtv = (leverage - 1) / leverage;
  return (1 - initialLtv / lltv) * 100;
}

// Max leverage given a depeg threshold:
// L = 1 / (1 - LLTV * (1 - safe_depeg))
function maxLeverageFromDepeg(maxDepegPct: number, safetyBuffer: number, lltv: number): number {
  const safeThreshold = (maxDepegPct / 100) * (1 + safetyBuffer);
  const denom = 1 - lltv * (1 - safeThreshold);
  if (denom <= 0) return 1 / (1 - lltv);
  return 1 / denom;
}

interface DepegChartProps {
  reserveInfo: { liquidationThreshold: number; stakingYield: number; maxLeverage: number } | null;
}

export default function DepegChart({ reserveInfo }: DepegChartProps) {
  const [data, setData] = useState<DepegPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const lltv = reserveInfo?.liquidationThreshold
    ? reserveInfo.liquidationThreshold / 100
    : DEFAULT_LLTV;

  const stakingAPY = reserveInfo?.stakingYield
    ? reserveInfo.stakingYield / 100 // Convert from % to decimal
    : DEFAULT_STAKING_APY;

  useEffect(() => {
    fetchDepegData();
  }, []);

  const fetchDepegData = async () => {
    setLoading(true);
    setError('');

    try {
      // Step 1: Get current intrinsic value from the fork
      const client = createPublicClient({
        chain: contractDevMainnet,
        transport: http(RPC_URL),
      });

      let currentIntrinsic = 1.2265; // fallback
      try {
        const raw = await client.readContract({
          address: ADDRESSES.WSTETH,
          abi: WSTETH_ABI,
          functionName: 'stEthPerToken',
        });
        currentIntrinsic = Number(formatEther(raw));
      } catch {}

      // Step 2: Fetch historical prices from CoinGecko
      // wstETH and ETH price history in USD
      const days = 180;
      const [wstethRes, ethRes] = await Promise.all([
        fetch(`https://api.coingecko.com/api/v3/coins/wrapped-steth/market_chart?vs_currency=usd&days=${days}&interval=daily`),
        fetch(`https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=${days}&interval=daily`),
      ]);

      if (!wstethRes.ok || !ethRes.ok) {
        setError('CoinGecko API rate limited. Try again in a minute.');
        setLoading(false);
        return;
      }

      const wstethData = await wstethRes.json();
      const ethData = await ethRes.json();

      const wstethPrices: [number, number][] = wstethData.prices;
      const ethPrices: [number, number][] = ethData.prices;

      if (!wstethPrices?.length || !ethPrices?.length) {
        setError('No price data from CoinGecko');
        setLoading(false);
        return;
      }

      // Step 3: Align timestamps and calculate ratios
      // CoinGecko returns [timestamp_ms, price_usd] arrays
      const ethPriceMap = new Map<string, number>();
      for (const [ts, price] of ethPrices) {
        const dateKey = new Date(ts).toISOString().split('T')[0];
        ethPriceMap.set(dateKey, price);
      }

      const now = Date.now();
      const points: DepegPoint[] = [];

      for (const [ts, wstethUsd] of wstethPrices) {
        const dateKey = new Date(ts).toISOString().split('T')[0];
        const ethUsd = ethPriceMap.get(dateKey);
        if (!ethUsd || ethUsd === 0) continue;

        // Market wstETH/ETH ratio
        const marketRatio = wstethUsd / ethUsd;

        // Reconstruct historical intrinsic value
        // intrinsic(t) = intrinsic(now) / (1 + apy)^years_elapsed
        const yearsAgo = (now - ts) / (365.25 * 24 * 3600 * 1000);
        const growthFactor = Math.pow(1 + stakingAPY, yearsAgo);
        const historicalIntrinsic = currentIntrinsic / growthFactor;

        // Depeg percentage
        const depegPct = ((marketRatio - historicalIntrinsic) / historicalIntrinsic) * 100;

        const date = new Date(ts);
        const dateStr = date.toLocaleString('default', { month: 'short', day: 'numeric' });

        points.push({
          date: dateStr,
          timestamp: ts,
          intrinsic: historicalIntrinsic,
          market: marketRatio,
          depegPct,
        });
      }

      if (points.length > 0) {
        setData(points);
      } else {
        setError('Could not compute depeg data');
      }
    } catch (err: any) {
      setError(`Failed: ${err.message?.slice(0, 60) || 'unknown error'}`);
    }
    setLoading(false);
  };

  // ---- Statistics ----
  const depegValues = data.map(d => d.depegPct);
  const absDepegValues = depegValues.map(v => Math.abs(v));
  const maxHistoricalDepeg = absDepegValues.length > 0 ? Math.max(...absDepegValues) : 0;
  const currentDepeg = data.length > 0 ? data[data.length - 1].depegPct : 0;

  // Max safe leverage using the Python script's formula, capped at contract max
  const calculatedMaxLeverage = maxLeverageFromDepeg(maxHistoricalDepeg, SAFETY_BUFFER, lltv);
  const contractMaxLeverage = reserveInfo?.maxLeverage || 1 / (1 - lltv);
  const maxSafeLeverage = Math.min(calculatedMaxLeverage, contractMaxLeverage);
  const conservativeLev = maxSafeLeverage * 0.6;
  const moderateLev = maxSafeLeverage * 0.8;
  const aggressiveLev = maxSafeLeverage;

  // Liquidation thresholds at key leverage levels
  const leverageLevels = [
    { label: '2x', leverage: 2, color: '#10b981' },
    { label: '3x', leverage: 3, color: '#f59e0b' },
    { label: '4x', leverage: 4, color: '#ef4444' },
    { label: '4.5x', leverage: 4.5, color: '#dc2626' },
  ];

  // ---- SVG Chart ----
  const W = 650;
  const H = 300;
  const PAD = { top: 25, right: 60, bottom: 35, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Y-axis: symmetric around 0, include relevant liquidation thresholds
  const relevantLiq = leverageLevels
    .map(l => maxDepegAtLeverage(l.leverage, lltv))
    .filter(v => v < 50);
  const maxY = Math.max(maxHistoricalDepeg * 2, relevantLiq[1] || 5, 3);

  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH / 2 - (v / maxY) * (chartH / 2);
  const zeroY = toY(0);

  // Depeg line path
  const depegPath = data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.depegPct)}`
  ).join(' ');

  // Fill above zero (premium)
  const premiumFill = data.length > 1
    ? data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(Math.max(d.depegPct, 0))}`).join(' ')
      + ` L ${toX(data.length - 1)} ${zeroY} L ${toX(0)} ${zeroY} Z`
    : '';

  // Fill below zero (discount)
  const discountFill = data.length > 1
    ? data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(Math.min(d.depegPct, 0))}`).join(' ')
      + ` L ${toX(data.length - 1)} ${zeroY} L ${toX(0)} ${zeroY} Z`
    : '';

  // Y-axis ticks
  const yTicks = [-maxY, -maxY / 2, 0, maxY / 2, maxY];

  // Calculate risk level
  const getRiskLevel = () => {
    const buffer = (maxHistoricalDepeg * (1 + SAFETY_BUFFER));
    if (buffer < 2) return { level: 'LOW', color: '#10b981', text: 'Historically very stable' };
    if (buffer < 5) return { level: 'MODERATE', color: '#f59e0b', text: 'Some volatility observed' };
    return { level: 'HIGH', color: '#ef4444', text: 'Significant price swings detected' };
  };
  const riskLevel = getRiskLevel();

  return (
    <div className="card-glow p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold gradient-text">Risk Analysis</h2>
        <div className="flex items-center gap-2">
          <div
            className="px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5"
            style={{ background: riskLevel.color + '20', color: riskLevel.color }}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: riskLevel.color }} />
            {riskLevel.level} RISK
          </div>
          <span className="text-xs px-2 py-1 rounded bg-[#111827] text-[#64748b] font-mono">
            {data.length} days
          </span>
        </div>
      </div>
      <p className="text-xs text-[#64748b] mb-3">
        {riskLevel.text}. Chart shows how wstETH price stability affects your leverage safety.
      </p>

      {/* Info Box - What is this? */}
      <div className="bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <span className="text-lg">💡</span>
          <div>
            <p className="text-xs font-semibold text-[#3b82f6] mb-1">What does this chart show?</p>
            <p className="text-xs text-[#94a3b8] leading-relaxed">
              wstETH should maintain a stable price relative to ETH. This chart tracks any price deviations.
              Bigger deviations = higher risk for leveraged positions. The colored lines show when different
              leverage levels would get liquidated.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <CardLoader label="Analyzing risk data" />
      ) : error ? (
        <div className="bg-[#111827] rounded-xl p-8 text-center">
          <p className="text-sm text-[#ef4444]">{error}</p>
          <button onClick={fetchDepegData} className="text-xs text-[#3b82f6] mt-2 hover:underline">Retry</button>
        </div>
      ) : (
        <>
          {/* Depeg % Chart */}
          <div className="bg-[#111827] rounded-xl p-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="premiumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="discountGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Y-axis grid lines */}
              {yTicks.map((val, i) => (
                <g key={i}>
                  <line
                    x1={PAD.left} y1={toY(val)} x2={W - PAD.right} y2={toY(val)}
                    stroke={val === 0 ? '#4a5568' : '#2a3555'}
                    strokeWidth={val === 0 ? '1' : '0.5'}
                    strokeDasharray={val === 0 ? '' : '4 4'}
                  />
                  <text x={PAD.left - 5} y={toY(val) + 4} textAnchor="end" fill="#64748b" fontSize="9">
                    {val > 0 ? '+' : ''}{val.toFixed(1)}%
                  </text>
                </g>
              ))}

              {/* Liquidation threshold lines (discount side) */}
              {leverageLevels.map((level) => {
                const threshold = maxDepegAtLeverage(level.leverage, lltv);
                if (threshold > maxY) return null;
                const y = toY(-threshold);
                return (
                  <g key={level.label}>
                    <line
                      x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                      stroke={level.color} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.7"
                    />
                    <text x={W - PAD.right + 4} y={y + 3} fill={level.color} fontSize="9" fontWeight="bold">
                      {level.label} liq
                    </text>
                    <text x={W - PAD.right + 4} y={y + 13} fill="#64748b" fontSize="8">
                      -{threshold.toFixed(1)}%
                    </text>
                  </g>
                );
              })}

              {/* X-axis date labels */}
              {data.filter((_, i) => i % Math.max(Math.floor(data.length / 6), 1) === 0).map((d, idx) => {
                const i = data.indexOf(d);
                return (
                  <text key={idx} x={toX(i)} y={H - 5} textAnchor="middle" fill="#64748b" fontSize="8">
                    {d.date}
                  </text>
                );
              })}

              {/* Premium fill */}
              {premiumFill && <path d={premiumFill} fill="url(#premiumGrad)" />}
              {/* Discount fill */}
              {discountFill && <path d={discountFill} fill="url(#discountGrad)" />}

              {/* Depeg line */}
              {depegPath && (
                <path d={depegPath} fill="none" stroke="#8b5cf6" strokeWidth="2" />
              )}

              {/* Worst discount dot (maximum negative depeg = liquidation risk) */}
              {data.length > 0 && (() => {
                // Find the worst DISCOUNT (most negative value) - this is the liquidation risk
                const negativeDepegs = depegValues.filter(v => v < 0);
                if (negativeDepegs.length > 0) {
                  const worstDiscount = Math.min(...negativeDepegs); // Most negative
                  const worstIdx = depegValues.indexOf(worstDiscount);
                  if (worstIdx >= 0 && worstIdx < data.length) {
                    return (
                      <>
                        <circle
                          cx={toX(worstIdx)} cy={toY(data[worstIdx].depegPct)}
                          r="6" fill="#ef4444" stroke="#fff" strokeWidth="2"
                        />
                        <text
                          x={toX(worstIdx)}
                          y={toY(data[worstIdx].depegPct) + 20}
                          textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="bold"
                        >
                          ⚠ Worst Drop: {data[worstIdx].depegPct.toFixed(2)}%
                        </text>
                      </>
                    );
                  }
                }
                return null;
              })()}

              {/* Current dot */}
              {data.length > 0 && (
                <circle
                  cx={toX(data.length - 1)} cy={toY(currentDepeg)}
                  r="4" fill="#8b5cf6" stroke="#0a0e17" strokeWidth="2"
                />
              )}

              {/* Zone labels - Improved */}
              <text x={PAD.left + 5} y={PAD.top + 12} fill="#10b981" fontSize="10" fontWeight="600" opacity="0.8">
                ✓ Safe Zone (Above Fair Value)
              </text>
              <text x={PAD.left + 5} y={H - PAD.bottom - 5} fill="#ef4444" fontSize="10" fontWeight="600" opacity="0.8">
                ⚠ Risk Zone (Below Fair Value)
              </text>
            </svg>

            {/* Legend - Improved */}
            <div className="mt-4 space-y-3">
              <div className="bg-[#0a0e17] rounded-lg p-3">
                <p className="text-xs font-semibold text-[#94a3b8] mb-2">📊 How to Read This Chart</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 rounded bg-[#8b5cf6]" />
                    <span className="text-xs text-[#64748b]">Purple line = Price difference over time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(to bottom, #10b981 40%, transparent)' }} />
                    <span className="text-xs text-[#64748b]">Green area = wstETH trading above fair value (good)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(to top, #ef4444 40%, transparent)' }} />
                    <span className="text-xs text-[#64748b]">Red area = wstETH trading below fair value (caution)</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#0a0e17] rounded-lg p-3">
                <p className="text-xs font-semibold text-[#94a3b8] mb-2">⚠️ Liquidation Warning Lines</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {leverageLevels.map(level => {
                    const threshold = maxDepegAtLeverage(level.leverage, lltv);
                    if (threshold > maxY) return null;
                    return (
                      <div key={level.label} className="flex items-center gap-1.5">
                        <div className="w-2 h-0.5 rounded" style={{ background: level.color }} />
                        <span className="text-xs text-[#64748b]">{level.label} → -{threshold.toFixed(1)}% drop</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-[#64748b] mt-2 italic">
                  If the purple line crosses a warning line, positions at that leverage get liquidated
                </p>
              </div>
            </div>
          </div>

          {/* Key Insights - Simplified */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Current Status */}
            <div className="bg-[#111827] rounded-xl p-4 border-2" style={{ borderColor: currentDepeg >= 0 ? '#10b981' : '#ef4444' }}>
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">Current Price</p>
                <span className={`text-xs px-2 py-0.5 rounded ${currentDepeg >= 0 ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#ef4444]/20 text-[#ef4444]'}`}>
                  {currentDepeg >= 0 ? 'Above Fair Value' : 'Below Fair Value'}
                </span>
              </div>
              <p className={`text-3xl font-bold mb-1 ${currentDepeg >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                {currentDepeg >= 0 ? '+' : ''}{currentDepeg.toFixed(2)}%
              </p>
              <p className="text-xs text-[#64748b]">
                {currentDepeg >= 0
                  ? 'wstETH is trading above its fair value - good for holders'
                  : 'wstETH is trading below fair value - potential buying opportunity'}
              </p>
            </div>

            {/* Risk Summary */}
            <div className="bg-[#111827] rounded-xl p-4">
              <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-3">Safety Analysis</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">Historical Volatility</span>
                  <span className="text-sm font-bold text-[#ef4444]">{maxHistoricalDepeg.toFixed(2)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">Safety Buffer (20%)</span>
                  <span className="text-sm font-bold text-[#f59e0b]">
                    +{(maxHistoricalDepeg * SAFETY_BUFFER).toFixed(2)}%
                  </span>
                </div>
                <div className="h-px bg-[#2a3555] my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#94a3b8]">Recommended Max Leverage</span>
                  <span className="text-lg font-bold text-[#3b82f6]">{maxSafeLeverage.toFixed(1)}x</span>
                </div>
              </div>
              <p className="text-xs text-[#64748b] mt-3 leading-relaxed">
                Based on past {data.length} days of price movements, staying at or below {maxSafeLeverage.toFixed(1)}x leverage provides a 20% safety cushion.
              </p>
            </div>
          </div>

          {/* Leverage Recommendations - Simplified */}
          <div className="bg-[#111827] rounded-xl p-5 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#e2e8f0]">Choose Your Risk Level</h3>
              <span className="text-xs text-[#64748b]">Based on historical data</span>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: 'Safe & Steady',
                  sublabel: 'For cautious investors',
                  pct: '60%',
                  lev: conservativeLev,
                  color: '#10b981',
                  icon: '🛡️'
                },
                {
                  label: 'Balanced',
                  sublabel: 'Good risk/reward ratio',
                  pct: '80%',
                  lev: moderateLev,
                  color: '#f59e0b',
                  icon: '⚖️'
                },
                {
                  label: 'Maximum Returns',
                  sublabel: 'Higher risk, higher yield',
                  pct: '100%',
                  lev: aggressiveLev,
                  color: '#ef4444',
                  icon: '🚀'
                },
              ].map(tier => {
                const liqDist = maxDepegAtLeverage(tier.lev, lltv);
                return (
                  <div
                    key={tier.label}
                    className="p-3 rounded-lg border-2 hover:border-opacity-100 transition-all cursor-pointer"
                    style={{
                      background: tier.color + '08',
                      borderColor: tier.color + '40'
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{tier.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-[#e2e8f0]">{tier.label}</p>
                          <p className="text-xs text-[#64748b]">{tier.sublabel}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold" style={{ color: tier.color }}>
                          {tier.lev.toFixed(1)}x
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-[#2a3555]">
                      <span className="text-[#64748b]">Liquidation if price drops</span>
                      <span className="font-semibold" style={{ color: tier.color }}>
                        {liqDist.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visual leverage bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-[#64748b] mb-1">
                <span>1x (No leverage)</span>
                <span>{(1 / (1 - lltv)).toFixed(1)}x (Maximum possible)</span>
              </div>
              <div className="h-3 bg-[#1a2035] rounded-full overflow-hidden relative">
                <div
                  className="absolute h-full rounded-l-full"
                  style={{
                    width: `${Math.min((conservativeLev / (1 / (1 - lltv))) * 100, 100)}%`,
                    background: 'linear-gradient(90deg, #10b981, #10b98180)',
                  }}
                />
                <div
                  className="absolute h-full"
                  style={{
                    left: `${(conservativeLev / (1 / (1 - lltv))) * 100}%`,
                    width: `${((moderateLev - conservativeLev) / (1 / (1 - lltv))) * 100}%`,
                    background: '#f59e0b80',
                  }}
                />
                <div
                  className="absolute h-full rounded-r-full"
                  style={{
                    left: `${(moderateLev / (1 / (1 - lltv))) * 100}%`,
                    width: `${Math.min(((aggressiveLev - moderateLev) / (1 / (1 - lltv))) * 100, 100 - (moderateLev / (1 / (1 - lltv))) * 100)}%`,
                    background: '#ef444480',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Action Recommendation Box */}
          <div
            className="mt-4 p-4 rounded-xl border-2"
            style={{
              background: riskLevel.color + '08',
              borderColor: riskLevel.color + '30'
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: riskLevel.color + '20' }}
              >
                <span className="text-xl">
                  {riskLevel.level === 'LOW' ? '✅' : riskLevel.level === 'MODERATE' ? '⚠️' : '🚨'}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#e2e8f0] mb-1">
                  {riskLevel.level === 'LOW' && 'Great time to leverage'}
                  {riskLevel.level === 'MODERATE' && 'Proceed with caution'}
                  {riskLevel.level === 'HIGH' && 'Consider reducing leverage'}
                </p>
                <p className="text-xs text-[#94a3b8] leading-relaxed">
                  {riskLevel.level === 'LOW' &&
                    `wstETH has been very stable with minimal price swings. You can comfortably use up to ${maxSafeLeverage.toFixed(1)}x leverage with low liquidation risk.`}
                  {riskLevel.level === 'MODERATE' &&
                    `Some price volatility detected in the past ${data.length} days. Stick to ${conservativeLev.toFixed(1)}x-${moderateLev.toFixed(1)}x leverage for safer positions.`}
                  {riskLevel.level === 'HIGH' &&
                    `High volatility observed. Consider using lower leverage (max ${conservativeLev.toFixed(1)}x) or waiting for more stable market conditions.`}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
