'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatEther } from 'viem';
import { RPC_URL } from '@/lib/types';
import { WSTETH_ABI, getAddresses } from '@/lib/leverageContract';
import { contractDevMainnet } from '@/lib/wagmi';
import { CardLoader } from '@/components/Loader';
import { useProtocol } from '@/contexts/ProtocolContext';

interface ChartPoint {
  date: string;
  timestamp: number;
  intrinsic: number;  // reconstructed stETH per wstETH (fair value)
  market: number;      // actual wstETH/ETH market ratio from CoinGecko
}

const DEFAULT_STAKING_APY = 0.032; // Fallback ~3.2% annual

interface PriceChartProps {
  exchangeRate: number;
  reserveInfo: { stakingYield: number } | null;
}

export default function PriceChart({ exchangeRate, reserveInfo }: PriceChartProps) {
  const { protocol } = useProtocol();
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const ADDRESSES = getAddresses(protocol);
  const stakingAPY = reserveInfo?.stakingYield
    ? reserveInfo.stakingYield / 100 // Convert from % to decimal
    : DEFAULT_STAKING_APY;

  useEffect(() => {
    fetchData();
  }, [protocol]); // Refetch when protocol changes

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      // Step 1: Get current intrinsic from fork (Ethereum only)
      let currentIntrinsic = exchangeRate || 1.2265;

      if (protocol === 'aave') {
        // Only try to fetch from contract on Ethereum
        try {
          const client = createPublicClient({
            chain: contractDevMainnet,
            transport: http(RPC_URL),
          });

          const raw = await client.readContract({
            address: ADDRESSES.WSTETH,
            abi: WSTETH_ABI,
            functionName: 'stEthPerToken',
          });
          currentIntrinsic = Number(formatEther(raw));
        } catch (e) {
          console.log('Could not fetch stEthPerToken, using exchangeRate prop');
        }
      } else {
        // Morpho/Base: Use the exchangeRate prop
        console.log('Morpho: Using exchangeRate prop for chart');
      }

      // Step 2: Fetch 180 days of prices from CoinGecko
      const days = 180;
      const [wstethRes, ethRes] = await Promise.all([
        fetch(`https://api.coingecko.com/api/v3/coins/wrapped-steth/market_chart?vs_currency=usd&days=${days}&interval=daily`),
        fetch(`https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=${days}&interval=daily`),
      ]);

      if (!wstethRes.ok || !ethRes.ok) {
        setError('CoinGecko API rate limited. Try again shortly.');
        setLoading(false);
        return;
      }

      const wstethData = await wstethRes.json();
      const ethData = await ethRes.json();

      const wstethPrices: [number, number][] = wstethData.prices;
      const ethPrices: [number, number][] = ethData.prices;

      if (!wstethPrices?.length || !ethPrices?.length) {
        setError('No price data available');
        setLoading(false);
        return;
      }

      // Build ETH price lookup by date
      const ethPriceMap = new Map<string, number>();
      for (const [ts, price] of ethPrices) {
        ethPriceMap.set(new Date(ts).toISOString().split('T')[0], price);
      }

      const now = Date.now();
      const points: ChartPoint[] = [];

      for (const [ts, wstethUsd] of wstethPrices) {
        const dateKey = new Date(ts).toISOString().split('T')[0];
        const ethUsd = ethPriceMap.get(dateKey);
        if (!ethUsd || ethUsd === 0) continue;

        const marketRatio = wstethUsd / ethUsd;

        // Reconstruct historical intrinsic
        const yearsAgo = (now - ts) / (365.25 * 24 * 3600 * 1000);
        const growthFactor = Math.pow(1 + stakingAPY, yearsAgo);
        const historicalIntrinsic = currentIntrinsic / growthFactor;

        const date = new Date(ts);
        const dateStr = date.toLocaleString('default', { month: 'short', day: 'numeric' });

        points.push({ date: dateStr, timestamp: ts, intrinsic: historicalIntrinsic, market: marketRatio });
      }

      if (points.length > 0) {
        setData(points);
      } else {
        setError('Could not compute chart data');
      }
    } catch (err: any) {
      setError(`Failed: ${err.message?.slice(0, 60) || 'unknown'}`);
    }
    setLoading(false);
  };

  // ---- SVG Chart ----
  const W = 600;
  const H = 280;
  const PAD = { top: 20, right: 20, bottom: 30, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Y-axis from both series
  const allValues = data.flatMap(d => [d.intrinsic, d.market]);
  const minVal = allValues.length > 0 ? Math.min(...allValues) * 0.998 : 1.15;
  const maxVal = allValues.length > 0 ? Math.max(...allValues) * 1.002 : 1.23;
  const range = maxVal - minVal || 0.01;

  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH;

  // Intrinsic line (blue -> purple)
  const intrinsicPath = data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.intrinsic)}`
  ).join(' ');
  const intrinsicFill = data.length > 1
    ? `${intrinsicPath} L ${toX(data.length - 1)} ${PAD.top + chartH} L ${toX(0)} ${PAD.top + chartH} Z`
    : '';

  // Market line (orange -> red, dashed)
  const marketPath = data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.market)}`
  ).join(' ');

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range * i) / 4;
    return { val, y: toY(val) };
  });

  // Stats
  const growth = data.length >= 2
    ? ((data[data.length - 1].intrinsic - data[0].intrinsic) / data[0].intrinsic * 100) : 0;
  const weeksShown = Math.round(data.length / 7);
  const annualizedAPR = growth > 0 && weeksShown > 0 ? (growth / weeksShown * 52) : 3.2;

  const latestPoint = data.length > 0 ? data[data.length - 1] : null;
  const premiumPct = latestPoint
    ? ((latestPoint.market - latestPoint.intrinsic) / latestPoint.intrinsic * 100) : null;

  return (
    <div className="card-glow p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold gradient-text">wstETH: Intrinsic vs Market</h2>
        <span className="text-xs px-2 py-1 rounded bg-[#111827] text-[#10b981] font-mono">
          {data.length} days
        </span>
      </div>
      <p className="text-xs text-[#64748b] mb-4">
        Intrinsic (stEthPerToken + {(stakingAPY * 100).toFixed(1)}% APY) vs Market (CoinGecko wstETH/ETH)
      </p>

      {loading ? (
        <CardLoader label="Fetching price history" />
      ) : error ? (
        <div className="bg-[#111827] rounded-xl p-8 text-center">
          <p className="text-sm text-[#ef4444]">{error}</p>
          <button onClick={fetchData} className="text-xs text-[#3b82f6] mt-2 hover:underline">Retry</button>
        </div>
      ) : (
        <>
          <div className="bg-[#111827] rounded-xl p-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="intrinsicGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="intrinsicLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
                <linearGradient id="marketLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>

              {/* Grid */}
              {yLabels.map((l, i) => (
                <g key={i}>
                  <line x1={PAD.left} y1={l.y} x2={W - PAD.right} y2={l.y}
                    stroke="#2a3555" strokeWidth="0.5" strokeDasharray="4 4" />
                  <text x={PAD.left - 5} y={l.y + 4} textAnchor="end" fill="#64748b" fontSize="10">
                    {l.val.toFixed(4)}
                  </text>
                </g>
              ))}

              {/* X labels */}
              {data.filter((_, i) => i % Math.max(Math.floor(data.length / 6), 1) === 0).map((d) => {
                const idx = data.indexOf(d);
                return (
                  <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fill="#64748b" fontSize="9">
                    {d.date}
                  </text>
                );
              })}

              {/* Intrinsic fill */}
              {intrinsicFill && <path d={intrinsicFill} fill="url(#intrinsicGrad)" />}

              {/* Market line (dashed) */}
              {marketPath && (
                <path d={marketPath} fill="none" stroke="url(#marketLine)" strokeWidth="2" strokeDasharray="6 3" />
              )}

              {/* Intrinsic line (solid) */}
              {intrinsicPath && (
                <path d={intrinsicPath} fill="none" stroke="url(#intrinsicLine)" strokeWidth="2.5" />
              )}

              {/* End dots */}
              {data.length > 0 && (
                <>
                  <circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1].intrinsic)}
                    r="5" fill="#8b5cf6" stroke="#0a0e17" strokeWidth="2" />
                  <text x={toX(data.length - 1) - 10} y={toY(data[data.length - 1].intrinsic) - 12}
                    textAnchor="end" fill="#c4b5fd" fontSize="10" fontWeight="bold">
                    {data[data.length - 1].intrinsic.toFixed(4)}
                  </text>

                  <circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1].market)}
                    r="4" fill="#f59e0b" stroke="#0a0e17" strokeWidth="2" />
                  <text x={toX(data.length - 1) + 5} y={toY(data[data.length - 1].market) + 15}
                    textAnchor="start" fill="#fbbf24" fontSize="10" fontWeight="bold">
                    {data[data.length - 1].market.toFixed(4)}
                  </text>

                  <circle cx={toX(0)} cy={toY(data[0].intrinsic)}
                    r="3" fill="#3b82f6" stroke="#0a0e17" strokeWidth="2" />
                </>
              )}
            </svg>

            {/* Legend */}
            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 rounded" style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
                <span className="text-xs text-[#94a3b8]">Intrinsic (stEthPerToken)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 rounded" style={{ background: 'linear-gradient(90deg, #f59e0b, #ef4444)' }} />
                <span className="text-xs text-[#94a3b8]">Market (CoinGecko wstETH/ETH)</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            <div className="bg-[#111827] rounded-xl p-3 text-center">
              <p className="text-xs text-[#64748b]">Intrinsic</p>
              <p className="text-lg font-bold text-[#c4b5fd]">
                {latestPoint ? latestPoint.intrinsic.toFixed(4) : exchangeRate.toFixed(4)}
              </p>
              <p className="text-xs text-[#64748b]">stETH/wstETH</p>
            </div>
            <div className="bg-[#111827] rounded-xl p-3 text-center">
              <p className="text-xs text-[#64748b]">Market</p>
              <p className="text-lg font-bold text-[#fbbf24]">
                {latestPoint ? latestPoint.market.toFixed(4) : '-'}
              </p>
              <p className="text-xs text-[#64748b]">
                {premiumPct !== null && (
                  <span style={{ color: premiumPct >= 0 ? '#10b981' : '#ef4444' }}>
                    {premiumPct >= 0 ? '+' : ''}{premiumPct.toFixed(3)}% {premiumPct >= 0 ? 'premium' : 'discount'}
                  </span>
                )}
              </p>
            </div>
            <div className="bg-[#111827] rounded-xl p-3 text-center">
              <p className="text-xs text-[#64748b]">Period Growth</p>
              <p className="text-lg font-bold text-[#10b981]">+{growth.toFixed(3)}%</p>
              <p className="text-xs text-[#64748b]">{data.length} days</p>
            </div>
            <div className="bg-[#111827] rounded-xl p-3 text-center">
              <p className="text-xs text-[#64748b]">Annualized</p>
              <p className="text-lg font-bold text-[#10b981]">~{annualizedAPR.toFixed(1)}%</p>
              <p className="text-xs text-[#64748b]">APR from data</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
