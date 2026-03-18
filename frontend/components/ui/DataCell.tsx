'use client';

interface DataCellProps {
  label: string;
  value: string | number;
  subtext?: string;
  variant?: 'vertical' | 'horizontal' | 'compact';
  color?: string;
  mono?: boolean;
  className?: string;
}

export default function DataCell({
  label,
  value,
  subtext,
  variant = 'vertical',
  color,
  mono = true,
  className = '',
}: DataCellProps) {
  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center justify-between gap-2 ${className}`}>
        <span className="text-[var(--text-caption)] font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`font-bold ${mono ? 'font-mono' : 'font-sans'}`}
            style={{ color: color || 'var(--text-primary)', fontSize: 'var(--text-body)' }}
          >
            {value}
          </span>
          {subtext && (
            <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
              {subtext}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="font-sans uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
          {label}
        </span>
        <span
          className={`font-bold ${mono ? 'font-mono' : 'font-sans'}`}
          style={{ color: color || 'var(--text-primary)', fontSize: 'var(--text-caption)' }}
        >
          {value}
        </span>
      </div>
    );
  }

  // vertical (default)
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="font-sans uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
        {label}
      </span>
      <span
        className={`font-bold ${mono ? 'font-mono' : 'font-sans'}`}
        style={{ color: color || 'var(--text-primary)', fontSize: 'var(--text-body)' }}
      >
        {value}
      </span>
      {subtext && (
        <span className="font-sans" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro)' }}>
          {subtext}
        </span>
      )}
    </div>
  );
}
