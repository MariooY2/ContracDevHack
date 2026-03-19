'use client';

type StatusType = 'safe' | 'caution' | 'danger' | 'neutral' | 'info';

const STATUS_CONFIG: Record<StatusType, { bg: string; border: string; color: string; dotColor: string }> = {
  safe:    { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', color: '#10B981', dotColor: '#10B981' },
  caution: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', color: '#F59E0B', dotColor: '#F59E0B' },
  danger:  { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#ef4444', dotColor: '#ef4444' },
  neutral: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', dotColor: 'var(--text-muted)' },
  info:    { bg: 'rgba(41,115,255,0.08)', border: 'rgba(41,115,255,0.2)', color: '#2973ff', dotColor: '#2973ff' },
};

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  showDot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export default function StatusBadge({
  status,
  label,
  showDot = true,
  size = 'sm',
  className = '',
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const pad = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';
  const fontSize = size === 'sm' ? 'var(--text-micro)' : 'var(--text-caption)';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-bold uppercase tracking-wider ${pad} ${className}`}
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.color,
        fontSize,
      }}
    >
      {showDot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: config.dotColor }}
        />
      )}
      {label}
    </span>
  );
}

/** Helper to derive status from health factor */
export function healthFactorStatus(hf: number): StatusType {
  if (hf >= 2) return 'safe';
  if (hf >= 1.2) return 'caution';
  return 'danger';
}

/** Helper to derive status label from health factor */
export function healthFactorLabel(hf: number): string {
  if (hf >= 2) return 'SAFE';
  if (hf >= 1.2) return 'CAUTION';
  return 'DANGER';
}
