'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedNumber({
  value,
  duration = 800,
  decimals = 2,
  prefix = '',
  suffix = '',
  className = '',
  style,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const startRef = useRef(value);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = display;
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startRef.current + (value - startRef.current) * eased;
      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className={`font-mono font-bold tabular-nums ${className}`} style={style}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}
