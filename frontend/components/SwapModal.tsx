'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWalletClient } from 'wagmi';
import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { baseMainnet } from '@/lib/wagmi';
import { BASE_RPC_URL } from '@/lib/types';
import { ERC20_ABI } from '@/lib/leverageContract';
import {
  getLiFiRoutes, getLiFiTokens, getLiFiChains, getStepTransaction,
  type Route, type Token, type ExtendedChain, type RouteOrder,
} from '@/lib/lifi';
import { getTokenImageUrl } from '@/lib/tokenImages';
import TokenSelector from './swap/TokenSelector';
import ChainSelector from './swap/ChainSelector';
import RouteCard, { RouteCardSkeleton } from './swap/RouteCard';
import SwapProgress, { type SwapPhase } from './swap/SwapProgress';

const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const BASE_CHAIN_ID = 8453;

const DEFAULT_ETH: Token = {
  chainId: BASE_CHAIN_ID,
  address: NATIVE_ETH_ADDRESS,
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  priceUSD: '0',
  logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
};

type SwapMode = 'swap' | 'bridge';

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  collateralSymbol: string;
  collateralAddress: string;
  loanSymbol: string;
  loanAddress: string;
  onSuccess?: () => void;
}

const SLIPPAGE_PRESETS = [0.001, 0.005, 0.01];

export default function SwapModal({
  open, onClose, collateralSymbol, collateralAddress, loanSymbol, loanAddress, onSuccess,
}: SwapModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const publicClient = useMemo(() => createPublicClient({
    chain: baseMainnet,
    transport: http(BASE_RPC_URL, { batch: true, retryCount: 3 }),
  }), []);

  // Mode
  const [mode, setMode] = useState<SwapMode>('swap');

  // Chain state (for bridge mode)
  const [allChains, setAllChains] = useState<ExtendedChain[]>([]);
  const [fromChain, setFromChain] = useState<ExtendedChain | null>(null);
  const [chainsLoading, setChainsLoading] = useState(false);

  // Token state
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token>(DEFAULT_ETH);
  const [tokensLoading, setTokensLoading] = useState(false);

  // Input state
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.005);
  const [customSlippage, setCustomSlippage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feeDetailsOpen, setFeeDetailsOpen] = useState(false);

  // Route state
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState('');
  const [routeOrder, setRouteOrder] = useState<RouteOrder>('CHEAPEST');

  // Balance
  const [walletBalance, setWalletBalance] = useState(0n);

  // Swap execution state
  const [needsApproval, setNeedsApproval] = useState(false);
  const [swapPhase, setSwapPhase] = useState<SwapPhase>('idle');
  const [swapError, setSwapError] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const selectedRoute = routes[selectedRouteIndex] ?? null;
  const isNative = selectedToken.address.toLowerCase() === NATIVE_ETH_ADDRESS;
  const busy = swapPhase !== 'idle' && swapPhase !== 'done' && swapPhase !== 'error';

  // Determine the from-chain ID based on mode
  const fromChainId = mode === 'bridge' && fromChain ? fromChain.id : BASE_CHAIN_ID;
  // Is cross-chain?
  const isCrossChain = mode === 'bridge' && fromChain && fromChain.id !== BASE_CHAIN_ID;

  // Load chains on first open
  useEffect(() => {
    if (!open || allChains.length > 0) return;
    setChainsLoading(true);
    getLiFiChains()
      .then((chains) => {
        setAllChains(chains);
        const base = chains.find(c => c.id === BASE_CHAIN_ID);
        if (base && !fromChain) setFromChain(base);
      })
      .catch(() => {})
      .finally(() => setChainsLoading(false));
  }, [open, allChains.length, fromChain]);

  // Load tokens when chain changes or on first open
  useEffect(() => {
    if (!open) return;
    setTokensLoading(true);
    getLiFiTokens(fromChainId)
      .then((tokens) => {
        setAllTokens(tokens);
        // Find native token or ETH equivalent
        const native = tokens.find(t => t.address.toLowerCase() === NATIVE_ETH_ADDRESS);
        if (native) {
          setSelectedToken(native);
        } else if (tokens.length > 0) {
          // Pick the first token (usually native)
          setSelectedToken(tokens[0]);
        }
      })
      .catch(() => {})
      .finally(() => setTokensLoading(false));
  }, [open, fromChainId]);

  // Fetch wallet balance (only works on Base chain — same chain as RPC)
  useEffect(() => {
    if (!open || !address) return;
    // Balance only works for Base chain tokens since our publicClient is Base
    if (fromChainId !== BASE_CHAIN_ID) {
      setWalletBalance(0n);
      return;
    }
    if (isNative) {
      publicClient.getBalance({ address }).then(setWalletBalance).catch(() => {});
    } else {
      publicClient.readContract({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }).then((bal) => setWalletBalance(bal as bigint)).catch(() => {});
    }
  }, [open, address, selectedToken, publicClient, isNative, fromChainId]);

  // Debounced routes fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (refreshRef.current) clearTimeout(refreshRef.current);
    setRoutes([]);
    setRoutesError('');
    setSelectedRouteIndex(0);

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0 || !address) {
      setRoutesLoading(false);
      return;
    }

    setRoutesLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const fromAmount = parseUnits(amount, selectedToken.decimals).toString();
        const response = await getLiFiRoutes({
          fromToken: selectedToken.address,
          toToken: collateralAddress,
          fromAmount,
          fromAddress: address,
          toAddress: address,
          fromChain: fromChainId,
          toChain: BASE_CHAIN_ID,
          slippage,
        }, 3, routeOrder);

        setRoutes(response.routes);
        setSelectedRouteIndex(0);
        setRoutesError('');

        if (response.routes.length > 0 && fromChainId === BASE_CHAIN_ID) {
          await checkApproval(response.routes[0]);
        }

        refreshRef.current = setTimeout(() => {
          setRoutes(prev => [...prev]);
        }, 30000);
      } catch (err: any) {
        setRoutesError(err.message?.slice(0, 80) || 'Failed to find routes');
        setRoutes([]);
      } finally {
        setRoutesLoading(false);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (refreshRef.current) clearTimeout(refreshRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, address, selectedToken.address, selectedToken.decimals, collateralAddress, slippage, fromChainId, routeOrder]);

  const checkApproval = useCallback(async (route: Route) => {
    if (!address || isNative || fromChainId !== BASE_CHAIN_ID) {
      setNeedsApproval(false);
      return;
    }
    try {
      const approvalAddress = route.steps[0]?.estimate?.approvalAddress;
      if (!approvalAddress) { setNeedsApproval(false); return; }

      const allowance = await publicClient.readContract({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, approvalAddress as `0x${string}`],
      }) as bigint;
      setNeedsApproval(allowance < parseUnits(amount || '0', selectedToken.decimals));
    } catch {
      setNeedsApproval(false);
    }
  }, [address, isNative, publicClient, selectedToken, amount, fromChainId]);

  useEffect(() => {
    if (selectedRoute) checkApproval(selectedRoute);
  }, [selectedRouteIndex, selectedRoute, checkApproval]);

  const handleApprove = useCallback(async () => {
    if (!walletClient || !selectedRoute || !address) return;
    setSwapPhase('approving');
    setSwapError('');
    try {
      const approvalAddress = selectedRoute.steps[0]?.estimate?.approvalAddress;
      if (!approvalAddress) return;

      const hash = await walletClient.writeContract({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [approvalAddress as `0x${string}`, parseUnits(amount, selectedToken.decimals)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setNeedsApproval(false);
      setSwapPhase('idle');
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('denied')) {
        setSwapPhase('idle');
        return;
      }
      setSwapError(err.shortMessage || err.message?.slice(0, 80) || 'Approval failed');
      setSwapPhase('error');
      setTimeout(() => { setSwapPhase('idle'); setSwapError(''); }, 4000);
    }
  }, [walletClient, selectedRoute, address, selectedToken, amount, publicClient]);

  const handleSwap = useCallback(async () => {
    if (!walletClient || !selectedRoute || !address) return;
    setSwapPhase('sending');
    setSwapError('');
    setTxHash(null);

    try {
      const freshStep = await getStepTransaction(selectedRoute.steps[0] as any);
      const tx = freshStep.transactionRequest;
      if (!tx) throw new Error('No transaction data');

      const hash = await walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value ?? '0'),
        gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
      });

      setTxHash(hash);
      setSwapPhase('confirming');
      await publicClient.waitForTransactionReceipt({ hash });
      setSwapPhase('done');
      onSuccess?.();

      setTimeout(() => {
        resetState();
        onClose();
      }, 2500);
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('denied')) {
        setSwapPhase('idle');
        return;
      }
      setSwapError(err.shortMessage || err.message?.slice(0, 80) || 'Swap failed');
      setSwapPhase('error');
      setTimeout(() => { setSwapPhase('idle'); setSwapError(''); }, 4000);
    }
  }, [walletClient, selectedRoute, address, publicClient, onSuccess, onClose]);

  const resetState = useCallback(() => {
    setAmount('');
    setRoutes([]);
    setRoutesError('');
    setSelectedRouteIndex(0);
    setSwapPhase('idle');
    setSwapError('');
    setTxHash(null);
    setNeedsApproval(false);
    setSettingsOpen(false);
    setFeeDetailsOpen(false);
    setMode('swap');
    setRouteOrder('CHEAPEST');
    const ethToken = allTokens.find(t => t.address.toLowerCase() === NATIVE_ETH_ADDRESS) ?? DEFAULT_ETH;
    setSelectedToken(ethToken);
    const base = allChains.find(c => c.id === BASE_CHAIN_ID);
    if (base) setFromChain(base);
  }, [allTokens, allChains]);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  // Computed values
  const outputAmount = selectedRoute ? Number(formatUnits(BigInt(selectedRoute.toAmount), selectedRoute.toToken.decimals)) : 0;
  const inputNum = parseFloat(amount) || 0;
  const rate = inputNum > 0 && outputAmount > 0 ? outputAmount / inputNum : 0;
  const formattedBalance = Number(formatUnits(walletBalance, selectedToken.decimals));
  const inputUSD = inputNum * parseFloat(selectedToken.priceUSD || '0');

  const fastestIdx = routes.length > 1
    ? routes.reduce((best, r, i) => {
        const dur = r.steps.reduce((s, step) => s + (step.estimate?.executionDuration ?? 0), 0);
        const bestDur = routes[best].steps.reduce((s, step) => s + (step.estimate?.executionDuration ?? 0), 0);
        return dur < bestDur ? i : best;
      }, 0)
    : 0;

  const gasCostUSD = selectedRoute?.gasCostUSD ? parseFloat(selectedRoute.gasCostUSD) : 0;
  const feeCosts = selectedRoute?.steps.flatMap(s => s.estimate?.feeCosts ?? []) ?? [];
  const totalFeeUSD = feeCosts.reduce((sum, f) => sum + parseFloat(f.amountUSD || '0'), 0);
  const priceImpact = selectedRoute && parseFloat(selectedRoute.fromAmountUSD) > 0
    ? ((1 - parseFloat(selectedRoute.toAmountUSD) / parseFloat(selectedRoute.fromAmountUSD)) * 100)
    : 0;
  const minOutput = selectedRoute ? Number(formatUnits(BigInt(selectedRoute.toAmountMin), selectedRoute.toToken.decimals)) : 0;

  const getButtonLabel = () => {
    if (!address) return 'Connect Wallet';
    if (!amount || parseFloat(amount) <= 0) return 'Enter Amount';
    if (routesLoading) return 'Finding Routes...';
    if (routesError) return 'No Routes Found';
    if (routes.length === 0 && !routesLoading) return 'Enter Amount';
    if (needsApproval) return `Approve ${selectedToken.symbol}`;
    return isCrossChain ? 'Bridge & Swap' : 'Swap';
  };

  const canSwap = selectedRoute && !busy && !routesLoading && amount && parseFloat(amount) > 0 && address;
  const buttonDisabled = !canSwap || (routesError ? true : false);

  // Check if route involves a bridge
  const hasBridgeStep = selectedRoute?.steps.some(s =>
    s.includedSteps?.some(is => (is.type as string) === 'cross')
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(9,9,9,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{
              background: '#111112',
              border: '1px solid rgba(41,115,255,0.12)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 60px rgba(41,115,255,0.04)',
              scrollbarWidth: 'thin',
            }}
          >
            {/* Accent bar */}
            <div className="h-0.5" style={{ background: isCrossChain
              ? 'linear-gradient(90deg, #a78bfa, #2973ff, #10B981, transparent)'
              : 'linear-gradient(90deg, #2973ff, #a78bfa, transparent)'
            }} />

            {/* ===== HEADER ===== */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(41,115,255,0.08)', border: '1px solid rgba(41,115,255,0.15)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2973ff" strokeWidth="2">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-black font-mono" style={{ color: 'var(--text-primary)' }}>
                    Get {collateralSymbol}
                  </h3>
                  <p className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    Powered by LI.FI — {isCrossChain ? 'bridging + swap' : 'best DEX routes'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                  style={{ color: settingsOpen ? '#2973ff' : 'var(--text-muted)' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ===== MODE TOGGLE ===== */}
            <div className="px-5 pb-3">
              <div
                className="flex rounded-xl p-0.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
              >
                {(['swap', 'bridge'] as SwapMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      if (m !== mode) {
                        setMode(m);
                        setAmount('');
                        setRoutes([]);
                        setRoutesError('');
                        if (m === 'swap') {
                          const base = allChains.find(c => c.id === BASE_CHAIN_ID);
                          if (base) setFromChain(base);
                        }
                      }
                    }}
                    disabled={busy}
                    className="flex-1 py-2 rounded-[10px] text-[11px] font-bold font-mono uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                    style={{
                      background: mode === m ? 'rgba(41,115,255,0.1)' : 'transparent',
                      color: mode === m ? '#2973ff' : 'var(--text-muted)',
                      border: mode === m ? '1px solid rgba(41,115,255,0.2)' : '1px solid transparent',
                    }}
                  >
                    {m === 'swap' ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 12h5l2-9 6 18 2-9h5" />
                      </svg>
                    )}
                    {m === 'swap' ? 'Swap' : 'Bridge'}
                  </button>
                ))}
              </div>
            </div>

            {/* ===== SLIPPAGE SETTINGS ===== */}
            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-3">
                    <div
                      className="rounded-xl p-3"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
                    >
                      <label className="text-[9px] font-mono font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--text-muted)' }}>
                        Slippage Tolerance
                      </label>
                      <div className="flex items-center gap-2">
                        {SLIPPAGE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            onClick={() => { setSlippage(preset); setCustomSlippage(''); }}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-bold font-mono transition-all"
                            style={{
                              background: slippage === preset && !customSlippage ? '#2973ff' : 'rgba(255,255,255,0.04)',
                              color: slippage === preset && !customSlippage ? '#fff' : 'var(--text-secondary)',
                              border: `1px solid ${slippage === preset && !customSlippage ? 'transparent' : 'var(--border)'}`,
                            }}
                          >
                            {(preset * 100).toFixed(1)}%
                          </button>
                        ))}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={customSlippage}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d*\.?\d*$/.test(v)) {
                                setCustomSlippage(v);
                                const parsed = parseFloat(v);
                                if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
                                  setSlippage(parsed / 100);
                                }
                              }
                            }}
                            placeholder="Custom"
                            className="w-full py-1.5 px-2 rounded-lg text-[11px] font-bold font-mono outline-none text-center bg-transparent"
                            style={{
                              border: `1px solid ${customSlippage ? 'rgba(41,115,255,0.3)' : 'var(--border)'}`,
                              color: 'var(--text-primary)',
                            }}
                          />
                          {customSlippage && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>%</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="px-5 pb-5 space-y-3">
              {/* ===== BRIDGE: CHAIN SELECTOR ===== */}
              <AnimatePresence>
                {mode === 'bridge' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-2 mb-1">
                      <ChainSelector
                        chains={allChains}
                        selected={fromChain}
                        onSelect={(chain) => {
                          setFromChain(chain);
                          setAmount('');
                          setRoutes([]);
                          setAllTokens([]); // force token reload
                        }}
                        disabled={busy || chainsLoading}
                        label="From"
                      />
                      <div
                        className="flex items-center gap-2 py-2 px-3 rounded-xl"
                        style={{ background: 'rgba(41,115,255,0.04)', border: '1px solid rgba(41,115,255,0.1)' }}
                      >
                        {/* Base chain is always destination */}
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(41,115,255,0.15)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2973ff" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[8px] font-mono uppercase tracking-widest block" style={{ color: 'var(--text-muted)' }}>
                            To
                          </span>
                          <span className="font-mono text-xs font-bold block" style={{ color: '#2973ff' }}>
                            Base
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Cross-chain indicator */}
                    {isCrossChain && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 rounded-lg px-3 py-1.5 mb-1"
                        style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.1)' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                          <path d="M2 12h5l2-9 6 18 2-9h5" />
                        </svg>
                        <span className="text-[10px] font-mono font-bold" style={{ color: '#a78bfa' }}>
                          Cross-chain: {fromChain?.name} → Base
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ===== YOU PAY ===== */}
              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    You Pay {mode === 'bridge' && fromChain ? `on ${fromChain.name}` : ''}
                  </span>
                  {fromChainId === BASE_CHAIN_ID && (
                    <button
                      className="text-[10px] font-mono transition-colors hover:text-[#2973ff]"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => {
                        if (walletBalance > 0n) {
                          if (isNative) {
                            const buffer = parseUnits('0.001', 18);
                            const max = walletBalance > buffer ? walletBalance - buffer : 0n;
                            setAmount(formatUnits(max, selectedToken.decimals));
                          } else {
                            setAmount(formatUnits(walletBalance, selectedToken.decimals));
                          }
                        }
                      }}
                    >
                      Balance: {formattedBalance.toFixed(4)}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <TokenSelector
                    tokens={allTokens}
                    selected={selectedToken}
                    onSelect={(token) => {
                      setSelectedToken(token);
                      setAmount('');
                      setRoutes([]);
                    }}
                    disabled={busy || tokensLoading}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
                    }}
                    disabled={busy}
                    className="flex-1 bg-transparent text-xl font-bold font-mono outline-none min-w-0 text-right"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
                {inputUSD > 0 && (
                  <p className="text-right mt-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    ≈${inputUSD.toFixed(2)}
                  </p>
                )}
              </div>

              {/* ===== ARROW ===== */}
              <div className="flex justify-center -my-1 relative z-10">
                <motion.div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: '#111112',
                    border: `1px solid ${isCrossChain ? 'rgba(167,139,250,0.2)' : 'rgba(41,115,255,0.15)'}`,
                    boxShadow: `0 0 15px ${isCrossChain ? 'rgba(167,139,250,0.08)' : 'rgba(41,115,255,0.05)'}`,
                  }}
                  whileHover={{ scale: 1.1 }}
                >
                  {isCrossChain ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
                      <path d="M2 12h5l2-9 6 18 2-9h5" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2973ff" strokeWidth="2.5">
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                  )}
                </motion.div>
              </div>

              {/* ===== YOU RECEIVE ===== */}
              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    You Receive on Base
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 py-2 px-3 rounded-xl" style={{ background: 'rgba(41,115,255,0.06)', border: '1px solid rgba(41,115,255,0.12)' }}>
                    {(() => {
                      const collateralImg = getTokenImageUrl(collateralSymbol);
                      return collateralImg ? (
                        <img src={collateralImg} alt={collateralSymbol} className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(41,115,255,0.15)' }}>
                          <span className="text-[8px] font-bold font-mono" style={{ color: '#2973ff' }}>
                            {collateralSymbol.slice(0, 2)}
                          </span>
                        </div>
                      );
                    })()}
                    <span className="font-mono text-sm font-bold" style={{ color: '#2973ff' }}>
                      {collateralSymbol}
                    </span>
                  </div>
                  <span
                    className="flex-1 text-xl font-bold font-mono min-w-0 text-right"
                    style={{ color: routesLoading ? 'var(--text-muted)' : 'var(--text-primary)' }}
                  >
                    {routesLoading ? '...' : outputAmount > 0 ? outputAmount.toFixed(6) : '0.0'}
                  </span>
                </div>
                {selectedRoute?.toAmountUSD && parseFloat(selectedRoute.toAmountUSD) > 0 && (
                  <p className="text-right mt-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    ≈${parseFloat(selectedRoute.toAmountUSD).toFixed(2)}
                  </p>
                )}
                {/* Exchange rate display */}
                {rate > 0 && (
                  <div
                    className="flex items-center justify-between mt-2 pt-2"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      Exchange Rate
                    </span>
                    <span className="text-[10px] font-mono font-bold" style={{ color: '#10B981' }}>
                      1 {selectedToken.symbol} = {rate.toFixed(6)} {collateralSymbol}
                    </span>
                  </div>
                )}
              </div>

              {/* ===== ROUTE COMPARISON ===== */}
              {(routesLoading || routes.length > 0) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        {routes.length > 1 ? `${routes.length} Routes` : 'Best Route'}
                      </span>
                      {hasBridgeStep && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase"
                          style={{ background: 'rgba(167,139,250,0.08)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.15)' }}
                        >
                          Bridge
                        </span>
                      )}
                    </div>
                    {routes.length > 0 && (
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {(slippage * 100).toFixed(1)}% slip
                      </span>
                    )}
                  </div>

                  {/* Route sort toggle */}
                  <div className="flex rounded-lg p-0.5 mb-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    {([
                      { key: 'CHEAPEST' as RouteOrder, label: 'Best Rate', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
                      { key: 'FASTEST' as RouteOrder, label: 'Fastest', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
                      { key: 'RECOMMENDED' as RouteOrder, label: 'Optimal', icon: 'M22 11.08V12a10 10 0 11-5.93-9.14' },
                    ]).map(({ key, label, icon }) => (
                      <button
                        key={key}
                        onClick={() => setRouteOrder(key)}
                        disabled={busy || routesLoading}
                        className="flex-1 py-1.5 rounded-md text-[9px] font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                        style={{
                          background: routeOrder === key ? 'rgba(41,115,255,0.1)' : 'transparent',
                          color: routeOrder === key ? '#2973ff' : 'var(--text-muted)',
                          border: routeOrder === key ? '1px solid rgba(41,115,255,0.2)' : '1px solid transparent',
                        }}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d={icon} />
                        </svg>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {routesLoading ? (
                      <>
                        <RouteCardSkeleton index={0} />
                        <RouteCardSkeleton index={1} />
                      </>
                    ) : (
                      routes.map((route, i) => (
                        <RouteCard
                          key={route.id}
                          route={route}
                          index={i}
                          isSelected={i === selectedRouteIndex}
                          isBest={i === 0}
                          isFastest={i === fastestIdx && routes.length > 1}
                          onSelect={() => setSelectedRouteIndex(i)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ===== ROUTE ERROR ===== */}
              {routesError && (
                <div
                  className="rounded-xl px-4 py-2.5 text-center"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}
                >
                  <p className="text-[10px] font-mono font-bold" style={{ color: '#ef4444' }}>
                    {routesError}
                  </p>
                </div>
              )}

              {/* ===== FEE BREAKDOWN ===== */}
              {selectedRoute && (
                <div>
                  <button
                    onClick={() => setFeeDetailsOpen(!feeDetailsOpen)}
                    className="flex items-center gap-1.5 w-full text-left transition-colors"
                  >
                    <motion.svg
                      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5"
                      animate={{ rotate: feeDetailsOpen ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </motion.svg>
                    <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--text-muted)' }}>
                      Fee details
                    </span>
                  </button>
                  <AnimatePresence>
                    {feeDetailsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div
                          className="mt-2 rounded-xl p-3 space-y-1.5 text-[10px] font-mono"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                        >
                          <div className="flex justify-between">
                            <span>Rate</span>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              1 {selectedToken.symbol} = {rate.toFixed(6)} {collateralSymbol}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Min. received</span>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {minOutput.toFixed(6)} {collateralSymbol}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Price impact</span>
                            <span style={{
                              color: priceImpact < 0.5 ? '#10B981' : priceImpact < 2 ? '#f59e0b' : '#ef4444'
                            }}>
                              {priceImpact.toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Gas cost</span>
                            <span style={{ color: 'var(--text-secondary)' }}>${gasCostUSD.toFixed(2)}</span>
                          </div>
                          {totalFeeUSD > 0 && (
                            <div className="flex justify-between">
                              <span>Protocol / bridge fees</span>
                              <span style={{ color: 'var(--text-secondary)' }}>${totalFeeUSD.toFixed(2)}</span>
                            </div>
                          )}
                          {isCrossChain && (
                            <div className="flex justify-between">
                              <span>Route type</span>
                              <span style={{ color: '#a78bfa' }}>Cross-chain bridge</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Slippage tolerance</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{(slippage * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ===== SWAP PROGRESS ===== */}
              <AnimatePresence>
                {swapPhase !== 'idle' && (
                  <SwapProgress
                    phase={swapPhase}
                    error={swapError}
                    needsApproval={needsApproval}
                    txHash={txHash}
                  />
                )}
              </AnimatePresence>

              {/* ===== ACTION BUTTONS ===== */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  disabled={busy}
                  className="flex-1 py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-widest transition-all hover:opacity-80 disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <motion.button
                  onClick={needsApproval ? handleApprove : handleSwap}
                  disabled={buttonDisabled}
                  className="flex-[1.5] py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-widest transition-all disabled:opacity-40 overflow-hidden relative"
                  style={{
                    background: buttonDisabled
                      ? 'rgba(255,255,255,0.04)'
                      : isCrossChain
                        ? 'linear-gradient(135deg, #a78bfa, #2973ff)'
                        : '#2973ff',
                    color: buttonDisabled ? 'var(--text-muted)' : '#ffffff',
                    cursor: buttonDisabled ? 'not-allowed' : 'pointer',
                  }}
                  whileHover={!buttonDisabled ? { scale: 1.01 } : {}}
                  whileTap={!buttonDisabled ? { scale: 0.99 } : {}}
                >
                  {!buttonDisabled && (
                    <motion.div
                      className="absolute inset-0"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.6, ease: 'easeInOut' }}
                    />
                  )}
                  <span className="relative z-10">{getButtonLabel()}</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
