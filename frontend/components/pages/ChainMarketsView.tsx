'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import MarketCard from '@/components/MarketCard';
import PageTransition from '@/components/PageTransition';
import type { EnrichedMarket, ChainSlug } from '@/lib/types';
import { CHAIN_CONFIG } from '@/lib/chains';

type SortField = 'roe' | 'supplyAPY' | 'borrowAPY' | 'lltv' | 'utilization' | 'liquidity';
type FilterType = 'all' | 'eth' | 'stable';

const ETH_TOKENS = ['WETH', 'ETH'];

interface Props {
  chain: ChainSlug;
  markets: EnrichedMarket[];
}

export default function ChainMarketsView({ chain, markets }: Props) {
  const [sortField, setSortField] = useState<SortField>('roe');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const chainMeta = CHAIN_CONFIG[chain];

  const filtered = useMemo(() => {
    let result = [...markets];
    if (filter === 'eth') {
      result = result.filter(m => ETH_TOKENS.includes(m.loanSymbol));
    } else if (filter === 'stable') {
      result = result.filter(m => !ETH_TOKENS.includes(m.loanSymbol));
    }
    return result;
  }, [markets, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case 'roe': va = a.roe.aggressive.roe; vb = b.roe.aggressive.roe; break;
        case 'supplyAPY': va = a.supplyAPY; vb = b.supplyAPY; break;
        case 'borrowAPY': va = a.borrowAPY; vb = b.borrowAPY; break;
        case 'lltv': va = a.lltv; vb = b.lltv; break;
        case 'utilization': va = a.utilization; vb = b.utilization; break;
        case 'liquidity': va = parseFloat(a.availableLiquidity); vb = parseFloat(b.availableLiquidity); break;
        default: va = a.roe.aggressive.roe; vb = b.roe.aggressive.roe;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [filtered, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const totalLiquidity = markets.reduce((s, m) => s + parseFloat(m.availableLiquidity || '0'), 0);

  return (
    <PageTransition>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <div className="breadcrumb mb-6">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <span className="text-[var(--text-primary)]">{chainMeta.name}</span>
      </div>

      {/* Chain Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: `${chainMeta.color}20`, border: `1px solid ${chainMeta.color}40` }}
          >
            <Image src={`/icons/${chain}.svg`} alt={chainMeta.name} width={28} height={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[var(--text-primary)]">{chainMeta.name} Markets</h1>
            <p className="text-xs font-mono text-[var(--text-muted)]">
              {markets.length} markets · {totalLiquidity >= 1000
                ? `${(totalLiquidity / 1000).toFixed(1)}K`
                : totalLiquidity.toFixed(0)} available liquidity
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2">
          <div className="stat-chip">
            <span className="stat-label">Markets</span>
            <span className="stat-value">{markets.length}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-label">Avg Supply</span>
            <span className="stat-value" style={{ color: 'var(--accent-primary)' }}>
              {(markets.reduce((s, m) => s + m.supplyAPY, 0) / markets.length).toFixed(2)}%
            </span>
          </div>
        </div>
      </motion.div>

      {/* Filter + Sort Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Filter */}
        {(['all', 'eth', 'stable'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
          >
            {f === 'all' ? 'All' : f === 'eth' ? 'ETH Pairs' : 'Stable Pairs'}
          </button>
        ))}

        <div className="flex-1" />

        {/* Sort */}
        <select
          value={sortField}
          onChange={e => handleSort(e.target.value as SortField)}
          className="filter-tab bg-transparent appearance-none pr-8 cursor-pointer"
          style={{ backgroundImage: 'none' }}
        >
          <option value="roe">Sort: ROE</option>
          <option value="supplyAPY">Sort: Supply APY</option>
          <option value="borrowAPY">Sort: Borrow APY</option>
          <option value="lltv">Sort: LLTV</option>
          <option value="utilization">Sort: Utilization</option>
          <option value="liquidity">Sort: Liquidity</option>
        </select>
        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="filter-tab"
          title={sortAsc ? 'Ascending' : 'Descending'}
        >
          {sortAsc ? '↑' : '↓'}
        </button>
      </div>

      {/* Market Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((market, i) => (
          <MarketCard key={market.marketId} market={market} index={i} />
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="var(--text-muted)" strokeWidth="2"/>
              <path d="M21 21l-4.35-4.35" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="text-[var(--text-muted)] font-mono text-sm">
            No markets found for this filter
          </p>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
