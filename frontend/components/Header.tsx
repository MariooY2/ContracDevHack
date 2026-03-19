'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { WalletConnect } from '@/components/WalletConnect';
import VoltIcon from './VoltIcon';

interface NavItemProps {
  href: string;
  label: string;
  isActive: boolean;
  showIndicator?: boolean;
  badge?: string;
}

function NavItem({ href, label, isActive, showIndicator = true, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      className="relative px-3 py-1.5 rounded-lg font-sans font-bold uppercase tracking-wider transition-all duration-200 hidden sm:flex items-center gap-1.5"
      style={{
        fontSize: 'var(--text-caption)',
        color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
        background: isActive ? 'rgba(41,115,255,0.08)' : 'transparent',
      }}
    >
      {label}
      {badge && (
        <span
          className="font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            fontSize: '7px',
            background: 'rgba(41,115,255,0.1)',
            color: '#2973ff',
            border: '1px solid rgba(41,115,255,0.2)',
          }}
        >
          {badge}
        </span>
      )}
      {isActive && showIndicator && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/5 h-[2px] rounded-full"
          style={{ background: 'var(--accent-primary)' }}
        />
      )}
    </Link>
  );
}

export default function Header() {
  const pathname = usePathname();
  const { isConnected } = useAccount();

  const isMarketDetail = pathname.startsWith('/markets/') && pathname !== '/markets';
  const isMarkets = pathname === '/markets' || isMarketDetail;
  const isDashboard = pathname === '/dashboard';
  const isLearn = pathname === '/learn';
  const isCommunity = pathname.startsWith('/community');

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          borderColor: 'var(--border)',
          background: 'rgba(9, 9, 9, 0.85)',
          backdropFilter: 'blur(24px)',
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
                <h1 className="text-base font-black tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>VOLT</h1>
                <p className="font-mono mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '8px', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
                  Protocol
                </p>
              </div>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-1 ml-2">
              <NavItem href="/markets" label="Markets" isActive={isMarkets} showIndicator={!isMarketDetail} />
              {isConnected && (
                <NavItem href="/dashboard" label="Dashboard" isActive={isDashboard} />
              )}
              <NavItem href="/learn" label="Learn" isActive={isLearn} />
              <NavItem href="/community" label="Community" isActive={isCommunity} />
            </nav>
          </div>

          {pathname === '/' ? (
            <Link
              href="/markets"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg font-semibold transition-colors"
              style={{
                fontSize: '11px',
                background: 'rgba(41,115,255,0.1)',
                color: 'var(--accent-primary)',
                border: '1px solid rgba(41,115,255,0.2)',
              }}
            >
              Launch App
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <WalletConnect />
          )}
        </div>
      </header>
    </>
  );
}
