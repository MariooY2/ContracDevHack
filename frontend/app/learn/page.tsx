'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <motion.svg
    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    animate={{ rotate: open ? 90 : 0 }}
    transition={{ duration: 0.2 }}
    style={{ color: 'var(--text-muted)' }}
  >
    <path d="M9 18l6-6-6-6" />
  </motion.svg>
);

const sections: Section[] = [
  {
    id: 'what-is-leverage',
    title: 'What is Leverage?',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-primary)' }}>
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Leverage amplifies your exposure to an asset. If you have 1 ETH and use 5x leverage, you gain exposure equivalent to 5 ETH worth of the asset.</p>
        <p>In DeFi, leverage is achieved by depositing collateral, borrowing against it, and reinvesting the borrowed funds to increase your position size.</p>
        <div
          className="rounded-xl p-4 mt-3"
          style={{ background: 'rgba(0,255,209,0.04)', border: '1px solid rgba(0,255,209,0.1)' }}
        >
          <p className="font-mono font-bold mb-2" style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-caption)' }}>Example</p>
          <p>With 1 wstETH at 5x leverage: you deposit 1 wstETH, borrow 4 WETH, swap back to wstETH, and now hold 5 wstETH exposure with only 1 wstETH equity.</p>
        </div>
        <p>The key benefit for LST/ETH pairs: since the collateral and loan are highly correlated (both track ETH), the liquidation risk is much lower than typical leverage positions.</p>
      </div>
    ),
  },
  {
    id: 'flash-loans',
    title: 'How Flash Loans Work',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#00C2FF' }}>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Flash loans are uncollateralized loans that must be borrowed and repaid within a single blockchain transaction. If the repayment fails, the entire transaction reverts as if nothing happened.</p>
        <div className="space-y-2 mt-3">
          <p className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>VOLT's Flash Loan Flow:</p>
          <ol className="space-y-2 list-decimal list-inside">
            <li>Flash borrow WETH from Morpho</li>
            <li>Swap WETH to wstETH via best DEX route</li>
            <li>Deposit all wstETH as collateral on Morpho</li>
            <li>Borrow WETH against collateral to repay flash loan</li>
          </ol>
        </div>
        <div
          className="rounded-xl p-4 mt-3"
          style={{ background: 'rgba(0,194,255,0.04)', border: '1px solid rgba(0,194,255,0.1)' }}
        >
          <p className="font-mono font-bold mb-2" style={{ color: '#00C2FF', fontSize: 'var(--text-caption)' }}>Why it matters</p>
          <p>All 4 steps happen atomically in one transaction. You never need to manually manage intermediate states, and there is zero price exposure during execution.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'health-factor',
    title: 'Understanding Health Factor',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#10B981' }}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Health Factor (HF) measures how safe your position is. It's the ratio of your collateral value to your debt, adjusted by the liquidation threshold.</p>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <p className="font-mono font-bold" style={{ color: '#10B981', fontSize: 'var(--text-caption)' }}>HF &gt; 2.0</p>
            <p className="font-sans mt-1" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-micro)' }}>Safe — plenty of buffer</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <p className="font-mono font-bold" style={{ color: '#F59E0B', fontSize: 'var(--text-caption)' }}>HF 1.2 – 2.0</p>
            <p className="font-sans mt-1" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-micro)' }}>Caution — monitor closely</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.15)' }}>
            <p className="font-mono font-bold" style={{ color: '#FF3366', fontSize: 'var(--text-caption)' }}>HF &lt; 1.2</p>
            <p className="font-sans mt-1" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-micro)' }}>Danger — close to liquidation</p>
          </div>
        </div>
        <p>For LST/ETH markets on Morpho Blue with 94.5% LLTV, liquidation only occurs from interest accrual, not price deviation. This means positions can safely sustain much higher leverage than traditional markets.</p>
      </div>
    ),
  },
  {
    id: 'risks',
    title: 'Risks to Understand',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#FF3366' }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-4">
        <div>
          <p className="font-sans font-bold mb-1" style={{ color: '#FF3366', fontSize: 'var(--text-caption)' }}>Liquidation Risk</p>
          <p>If your health factor drops below 1.0, your position can be liquidated. For LST/ETH pairs this mainly happens from borrow interest accrual over long periods at very high leverage.</p>
        </div>
        <div>
          <p className="font-sans font-bold mb-1" style={{ color: '#F59E0B', fontSize: 'var(--text-caption)' }}>Smart Contract Risk</p>
          <p>VOLT interacts with Morpho Blue, DEX routers, and LST contracts. While Morpho Blue is audited, the flash leverage helper contract carries inherent smart contract risk.</p>
        </div>
        <div>
          <p className="font-sans font-bold mb-1" style={{ color: '#00C2FF', fontSize: 'var(--text-caption)' }}>Oracle Risk</p>
          <p>The exchange rate between LSTs and ETH relies on oracle feeds. A malfunctioning oracle could trigger unexpected liquidations or enable exploits.</p>
        </div>
        <div>
          <p className="font-sans font-bold mb-1" style={{ color: '#A78BFA', fontSize: 'var(--text-caption)' }}>Slippage Risk</p>
          <p>Large swaps during leverage/unwind may experience slippage. VOLT uses optimized DEX routing, but extreme market conditions could result in worse execution.</p>
        </div>
      </div>
    ),
  },
];

export default function LearnPage() {
  const [openSection, setOpenSection] = useState<string | null>('what-is-leverage');

  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 text-center"
      >
        <p className="font-sans uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
          {'// EDUCATION'}
        </p>
        <h1 className="font-black gradient-text tracking-tight mb-3" style={{ fontSize: 'var(--text-h1)' }}>
          Learn VOLT
        </h1>
        <p className="font-sans max-w-lg mx-auto" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
          Understand how VOLT Protocol works, the mechanics of flash loans, and the risks involved before opening a position.
        </p>
      </motion.div>

      {/* Accordion sections */}
      <div className="space-y-3">
        {sections.map((section, i) => {
          const isOpen = openSection === section.id;
          return (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <div
                className="rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  background: isOpen ? 'rgba(10, 15, 31, 0.9)' : 'rgba(10, 15, 31, 0.6)',
                  border: isOpen ? '1px solid rgba(0,255,209,0.15)' : '1px solid var(--border)',
                }}
              >
                {/* Header */}
                <button
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  className="w-full flex items-center gap-3 p-5 text-left"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border)' }}
                  >
                    {section.icon}
                  </div>
                  <span className="font-sans font-bold flex-1" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                    {section.title}
                  </span>
                  <ChevronIcon open={isOpen} />
                </button>

                {/* Content */}
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div
                    className="px-5 pb-5 pt-0 font-sans leading-relaxed"
                    style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="pt-4">
                      {section.content}
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-center mt-10"
      >
        <Link href="/markets" className="btn-primary inline-flex items-center gap-2 px-8">
          Explore Markets
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </motion.div>
    </div>
  );
}
