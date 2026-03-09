'use client';

interface TooltipProps {
  label: string;
  tip: string;
  className?: string;
}

export default function Tooltip({ label, tip, className = '' }: TooltipProps) {
  return (
    <span className={`tooltip-wrap ${className}`}>
      {label}
      <span className="tooltip-icon">?</span>
      <span className="tooltip-box">{tip}</span>
    </span>
  );
}
