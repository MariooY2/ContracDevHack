'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';

interface MobileNavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  requiresWallet?: boolean;
}

const items: MobileNavItem[] = [
  {
    href: '/markets',
    label: 'Markets',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 4 4-8" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    requiresWallet: true,
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    href: '/learn',
    label: 'Learn',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
        <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
      </svg>
    ),
  },
  {
    href: '/community',
    label: 'Community',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { isConnected } = useAccount();

  const visibleItems = items.filter(item => !item.requiresWallet || isConnected);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t"
      style={{
        borderColor: 'var(--border)',
        background: 'rgba(9, 9, 9, 0.92)',
        backdropFilter: 'blur(24px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {visibleItems.map(item => {
          const isActive = pathname === item.href || (item.href === '/markets' && pathname.startsWith('/markets'));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors"
              style={{
                color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                background: isActive ? 'rgba(41,115,255,0.08)' : 'transparent',
              }}
            >
              {item.icon(isActive)}
              <span className="font-sans font-bold" style={{ fontSize: '9px', letterSpacing: '0.05em' }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
