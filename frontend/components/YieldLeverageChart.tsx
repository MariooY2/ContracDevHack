'use client';

import { motion } from 'framer-motion';
import type { ReserveInfo } from '@/lib/types';

interface YieldLeverageChartProps {
  reserveInfo: ReserveInfo | null;
  leverage: number;
  maxLeverage: number;
  hasPosition?: boolean;
}

export default function YieldLeverageChart({ reserveInfo, leverage, maxLeverage, hasPosition = false }: YieldLeverageChartProps) {
  const stakingYield = reserveInfo?.stakingYield || 3.2;
  const supplyAPY = reserveInfo?.supplyAPY || 0;
  const borrowAPY = reserveInfo?.borrowAPY || 3.0;

  const netAPY = (lev: number) => (stakingYield + supplyAPY) * lev - borrowAPY * (lev - 1);

  // Breakeven: (stakingYield + supplyAPY) * lev - borrowAPY * (lev - 1) = 0
  // => lev * (stakingYield + supplyAPY - borrowAPY) + borrowAPY = 0
  // => lev = -borrowAPY / (stakingYield + supplyAPY - borrowAPY)
  const spread = stakingYield + supplyAPY - borrowAPY;
  const breakeven = spread !== 0 ? -borrowAPY / spread : null;
  const hasBreakevenInRange = breakeven !== null && breakeven > 1 && breakeven <= maxLeverage;

  // Generate curve points
  const STEPS = 100;
  const minLev = 1;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const lev = minLev + (maxLeverage - minLev) * (i / STEPS);
    points.push({ x: lev, y: netAPY(lev) });
  }

  const currentNetAPY = netAPY(leverage);
  const apyAt1x = netAPY(1);
  const apyAtMax = netAPY(maxLeverage);

  // SVG dimensions
  const W = 600;
  const H = 260;
  const PAD = { top: 20, right: 20, bottom: 35, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allY = points.map(p => p.y);
  const minY = Math.min(...allY, 0);
  const maxY = Math.max(...allY, 0);
  const yRange = (maxY - minY) || 1;
  const yPad = yRange * 0.1;

  const toX = (lev: number) => PAD.left + ((lev - minLev) / (maxLeverage - minLev)) * chartW;
  const toY = (val: number) => PAD.top + chartH - ((val - (minY - yPad)) / (yRange + 2 * yPad)) * chartH;

  const zeroY = toY(0);

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`).join(' ');

  // Green fill (above zero) and red fill (below zero)
  const greenFill = points.map((p, i) => {
    const clampedY = Math.min(p.y, Math.max(p.y, 0));
    const yPos = p.y >= 0 ? toY(p.y) : zeroY;
    return `${i === 0 ? 'M' : 'L'} ${toX(p.x).toFixed(1)} ${yPos.toFixed(1)}`;
  }).join(' ') + ` L ${toX(points[points.length - 1].x).toFixed(1)} ${zeroY.toFixed(1)} L ${toX(points[0].x).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const redFill = points.map((p, i) => {
    const yPos = p.y < 0 ? toY(p.y) : zeroY;
    return `${i === 0 ? 'M' : 'L'} ${toX(p.x).toFixed(1)} ${yPos.toFixed(1)}`;
  }).join(' ') + ` L ${toX(points[points.length - 1].x).toFixed(1)} ${zeroY.toFixed(1)} L ${toX(points[0].x).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  // Y-axis ticks
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const val = (minY - yPad) + ((yRange + 2 * yPad) * i) / (yTickCount - 1);
    return val;
  });

  // X-axis ticks
  const xTickValues = [1];
  const step = maxLeverage > 10 ? 3 : 1;
  for (let v = Math.ceil(minLev / step) * step; v <= maxLeverage; v += step) {
    if (v > 1 && !xTickValues.includes(v)) xTickValues.push(v);
  }
  if (!xTickValues.includes(Math.floor(maxLeverage))) xTickValues.push(Math.floor(maxLeverage));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="card-glow p-6"
    >
      <h2 className="text-base font-black gradient-text tracking-tight mb-4">Yield vs Leverage</h2>

      <div className="glass-inner p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="yieldGreenGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00FF88" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#00FF88" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="yieldRedGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#FF3366" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#FF3366" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="yieldLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00FF88" />
              <stop offset="100%" stopColor={apyAtMax >= 0 ? '#00C2FF' : '#FF3366'} />
            </linearGradient>
          </defs>

          {/* Y-axis grid */}
          {yTicks.map((val, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={toY(val)} x2={W - PAD.right} y2={toY(val)}
                stroke={Math.abs(val) < 0.01 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}
                strokeWidth={Math.abs(val) < 0.01 ? '1' : '0.5'}
                strokeDasharray={Math.abs(val) < 0.01 ? '' : '4 4'}
              />
              <text x={PAD.left - 5} y={toY(val) + 4} textAnchor="end" fill="#64748b" fontSize="9">
                {val > 0 ? '+' : ''}{val.toFixed(1)}%
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xTickValues.map(v => (
            <text key={v} x={toX(v)} y={H - 8} textAnchor="middle" fill="#64748b" fontSize="9">
              {v}×
            </text>
          ))}

          {/* Fills */}
          <path d={greenFill} fill="url(#yieldGreenGrad)" />
          <path d={redFill} fill="url(#yieldRedGrad)" />

          {/* Main curve */}
          <path d={linePath} fill="none" stroke="url(#yieldLine)" strokeWidth="2.5" />

          {/* Breakeven vertical */}
          {hasBreakevenInRange && (
            <>
              <line
                x1={toX(breakeven)} y1={PAD.top} x2={toX(breakeven)} y2={PAD.top + chartH}
                stroke="#FF3366" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7"
              />
              <text x={toX(breakeven)} y={PAD.top - 4} textAnchor="middle" fill="#FF3366" fontSize="9" fontWeight="bold">
                Breakeven {breakeven.toFixed(1)}×
              </text>
            </>
          )}

          {/* Current leverage marker (only when user has an active position) */}
          {hasPosition && (
            <>
              <line
                x1={toX(leverage)} y1={PAD.top} x2={toX(leverage)} y2={PAD.top + chartH}
                stroke="#00C2FF" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"
              />
              <circle cx={toX(leverage)} cy={toY(currentNetAPY)} r="6" fill="#00C2FF" stroke="#05080F" strokeWidth="2" />
              <text
                x={toX(leverage) + (leverage > maxLeverage * 0.8 ? -8 : 8)}
                y={toY(currentNetAPY) - 10}
                textAnchor={leverage > maxLeverage * 0.8 ? 'end' : 'start'}
                fill="#00C2FF" fontSize="11" fontWeight="bold"
              >
                {currentNetAPY.toFixed(1)}%
              </text>
            </>
          )}
        </svg>
      </div>

    </motion.div>
  );
}
