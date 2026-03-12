'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnect } from '@/components/WalletConnect';
import VoltIcon from './VoltIcon';

export default function Header() {
  const pathname = usePathname();

  const isMarketDetail = pathname.startsWith('/markets/') && pathname !== '/markets';
  const isMarkets = pathname === '/markets' || isMarketDetail;

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          borderColor: 'var(--border)',
          background: 'rgba(3, 7, 17, 0.85)',
          backdropFilter: 'blur(24px) saturate(1.5)',
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-5 shrink-0">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="volt-logo w-8 h-8" style={{ borderRadius: 10 }}>
                <VoltIcon />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-base font-black gradient-text tracking-tight leading-none">VOLT</h1>
                <p className="text-[8px] text-(--text-muted) uppercase tracking-[0.25em] font-mono mt-0.5">
                  Flash Leverage
                </p>
              </div>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-1 ml-2">
              <Link
                href="/markets"
                className="relative px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-[0.12em] transition-all duration-200"
                style={{
                  color: isMarkets ? 'var(--accent-primary)' : 'var(--text-muted)',
                  background: isMarkets ? 'rgba(0,255,209,0.06)' : 'transparent',
                }}
              >
                Markets
                {isMarkets && !isMarketDetail && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/5 h-[2px] rounded-full"
                    style={{ background: 'var(--accent-primary)' }}
                  />
                )}
              </Link>
              {isMarketDetail && (
                <span
                  className="relative px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-[0.12em]"
                  style={{
                    color: 'var(--accent-primary)',
                    background: 'rgba(0,255,209,0.06)',
                  }}
                >
                  Position
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/5 h-[2px] rounded-full"
                    style={{ background: 'var(--accent-primary)' }}
                  />
                </span>
              )}
            </nav>
          </div>

          <WalletConnect />
        </div>
      </header>
      <div className="glow-line" />
    </>
  );
}
