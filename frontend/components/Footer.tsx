import VoltIcon from './VoltIcon';

export default function Footer() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: 'var(--border)' }}>
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

          {/* Disclaimer */}
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
            Use at your own risk &middot; Not audited
          </span>
        </div>
      </div>
    </footer>
  );
}
