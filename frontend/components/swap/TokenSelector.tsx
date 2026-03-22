'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Token } from '@/lib/lifi';
import { getTokenImageUrl } from '@/lib/tokenImages';

// Pinned token addresses on Base
const PINNED_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000', // ETH
  '0x4200000000000000000000000000000000000006', // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT
]);

interface TokenSelectorProps {
  tokens: Token[];
  selected: Token | null;
  onSelect: (token: Token) => void;
  disabled?: boolean;
}

export default function TokenSelector({ tokens, selected, onSelect, disabled }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updatePos = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search and calc position on open
  useEffect(() => {
    if (open) {
      updatePos();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, updatePos]);

  const { pinned, filtered } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const pinnedTokens = tokens.filter(t => PINNED_ADDRESSES.has(t.address.toLowerCase()));
    const rest = tokens.filter(t => !PINNED_ADDRESSES.has(t.address.toLowerCase()));

    if (!q) return { pinned: pinnedTokens, filtered: rest.slice(0, 50) };

    const matchFn = (t: Token) =>
      t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q);

    return {
      pinned: pinnedTokens.filter(matchFn),
      filtered: rest.filter(matchFn).slice(0, 50),
    };
  }, [tokens, search]);

  return (
    <>
      {/* Trigger button */}
      <motion.button
        ref={btnRef}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-2 py-2 px-3 rounded-xl transition-all hover:bg-white/5"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        {(() => {
          const imgUrl = selected ? getTokenImageUrl(selected.symbol, selected.logoURI) : undefined;
          return imgUrl ? (
            <img src={imgUrl} alt={selected?.symbol} className="w-5 h-5 rounded-full" />
          ) : (
            <div className="w-5 h-5 rounded-full" style={{ background: 'rgba(41,115,255,0.15)' }} />
          );
        })()}
        <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {selected?.symbol ?? 'Select'}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </motion.button>

      {/* Dropdown via portal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed w-72 rounded-2xl overflow-hidden"
              style={{
                top: pos.top,
                left: pos.left,
                zIndex: 9999,
                background: '#151516',
                border: '1px solid rgba(41,115,255,0.15)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              }}
            >
              {/* Search */}
              <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tokens..."
                    className="flex-1 bg-transparent text-xs font-mono outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Token list */}
              <div className="max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {/* Pinned / Popular */}
                {pinned.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        Popular
                      </span>
                    </div>
                    {pinned.map((token) => (
                      <TokenRow
                        key={`${token.chainId}-${token.address}`}
                        token={token}
                        isSelected={selected?.address.toLowerCase() === token.address.toLowerCase()}
                        onClick={() => { onSelect(token); setOpen(false); setSearch(''); }}
                      />
                    ))}
                  </div>
                )}

                {/* All tokens */}
                {filtered.length > 0 && (
                  <div>
                    {pinned.length > 0 && (
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                          All Tokens
                        </span>
                      </div>
                    )}
                    {filtered.map((token) => (
                      <TokenRow
                        key={`${token.chainId}-${token.address}`}
                        token={token}
                        isSelected={selected?.address.toLowerCase() === token.address.toLowerCase()}
                        onClick={() => { onSelect(token); setOpen(false); setSearch(''); }}
                      />
                    ))}
                  </div>
                )}

                {pinned.length === 0 && filtered.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>No tokens found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function TokenRow({ token, isSelected, onClick }: { token: Token; isSelected: boolean; onClick: () => void }) {
  const imgUrl = getTokenImageUrl(token.symbol, token.logoURI);
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 transition-all hover:bg-white/[0.03]"
      style={{
        background: isSelected ? 'rgba(41,115,255,0.06)' : 'transparent',
      }}
    >
      {imgUrl ? (
        <img src={imgUrl} alt={token.symbol} className="w-7 h-7 rounded-full shrink-0" />
      ) : (
        <div
          className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold font-mono"
          style={{ background: 'rgba(41,115,255,0.1)', color: 'var(--accent-primary)' }}
        >
          {token.symbol.slice(0, 2)}
        </div>
      )}
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {token.symbol}
          </span>
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>
        <span className="text-[10px] font-mono truncate block" style={{ color: 'var(--text-muted)' }}>
          {token.name}
        </span>
      </div>
      {parseFloat(token.priceUSD) > 0 && (
        <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
          ${parseFloat(token.priceUSD).toFixed(2)}
        </span>
      )}
    </button>
  );
}
