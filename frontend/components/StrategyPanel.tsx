'use client';

import { useState, useMemo } from 'react';
import { useAccount, useReadContract, useSwitchChain } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { motion } from 'framer-motion';
import type { EnrichedMarket, ChainSlug } from '@/lib/types';
import { computeROE, computeHealthFactor } from '@/lib/dataEnrichment';
import { CHAIN_CONFIG } from '@/lib/chains';
import { CHAIN_CONTRACTS, ERC20_ABI } from '@/lib/contracts';

interface Props {
  market: EnrichedMarket;
  chainSlug: ChainSlug;
}

type Tier = 'conservative' | 'moderate' | 'aggressive' | 'custom';

const TIER_CONFIG = {
  conservative: { label: 'Conservative', color: 'var(--accent-primary)', cssClass: 'tier-pill--conservative' },
  moderate: { label: 'Moderate', color: 'var(--accent-info)', cssClass: 'tier-pill--moderate' },
  aggressive: { label: 'Aggressive', color: 'var(--accent-warning)', cssClass: 'tier-pill--aggressive' },
} as const;

export default function StrategyPanel({ market, chainSlug }: Props) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [selectedTier, setSelectedTier] = useState<Tier>('moderate');
  const [customLeverage, setCustomLeverage] = useState(market.roe.moderate.leverage);
  const [amount, setAmount] = useState('');

  const chainMeta = CHAIN_CONFIG[chainSlug];
  const contracts = CHAIN_CONTRACTS[chainSlug];
  const isCorrectChain = chainId === chainMeta.chainId;

  // Read collateral token balance
  const { data: balanceData } = useReadContract({
    address: market.collateralAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainMeta.chainId,
    query: { enabled: !!address },
  });

  const walletBalance = balanceData as bigint | undefined;

  const currentLeverage = useMemo(() => {
    if (selectedTier === 'custom') return customLeverage;
    return market.roe[selectedTier].leverage;
  }, [selectedTier, customLeverage, market.roe]);

  const currentROE = useMemo(() => {
    return computeROE(market.collateralYield, market.supplyAPY, market.borrowAPY, currentLeverage);
  }, [market, currentLeverage]);

  const currentHF = useMemo(() => {
    return computeHealthFactor(currentLeverage, market.lltv);
  }, [currentLeverage, market.lltv]);

  const liquidationDistance = currentHF > 0 ? (1 - 1 / currentHF) * 100 : 0;

  const handleSetMax = () => {
    if (walletBalance) {
      setAmount(formatEther(walletBalance));
    }
  };

  const handleTierSelect = (tier: Tier) => {
    setSelectedTier(tier);
    if (tier !== 'custom') {
      setCustomLeverage(market.roe[tier].leverage);
    }
  };

  const handleSliderChange = (value: number) => {
    setCustomLeverage(value);
    setSelectedTier('custom');
  };

  const canExecute = contracts.leverageHelper !== null;
  const amountBigInt = amount ? parseEther(amount) : 0n;
  const hasAmount = amountBigInt > 0n;

  return (
    <div className="card-glow p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">Open Position</h3>
        <div className="badge-info">{market.pair}</div>
      </div>

      {/* ROE Display */}
      <div className="glass-inner p-4 rounded-xl text-center">
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
          Return on Equity at {currentLeverage.toFixed(1)}x
        </p>
        <p
          className="text-4xl font-black font-mono"
          style={{ color: currentROE >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}
        >
          {currentROE >= 0 ? '+' : ''}{currentROE.toFixed(2)}%
        </p>
      </div>

      {/* Strategy Buttons */}
      <div className="grid grid-cols-3 gap-2">
        {(['conservative', 'moderate', 'aggressive'] as const).map(tier => {
          const config = TIER_CONFIG[tier];
          const tierData = market.roe[tier];
          const isSelected = selectedTier === tier;

          return (
            <button
              key={tier}
              onClick={() => handleTierSelect(tier)}
              className={`strategy-btn ${isSelected ? 'selected' : ''}`}
            >
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-1">
                {config.label}
              </p>
              <p className="text-lg font-black font-mono" style={{ color: config.color }}>
                {tierData.leverage.toFixed(1)}x
              </p>
              <p className="text-xs font-mono" style={{ color: tierData.roe >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                {tierData.roe >= 0 ? '+' : ''}{tierData.roe.toFixed(1)}%
              </p>
            </button>
          );
        })}
      </div>

      {/* Custom Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-[var(--text-muted)]">Custom Leverage</span>
          <span className="text-sm font-bold font-mono text-[var(--text-primary)]">
            {customLeverage.toFixed(1)}x
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={market.maxLeverage * 0.95}
          step={0.1}
          value={customLeverage}
          onChange={e => handleSliderChange(parseFloat(e.target.value))}
        />
        <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)] mt-1">
          <span>1.0x</span>
          <span>{(market.maxLeverage * 0.95).toFixed(1)}x max</span>
        </div>
      </div>

      {/* Health & Risk */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-inner p-3 rounded-xl">
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">
            Health Factor
          </p>
          <p
            className="text-lg font-bold font-mono"
            style={{ color: currentHF > 1.5 ? 'var(--accent-primary)' : currentHF > 1.1 ? 'var(--accent-warning)' : 'var(--accent-secondary)' }}
          >
            {currentHF > 100 ? '∞' : currentHF.toFixed(2)}
          </p>
        </div>
        <div className="glass-inner p-3 rounded-xl">
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-mono mb-0.5">
            Liq. Distance
          </p>
          <p
            className="text-lg font-bold font-mono"
            style={{ color: liquidationDistance > 15 ? 'var(--accent-primary)' : liquidationDistance > 5 ? 'var(--accent-warning)' : 'var(--accent-secondary)' }}
          >
            {liquidationDistance.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="divider" />

      {/* Amount Input */}
      {isConnected ? (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono text-[var(--text-muted)]">Deposit Amount</label>
              {walletBalance !== undefined && (
                <button
                  onClick={handleSetMax}
                  className="text-xs font-mono text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  Balance: {Number(formatEther(walletBalance)).toFixed(4)} {market.collateralSymbol}
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.0"
                className="pr-20"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-mono text-[var(--text-muted)]">
                {market.collateralSymbol}
              </span>
            </div>
          </div>

          {/* Preview */}
          {hasAmount && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="glass-inner p-3 rounded-xl space-y-2"
            >
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--text-muted)]">Total Collateral</span>
                <span className="text-[var(--text-primary)]">
                  ~{(parseFloat(amount) * currentLeverage).toFixed(4)} {market.collateralSymbol}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--text-muted)]">Total Debt</span>
                <span className="text-[var(--text-primary)]">
                  ~{(parseFloat(amount) * (currentLeverage - 1)).toFixed(4)} {market.loanSymbol}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--text-muted)]">Estimated ROE</span>
                <span style={{ color: currentROE >= 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                  {currentROE >= 0 ? '+' : ''}{currentROE.toFixed(2)}%
                </span>
              </div>
            </motion.div>
          )}

          {/* Execute */}
          {!isCorrectChain ? (
            <button
              onClick={() => switchChain({ chainId: chainMeta.chainId })}
              className="btn-primary"
            >
              Switch to {chainMeta.name}
            </button>
          ) : canExecute ? (
            <button
              disabled={!hasAmount}
              className="btn-primary"
            >
              {hasAmount ? `Open ${currentLeverage.toFixed(1)}x Position` : 'Enter Amount'}
            </button>
          ) : (
            <button disabled className="btn-primary">
              Execution Coming Soon on {chainMeta.name}
            </button>
          )}
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-[var(--text-muted)] font-mono">
            Connect wallet to open a position
          </p>
        </div>
      )}
    </div>
  );
}
