'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExtendedChain } from '@/lib/lifi';

interface ChainSelectorProps {
  chains: ExtendedChain[];
  selected: ExtendedChain | null;
  onSelect: (chain: ExtendedChain) => void;
  disabled?: boolean;
  label?: string;
}

export default function ChainSelector({ chains, selected, onSelect, disabled, label }: ChainSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate dropdown position from button
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return chains;
    return chains.filter(c => c.name.toLowerCase().includes(q) || c.id.toString().includes(q));
  }, [chains, search]);

  return (
    <>
      <motion.button
        ref={btnRef}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-2 py-2 px-3 rounded-xl transition-all hover:bg-white/5 w-full"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        whileHover={!disabled ? { scale: 1.01 } : {}}
        whileTap={!disabled ? { scale: 0.99 } : {}}
      >
        {selected?.logoURI ? (
          <img src={selected.logoURI} alt={selected.name} className="w-5 h-5 rounded-full" />
        ) : (
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.15)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
        )}
        <div className="flex-1 text-left min-w-0">
          {label && (
            <span className="text-[8px] font-mono uppercase tracking-widest block" style={{ color: 'var(--text-muted)' }}>
              {label}
            </span>
          )}
          <span className="font-mono text-xs font-bold truncate block" style={{ color: 'var(--text-primary)' }}>
            {selected?.name ?? 'Select Chain'}
          </span>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" className="shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </motion.button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed w-64 rounded-2xl overflow-hidden"
              style={{
                top: pos.top,
                left: pos.left,
                zIndex: 9999,
                background: '#151516',
                border: '1px solid rgba(167,139,250,0.15)',
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
                    placeholder="Search chains..."
                    className="flex-1 bg-transparent text-xs font-mono outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Chain list */}
              <div className="max-h-56 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {filtered.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => { onSelect(chain); setOpen(false); setSearch(''); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 transition-all hover:bg-white/[0.03]"
                    style={{
                      background: selected?.id === chain.id ? 'rgba(167,139,250,0.06)' : 'transparent',
                    }}
                  >
                    {chain.logoURI ? (
                      <img src={chain.logoURI} alt={chain.name} className="w-6 h-6 rounded-full shrink-0" />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold font-mono"
                        style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}
                      >
                        {chain.name.slice(0, 2)}
                      </div>
                    )}
                    <span className="font-mono text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {chain.name}
                    </span>
                    {selected?.id === chain.id && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="3" className="ml-auto shrink-0">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="py-6 text-center">
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>No chains found</p>
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
