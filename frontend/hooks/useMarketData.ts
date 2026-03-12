'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useLeverageContract } from './useLeverageContract';
import { useAppStore } from '@/store/useAppStore';

/**
 * Lightweight hook that fetches market data (reserveInfo + exchangeRate)
 * and writes to the Zustand store. Used by pages that need market context
 * without position data (e.g., analytics).
 */
export function useMarketData() {
  const { getReserveInfo, getExchangeRate } = useLeverageContract();
  const { reserveInfo, exchangeRate, isMarketLoading, setMarketData, setInitialLoadDone } = useAppStore();

  const fnRef = useRef({ getReserveInfo, getExchangeRate });
  useEffect(() => {
    fnRef.current = { getReserveInfo, getExchangeRate };
  }, [getReserveInfo, getExchangeRate]);

  const fetchMarketData = useCallback(async () => {
    try {
      const fns = fnRef.current;
      const [reserve, rate] = await Promise.all([fns.getReserveInfo(), fns.getExchangeRate()]);
      setMarketData({ reserveInfo: reserve ?? null, exchangeRate: rate });
    } catch (err) {
      console.error('Error fetching market data:', err);
    } finally {
      setInitialLoadDone();
    }
  }, [setMarketData, setInitialLoadDone]);

  // Fetch on mount + 30s refresh
  useEffect(() => {
    let cancelled = false;
    const run = async () => { if (!cancelled) await fetchMarketData(); };
    run();
    const interval = setInterval(run, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchMarketData]);

  return { reserveInfo, exchangeRate, isMarketLoading };
}
