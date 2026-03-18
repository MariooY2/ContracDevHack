'use client';

import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, subtitle, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      {icon && (
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border)' }}
        >
          {icon}
        </div>
      )}
      <h3
        className="font-sans font-bold mb-1.5"
        style={{ color: 'var(--text-primary)', fontSize: 'var(--text-h2)' }}
      >
        {title}
      </h3>
      {subtitle && (
        <p className="font-sans max-w-sm mb-5" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
          {subtitle}
        </p>
      )}
      {action}
    </div>
  );
}
