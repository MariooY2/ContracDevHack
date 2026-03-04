'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { WalletConnect } from '@/components/WalletConnect';

function VoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13 2L4.09 12.37A1 1 0 0 0 5 14H11L11 22L19.91 11.63A1 1 0 0 0 19 10H13L13 2Z"
        fill="#05080F"
        stroke="#05080F"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV_LINKS = [
  { href: '/', label: 'Markets' },
  { href: '/positions', label: 'Positions' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || /^\/(ethereum|base|arbitrum|polygon)/.test(pathname);
    }
    return pathname.startsWith(href);
  };

  return (
    <header
      className="sticky top-0 z-50 border-b transition-all duration-300"
      style={{
        borderColor: scrolled ? 'var(--border-bright)' : 'var(--border)',
        background: scrolled ? 'rgba(5, 8, 15, 0.95)' : 'rgba(5, 8, 15, 0.85)',
        backdropFilter: scrolled ? 'blur(32px)' : 'blur(24px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Brand + Nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="volt-logo">
              <VoltIcon />
            </div>
            <div>
              <h1 className="text-lg font-black gradient-text tracking-tight leading-none">VOLT</h1>
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.25em] font-mono mt-0.5">
                Leverage Protocol
              </p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1 relative">
            {NAV_LINKS.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200"
                  style={{
                    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-geist-mono)',
                  }}
                >
                  {active && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl"
                      style={{ background: 'rgba(0,255,136,0.08)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Protocol badge + Wallet + Hamburger */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center">
            <div className="stat-chip">
              <span className="stat-label">Protocol</span>
              <span className="stat-value" style={{ color: 'var(--accent-info)' }}>Morpho Blue</span>
            </div>
          </div>
          <WalletConnect />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-colors"
            style={{ background: mobileOpen ? 'rgba(0,255,136,0.08)' : 'transparent' }}
            aria-label="Toggle menu"
          >
            <motion.span
              animate={mobileOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
              className="block w-5 h-0.5 rounded-full mb-1.5"
              style={{ background: mobileOpen ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            />
            <motion.span
              animate={mobileOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
              className="block w-5 h-0.5 rounded-full mb-1.5"
              style={{ background: 'var(--text-secondary)' }}
            />
            <motion.span
              animate={mobileOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
              className="block w-5 h-0.5 rounded-full"
              style={{ background: mobileOpen ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="sm:hidden overflow-hidden border-t"
            style={{ borderColor: 'var(--border)', background: 'rgba(5, 8, 15, 0.98)' }}
          >
            <div className="px-4 py-3 space-y-1">
              {NAV_LINKS.map(({ href, label }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className="block px-4 py-3 rounded-xl text-sm font-semibold font-mono transition-all"
                    style={{
                      color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      background: active ? 'rgba(0,255,136,0.08)' : 'transparent',
                    }}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
