'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { createPublicClient, http, formatEther } from 'viem';
import { baseMainnet } from '@/lib/wagmi';
import { BASE_RPC_URL } from '@/lib/types';
import type { UserPosition } from '@/lib/types';
import { MORPHO_ABI } from '@/lib/leverageContract';

const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const;

interface MarketInput {
  uniqueKey: string;
  pair: string;
  collateralSymbol: string;
  loanSymbol: string;
  lltv: number;
  supplyApy: number;
  borrowApy: number;
}

/**
 * Batch-reads user positions across all provided markets via multicall.
 * Returns only markets where the user has an active position.
 */
export function useMultiMarketPositions(markets: MarketInput[]) {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publicClient = useMemo(() => createPublicClient({
    chain: baseMainnet,
    transport: http(BASE_RPC_URL, { batch: true, retryCount: 3 }),
  }), []);

  const fetchPositions = useCallback(async () => {
    if (!address || !isConnected || markets.length === 0) {
      setPositions([]);
      setLoading(false);
      return;
    }

    try {
      // Build multicall: 2 calls per market (position + market data)
      const positionCalls = markets.map((m) => ({
        address: MORPHO_BLUE,
        abi: MORPHO_ABI,
        functionName: 'position' as const,
        args: [m.uniqueKey as `0x${string}`, address],
      }));

      const marketCalls = markets.map((m) => ({
        address: MORPHO_BLUE,
        abi: MORPHO_ABI,
        functionName: 'market' as const,
        args: [m.uniqueKey as `0x${string}`],
      }));

      // Execute both batches in parallel
      const [positionResults, marketResults] = await Promise.all([
        publicClient.multicall({ contracts: positionCalls, allowFailure: true }),
        publicClient.multicall({ contracts: marketCalls, allowFailure: true }),
      ]);

      const activePositions: UserPosition[] = [];

      for (let i = 0; i < markets.length; i++) {
        const posResult = positionResults[i];
        const mktResult = marketResults[i];

        if (posResult.status !== 'success' || mktResult.status !== 'success') continue;

        const [, borrowShares, collateral] = posResult.result as [bigint, bigint, bigint];

        // Skip markets with no position
        if (borrowShares === 0n && collateral === 0n) continue;

        // Compute debt from shares
        const [, , totalBorrowAssets, totalBorrowShares] = mktResult.result as [bigint, bigint, bigint, bigint, bigint, bigint];
        let debt = 0n;
        if (borrowShares > 0n && totalBorrowShares > 0n) {
          debt = (borrowShares * totalBorrowAssets) / totalBorrowShares;
        }

        const market = markets[i];
        const collateralNum = Number(formatEther(collateral));
        const debtNum = Number(formatEther(debt));

        // For LST/ETH pairs, rate >= 1.0 — use 1.0 as conservative default
        const rate = 1.0;
        const collateralValue = collateralNum * rate;
        const equity = collateralValue - debtNum;

        const leverage = equity > 0 ? collateralValue / equity : 0;
        const healthFactor = debtNum > 0
          ? (collateralNum * rate * market.lltv) / debtNum
          : 999;

        activePositions.push({
          marketId: market.uniqueKey,
          pair: market.pair,
          collateralSymbol: market.collateralSymbol,
          loanSymbol: market.loanSymbol,
          lltv: market.lltv,
          supplyApy: market.supplyApy,
          borrowApy: market.borrowApy,
          collateral,
          debt,
          leverage,
          healthFactor,
        });
      }

      setPositions(activePositions);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching multi-market positions:', err);
      setError(err.message || 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, markets, publicClient]);

  // Initial fetch + 30s refresh
  useEffect(() => {
    let cancelled = false;
    const run = async () => { if (!cancelled) await fetchPositions(); };
    run();
    const interval = setInterval(run, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchPositions]);

  return { positions, loading, error, refresh: fetchPositions };
}
