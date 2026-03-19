'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useScroll, animate as motionAnimate } from 'framer-motion';
import Link from 'next/link';

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
    <span className={`font-black ${className}`} style={{ color: 'var(--text-primary)' }}>
      {prefix}<motion.span>{display}</motion.span>{suffix}
    </span>
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

/* ─── VoltBolt — Animated lightning bolt behind wordmark ──── */
function VoltBolt() {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      className="absolute pointer-events-none"
      style={{
        width: 'clamp(140px, 22vw, 220px)',
        height: 'auto',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.1, 0.06, 0.1] }}
      transition={{ delay: 1.2, duration: 4, repeat: Infinity, repeatType: 'reverse' }}
    >
      <motion.path
        d="M13 2L4.09 12.37A1 1 0 0 0 5 14H12L10 22L19.91 11.63A1 1 0 0 0 19 10H12L13 2Z"
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="0.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: 0.6, duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.path
        d="M13 2L4.09 12.37A1 1 0 0 0 5 14H12L10 22L19.91 11.63A1 1 0 0 0 19 10H12L13 2Z"
        fill="rgba(41,115,255,0.03)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
      />
    </motion.svg>
  );
}

/* ─── Typewriter — Character-by-character typing effect ──── */
function TypewriterHeadline() {
  const text1 = 'Amplify Your ';
  const text2 = 'Staking Yield';
  const fullText = text1 + text2;
  const [charCount, setCharCount] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (charCount < fullText.length) {
      const delay = charCount === 0 ? 1200 : 35 + Math.random() * 25;
      const timer = setTimeout(() => setCharCount((c) => c + 1), delay);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShowCursor(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [charCount, fullText.length]);

  const typed = fullText.slice(0, charCount);
  const plain = typed.slice(0, Math.min(charCount, text1.length));
  const accent = charCount > text1.length ? typed.slice(text1.length) : '';

  return (
    <h2
      className="font-black leading-[1.05] mb-6"
      style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
    >
      {plain}
      {accent && <span style={{ color: 'var(--accent-primary)' }}>{accent}</span>}
      {showCursor && <span className="typewriter-cursor" />}
    </h2>
  );
}

/* ─── FloatingBadges — Drifting protocol pills ──────────── */
const BADGES = [
  { text: 'Morpho Blue', x: '8%', y: '18%', delay: 0, anim: 'float-y', dur: '5s', color: '#2973ff' },
  { text: 'Flash Loans', x: '85%', y: '22%', delay: 0.5, anim: 'float-y-alt', dur: '4.5s', color: '#a78bfa' },
  { text: 'Up to 28x', x: '5%', y: '72%', delay: 1.0, anim: 'float-diagonal', dur: '6s', color: '#10B981' },
  { text: 'Atomic', x: '88%', y: '68%', delay: 0.3, anim: 'float-y', dur: '5.5s', color: '#F59E0B' },
  { text: 'Risk Analytics', x: '15%', y: '45%', delay: 0.8, anim: 'float-y-alt', dur: '4s', color: '#00C2FF' },
  { text: 'Multi-Chain', x: '82%', y: '45%', delay: 1.2, anim: 'float-diagonal', dur: '5s', color: '#ef4444' },
];

function FloatingBadges() {
  return (
    <div className="absolute inset-0 pointer-events-none hidden md:block overflow-hidden">
      {BADGES.map((badge, i) => (
        <motion.div
          key={badge.text}
          className="absolute"
          style={{ left: badge.x, top: badge.y, animation: `${badge.anim} ${badge.dur} ease-in-out infinite`, animationDelay: `${badge.delay}s` }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5 + i * 0.15, duration: 0.6 }}
        >
          <div
            className="px-3 py-1.5 rounded-full font-mono text-[10px] font-bold tracking-wider whitespace-nowrap"
            style={{
              background: `${badge.color}0a`,
              border: `1px solid ${badge.color}20`,
              color: badge.color,
            }}
          >
            {badge.text}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── ParticleGrid — Animated floating dots with lines ──── */
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  x: `${5 + (i % 6) * 17 + (i * 7.3) % 8}%`,
  y: `${10 + Math.floor(i / 6) * 30 + (i * 13.7) % 15}%`,
  size: 2 + (i * 1.7) % 2,
  delay: (i * 0.97) % 4,
  duration: 4 + (i * 1.3) % 4,
}));

function ParticleGrid() {
  return (
    <div className="absolute inset-0 pointer-events-none hidden md:block overflow-hidden" style={{ opacity: 0.5 }}>
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            background: 'rgba(41,115,255,0.5)',
            animation: `particle-float ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.08 }}>
        <line x1="10%" y1="20%" x2="27%" y2="35%" stroke="#2973ff" strokeWidth="0.5" />
        <line x1="27%" y1="35%" x2="44%" y2="22%" stroke="#2973ff" strokeWidth="0.5" />
        <line x1="44%" y1="22%" x2="61%" y2="38%" stroke="#2973ff" strokeWidth="0.5" />
        <line x1="61%" y1="38%" x2="78%" y2="25%" stroke="#2973ff" strokeWidth="0.5" />
        <line x1="78%" y1="25%" x2="90%" y2="40%" stroke="#2973ff" strokeWidth="0.5" />
        <line x1="15%" y1="55%" x2="35%" y2="65%" stroke="#a78bfa" strokeWidth="0.5" />
        <line x1="35%" y1="65%" x2="55%" y2="55%" stroke="#a78bfa" strokeWidth="0.5" />
        <line x1="55%" y1="55%" x2="75%" y2="65%" stroke="#a78bfa" strokeWidth="0.5" />
        <line x1="75%" y1="65%" x2="88%" y2="55%" stroke="#a78bfa" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

/* ─── TiltCard — 3D perspective tilt on hover ────────────── */
function TiltCard({ children, className, style }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  return (
    <div
      className={className}
      style={{
        ...style,
        transform: `perspective(800px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
        transition: 'transform 0.25s ease, border-color 0.25s, box-shadow 0.25s',
        willChange: 'transform',
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
        setTilt({ x, y });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      {children}
    </div>
  );
}

/* ─── FlashLoanVisualizer — Animated atomic loop diagram ─── */
function FlashLoanVisualizer() {
  const nodes = [
    { label: 'Flash Loan', sub: 'Borrow WETH', x: 300, y: 45 },
    { label: 'Swap', sub: 'WETH → LST', x: 520, y: 155 },
    { label: 'Supply', sub: 'Add Collateral', x: 445, y: 315 },
    { label: 'Borrow', sub: 'More WETH', x: 155, y: 315 },
    { label: 'Repay', sub: 'Flash Loan', x: 80, y: 155 },
  ];

  // Circular path connecting all nodes
  const pathData = `M 300 65 C 420 65, 520 100, 520 155 C 520 220, 500 280, 445 315 C 380 350, 220 350, 155 315 C 100 280, 80 220, 80 155 C 80 100, 180 65, 300 65`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="hidden md:flex justify-center mb-20 -mt-8"
    >
      <div className="relative" style={{ width: 600, height: 380 }}>
        <svg width="600" height="380" viewBox="0 0 600 380" fill="none" className="absolute inset-0">
          {/* Connection path */}
          <motion.path
            d={pathData}
            stroke="rgba(41,115,255,0.12)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            fill="none"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 1.5, ease: 'easeInOut' }}
          />

          {/* Animated flowing dots */}
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              r="3"
              fill="#2973ff"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: [0, 1, 1, 0] }}
              viewport={{ once: true }}
              transition={{ delay: 1.5 + i * 1.2, duration: 3.6, repeat: Infinity, ease: 'linear' }}
            >
              <animateMotion
                dur="3.6s"
                repeatCount="indefinite"
                begin={`${1.5 + i * 1.2}s`}
                path={pathData}
              />
            </motion.circle>
          ))}

          {/* Glow trail for dots */}
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={`glow-${i}`}
              r="8"
              fill="rgba(41,115,255,0.15)"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: [0, 0.5, 0.5, 0] }}
              viewport={{ once: true }}
              transition={{ delay: 1.5 + i * 1.2, duration: 3.6, repeat: Infinity, ease: 'linear' }}
            >
              <animateMotion
                dur="3.6s"
                repeatCount="indefinite"
                begin={`${1.5 + i * 1.2}s`}
                path={pathData}
              />
            </motion.circle>
          ))}
        </svg>

        {/* Nodes */}
        {nodes.map((node, i) => (
          <motion.div
            key={node.label}
            className="absolute flex flex-col items-center"
            style={{ left: node.x, top: node.y, transform: 'translate(-50%, -50%)' }}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="px-4 py-2.5 rounded-xl text-center"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                minWidth: 100,
              }}
            >
              <p className="font-sans font-bold" style={{ color: 'var(--text-primary)', fontSize: '12px' }}>{node.label}</p>
              <p className="font-sans" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{node.sub}</p>
            </div>
          </motion.div>
        ))}

        {/* Center label */}
        <motion.div
          className="absolute flex flex-col items-center"
          style={{ left: 300, top: 190, transform: 'translate(-50%, -50%)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.0, duration: 0.6 }}
        >
          <div
            className="px-4 py-2 rounded-full"
            style={{
              background: 'rgba(41,115,255,0.06)',
              border: '1px solid rgba(41,115,255,0.2)',
              animation: 'subtle-pulse 3s ease-in-out infinite',
            }}
          >
            <span className="font-sans font-bold" style={{ color: 'var(--accent-primary)', fontSize: '11px', letterSpacing: '0.15em' }}>
              ATOMIC
            </span>
          </div>
          <p className="font-sans mt-1" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>One Block</p>
        </motion.div>
      </div>
    </motion.div>
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
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.3 } },
};

const fadeUpBlur = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
};

const voltLetters = ['V', 'O', 'L', 'T'];

const letterContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const letterVariant = {
  hidden: { opacity: 0, y: 40, scale: 0.85, filter: 'blur(8px)' },
  visible: {
    opacity: 1, y: 0, scale: 1, filter: 'blur(0px)',
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

/* ─── Page ───────────────────────────────────────────────── */
export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [hasMoved, setHasMoved] = useState(false);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div
      className="relative"
      onMouseMove={(e) => {
        if (!hasMoved) setHasMoved(true);
        setMousePos({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* Mouse-tracking gradient orb */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={hasMoved ? {
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(41,115,255,0.07), transparent 70%)`,
          transition: 'background 0.15s ease',
        } : {}}
      />

      {/* ═══════════════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════════════ */}
      <div
        ref={heroRef}
        className="min-h-[calc(100vh-64px)] flex flex-col justify-center relative -mt-6 mb-28"
      >
        {/* Particle grid background */}
        <ParticleGrid />

        {/* Floating protocol badges */}
        <FloatingBadges />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          variants={heroContainer}
          initial="hidden"
          animate="visible"
          className="text-center relative z-10 px-4"
        >
          {/* VOLT Wordmark — animated gradient + bolt */}
          <div className="mb-4 relative inline-block">
            <VoltBolt />
            <motion.h1
              className="volt-gradient-text volt-glow font-black flex items-center justify-center relative"
              style={{ fontSize: 'clamp(6rem, 16vw, 12rem)', lineHeight: 1, letterSpacing: '-0.03em' }}
              variants={letterContainer}
              initial="hidden"
              animate="visible"
            >
              {voltLetters.map((letter, i) => (
                <motion.span
                  key={i}
                  variants={letterVariant}
                  style={{ display: 'inline-block' }}
                >
                  {letter}
                </motion.span>
              ))}
            </motion.h1>
            <motion.p
              className="font-sans tracking-[0.3em] uppercase font-semibold mt-3"
              style={{ color: 'var(--text-muted)', fontSize: '11px' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
            >
              PROTOCOL
            </motion.p>
          </div>

          {/* Typewriter headline */}
          <motion.div variants={fadeUpBlur}>
            <TypewriterHeadline />
          </motion.div>

          {/* Subheadline */}
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
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

        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          HOW IT WORKS
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <SectionHeader
          label="HOW IT WORKS"
          title="One Transaction. Maximum Exposure."
          description="VOLT handles the entire leverage loop atomically — no manual steps, no price exposure between transactions."
        />

        {/* Desktop: horizontal with 3D tilt + connectors */}
        <div className="hidden md:flex items-stretch gap-4 max-w-5xl mx-auto relative">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1"
            >
              <TiltCard
                className="relative p-6 rounded-2xl h-full"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
              >
                <span className="absolute top-3 right-4 font-black text-6xl opacity-[0.04]" style={{ color: 'var(--text-primary)' }}>{step.num}</span>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(41,115,255,0.08)', color: 'var(--accent-primary)' }}
                >
                  {step.icon}
                </div>
                <h3 className="font-sans font-bold mb-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>{step.title}</h3>
                <p className="font-sans leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>{step.desc}</p>
              </TiltCard>
            </motion.div>
          ))}

          {/* Connector arrows between cards */}
          <svg className="absolute top-1/2 left-0 w-full h-12 -translate-y-1/2 pointer-events-none" style={{ zIndex: 5 }}>
            {[0, 1].map((i) => {
              const x1 = `${33.33 * (i + 1) - 1}%`;
              const x2 = `${33.33 * (i + 1) + 1}%`;
              return (
                <motion.line
                  key={i}
                  x1={x1} y1="50%" x2={x2} y2="50%"
                  stroke="var(--accent-primary)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 0.25 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.7 + i * 0.2, duration: 0.6 }}
                />
              );
            })}
            {/* Arrowheads */}
            {[0, 1].map((i) => {
              const cx = 33.33 * (i + 1) + 1.5;
              return (
                <motion.polygon
                  key={`arrow-${i}`}
                  points={`${cx - 0.6}%,35% ${cx + 0.4}%,50% ${cx - 0.6}%,65%`}
                  fill="var(--accent-primary)"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 0.25 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.0 + i * 0.2 }}
                />
              );
            })}
          </svg>
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
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(41,115,255,0.08)', color: 'var(--accent-primary)' }}>
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
          FLASH LOAN VISUALIZER
          ═══════════════════════════════════════════════════════ */}
      <FlashLoanVisualizer />

      {/* ═══════════════════════════════════════════════════════
          WHY VOLT — Comparison
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
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
          {/* Manual — slides in from left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="p-6 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border)' }}
          >
            <p className="font-sans uppercase tracking-[0.15em] font-semibold mb-5" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              Manual Leverage
            </p>
            <div className="space-y-3.5">
              {MANUAL_ITEMS.map((text, i) => (
                <motion.div
                  key={text}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                >
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0 font-bold"
                    style={{ background: 'rgba(255,119,146,0.08)', color: 'var(--color-danger)', fontSize: '10px' }}
                  >
                    ✕
                  </span>
                  <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>{text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* VOLT — slides in from right */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="p-6 rounded-2xl"
            style={{ background: 'rgba(41,115,255,0.03)', border: '1px solid rgba(41,115,255,0.15)' }}
          >
            <p className="font-sans uppercase tracking-[0.15em] font-semibold mb-5" style={{ color: 'var(--accent-primary)', fontSize: '11px' }}>
              VOLT Protocol
            </p>
            <div className="space-y-3.5">
              {VOLT_ITEMS.map((text, i) => (
                <motion.div
                  key={text}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                >
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0 font-bold"
                    style={{ background: 'rgba(41,115,255,0.08)', color: 'var(--accent-primary)', fontSize: '10px' }}
                  >
                    ✓
                  </span>
                  <span className="font-sans" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>{text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.p
          className="font-sans font-medium text-center mt-6"
          style={{ color: 'var(--text-muted)', fontSize: 'var(--text-body)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          Same result. <span style={{ color: 'var(--accent-primary)' }}><CountUp value={75} decimals={0} suffix="% less gas." className="inline" /></span> Zero execution risk.
        </motion.p>
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
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <TiltCard
                className="p-6 rounded-2xl text-center h-full"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(41,115,255,0.08)', color: 'var(--accent-primary)' }}
                >
                  {feature.icon}
                </div>
                <h3 className="font-sans font-bold mb-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
                  {feature.title}
                </h3>
                <p className="font-sans leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }}>
                  {feature.desc}
                </p>
              </TiltCard>
            </motion.div>
          ))}
        </div>

        {/* Auditor names */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
          {['Cantina', 'Spearbit', 'ChainSecurity', 'OpenZeppelin', 'Trail of Bits'].map((name, i) => (
            <motion.span
              key={name}
              className="font-sans font-medium hover:opacity-50 transition-opacity duration-300"
              style={{ color: 'var(--text-secondary)', fontSize: '12px', letterSpacing: '0.05em', opacity: 0.25 }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 0.25 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.08 }}
              whileHover={{ opacity: 0.5 }}
            >
              {name}
            </motion.span>
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
        className="mb-16 text-center py-20 relative rounded-3xl overflow-hidden grid-bg"
      >
        {/* Subtle orb */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(400px circle at 50% 50%, rgba(41,115,255,0.05), transparent 70%)',
          }}
        />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mb-4"
          >
            <span className="badge-info">Get Started</span>
          </motion.div>
          <h2
            className="font-sans font-black mb-4"
            style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', letterSpacing: '-0.03em' }}
          >
            Ready to Amplify Your <span style={{ color: 'var(--accent-primary)' }}>Yield</span>?
          </h2>
          <p className="font-sans max-w-md mx-auto mb-8" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
            One transaction. Maximum capital efficiency. Zero execution risk.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/markets">
              <motion.div
                className="btn-primary w-auto inline-flex items-center justify-center gap-2 px-10 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
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
    </div>
  );
}
