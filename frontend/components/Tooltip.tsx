'use client';

interface TooltipProps {
  label: string;
  tip: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function Tooltip({ label, tip, className = '', style }: TooltipProps) {
  return (
    <span className={`tooltip-wrap ${className}`} style={style}>
      {label}
      <span className="tooltip-icon">?</span>
      <span className="tooltip-box">{tip}</span>
    </span>
  );
}
