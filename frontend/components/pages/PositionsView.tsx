'use client';

import { useAccount, useReadContracts } from 'wagmi';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import type { EnrichedMarket } from '@/lib/types';
import { CHAIN_CONFIG } from '@/lib/chains';
import { CHAIN_CONTRACTS, MORPHO_FLASH_LOAN_HELPER_ABI } from '@/lib/contracts';

interface Props {
  markets: EnrichedMarket[];
}

export default function PositionsView({ markets }: Props) {
  const { address, isConnected } = useAccount();

  // Find markets that have a leverage helper (can query positions)
  const marketsWithHelper = markets.filter(m => CHAIN_CONTRACTS[m.chainSlug].leverageHelper !== null);

  // Build contract read calls for each market with a helper
  const contracts = marketsWithHelper.map(m => ({
    address: CHAIN_CONTRACTS[m.chainSlug].leverageHelper as `0x${string}`,
    abi: MORPHO_FLASH_LOAN_HELPER_ABI,
    functionName: 'getUserPosition' as const,
    args: address ? [address] : undefined,
    chainId: CHAIN_CONFIG[m.chainSlug].chainId,
  }));

  const { data: positionResults, isLoading } = useReadContracts({
    contracts: isConnected && address ? contracts : [],
    query: { enabled: isConnected && !!address },
  });

  // Parse positions
  const positions = marketsWithHelper
    .map((market, i) => {
      const result = positionResults?.[i];
      if (!result || result.status === 'failure') return null;

      const [collateral, debt, healthFactor] = result.result as [bigint, bigint, bigint];
      if (debt === 0n) return null; // No position

      return {
        market,
        collateral,
        debt,
        healthFactor: Number(healthFactor) / 1e18,
      };
    })
    .filter(Boolean);

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-4">My Positions</h1>
        <div className="card-glow p-12 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <p className="text-lg font-bold text-[var(--text-primary)] mb-2">Connect Your Wallet</p>
          <p className="text-sm text-[var(--text-muted)] font-mono">
            Connect your wallet to view your open leveraged positions across all chains.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-[var(--text-primary)]">My Positions</h1>
        <div className="stat-chip">
          <span className="stat-label">Active</span>
          <span className="stat-value">{positions.length}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="card-glow p-6">
              <div className="skeleton h-6 w-40 mb-4 rounded-lg" />
              <div className="skeleton h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : positions.length === 0 ? (
        <div className="card-glow p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-lg font-bold text-[var(--text-primary)] mb-2">No Open Positions</p>
          <p className="text-sm text-[var(--text-muted)] font-mono mb-4">
            You don&apos;t have any leveraged positions yet.
          </p>
          <Link href="/" className="btn-primary inline-block !w-auto">
            Browse Markets
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {positions.map((pos) => {
            if (!pos) return null;
            const { market, collateral, debt, healthFactor } = pos;
            const chain = CHAIN_CONFIG[market.chainSlug];
            const collateralNum = Number(collateral) / 1e18;
            const debtNum = Number(debt) / 1e18;
            const currentLev = collateralNum > debtNum ? collateralNum / (collateralNum - debtNum) : 1;

            return (
              <motion.div
                key={`${market.chainSlug}-${market.marketId}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Link href={`/${market.chainSlug}/${market.marketId}`}>
                  <div className="card-glow p-5 cursor-pointer">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: `${chain.color}20`, border: `1px solid ${chain.color}30` }}
                        >
                          <Image src={`/icons/${chain.slug}.svg`} alt={chain.name} width={20} height={20} />
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">{market.pair}</p>
                          <p className="text-[10px] font-mono text-[var(--text-muted)]">{chain.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black font-mono gradient-text">{currentLev.toFixed(1)}x</p>
                        <p className="text-[10px] font-mono text-[var(--text-muted)]">Leverage</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="glass-inner p-2.5 rounded-lg text-center">
                        <p className="text-[9px] text-[var(--text-muted)] uppercase font-mono mb-0.5">Collateral</p>
                        <p className="text-sm font-bold font-mono text-[var(--text-primary)]">
                          {collateralNum.toFixed(4)}
                        </p>
                      </div>
                      <div className="glass-inner p-2.5 rounded-lg text-center">
                        <p className="text-[9px] text-[var(--text-muted)] uppercase font-mono mb-0.5">Debt</p>
                        <p className="text-sm font-bold font-mono text-[var(--text-primary)]">
                          {debtNum.toFixed(4)}
                        </p>
                      </div>
                      <div className="glass-inner p-2.5 rounded-lg text-center">
                        <p className="text-[9px] text-[var(--text-muted)] uppercase font-mono mb-0.5">Health</p>
                        <p className="text-sm font-bold font-mono" style={{
                          color: healthFactor > 1.5 ? 'var(--accent-primary)' : healthFactor > 1.1 ? 'var(--accent-warning)' : 'var(--accent-secondary)'
                        }}>
                          {healthFactor.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Info banner */}
      <div className="card-glow p-4 mt-6">
        <p className="text-xs font-mono text-[var(--text-muted)] text-center">
          Positions are read from chains with deployed leverage helpers. Currently: Base.
          Ethereum, Arbitrum, and Polygon coming soon.
        </p>
      </div>
    </div>
  );
}
