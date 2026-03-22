'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import LeverageSimulator from '@/components/LeverageSimulator';

/* ─── Types ────────────────────────────────────────────── */
interface Section {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  category: string;
  readTime: string;
}

/* ─── Shared components ────────────────────────────────── */
const ChevronIcon = ({ open }: { open: boolean }) => (
  <motion.svg
    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    animate={{ rotate: open ? 180 : 0 }}
    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    style={{ color: 'var(--text-muted)' }}
  >
    <path d="M6 9l6 6 6-6" />
  </motion.svg>
);

const InfoBox = ({ color, label, children }: { color: string; label: string; children: React.ReactNode }) => (
  <div
    className="rounded-xl p-4 mt-3"
    style={{ background: `${color}08`, border: `1px solid ${color}20` }}
  >
    <p className="font-mono font-bold mb-2" style={{ color, fontSize: 'var(--text-caption)' }}>{label}</p>
    <div style={{ color: 'var(--text-secondary)' }}>{children}</div>
  </div>
);

const FormulaBox = ({ formula, explanation }: { formula: string; explanation: string }) => (
  <div
    className="rounded-xl p-4 mt-3 text-center"
    style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}
  >
    <p className="font-mono font-bold text-lg mb-1" style={{ color: '#a78bfa' }}>{formula}</p>
    <p className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>{explanation}</p>
  </div>
);

const StatCard = ({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) => (
  <div className="rounded-xl p-3" style={{ background: `${color}0a`, border: `1px solid ${color}20` }}>
    <p className="font-mono font-bold" style={{ color, fontSize: 'var(--text-caption)' }}>{value}</p>
    <p className="font-sans mt-1" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-micro)' }}>{label}</p>
    {sub && <p className="font-sans mt-0.5" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>{sub}</p>}
  </div>
);

/* ─── Category config ──────────────────────────────────── */
const CATEGORIES = [
  { slug: 'all', label: 'All Topics', icon: '{}', count: 16 },
  { slug: 'fundamentals', label: 'DeFi Basics', icon: 'A', count: 8 },
  { slug: 'volt', label: 'VOLT Protocol', icon: 'V', count: 4 },
  { slug: 'risk', label: 'Risk & Safety', icon: '!', count: 4 },
] as const;

const CAT_COLORS: Record<string, string> = {
  fundamentals: '#2973ff',
  volt: '#a78bfa',
  risk: '#ef4444',
};

const CAT_LABELS: Record<string, string> = {
  fundamentals: 'DEFI BASICS',
  volt: 'VOLT PROTOCOL',
  risk: 'RISK & SAFETY',
};

/* ─── Sections ─────────────────────────────────────────── */
const sections: Section[] = [
  /* ━━━━━ FUNDAMENTALS ━━━━━ */
  {
    id: 'ltv-lltv',
    category: 'fundamentals',
    title: 'LTV & Liquidation LTV (LLTV)',
    subtitle: 'How much you can borrow against your collateral',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-primary)' }}>
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M3 15h18" stroke="currentColor" strokeWidth="2"/>
        <path d="M9 3v18" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p><strong style={{ color: 'var(--text-primary)' }}>Loan-to-Value (LTV)</strong> is the ratio of what you've borrowed to the value of your collateral. It tells you how "loaded" your position is.</p>
        <FormulaBox formula="LTV = Debt / Collateral Value" explanation="A higher LTV means more borrowing relative to your collateral" />
        <p><strong style={{ color: 'var(--text-primary)' }}>Liquidation LTV (LLTV)</strong> is the maximum LTV allowed before your position can be liquidated. Think of it as the red line you must never cross.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <StatCard label="Typical DeFi LLTV" value="75 – 85%" color="#2973ff" sub="ETH/USDC, BTC/USDC" />
          <StatCard label="LST/ETH LLTV (Morpho)" value="94.5%" color="#10B981" sub="wstETH/WETH, cbETH/WETH" />
        </div>
        <InfoBox color="#10B981" label="Why LST/ETH LLTVs are so high">
          <p>Because the collateral (e.g. wstETH) and the loan (WETH) both track ETH, their price ratio stays near 1:1. This tight correlation means much less liquidation risk, allowing a higher LLTV.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'utilization',
    category: 'fundamentals',
    title: 'Utilization Rate',
    subtitle: 'The heartbeat of lending market supply and demand',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#F59E0B' }}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Utilization is the percentage of deposited (supplied) assets that are currently being borrowed. It's the heartbeat of any lending market.</p>
        <FormulaBox formula="Utilization = Total Borrowed / Total Supplied × 100%" explanation="Measures how much of the lending pool is actively in use" />
        <div className="grid grid-cols-3 gap-3 mt-3">
          <StatCard label="Low Utilization" value="< 50%" color="#10B981" sub="Lots of supply, cheap to borrow" />
          <StatCard label="Optimal" value="70 – 85%" color="#F59E0B" sub="Balanced supply & demand" />
          <StatCard label="High Utilization" value="> 90%" color="#ef4444" sub="Little supply left, rates spike" />
        </div>
        <InfoBox color="#F59E0B" label="Why utilization matters to you">
          <p>High utilization drives up borrow rates (making leverage more expensive) and can make it hard for suppliers to withdraw. Most protocols use a kinked interest rate model that sharply increases rates past an optimal utilization target to rebalance supply and demand.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'supply-borrow-apy',
    category: 'fundamentals',
    title: 'Supply APY & Borrow APY',
    subtitle: 'How lending and borrowing rates are determined',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#10B981' }}>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p><strong style={{ color: 'var(--text-primary)' }}>Supply APY</strong> is the annual yield earned by depositors who lend their assets to the pool. <strong style={{ color: 'var(--text-primary)' }}>Borrow APY</strong> is the annual cost paid by borrowers.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <p className="font-mono font-bold mb-2" style={{ color: '#10B981' }}>Supply APY</p>
            <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>Earned by lenders / depositors</li>
              <li>Increases with higher utilization</li>
              <li>Interest paid by borrowers</li>
            </ul>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="font-mono font-bold mb-2" style={{ color: '#ef4444' }}>Borrow APY</p>
            <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>Cost paid by borrowers</li>
              <li>Spikes when utilization is high</li>
              <li>Your leverage running cost</li>
            </ul>
          </div>
        </div>
        <InfoBox color="#a78bfa" label="Net APY for leveraged positions">
          <p>When you leverage an LST, your <strong>net APY = (staking yield × leverage) – (borrow APY × debt)</strong>. Leverage amplifies your staking rewards, but also amplifies your borrowing costs. The sweet spot depends on current market rates.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'collateral-debt',
    category: 'fundamentals',
    title: 'Collateral & Debt',
    subtitle: 'The building blocks of every leveraged position',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#2973ff' }}>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="2"/>
        <path d="M7.5 4.21l4.5 2.6 4.5-2.6M12 22V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p><strong style={{ color: 'var(--text-primary)' }}>Collateral</strong> is the asset you deposit to secure your loan. <strong style={{ color: 'var(--text-primary)' }}>Debt</strong> is the amount you borrow against it.</p>
        <p>In traditional lending, you might pledge your house (collateral) to get a mortgage (debt). DeFi works the same way — but with tokens, and it's all permissionless and on-chain.</p>
        <InfoBox color="#2973ff" label="In VOLT's context">
          <p>You deposit <strong>wstETH</strong> (or another LST) as collateral, and borrow <strong>WETH</strong> against it. Your equity is the difference: <em>Equity = Collateral Value – Debt</em>. If equity approaches zero, you're at risk of liquidation.</p>
        </InfoBox>
        <div className="rounded-xl p-4 mt-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
          <p className="font-mono font-bold mb-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>Worked Example</p>
          <div className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <p>You deposit <strong>10 wstETH</strong> as collateral</p>
            <p>You borrow <strong>8 WETH</strong> against it</p>
            <p>Your LTV = 8/10 = <strong>80%</strong></p>
            <p>Your equity = 10 – 8 = <strong>2 ETH worth</strong></p>
            <p>LLTV is 94.5% → you can borrow up to 9.45 WETH max</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'liquidation',
    category: 'fundamentals',
    title: 'Liquidation Mechanics',
    subtitle: 'What happens when positions become undercollateralized',
    readTime: '3 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#ef4444' }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Liquidation is the process where a third party (a "liquidator") repays part of your debt and seizes your collateral at a discount, because your position became undercollateralized (LTV exceeded LLTV).</p>
        <div className="space-y-2 mt-3">
          <p className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>How it happens:</p>
          <ol className="space-y-2 list-decimal list-inside text-sm" style={{ color: 'var(--text-secondary)' }}>
            <li>Your collateral value drops OR your debt grows (from accruing interest)</li>
            <li>Your LTV crosses the LLTV threshold</li>
            <li>A liquidator bot detects this on-chain</li>
            <li>The bot repays a portion of your debt and takes equivalent collateral + a liquidation bonus</li>
            <li>Your remaining position has less debt but also less collateral</li>
          </ol>
        </div>
        <InfoBox color="#ef4444" label="Liquidation penalty">
          <p>Liquidators receive a bonus (typically 1–10%) for performing the liquidation. This means you lose more collateral than the debt repaid. On Morpho Blue LST/ETH markets, the penalty is relatively small because the assets are closely correlated.</p>
        </InfoBox>
        <InfoBox color="#10B981" label="Why LST/ETH liquidations are rare">
          <p>Since both wstETH and WETH track ETH, the exchange rate is extremely stable (~1:1). Liquidation in these markets almost exclusively comes from interest accrual over time, not sudden price crashes. This makes positions safer than typical leverage.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'lst-explained',
    category: 'fundamentals',
    title: 'Liquid Staking Tokens (LSTs)',
    subtitle: 'Earn staking rewards while keeping your ETH liquid',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#a78bfa' }}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 6v12M8 10l4-4 4 4M8 14l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>When you stake ETH on Ethereum, it gets locked up to help secure the network and earn rewards (~3-4% APY). <strong style={{ color: 'var(--text-primary)' }}>Liquid Staking Tokens</strong> solve the liquidity problem: you get a token that represents your staked ETH.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(41,115,255,0.05)', border: '1px solid rgba(41,115,255,0.12)' }}>
            <p className="font-mono font-bold" style={{ color: '#2973ff' }}>wstETH</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Lido</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(41,115,255,0.05)', border: '1px solid rgba(41,115,255,0.12)' }}>
            <p className="font-mono font-bold" style={{ color: '#2973ff' }}>cbETH</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Coinbase</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(41,115,255,0.05)', border: '1px solid rgba(41,115,255,0.12)' }}>
            <p className="font-mono font-bold" style={{ color: '#2973ff' }}>rETH</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Rocket Pool</p>
          </div>
        </div>
        <InfoBox color="#a78bfa" label="How LST value accrues">
          <p>LSTs like wstETH increase in value relative to ETH over time as staking rewards accumulate. 1 wstETH today might be worth 1.18 ETH — and tomorrow it'll be worth slightly more. This is the yield VOLT helps you amplify through leverage.</p>
        </InfoBox>
        <p>The key insight: <strong style={{ color: 'var(--text-primary)' }}>LST yield + leverage = amplified staking returns</strong>. That's what VOLT Protocol enables.</p>
      </div>
    ),
  },
  {
    id: 'morpho-blue',
    category: 'fundamentals',
    title: 'What is Morpho Blue?',
    subtitle: 'The permissionless lending protocol powering VOLT',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#2973ff' }}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Morpho Blue is a permissionless, minimal lending protocol. Unlike Aave or Compound which have large multi-asset pools, Morpho Blue creates <strong style={{ color: 'var(--text-primary)' }}>isolated markets</strong> — each with one collateral asset, one loan asset, one oracle, and one LLTV.</p>
        <div className="space-y-2 mt-3">
          <p className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>Key properties:</p>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <li><strong style={{ color: 'var(--text-primary)' }}>Isolated markets</strong> — each market is independent; a bad asset in one market can't affect others</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Immutable</strong> — the core contract has no admin keys, no upgrades, no governance</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Minimal</strong> — only ~650 lines of Solidity, heavily audited</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Permissionless</strong> — anyone can create a market with any parameters</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Flash loans built-in</strong> — free flash loans on any market, enabling VOLT's one-click leverage</li>
          </ul>
        </div>
        <InfoBox color="#2973ff" label="Why VOLT uses Morpho Blue">
          <p>Morpho Blue's built-in flash loans, high LLTVs for correlated assets, and immutable architecture make it ideal for leveraged LST strategies. No governance risk, no pooled asset contagion, and the flash loan mechanism enables atomic leverage in a single transaction.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'oracles',
    category: 'fundamentals',
    title: 'Oracles & Price Feeds',
    subtitle: 'How smart contracts know real-world prices',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#F59E0B' }}>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Smart contracts can't access real-world data on their own. <strong style={{ color: 'var(--text-primary)' }}>Oracles</strong> are services that bring off-chain data (like prices) on-chain so protocols can use them.</p>
        <p>In lending, oracles determine the value of your collateral relative to your debt. This price ratio decides whether your position is healthy or liquidatable.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <p className="font-mono font-bold" style={{ color: '#F59E0B', fontSize: 'var(--text-caption)' }}>Exchange Rate Oracle</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Reports the wstETH/WETH price ratio. For VOLT markets, this is the LST's redemption rate.</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(41,115,255,0.06)', border: '1px solid rgba(41,115,255,0.12)' }}>
            <p className="font-mono font-bold" style={{ color: '#2973ff', fontSize: 'var(--text-caption)' }}>Chainlink, Redstone, etc.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Popular oracle providers that aggregate data from multiple sources for accuracy.</p>
          </div>
        </div>
        <InfoBox color="#F59E0B" label="VOLT's oracle monitoring">
          <p>VOLT tracks the on-chain exchange rate over time (visible on each market's chart). This lets you monitor the stability of the LST peg — if the rate drops significantly, it could trigger liquidations at high leverage.</p>
        </InfoBox>
      </div>
    ),
  },

  /* ━━━━━ VOLT PROTOCOL ━━━━━ */
  {
    id: 'what-is-leverage',
    category: 'volt',
    title: 'What is Leverage?',
    subtitle: 'Amplify your exposure with borrowed capital',
    readTime: '1 min',
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
        <InfoBox color="#2973ff" label="Example">
          <p>With 1 wstETH at 5x leverage: you deposit 1 wstETH, borrow 4 WETH, swap back to wstETH, and now hold 5 wstETH exposure with only 1 wstETH equity.</p>
        </InfoBox>
        <p>The key benefit for LST/ETH pairs: since the collateral and loan are highly correlated (both track ETH), the liquidation risk is much lower than typical leverage positions.</p>
      </div>
    ),
  },
  {
    id: 'flash-loans',
    category: 'volt',
    title: 'How Flash Loans Work',
    subtitle: 'Borrow millions and repay in the same transaction',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#2973ff' }}>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Flash loans are uncollateralized loans that must be borrowed and repaid within a single blockchain transaction. If the repayment fails, the entire transaction reverts as if nothing happened.</p>
        <div className="space-y-2 mt-3">
          <p className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>VOLT's Flash Loan Flow:</p>
          <div className="space-y-2">
            {[
              { step: '1', text: 'Flash borrow WETH from Morpho', color: '#2973ff' },
              { step: '2', text: 'Swap WETH → wstETH via Aerodrome DEX', color: '#a78bfa' },
              { step: '3', text: 'Deposit all wstETH as collateral on Morpho', color: '#10B981' },
              { step: '4', text: 'Borrow WETH against collateral to repay flash loan', color: '#F59E0B' },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-xs"
                  style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30` }}
                >
                  {item.step}
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <InfoBox color="#2973ff" label="Why it matters">
          <p>All 4 steps happen atomically in one transaction. You never need to manually manage intermediate states, and there is zero price exposure during execution. If any step fails, the entire thing reverts — your funds stay safe.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'net-apy',
    category: 'volt',
    title: 'Net APY & Leverage Economics',
    subtitle: 'Understanding your real returns from leveraged staking',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#10B981' }}>
        <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17 6h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Your net return from a leveraged LST position depends on three factors: the staking yield, the borrowing cost, and your leverage multiplier.</p>
        <FormulaBox
          formula="Net APY = (Staking APY × Leverage) − (Borrow APY × (Leverage − 1))"
          explanation="Leverage amplifies both yield and cost"
        />
        <div className="rounded-xl p-4 mt-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
          <p className="font-mono font-bold mb-3" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>Example: 3% staking yield, 1.5% borrow rate</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { lev: '1x', net: '3.0%', color: '#10B981' },
              { lev: '3x', net: '6.0%', color: '#10B981' },
              { lev: '5x', net: '9.0%', color: '#2973ff' },
              { lev: '10x', net: '16.5%', color: '#a78bfa' },
              { lev: '15x', net: '24.0%', color: '#F59E0B' },
              { lev: '18x', net: '28.5%', color: '#ef4444' },
            ].map((r) => (
              <div key={r.lev} className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <p className="font-mono font-bold text-xs" style={{ color: r.color }}>{r.net}</p>
                <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.lev}</p>
              </div>
            ))}
          </div>
        </div>
        <InfoBox color="#F59E0B" label="Diminishing returns & risk">
          <p>Higher leverage gives higher APY, but the gains become marginal while risk increases. At 18x you're close to the 94.5% LLTV ceiling — even small rate changes could push you toward liquidation. Most users find the sweet spot between 3–10x.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'deleverage',
    category: 'volt',
    title: 'Unwinding (Deleveraging)',
    subtitle: 'How to close your position and reclaim equity',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#a78bfa' }}>
        <path d="M3 12h18M3 12l6-6M3 12l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Unwinding is the reverse of leveraging — you close your position and get back your equity. VOLT does this atomically using another flash loan.</p>
        <div className="space-y-2 mt-3">
          <p className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }}>Unwind Flow:</p>
          <div className="space-y-2">
            {[
              { step: '1', text: 'Flash borrow WETH to repay your full Morpho debt', color: '#ef4444' },
              { step: '2', text: 'Withdraw all collateral (wstETH) from Morpho', color: '#F59E0B' },
              { step: '3', text: 'Swap enough wstETH → WETH to repay the flash loan', color: '#a78bfa' },
              { step: '4', text: 'Remaining wstETH is your equity — sent to your wallet', color: '#10B981' },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-xs"
                  style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30` }}
                >
                  {item.step}
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <InfoBox color="#a78bfa" label="Slippage on unwind">
          <p>The wstETH → WETH swap during unwind may incur slippage, especially for large positions. VOLT uses a 2% buffer and optimized routing through Aerodrome's concentrated liquidity pools to minimize this cost.</p>
        </InfoBox>
      </div>
    ),
  },

  /* ━━━━━ RISK & SAFETY ━━━━━ */
  {
    id: 'health-factor',
    category: 'risk',
    title: 'Understanding Health Factor',
    subtitle: 'The single most important metric for your position',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#10B981' }}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>Health Factor (HF) measures how safe your position is. It's the ratio of your collateral value to your debt, adjusted by the liquidation threshold.</p>
        <FormulaBox formula="HF = (Collateral × Price × LLTV) / Debt" explanation="Liquidation occurs when HF drops below 1.0" />
        <div className="grid grid-cols-3 gap-3 mt-3">
          <StatCard label="Safe — plenty of buffer" value="HF > 2.0" color="#10B981" />
          <StatCard label="Caution — monitor closely" value="HF 1.2 – 2.0" color="#F59E0B" />
          <StatCard label="Danger — near liquidation" value="HF < 1.2" color="#ef4444" />
        </div>
        <p>For LST/ETH markets on Morpho Blue with 94.5% LLTV, liquidation only occurs from interest accrual, not price deviation. This means positions can safely sustain much higher leverage than traditional markets.</p>
      </div>
    ),
  },
  {
    id: 'depeg-risk',
    category: 'risk',
    title: 'Depeg Risk',
    subtitle: 'When LST prices drift from their expected value',
    readTime: '2 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#F59E0B' }}>
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 16l4-8 4 4 5-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>A <strong style={{ color: 'var(--text-primary)' }}>depeg</strong> occurs when an LST temporarily trades below its expected value relative to ETH. For example, if wstETH's exchange rate drops significantly, leveraged positions can get liquidated.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <p className="font-mono font-bold" style={{ color: '#10B981', fontSize: 'var(--text-caption)' }}>Normal</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Rate slowly increases as staking rewards accrue. ~0.01% per day.</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="font-mono font-bold" style={{ color: '#ef4444', fontSize: 'var(--text-caption)' }}>Depeg Event</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Rate drops suddenly due to market stress, slashing, or exploit fears.</p>
          </div>
        </div>
        <InfoBox color="#F59E0B" label="Historical context">
          <p>Major depeg events are rare but have happened — e.g., stETH briefly traded at ~0.93 ETH during the 2022 market crisis. At 94.5% LLTV with high leverage, even a 5-6% depeg could trigger liquidation. VOLT's oracle charts help you monitor this risk in real time.</p>
        </InfoBox>
      </div>
    ),
  },
  {
    id: 'risks',
    category: 'risk',
    title: 'All Risks Summary',
    subtitle: 'A comprehensive overview of every risk category',
    readTime: '3 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#ef4444' }}>
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2"/>
        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-4">
        {[
          { title: 'Liquidation Risk', color: '#ef4444', text: 'If your health factor drops below 1.0, your position can be liquidated. For LST/ETH pairs this mainly happens from borrow interest accrual over long periods at very high leverage.' },
          { title: 'Smart Contract Risk', color: '#F59E0B', text: 'VOLT interacts with Morpho Blue, DEX routers, and LST contracts. While Morpho Blue is audited and immutable, the flash leverage helper contract carries inherent smart contract risk.' },
          { title: 'Oracle Risk', color: '#2973ff', text: 'The exchange rate between LSTs and ETH relies on oracle feeds. A malfunctioning oracle could trigger unexpected liquidations or enable exploits.' },
          { title: 'Slippage Risk', color: '#a78bfa', text: 'Large swaps during leverage or unwind may experience slippage. VOLT uses optimized DEX routing with a 2% buffer, but extreme market conditions could result in worse execution.' },
          { title: 'Depeg Risk', color: '#F59E0B', text: 'If an LST depegs from ETH (trades significantly below fair value), highly leveraged positions face liquidation risk. This is the primary price risk in LST/ETH markets.' },
          { title: 'Interest Rate Risk', color: '#10B981', text: 'Borrow rates can spike if utilization increases. A sudden rise in borrow APY could make your leveraged position unprofitable or even push it toward liquidation over time.' },
        ].map((risk) => (
          <div key={risk.title} className="flex gap-3">
            <div className="w-1 rounded-full shrink-0 mt-1" style={{ background: risk.color, height: 16 }} />
            <div>
              <p className="font-sans font-bold mb-0.5" style={{ color: risk.color, fontSize: 'var(--text-caption)' }}>{risk.title}</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{risk.text}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'glossary',
    category: 'risk',
    title: 'DeFi Glossary',
    subtitle: 'Quick reference for common DeFi terminology',
    readTime: '3 min',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-primary)' }}>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2">
          {[
            { term: 'APY', def: 'Annual Percentage Yield — your annualized return including compound interest.' },
            { term: 'APR', def: 'Annual Percentage Rate — annualized return without compounding.' },
            { term: 'TVL', def: 'Total Value Locked — the total assets deposited in a protocol or market.' },
            { term: 'LLTV', def: 'Liquidation Loan-to-Value — the max LTV before liquidation.' },
            { term: 'Collateral Factor', def: 'The percentage of collateral value you can borrow against (related to LLTV).' },
            { term: 'Flash Loan', def: 'An uncollateralized loan that must be repaid in the same transaction.' },
            { term: 'Slippage', def: 'The difference between expected and actual execution price on a swap.' },
            { term: 'Oracle', def: 'A service that provides off-chain data (prices) to smart contracts.' },
            { term: 'Multicall', def: 'Batching multiple contract calls into a single transaction.' },
            { term: 'Atomic', def: 'An operation that either fully completes or fully reverts — no partial state.' },
            { term: 'Gas', def: 'The fee paid to the network to execute a transaction. Varies by network congestion.' },
            { term: 'Impermanent Loss', def: 'A loss that occurs when providing liquidity in AMM pools. Does NOT apply to VOLT lending positions.' },
            { term: 'DEX', def: 'Decentralized Exchange — a protocol for swapping tokens without a centralized intermediary.' },
            { term: 'Liquidator', def: 'A bot or entity that repays undercollateralized debt and seizes collateral at a discount.' },
          ].map((item) => (
            <div key={item.term} className="flex gap-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <span className="font-mono font-bold shrink-0 w-32 sm:w-40" style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-caption)' }}>{item.term}</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.def}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

/* ─── Page Component ───────────────────────────────────── */
export default function LearnPage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [readSections, setReadSections] = useState<Set<string>>(new Set());
  const tabsRef = useRef<HTMLDivElement>(null);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Mark as read when opened
        setReadSections((r) => new Set(r).add(id));
      }
      return next;
    });
  };

  const filteredSections = activeCategory === 'all'
    ? sections
    : sections.filter((s) => s.category === activeCategory);

  const progress = Math.round((readSections.size / sections.length) * 100);

  // Group sections by category for the "all" view
  const groupedSections = activeCategory === 'all'
    ? (['fundamentals', 'volt', 'risk'] as const).map((cat) => ({
        category: cat,
        label: CAT_LABELS[cat],
        color: CAT_COLORS[cat],
        items: sections.filter((s) => s.category === cat),
      }))
    : [{ category: activeCategory, label: CAT_LABELS[activeCategory] || '', color: CAT_COLORS[activeCategory] || '#2973ff', items: filteredSections }];

  return (
    <div className="max-w-4xl mx-auto">
      {/* ═══════════════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-10 relative"
      >
        {/* Subtle background glow */}
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(41,115,255,0.06) 0%, transparent 70%)',
          }}
        />

        <div className="relative text-center pt-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
          </motion.div>

          <h1
            className="font-black tracking-tight mb-3"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'var(--text-primary)', lineHeight: 1.15 }}
          >
            Learn DeFi &{' '}
            <span style={{ color: 'var(--accent-primary)' }}>VOLT</span>
          </h1>
          <p className="font-sans max-w-xl mx-auto mb-6" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', lineHeight: 1.6 }}>
            Master the fundamentals of DeFi lending, flash loan leverage, and risk management before opening your first position.
          </p>

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-xs mx-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Progress
              </span>
              <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--accent-primary)' }}>
                {readSections.size}/{sections.length} topics
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--accent-primary)' }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 60, damping: 15 }}
              />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          LEVERAGE SIMULATOR
          ═══════════════════════════════════════════════════════ */}
      <LeverageSimulator />

      {/* ═══════════════════════════════════════════════════════
          CATEGORY TABS
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        ref={tabsRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-8 sticky top-0 z-20 -mx-4 px-4 py-3"
        style={{ background: 'linear-gradient(to bottom, rgba(9,9,9,0.97) 70%, transparent)' }}
      >
        <div className="flex gap-2 flex-wrap justify-center">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.slug;
            const catColor = cat.slug === 'all' ? '#2973ff' : CAT_COLORS[cat.slug] || '#2973ff';
            return (
              <motion.button
                key={cat.slug}
                onClick={() => setActiveCategory(cat.slug)}
                className="relative px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 flex items-center gap-2"
                style={{
                  background: isActive ? `${catColor}12` : 'rgba(255,255,255,0.02)',
                  border: isActive ? `1px solid ${catColor}30` : '1px solid var(--border)',
                  color: isActive ? catColor : 'var(--text-muted)',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {cat.label}
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-md font-mono"
                  style={{
                    background: isActive ? `${catColor}18` : 'rgba(255,255,255,0.04)',
                    color: isActive ? catColor : 'var(--text-muted)',
                  }}
                >
                  {cat.count}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          SECTIONS
          ═══════════════════════════════════════════════════════ */}
      <div className="space-y-10">
        {groupedSections.map((group) => (
          <div key={group.category}>
            {/* Category header (shown in "all" view) */}
            {activeCategory === 'all' && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-3 mb-4"
              >
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ background: group.color }}
                />
                <h2
                  className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase"
                  style={{ color: group.color }}
                >
                  {group.label}
                </h2>
                <div className="flex-1 h-px" style={{ background: `${group.color}15` }} />
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {group.items.length} topics
                </span>
              </motion.div>
            )}

            {/* Sections list */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {group.items.map((section, i) => {
                  const isOpen = openSections.has(section.id);
                  const isRead = readSections.has(section.id);
                  const catColor = CAT_COLORS[section.category] || '#2973ff';
                  return (
                    <motion.div
                      key={section.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div
                        className="rounded-2xl overflow-hidden transition-all duration-300"
                        style={{
                          background: isOpen ? 'var(--bg-card)' : 'rgba(255,255,255,0.015)',
                          border: isOpen ? `1px solid ${catColor}25` : '1px solid var(--border)',
                          boxShadow: isOpen ? `0 0 40px ${catColor}06` : 'none',
                        }}
                      >
                        {/* Header */}
                        <button
                          onClick={() => toggleSection(section.id)}
                          className="w-full flex items-center gap-4 p-5 text-left group"
                        >
                          {/* Icon */}
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200"
                            style={{
                              background: isOpen ? `${catColor}12` : 'var(--bg-surface-1)',
                              border: `1px solid ${isOpen ? `${catColor}25` : 'var(--border)'}`,
                            }}
                          >
                            {section.icon}
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                                {section.title}
                              </span>
                              {isRead && !isOpen && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              )}
                            </div>
                            <span className="font-sans text-xs" style={{ color: 'var(--text-muted)' }}>
                              {section.subtitle}
                            </span>
                          </div>

                          {/* Meta + chevron */}
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-[10px] hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                              {section.readTime}
                            </span>
                            <ChevronIcon open={isOpen} />
                          </div>
                        </button>

                        {/* Content */}
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden"
                            >
                              <div
                                className="px-5 pb-6 pt-0 font-sans leading-relaxed"
                                style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                              >
                                <div className="pt-5 ml-15">
                                  {section.content}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          CTA
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mt-16 mb-8 relative rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Background gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(41,115,255,0.06) 0%, transparent 60%)',
          }}
        />

        <div className="relative z-10 py-14 px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mb-4"
          >
            <span
              className="inline-block px-3 py-1.5 rounded-full font-mono text-[10px] font-bold tracking-[0.15em] uppercase"
              style={{
                background: 'rgba(41,115,255,0.08)',
                border: '1px solid rgba(41,115,255,0.2)',
                color: 'var(--accent-primary)',
              }}
            >
              Ready?
            </span>
          </motion.div>

          <h2
            className="font-black mb-3"
            style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', letterSpacing: '-0.02em' }}
          >
            Put Your Knowledge to{' '}
            <span style={{ color: 'var(--accent-primary)' }}>Work</span>
          </h2>
          <p className="font-sans max-w-md mx-auto mb-8" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
            You've learned the fundamentals. Now explore live markets and open your first leveraged position.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/markets">
              <motion.div
                className="btn-primary w-auto inline-flex items-center justify-center gap-2 px-8 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Explore Markets
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </motion.div>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-sans font-semibold text-xs transition-all hover:bg-white/[0.04]"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Back to Home
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
