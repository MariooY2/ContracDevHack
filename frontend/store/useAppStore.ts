import { create } from 'zustand';
import type { ReserveInfo } from '@/lib/types';

interface AppState {
  // ── On-chain data ──────────────────────────────────────────────────────────
  collateralBalance: bigint;
  debtBalance: bigint;
  healthFactor: number;
  reserveInfo: ReserveInfo | null;
  exchangeRate: number;
  walletBalance: bigint;

  // ── UI ─────────────────────────────────────────────────────────────────────
  activeTab: 'leverage' | 'unwind';

  // ── Loading flags ──────────────────────────────────────────────────────────
  isInitialLoad: boolean;
  isMarketLoading: boolean;
  isPositionLoading: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  setMarketData: (data: { reserveInfo: ReserveInfo | null; exchangeRate: number }) => void;
  setPositionData: (data: {
    collateralBalance: bigint;
    debtBalance: bigint;
    healthFactor: number;
    walletBalance: bigint;
  }) => void;
  clearPositionData: () => void;
  setActiveTab: (tab: 'leverage' | 'unwind') => void;
  setInitialLoadDone: () => void;
  startRefresh: (walletConnected: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  collateralBalance: 0n,
  debtBalance: 0n,
  healthFactor: 0,
  reserveInfo: null,
  exchangeRate: 1.228,
  walletBalance: 0n,
  activeTab: 'leverage',

  isInitialLoad: true,
  isMarketLoading: true,
  isPositionLoading: false,

  setMarketData: ({ reserveInfo, exchangeRate }) =>
    set({ reserveInfo, exchangeRate, isMarketLoading: false }),

  setPositionData: ({ collateralBalance, debtBalance, healthFactor, walletBalance }) =>
    set({ collateralBalance, debtBalance, healthFactor, walletBalance, isPositionLoading: false }),

  clearPositionData: () =>
    set({
      collateralBalance: 0n,
      debtBalance: 0n,
      healthFactor: 0,
      walletBalance: 0n,
      isPositionLoading: false,
    }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setInitialLoadDone: () => set({ isInitialLoad: false }),

  startRefresh: (walletConnected) =>
    set({ isMarketLoading: true, isPositionLoading: walletConnected }),
}));
