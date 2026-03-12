'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { motion, useMotionValue, useTransform, useScroll, animate as motionAnimate } from 'framer-motion';
import Link from 'next/link';
import type { AggStats } from '@/components/MarketsTable';

/* ─── CountUp Component ──────────────────────────────────── */
function CountUp({ value, decimals = 1, suffix = '', prefix = '', commas = false }: { value: number; decimals?: number; suffix?: string; prefix?: string; commas?: boolean }) {
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
    <span className="text-xl sm:text-2xl font-black font-mono gradient-text">
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

/* ─── Protocol Advantages (slim trust badges) ────────────── */
const TRUST_BADGES = [
  { title: 'ONE TX', color: '#00FFD1', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg> },
  { title: 'DEPEG SAFE', color: '#00C2FF', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
  { title: 'MORPHO BLUE', color: '#A78BFA', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg> },
  { title: 'BASE L2', color: '#00FFD1', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg> },
];

/* ─── Animation Variants ─────────────────────────────────── */
const heroContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.2 } },
};

const fadeUpBlur = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6 } },
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

  // Fetch market stats for TOP OPPORTUNITY card
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
        let bestMarket: any = null;
        let pinnedMarket: any = null;
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
      } catch {}
    }
    load();
  }, []);

  // Scroll parallax for hero
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <>
      {/* ═══════════════════════════════════════════════════════
          HERO — Redesigned with visual energy
          ═══════════════════════════════════════════════════════ */}
      <div ref={heroRef} className="min-h-[calc(100vh-64px)] flex flex-col justify-center relative -mt-6 mb-16">
        {/* ── Hero Background Composite ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
          {/* 1) Perspective Grid */}
          <div className="hero-grid absolute inset-0" />

          {/* 2) Radial Pulse Rings */}
          <div className="hero-rings absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="hero-ring hero-ring-1" />
            <div className="hero-ring hero-ring-2" />
            <div className="hero-ring hero-ring-3" />
          </div>

          {/* 3) Gradient Mesh Blobs */}
          <div className="hero-blob hero-blob-cyan" />
          <div className="hero-blob hero-blob-purple" />
          <div className="hero-blob hero-blob-blue" />

          {/* 4) Orbital Rings with glowing dots */}
          <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="700" height="700" viewBox="0 0 700 700" fill="none" style={{ opacity: 0.25 }}>
            {/* Orbit path 1 — wide ellipse */}
            <ellipse cx="350" cy="350" rx="300" ry="120" stroke="rgba(0,255,209,0.08)" strokeWidth="0.5" transform="rotate(-15 350 350)" />
            <motion.circle
              r="3" fill="#00FFD1" filter="url(#orb-glow)"
              initial={{ offsetDistance: '0%' }}
              animate={{ offsetDistance: '100%' }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              style={{ offsetPath: 'ellipse(300px 120px at 350px 350px)', offsetRotate: '0deg' } as React.CSSProperties}
            />
            {/* Orbit path 2 — tighter, tilted */}
            <ellipse cx="350" cy="350" rx="220" ry="180" stroke="rgba(0,194,255,0.06)" strokeWidth="0.5" transform="rotate(25 350 350)" />
            <motion.circle
              r="2.5" fill="#00C2FF" filter="url(#orb-glow-blue)"
              initial={{ offsetDistance: '0%' }}
              animate={{ offsetDistance: '100%' }}
              transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
              style={{ offsetPath: 'ellipse(220px 180px at 350px 350px)', offsetRotate: '0deg' } as React.CSSProperties}
            />
            {/* Orbit path 3 — inner */}
            <ellipse cx="350" cy="350" rx="160" ry="90" stroke="rgba(167,139,250,0.06)" strokeWidth="0.5" transform="rotate(-40 350 350)" />
            <motion.circle
              r="2" fill="#A78BFA" filter="url(#orb-glow-purple)"
              initial={{ offsetDistance: '0%' }}
              animate={{ offsetDistance: '100%' }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              style={{ offsetPath: 'ellipse(160px 90px at 350px 350px)', offsetRotate: '0deg' } as React.CSSProperties}
            />
            {/* Glow filters for orbital dots */}
            <defs>
              <filter id="orb-glow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="orb-glow-blue" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="orb-glow-purple" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
          </svg>

          {/* 5) Dot Matrix — radial fade grid */}
          <div className="hero-dot-matrix absolute inset-0" />
        </div>

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          variants={heroContainer}
          initial="hidden"
          animate="visible"
          className="text-center relative z-10"
        >
          {/* System init line */}
          <motion.p
            variants={fadeUpBlur}
            className="text-[11px] font-mono tracking-[0.2em] uppercase mb-8"
            style={{ color: 'var(--text-muted)' }}
          >
            {'// VOLT PROTOCOL :: FLASH LEVERAGE ENGINE'}
          </motion.p>

          {/* Main headline — word-by-word stagger reveal */}
          <motion.div variants={fadeUpBlur}>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6"
                style={{ color: 'var(--text-primary)' }}>
              <motion.span variants={wordStagger} initial="hidden" animate="visible"
                           className="inline-flex flex-wrap justify-center gap-x-[0.3em]">
                {['Flash', 'Leverage'].map((word) => (
                  <motion.span key={word} variants={wordReveal} className="inline-block">
                    {word}
                  </motion.span>
                ))}
              </motion.span>
              <br />
              <motion.span variants={wordStagger} initial="hidden" animate="visible"
                           className="inline-flex flex-wrap justify-center gap-x-[0.3em]">
                {['for', 'Liquid', 'Staking'].map((word) => (
                  <motion.span key={word} variants={wordReveal}
                               className="inline-block gradient-text-animated">
                    {word}
                  </motion.span>
                ))}
              </motion.span>
            </h1>
          </motion.div>

          {/* Subline */}
          <motion.p
            variants={fadeUpBlur}
            className="text-sm sm:text-base font-mono max-w-2xl mx-auto leading-relaxed mb-6"
            style={{ color: 'var(--text-secondary)' }}
          >
            Atomic flash loan loops on Morpho Blue. Deposit once, amplify up to 18x.
            <br className="hidden sm:block" />
            One click. One transaction. Maximum capital efficiency.
          </motion.p>

          {/* CTA — spring physics */}
          <motion.div variants={fadeUpBlur}>
            <Link href="/markets">
              <motion.div
                className="btn-primary w-auto inline-flex items-center justify-center gap-2 px-10 cursor-pointer"
                whileHover={{ scale: 1.05, boxShadow: '0 8px 50px rgba(0,255,209,0.5), 0 0 100px rgba(0,255,209,0.2)' }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                LAUNCH APP
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </motion.div>
            </Link>
          </motion.div>
        </motion.div>

      </div>

      {/* ═══════════════════════════════════════════════════════
          HOW IT WORKS — Connected Flow
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="mb-16"
      >
        <div className="section-label mb-8">
          <span>HOW IT WORKS</span>
        </div>

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
                <h3 className="text-[15px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                <p className="text-[12px] font-mono leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
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
                  <h3 className="text-[14px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                  <p className="text-[11px] font-mono leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          TRUST STRIP — Slim advantage badges
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-16"
      >
        <div className="flex justify-center items-center gap-3 sm:gap-5 flex-wrap">
          {TRUST_BADGES.map((b) => (
            <div
              key={b.title}
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: `${b.color}06`, border: `1px solid ${b.color}15` }}
            >
              <span style={{ color: b.color }}>{b.icon}</span>
              <span className="text-[10px] font-mono font-bold tracking-[0.08em]" style={{ color: b.color }}>
                {b.title}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          TOP OPPORTUNITY — Highlighted best market
          ═══════════════════════════════════════════════════════ */}
      {stats?.topMarket && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <div className="section-label mb-6">
            <span>TOP OPPORTUNITY</span>
          </div>

          <div
            className="max-w-2xl mx-auto p-6 rounded-2xl text-center relative overflow-hidden"
            style={{
              background: 'rgba(10, 15, 31, 0.9)',
              border: '1px solid rgba(0,255,209,0.15)',
              boxShadow: '0 0 60px rgba(0,255,209,0.04), 0 24px 64px rgba(0,0,0,0.3)',
            }}
          >
            {/* Gradient top edge */}
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'var(--grad-card-top)' }} />
            {/* Glow */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center top, rgba(0,255,209,0.05) 0%, transparent 60%)' }} />

            <div className="relative z-10">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
                Highest Risk-Adjusted Yield
              </p>
              <h3 className="text-xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
                {stats.topMarket.pair}
              </h3>
              <p className="text-5xl font-black gradient-text font-mono leading-none mb-2">
                {stats.topMarket.netApy.toFixed(1)}%
              </p>
              <p className="text-xs font-mono mb-5" style={{ color: 'var(--text-secondary)' }}>
                Net APY at {stats.topMarket.leverage}x leverage
              </p>

              {/* Mini stats */}
              <div className="flex justify-center gap-4 mb-5 flex-wrap">
                <div className="stat-chip">
                  <span className="stat-label">LLTV</span>
                  <span className="stat-value">{(stats.topMarket.lltv * 100).toFixed(1)}%</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-label">TVL</span>
                  <span className="stat-value">{stats.topMarket.tvlEth >= 1000 ? `${(stats.topMarket.tvlEth / 1000).toFixed(1)}K` : stats.topMarket.tvlEth.toFixed(0)} ETH</span>
                </div>
                {stats.topMarket.collYield > 0 && (
                  <div className="stat-chip">
                    <span className="stat-label">Coll Yield</span>
                    <span className="stat-value" style={{ color: 'var(--accent-info)' }}>{stats.topMarket.collYield.toFixed(2)}%</span>
                  </div>
                )}
              </div>

              <Link
                href={`/markets/${stats.topMarket.uniqueKey}`}
                className="btn-primary inline-flex items-center gap-2 px-8"
              >
                Open Market
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            </div>
          </div>
        </motion.div>
      )}

    </>
  );
}
