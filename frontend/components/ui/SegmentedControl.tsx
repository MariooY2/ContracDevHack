'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface SegmentedControlProps<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const activeIdx = options.findIndex(o => o.value === value);
    const buttons = containerRef.current.querySelectorAll('button');
    if (buttons[activeIdx]) {
      const btn = buttons[activeIdx];
      setIndicatorStyle({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
      });
    }
  }, [value, options]);

  const pad = size === 'sm' ? 'px-2.5 py-1' : 'px-3.5 py-1.5';
  const fontSize = size === 'sm' ? 'var(--text-micro)' : 'var(--text-caption)';

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center gap-0.5 p-0.5 rounded-xl ${className}`}
      style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border)' }}
    >
      {/* Animated indicator */}
      <motion.div
        className="absolute top-0.5 bottom-0.5 rounded-lg"
        style={{ background: 'rgba(41,115,255,0.12)', border: '1px solid rgba(41,115,255,0.25)' }}
        animate={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      />

      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 ${pad} rounded-lg font-mono font-bold uppercase tracking-wider transition-colors duration-200`}
          style={{
            fontSize,
            color: value === option.value ? 'var(--accent-primary)' : 'var(--text-muted)',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
