'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWalletClient } from 'wagmi';
import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { baseMainnet } from '@/lib/wagmi';
import { BASE_RPC_URL } from '@/lib/types';
import { ERC20_ABI } from '@/lib/leverageContract';
import { getLiFiQuote, type LiFiStep } from '@/lib/lifi';

// LiFi uses this address for native ETH
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

interface FromToken {
  symbol: string;
  address: string;
  isNative: boolean;
}

const FROM_TOKENS: FromToken[] = [
  { symbol: 'ETH', address: NATIVE_ETH_ADDRESS, isNative: true },
  { symbol: 'WETH', address: WETH_ADDRESS, isNative: false },
  { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', isNative: false },
  { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', isNative: false },
];

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  collateralSymbol: string;
  collateralAddress: string;
  loanSymbol: string;
  loanAddress: string;
  onSuccess?: () => void;
}

export default function SwapModal({
  open, onClose, collateralSymbol, collateralAddress, loanSymbol, loanAddress, onSuccess,
}: SwapModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const publicClient = useMemo(() => createPublicClient({
    chain: baseMainnet,
    transport: http(BASE_RPC_URL, { batch: true, retryCount: 3 }),
  }), []);

  const [selectedToken, setSelectedToken] = useState<FromToken>(FROM_TOKENS[0]); // ETH default
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<LiFiStep | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [txIsError, setTxIsError] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0n);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fetch wallet balance of selected from-token
  useEffect(() => {
    if (!open || !address) return;
    if (selectedToken.isNative) {
      publicClient.getBalance({ address }).then(setWalletBalance).catch(() => {});
    } else {
      publicClient.readContract({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }).then((bal) => setWalletBalance(bal as bigint)).catch(() => {});
    }
  }, [open, address, selectedToken, publicClient]);

  // Debounced quote fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuote(null);
    setQuoteError('');

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0 || !address) {
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const fromAmount = parseEther(amount).toString();
        const q = await getLiFiQuote({
          fromToken: selectedToken.address,
          toToken: collateralAddress,
          fromAmount,
          fromAddress: address,
          toAddress: address,
          fromChain: 8453,
          slippage: 0.005,
        });
        setQuote(q);
        setQuoteError('');

        // Native ETH never needs approval
        if (selectedToken.isNative) {
          setNeedsApproval(false);
        } else {
          const allowance = await publicClient.readContract({
            address: selectedToken.address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, q.estimate.approvalAddress as `0x${string}`],
          }) as bigint;
          setNeedsApproval(allowance < parseEther(amount));
        }
      } catch (err: any) {
        setQuoteError(err.message?.slice(0, 80) || 'Failed to get quote');
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [amount, address, selectedToken, collateralAddress, publicClient]);

  const handleApprove = useCallback(async () => {
    if (!walletClient || !quote || !address) return;
    setApproving(true);
    setTxStatus('Approving...');
    setTxIsError(false);
    try {
      const hash = await walletClient.writeContract({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [quote.estimate.approvalAddress as `0x${string}`, parseEther(amount)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setNeedsApproval(false);
      setTxStatus('Approved!');
      setTimeout(() => setTxStatus(''), 2000);
    } catch (err: any) {
      setTxStatus(err.shortMessage || err.message?.slice(0, 80) || 'Approval failed');
      setTxIsError(true);
    } finally {
      setApproving(false);
    }
  }, [walletClient, quote, address, selectedToken, amount, publicClient]);

  const handleSwap = useCallback(async () => {
    if (!walletClient || !quote || !address) return;
    setSwapping(true);
    setTxStatus('Swapping...');
    setTxIsError(false);
    try {
      const tx = quote.transactionRequest!;
      const hash = await walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value ?? '0'),
        gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
      });
      setTxStatus('Confirming...');
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus('Swap successful!');
      setTxIsError(false);
      onSuccess?.();
      setTimeout(() => {
        setTxStatus('');
        setAmount('');
        setQuote(null);
        onClose();
      }, 2000);
    } catch (err: any) {
      setTxStatus(err.shortMessage || err.message?.slice(0, 80) || 'Swap failed');
      setTxIsError(true);
    } finally {
      setSwapping(false);
    }
  }, [walletClient, quote, address, publicClient, onSuccess, onClose]);

  const outputAmount = quote ? Number(formatEther(BigInt(quote.estimate.toAmount))) : 0;
  const minOutput = quote ? Number(formatEther(BigInt(quote.estimate.toAmountMin))) : 0;
  const inputNum = parseFloat(amount) || 0;
  const rate = inputNum > 0 && outputAmount > 0 ? outputAmount / inputNum : 0;
  const busy = approving || swapping;

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setAmount('');
      setQuote(null);
      setQuoteError('');
      setTxStatus('');
      setTxIsError(false);
      setNeedsApproval(false);
      setSelectedToken(FROM_TOKENS[0]);
    }
  }, [open]);

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
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{
              background: '#151516',
              border: '1px solid var(--border-bright)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black font-mono" style={{ color: 'var(--text-primary)' }}>
                Get {collateralSymbol}
              </h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Token selector row */}
            <div className="grid grid-cols-4 gap-2">
              {FROM_TOKENS.map((token) => (
                <button
                  key={token.symbol}
                  onClick={() => {
                    if (selectedToken.symbol !== token.symbol) {
                      setSelectedToken(token);
                      setAmount('');
                      setQuote(null);
                    }
                  }}
                  disabled={busy}
                  className="py-2 rounded-lg text-[11px] font-bold font-mono transition-all hover:opacity-80 truncate"
                  style={{
                    color: selectedToken.symbol === token.symbol ? '#ffffff' : 'var(--text-secondary)',
                    background: selectedToken.symbol === token.symbol
                      ? '#2973ff'
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selectedToken.symbol === token.symbol ? 'transparent' : 'var(--border)'}`,
                  }}
                >
                  {token.symbol}
                </button>
              ))}
            </div>

            {/* Input */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>You pay</span>
                <button
                  className="text-[10px] font-mono transition-colors hover:text-[var(--accent-primary)]"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => {
                    if (walletBalance > 0n) {
                      if (selectedToken.isNative) {
                        const buffer = parseEther('0.001');
                        const maxAmount = walletBalance > buffer ? walletBalance - buffer : 0n;
                        setAmount(formatEther(maxAmount));
                      } else {
                        setAmount(formatEther(walletBalance));
                      }
                    }
                  }}
                >
                  Balance: {Number(formatEther(walletBalance)).toFixed(4)}
                </button>
              </div>
              <div className="flex items-center gap-3">
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
                  className="flex-1 bg-transparent text-xl font-bold font-mono outline-none min-w-0"
                  style={{ color: 'var(--text-primary)' }}
                />
                <span
                  className="text-sm font-bold font-mono py-1.5 px-3 rounded-lg shrink-0 text-center"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', width: 90 }}
                >
                  {selectedToken.symbol}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center -my-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(41,115,255,0.08)', border: '1px solid rgba(41,115,255,0.15)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
                </svg>
              </div>
            </div>
                  <div className='m-3'></div>
            {/* Output */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>You receive</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-xl font-bold font-mono min-w-0" style={{ color: quoteLoading ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                  {quoteLoading ? '...' : outputAmount > 0 ? outputAmount.toFixed(6) : '0.0'}
                </span>
                <span
                  className="text-sm font-bold font-mono py-1.5 px-3 rounded-lg shrink-0 text-center"
                  style={{ background: 'rgba(41,115,255,0.06)', color: 'var(--accent-primary)', width: 90 }}
                >
                  {collateralSymbol}
                </span>
              </div>
            </div>

            {/* Quote details */}
            {quote && (
              <div className="space-y-1.5 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                <div className="flex justify-between">
                  <span>Rate</span>
                  <span style={{ color: 'var(--text-secondary)' }}>1 {selectedToken.symbol} = {rate.toFixed(6)} {collateralSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span>Min. received</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{minOutput.toFixed(6)} {collateralSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span>Route</span>
                  <span style={{ color: 'var(--accent-info)' }}>{quote.tool}</span>
                </div>
              </div>
            )}

            {/* Error */}
            {quoteError && (
              <p className="text-[10px] font-mono text-center" style={{ color: 'var(--accent-secondary)' }}>
                {quoteError}
              </p>
            )}

            {/* Tx status */}
            {txStatus && (
              <div
                className="rounded-lg px-3 py-2 text-center text-[10px] font-mono font-bold"
                style={{
                  background: txIsError ? 'rgba(239,68,68,0.08)' : 'rgba(57,166,153,0.08)',
                  border: `1px solid ${txIsError ? 'rgba(239,68,68,0.2)' : 'rgba(57,166,153,0.2)'}`,
                  color: txIsError ? 'var(--accent-secondary)' : 'var(--accent-primary)',
                }}
              >
                {txStatus}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-widest transition-all hover:opacity-80 disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              {needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={!quote || approving || quoteLoading}
                  className="flex-1 py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-widest transition-all hover:opacity-90 disabled:opacity-40"
                  style={{
                    background: '#2973ff',
                    color: '#ffffff',
                  }}
                >
                  {approving ? 'Approving...' : `Approve ${selectedToken.symbol}`}
                </button>
              ) : (
                <button
                  onClick={handleSwap}
                  disabled={!quote || swapping || quoteLoading || !amount}
                  className="flex-1 py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-widest transition-all hover:opacity-90 disabled:opacity-40"
                  style={{
                    background: '#2973ff',
                    color: '#ffffff',
                  }}
                >
                  {swapping ? 'Swapping...' : 'Swap'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
