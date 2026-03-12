'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { formatEther } from 'viem';
import { useLeverageContract } from './useLeverageContract';
import { useAppStore } from '@/store/useAppStore';

/**
 * Full dashboard data hook — fetches market data + user position + unwind state.
 * Used on the market detail page (/markets/[marketId]).
 */
export function useDashboardData() {
  const {
    isConnected,
    getUserPosition,
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

  const fnRef = useRef({ getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance });
  const connectedRef = useRef(isConnected);
  useEffect(() => {
    fnRef.current = { getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance };
  }, [getReserveInfo, getExchangeRate, getUserPosition, getWstethBalance]);
  useEffect(() => { connectedRef.current = isConnected; }, [isConnected]);

  const refreshData = useCallback(async (showLoading = false) => {
    if (showLoading) startRefresh(connectedRef.current);
    try {
      const fns = fnRef.current;
      const [reserve, rate] = await Promise.all([fns.getReserveInfo(), fns.getExchangeRate()]);
      setMarketData({ reserveInfo: reserve ?? null, exchangeRate: rate });

      if (connectedRef.current) {
        const [position, wBal] = await Promise.all([fns.getUserPosition(), fns.getWstethBalance()]);
        if (position) {
          setPositionData({
            collateralBalance: position.totalCollateralBase,
            debtBalance: position.totalDebtBase,
            healthFactor: position.healthFactor,
            walletBalance: wBal,
          });
        } else {
          setPositionData({ collateralBalance: 0n, debtBalance: 0n, healthFactor: 0, walletBalance: wBal });
        }
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

  // Initial + interval refresh
  useEffect(() => {
    let cancelled = false;
    const run = async (showLoading: boolean) => { if (!cancelled) await refreshData(showLoading); };
    run(true);
    const interval = setInterval(() => run(false), 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshData]);

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
