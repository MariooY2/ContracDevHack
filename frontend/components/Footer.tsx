import VoltIcon from './VoltIcon';

export default function Footer() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="glow-line" />
      <div className="max-w-[1400px] mx-auto px-6 py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="volt-logo w-5 h-5 rounded-md!">
              <VoltIcon />
            </div>
            <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
              VOLT Protocol
            </span>
          </div>

          {/* Powered by badges */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold"
              style={{ background: 'rgba(0,255,209,0.06)', border: '1px solid rgba(0,255,209,0.12)', color: 'var(--text-muted)' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-primary)' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Morpho Blue
            </div>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold"
              style={{ background: 'rgba(0,194,255,0.06)', border: '1px solid rgba(0,194,255,0.12)', color: 'var(--text-muted)' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-info)' }}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Base L2
            </div>
          </div>

          {/* Disclaimer */}
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
            Use at your own risk &middot; Not audited
          </span>
        </div>
      </div>
    </footer>
  );
}
