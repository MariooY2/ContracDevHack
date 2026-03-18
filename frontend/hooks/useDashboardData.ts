'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { formatEther } from 'viem';
import { useLeverageContract } from './useLeverageContract';
import { useAppStore } from '@/store/useAppStore';
import { MORPHO_MARKET_ID } from '@/lib/leverageContract';

/**
 * Full dashboard data hook — fetches market data + user position + unwind state.
 * Accepts an optional marketId to read position for any market (defaults to MORPHO_MARKET_ID).
 */
export function useDashboardData(marketId?: string) {
  const {
    isConnected,
    getUserPosition,
    readPositionForMarket,
    getReserveInfo,
    getExchangeRate,
    getWstethBalance,
    executeDeleverage,
  } = useLeverageContract();

  const {
    collateralBalance,
    debtBalance,
    healthFactor,
    reserveInfo,
    exchangeRate,
    walletBalance,
    activeTab,
    isInitialLoad,
    isMarketLoading,
    isPositionLoading,
    setMarketData,
    setPositionData,
    clearPositionData,
    setActiveTab,
    setInitialLoadDone,
    startRefresh,
  } = useAppStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Unwind modal state
  const [showUnwindModal, setShowUnwindModal] = useState(false);
  const [unwindExecuting, setUnwindExecuting] = useState(false);
  const [unwindTxStatus, setUnwindTxStatus] = useState('');
  const [unwindIsError, setUnwindIsError] = useState(false);

  // Determine which market to read position for
  const targetMarketId = marketId || MORPHO_MARKET_ID;
  const isDefaultMarket = targetMarketId === MORPHO_MARKET_ID;

  const fnRef = useRef({ getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance, readPositionForMarket });
  const connectedRef = useRef(isConnected);
  const marketIdRef = useRef(targetMarketId);
  useEffect(() => {
    fnRef.current = { getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance, readPositionForMarket };
  }, [getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance, readPositionForMarket]);
  useEffect(() => { connectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { marketIdRef.current = targetMarketId; }, [targetMarketId]);

  const refreshData = useCallback(async (showLoading = false) => {
    if (showLoading) startRefresh(connectedRef.current);
    try {
      const fns = fnRef.current;
      const currentMarketId = marketIdRef.current;
      const isDefault = currentMarketId === MORPHO_MARKET_ID;

      // Market data: use on-chain reserve info for default market, exchange rate always
      const [reserve, rate] = await Promise.all([
        isDefault ? fns.getReserveInfo() : null,
        fns.getExchangeRate(),
      ]);
      setMarketData({ reserveInfo: reserve ?? null, exchangeRate: rate });

      if (connectedRef.current) {
        // Position: use parameterized reader for any market
        const [posData, wBal] = await Promise.all([
          fns.readPositionForMarket(currentMarketId),
          fns.getWstethBalance(),
        ]);

        const collateral = posData.collateral;
        const debt = posData.debt;
        // Health factor: for LST/ETH pairs, rate >= 1.0; use rate for default, 1.0 for others (conservative)
        const effectiveRate = isDefault ? rate : 1.0;
        const lltv = 0.945; // default LLTV for LST/ETH markets
        const hf = debt > 0n
          ? (Number(formatEther(collateral)) * effectiveRate * lltv) / Number(formatEther(debt))
          : 999;

        setPositionData({
          collateralBalance: collateral,
          debtBalance: debt,
          healthFactor: hf,
          walletBalance: wBal,
        });
      } else {
        clearPositionData();
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setInitialLoadDone();
    }
  }, [setMarketData, setPositionData, clearPositionData, setInitialLoadDone, startRefresh]);

  const handleUnwindConfirm = useCallback(async () => {
    setShowUnwindModal(false);
    setUnwindExecuting(true);
    setUnwindIsError(false);
    setUnwindTxStatus('Executing flash loan unwind...');
    try {
      await executeDeleverage();
      setUnwindTxStatus('Position closed successfully!');
      refreshData();
      setTimeout(() => setUnwindTxStatus(''), 4000);
    } catch (err: any) {
      const errorMsg = err.message || err.toString();
      setUnwindTxStatus(errorMsg.slice(0, 80));
      setUnwindIsError(true);
    }
    setUnwindExecuting(false);
  }, [executeDeleverage, refreshData]);

  // Initial + interval refresh — re-run when marketId changes
  useEffect(() => {
    let cancelled = false;
    const run = async (showLoading: boolean) => { if (!cancelled) await refreshData(showLoading); };
    run(true);
    const interval = setInterval(() => run(false), 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshData, targetMarketId]);

  // Refresh on wallet connection change
  useEffect(() => { refreshData(true); }, [isConnected, refreshData]);

  // Derived calculations
  const collateralEth = Number(formatEther(collateralBalance)) * exchangeRate;
  const debtEth = Number(formatEther(debtBalance));
  const currentLeverage = debtBalance > 0n && collateralEth > debtEth
    ? collateralEth / (collateralEth - debtEth) : 1;
  const debtInWsteth = exchangeRate > 0 ? BigInt(Math.floor(Number(debtBalance) / exchangeRate)) : 0n;
  const unwindEquity = collateralBalance > debtInWsteth ? collateralBalance - debtInWsteth : 0n;

  const stakingYield = reserveInfo?.stakingYield || 0;
  const supplyAPY = reserveInfo?.supplyAPY || 0;
  const borrowAPY = reserveInfo?.borrowAPY || 0;
  const lev = debtBalance > 0n ? currentLeverage : 2.0;
  const netAPY = (stakingYield + supplyAPY) * lev - borrowAPY * (lev - 1);

  return {
    // State
    isConnected,
    mounted,
    collateralBalance,
    debtBalance,
    healthFactor,
    reserveInfo,
    exchangeRate,
    walletBalance,
    activeTab,
    isInitialLoad,
    isMarketLoading,
    isPositionLoading,

    // Derived
    collateralEth,
    debtEth,
    currentLeverage,
    debtInWsteth,
    unwindEquity,
    netAPY,
    lev,

    // Actions
    setActiveTab,
    refreshData,

    // Unwind
    showUnwindModal,
    setShowUnwindModal,
    unwindExecuting,
    unwindTxStatus,
    unwindIsError,
    handleUnwindConfirm,
  };
}
