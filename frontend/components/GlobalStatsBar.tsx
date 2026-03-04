'use client';

import type { ChainSummary } from '@/lib/types';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';

interface Props {
  chains: ChainSummary[];
  totalMarkets: number;
}

function AnimatedStat({ label, value, suffix, color, glow }: {
  label: string;
  value: number;
  suffix?: string;
  color?: string;
  glow?: boolean;
}) {
  const animated = useAnimatedCounter(value, 1400, value % 1 === 0 ? 0 : 1);

  return (
    <div className={`stat-chip ${glow ? 'glow-pulse' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={color ? { color } : undefined}>
        {suffix === '%' && value >= 0 ? '+' : ''}{animated}{suffix || ''}
      </span>
    </div>
  );
}

export default function GlobalStatsBar({ chains, totalMarkets }: Props) {
  const bestROE = Math.max(...chains.map(c => c.topROE));
  const totalLiquidity = chains.reduce((sum, c) => sum + c.totalLiquidity, 0);
  const displayLiquidity = totalLiquidity >= 1000 ? totalLiquidity / 1000 : totalLiquidity;
  const liquiditySuffix = totalLiquidity >= 1000 ? 'K' : '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnimatedStat label="Chains" value={chains.length} />
      <AnimatedStat label="Markets" value={totalMarkets} />
      <AnimatedStat label="Best ROE" value={bestROE} suffix="%" color="var(--accent-primary)" glow />
      <AnimatedStat label="Total Liquidity" value={displayLiquidity} suffix={liquiditySuffix} />
    </div>
  );
}
