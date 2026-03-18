'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { motion, useMotionValue, useTransform, useScroll, animate as motionAnimate } from 'framer-motion';
import Link from 'next/link';
import type { AggStats } from '@/components/MarketsTable';

/* ─── CountUp Component ──────────────────────────────────── */
function CountUp({ value, decimals = 1, suffix = '', prefix = '', commas = false, className = '' }: {
  value: number; decimals?: number; suffix?: string; prefix?: string; commas?: boolean; className?: string;
}) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => {
    const fixed = v.toFixed(decimals);
    if (commas) {
      const [int, dec] = fixed.split('.');
      const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return dec ? `${formatted}.${dec}` : formatted;
    }
    return fixed;
  });

  useEffect(() => {
    const ctrl = motionAnimate(mv, value, { duration: 1.5, ease: 'easeOut' });
    return () => ctrl.stop();
  }, [mv, value]);

  return (
    <span className={`font-black font-mono gradient-text ${className}`}>
      {prefix}<motion.span>{display}</motion.span>{suffix}
    </span>
  );
}

/* ─── Flash Loan Loop Visualizer ─────────────────────────── */
const LOOP_NODES = ['Flash\nBorrow', 'Swap\nWETH→LST', 'Supply\nCollateral', 'Borrow\nWETH', 'Repay\nFlash Loan'];

function FlashLoanLoop() {
  return (
    <div className="mt-4 relative" style={{ height: 80 }}>
      <div className="flex items-center justify-between gap-0.5 h-full">
        {LOOP_NODES.map((node, i) => (
          <Fragment key={i}>
            <div
              className="flash-node shrink-0 flex flex-col items-center justify-center rounded-lg px-1.5 py-1 text-center"
              style={{
                background: 'rgba(0,194,255,0.08)',
                border: '1px solid rgba(0,194,255,0.2)',
                width: 64,
                height: 44,
                animationDelay: `${i * 0.6}s`,
              }}
            >
              <span className="text-[7px] font-mono font-bold leading-tight whitespace-pre-line" style={{ color: '#00C2FF' }}>
                {node}
              </span>
            </div>
            {i < LOOP_NODES.length - 1 && (
              <div className="shrink-0 w-3 flex items-center">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4h6M7 1l3 3-3 3" stroke="rgba(0,194,255,0.4)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────────── */
function SectionHeader({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="text-center mb-12">
      <p className="font-sans uppercase tracking-[0.2em] font-semibold mb-4" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
        {label}
      </p>
      <h2
        className="font-sans font-black mb-4"
        style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', letterSpacing: '-0.03em', lineHeight: 1.15 }}
      >
        {title}
      </h2>
      <p className="font-sans max-w-lg mx-auto" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', lineHeight: 1.6 }}>
        {description}
      </p>
    </div>
  );
}

/* ─── How It Works Steps ─────────────────────────────────── */
const STEPS = [
  {
    num: '01',
    title: 'Deposit Collateral',
    desc: 'Supply your LST (wstETH, weETH, cbETH) as collateral into a Morpho Blue market.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 010-4h14v4" />
        <path d="M3 5v14a2 2 0 002 2h16v-5" />
        <path d="M18 12a1 1 0 100 4h4v-4h-4z" />
      </svg>
    ),
    color: '#00FFD1',
    extra: null,
  },
  {
    num: '02',
    title: 'Flash Loan Leverage',
    desc: 'VOLT borrows WETH via flash loan, swaps to your LST, and deposits it — all in one atomic transaction.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    color: '#00C2FF',
    extra: 'flash-loop',
  },
  {
    num: '03',
    title: 'Amplified Yield',
    desc: 'Your staking yield is multiplied by your leverage. At 10x, a 2.5% staking APR becomes ~25% gross yield.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 6l-9.5 9.5-5-5L1 18" />
        <path d="M17 6h6v6" />
      </svg>
    ),
    color: '#A78BFA',
    extra: null,
  },
];

/* ─── Comparison Items ───────────────────────────────────── */
const MANUAL_ITEMS = [
  '4 separate transactions',
  'Gas costs multiply',
  'Price exposure between txns',
  'Manual monitoring required',
];
const VOLT_ITEMS = [
  '1 atomic transaction',
  'Single gas cost',
  'Zero price risk (flash loan)',
  'Built-in risk analytics',
];

/* ─── Security Features ──────────────────────────────────── */
const SECURITY_FEATURES = [
  {
    title: 'Atomic Execution',
    desc: 'Flash loans revert the entire transaction if any step fails. No partial state, no stuck funds.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    title: 'Audited Infrastructure',
    desc: 'Built on Morpho Blue, audited by Cantina, Spearbit, ChainSecurity, OpenZeppelin, and Trail of Bits.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: 'Non-Custodial',
    desc: 'Your keys, your collateral. VOLT never takes custody — positions are held directly on Morpho.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
];

/* ─── Animation Variants ─────────────────────────────────── */
const heroContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 1.0 } },
};

const fadeUpBlur = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
};

const wordStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
};

const wordReveal = {
  hidden: { opacity: 0, y: 30, filter: 'blur(8px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { type: 'spring' as const, damping: 20, stiffness: 100 },
  },
};

/* ─── Page ───────────────────────────────────────────────── */
const FEATURED_MARKET_ID = '0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba';
const FEATURED_LEV = 18;
const MIN_TVL_ETH = 10;

function getTvlEth(supplyAssets: string) {
  return parseFloat(supplyAssets) / 1e18;
}

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<AggStats | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [mkRes, yldRes] = await Promise.all([
          fetch('/api/markets', { cache: 'no-store' }),
          fetch('/api/yields'),
        ]);
        if (!mkRes.ok) return;
        const { markets } = await mkRes.json();
        const yields: Record<string, number> = {};
        if (yldRes.ok) {
          const yd = await yldRes.json();
          if (yd?.yields) Object.assign(yields, yd.yields);
        }
        const filtered = (markets || []).filter((m: { supplyAssets: string }) => getTvlEth(m.supplyAssets) >= MIN_TVL_ETH);
        if (filtered.length === 0) return;

        const totalTvl = filtered.reduce((s: number, m: { supplyAssets: string }) => s + getTvlEth(m.supplyAssets), 0);
        const avgSupplyApy = filtered.reduce((s: number, m: { supplyApy: number }) => s + m.supplyApy, 0) / filtered.length;
        const avgBorrowApy = filtered.reduce((s: number, m: { borrowApy: number }) => s + m.borrowApy, 0) / filtered.length;

        let topNetApy = 0;
        let bestMarket: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
        let pinnedMarket: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
        for (const m of filtered) {
          const collYieldDecimal = (yields[m.collateralSymbol] || 2.5) / 100;
          const net = ((m.supplyApy + collYieldDecimal) * FEATURED_LEV - m.borrowApy * (FEATURED_LEV - 1)) * 100;
          if (net > topNetApy) { topNetApy = net; bestMarket = { ...m, netApy: net, leverage: FEATURED_LEV }; }
          if (m.uniqueKey === FEATURED_MARKET_ID) { pinnedMarket = { ...m, netApy: net, leverage: FEATURED_LEV }; }
        }
        const feat = pinnedMarket || bestMarket;
        setStats({
          totalTvl, marketCount: filtered.length, avgSupplyApy, topNetApy, avgBorrowApy,
          topMarket: feat ? {
            pair: feat.pair, uniqueKey: feat.uniqueKey, netApy: feat.netApy, leverage: feat.leverage,
            lltv: feat.lltv, tvlEth: getTvlEth(feat.supplyAssets), collYield: yields[feat.collateralSymbol] || 0,
          } : null,
        });
      } catch { /* silently ignore */ }
    }
    load();
  }, []);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <>
      {/* ═══════════════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════════════ */}
      <div ref={heroRef} className="min-h-[calc(100vh-64px)] flex flex-col justify-center relative -mt-6 mb-28">
        {/* Background — single subtle gradient, no excessive effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
          <div className="hero-blob hero-blob-cyan" />
          <div className="hero-blob hero-blob-purple" />
        </div>

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          variants={heroContainer}
          initial="hidden"
          animate="visible"
          className="text-center relative z-10 px-4"
        >
          {/* VOLT Wordmark — Electric Charge-In */}
          <div className="mb-4">
            <div
              className="flex items-center justify-center"
              style={{ fontSize: 'clamp(6rem, 16vw, 12rem)', lineHeight: 1 }}
            >
              {['V', 'O', 'L', 'T'].map((letter, i) => (
                <span
                  key={letter + i}
                  className="volt-letter"
                  style={{
                    animation: `volt-flicker 0.6s ${0.3 + i * 0.15}s ease-out forwards, volt-glow-pulse 4s ${0.9 + i * 0.15}s ease-in-out infinite`,
                    position: letter === 'O' ? 'relative' : undefined,
                  }}
                >
                  {letter}
                  {letter === 'O' && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="absolute"
                      style={{
                        width: '28%', height: '28%',
                        top: '50%', left: '40%',
                        transform: 'translate(-50%, -50%)',
                        opacity: 0.5,
                      }}
                    >
                      <path
                        d="M13 2L4.09 12.37A1 1 0 0 0 5 14H11L11 22L19.91 11.63A1 1 0 0 0 19 10H13L13 2Z"
                        fill="#00FFD1"
                      />
                    </svg>
                  )}
                </span>
              ))}
            </div>

            {/* Underline sweep */}
            <div className="flex justify-center mt-2">
              <motion.div
                className="volt-underline"
                style={{ width: 'min(280px, 60vw)' }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ delay: 1.0, duration: 0.6, ease: 'easeOut' }}
              />
            </div>

            {/* PROTOCOL subtitle */}
            <motion.p
              className="font-sans tracking-[0.3em] uppercase font-semibold mt-3"
              style={{ color: 'var(--text-muted)', fontSize: '11px' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.5 }}
            >
              PROTOCOL
            </motion.p>
          </div>

          {/* Headline — outcome-first */}
          <motion.div variants={fadeUpBlur}>
            <h1
              className="font-black leading-[1.05] mb-6"
              style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
            >
              <motion.span variants={wordStagger} initial="hidden" animate="visible"
                           className="inline-flex flex-wrap justify-center gap-x-[0.3em]">
                {['Amplify', 'Your'].map((word) => (
                  <motion.span key={word} variants={wordReveal} className="inline-block">
                    {word}
                  </motion.span>
                ))}
              </motion.span>
              <br />
              <motion.span variants={wordStagger} initial="hidden" animate="visible"
                           className="inline-flex flex-wrap justify-center gap-x-[0.3em]">
                {['Staking', 'Yield'].map((word) => (
                  <motion.span key={word} variants={wordReveal}
                               className="inline-block gradient-text-animated">
                    {word}
                  </motion.span>
                ))}
              </motion.span>
            </h1>
          </motion.div>

          {/* Subheadline — sans-serif for readability */}
          <motion.p
            variants={fadeUpBlur}
            className="font-sans max-w-lg mx-auto mb-8"
            style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.95rem, 2vw, 1.125rem)', lineHeight: 1.65 }}
          >
            Atomic flash loan leverage on Morpho Blue.
            Deposit once, amplify up to 28x — one transaction, zero execution risk.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeUpBlur} className="flex items-center justify-center gap-3 flex-wrap mb-12">
            <Link href="/markets">
              <motion.div
                className="btn-primary w-auto inline-flex items-center justify-center gap-2 px-10 cursor-pointer"
                whileHover={{ scale: 1.03, boxShadow: '0 8px 40px rgba(0,255,209,0.35)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Launch App
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </motion.div>
            </Link>
            <Link
              href="/learn"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-sans font-semibold transition-all hover:bg-white/[0.04]"
              style={{ fontSize: 'var(--text-caption)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              How It Works
            </Link>
          </motion.div>

          {/* Stats strip — large numbers */}
          {stats && (
            <motion.div variants={fadeUpBlur} className="flex justify-center">
              <div className="stat-strip inline-flex px-2">
                <div className="stat-strip-item">
                  <span className="font-sans uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Total TVL</span>
                  <CountUp value={stats.totalTvl} decimals={0} suffix=" ETH" commas className="text-2xl sm:text-3xl" />
                </div>
                <div className="stat-strip-item">
                  <span className="font-sans uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Markets</span>
                  <CountUp value={stats.marketCount} decimals={0} className="text-2xl sm:text-3xl" />
                </div>
                <div className="stat-strip-item">
                  <span className="font-sans uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Top Net APY</span>
                  <CountUp value={stats.topNetApy} decimals={1} suffix="%" className="text-2xl sm:text-3xl" />
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          HOW IT WORKS — Connected Flow (preserved)
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="mb-28"
      >
        <SectionHeader
          label="HOW IT WORKS"
          title="One Transaction. Maximum Exposure."
          description="VOLT handles the entire leverage loop atomically — no manual steps, no price exposure between transactions."
        />

        {/* Desktop: horizontal flow with connectors */}
        <div className="hidden md:flex items-stretch gap-0 max-w-5xl mx-auto">
          {STEPS.map((step, i) => (
            <Fragment key={step.num}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="relative flex-1 p-6 rounded-2xl group transition-all duration-300"
                style={{
                  background: 'rgba(10, 15, 31, 0.7)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${step.color}25`;
                  e.currentTarget.style.boxShadow = `0 8px 40px ${step.color}06`;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span className="step-watermark" style={{ color: step.color }}>{step.num}</span>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${step.color}10`, color: step.color, boxShadow: `0 0 30px ${step.color}12` }}
                >
                  {step.icon}
                </div>
                <h3 className="font-sans font-bold mb-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>{step.title}</h3>
                <p className="font-sans leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>{step.desc}</p>
                {step.extra === 'flash-loop' && <FlashLoanLoop />}
              </motion.div>

              {i < STEPS.length - 1 && (
                <div className="flow-connector w-10 self-center mx-1">
                  <motion.div
                    className="flow-connector-line"
                    style={{ background: `linear-gradient(90deg, ${step.color}, ${STEPS[i + 1].color})` }}
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.2, duration: 0.6 }}
                  />
                  <motion.div
                    className="flow-particle"
                    style={{ background: STEPS[i + 1].color, boxShadow: `0 0 8px ${STEPS[i + 1].color}` }}
                    animate={{ left: ['0%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear', delay: 0.8 + i * 0.3 }}
                  />
                </div>
              )}
            </Fragment>
          ))}
        </div>

        {/* Mobile: stacked */}
        <div className="md:hidden space-y-4">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative p-5 rounded-2xl"
              style={{ background: 'rgba(10, 15, 31, 0.7)', border: '1px solid var(--border)' }}
            >
              <span className="step-watermark" style={{ color: step.color }}>{step.num}</span>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${step.color}10`, color: step.color }}>
                  {step.icon}
                </div>
                <div>
                  <h3 className="font-sans font-bold mb-1" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>{step.title}</h3>
                  <p className="font-sans leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>{step.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          WHY VOLT — Comparison
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        className="mb-28"
      >
        <SectionHeader
          label="WHY VOLT"
          title="Traditional Leverage is Broken"
          description="Manual leveraging requires multiple transactions with price exposure between each step. VOLT replaces the entire process with a single atomic operation."
        />

        <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {/* Manual */}
          <div
            className="p-6 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="font-sans uppercase tracking-[0.15em] font-semibold mb-5" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              Manual Leverage
            </p>
            <div className="space-y-3.5">
              {MANUAL_ITEMS.map((text) => (
                <div key={text} className="flex items-center gap-3">
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0 font-bold"
                    style={{ background: 'rgba(255,51,102,0.08)', color: '#FF3366', fontSize: '10px' }}
                  >
                    ✕
                  </span>
                  <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* VOLT */}
          <div
            className="p-6 rounded-2xl relative overflow-hidden"
            style={{ background: 'rgba(0,255,209,0.02)', border: '1px solid rgba(0,255,209,0.12)' }}
          >
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,255,209,0.3), transparent)' }} />
            <p className="font-sans uppercase tracking-[0.15em] font-semibold mb-5" style={{ color: 'var(--accent-primary)', fontSize: '11px' }}>
              VOLT Protocol
            </p>
            <div className="space-y-3.5">
              {VOLT_ITEMS.map((text) => (
                <div key={text} className="flex items-center gap-3">
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0 font-bold"
                    style={{ background: 'rgba(0,255,209,0.08)', color: 'var(--accent-primary)', fontSize: '10px' }}
                  >
                    ✓
                  </span>
                  <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="font-sans font-medium text-center mt-6" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-body)' }}>
          Same result. <span style={{ color: 'var(--accent-primary)' }}>75% less gas.</span> Zero execution risk.
        </p>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          SECURITY
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        className="mb-28"
      >
        <SectionHeader
          label="SECURITY"
          title="Built on Audited Infrastructure"
          description="VOLT leverages Morpho Blue's battle-tested lending protocol, audited by five leading security firms."
        />

        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto mb-10">
          {SECURITY_FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="p-6 rounded-2xl text-center transition-all duration-300"
              style={{ background: 'rgba(10, 15, 31, 0.6)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,209,0.12)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(0,255,209,0.06)', color: 'var(--accent-primary)' }}
              >
                {feature.icon}
              </div>
              <h3 className="font-sans font-bold mb-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                {feature.title}
              </h3>
              <p className="font-sans leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Auditor names — borrowed trust */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
          {['Cantina', 'Spearbit', 'ChainSecurity', 'OpenZeppelin', 'Trail of Bits'].map((name) => (
            <span
              key={name}
              className="font-sans font-medium opacity-25 hover:opacity-50 transition-opacity duration-300"
              style={{ color: 'var(--text-secondary)', fontSize: '12px', letterSpacing: '0.05em' }}
            >
              {name}
            </span>
          ))}
        </div>
      </motion.div>



      {/* ═══════════════════════════════════════════════════════
          FINAL CTA
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        className="mb-16 text-center py-20 relative"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(0,255,209,0.03) 0%, transparent 70%)' }}
        />
        <div className="relative z-10">
          <h2
            className="font-sans font-black mb-4"
            style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', letterSpacing: '-0.03em' }}
          >
            Ready to Amplify Your Yield?
          </h2>
          <p className="font-sans max-w-md mx-auto mb-8" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
            One transaction. Maximum capital efficiency. Zero execution risk.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/markets">
              <motion.div
                className="btn-primary w-auto inline-flex items-center justify-center gap-2 px-10 cursor-pointer"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Launch App
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </motion.div>
            </Link>
            <Link
              href="/learn"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-sans font-semibold transition-all hover:bg-white/[0.04]"
              style={{ fontSize: 'var(--text-caption)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Learn More
            </Link>
          </div>
        </div>
      </motion.div>
    </>
  );
}
