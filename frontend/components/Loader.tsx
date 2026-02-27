'use client';

interface LoaderProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ring' | 'bars' | 'hex' | 'skeleton';
}

export function Loader({ label = 'Loading', size = 'md', variant = 'ring' }: LoaderProps) {
  if (variant === 'skeleton') {
    const h = size === 'sm' ? 'h-4' : size === 'md' ? 'h-6' : 'h-8';
    return (
      <div className="space-y-3 w-full">
        <div className={`skeleton ${h} w-3/4`} />
        <div className={`skeleton ${h} w-1/2`} />
        <div className={`skeleton ${h} w-5/6`} />
      </div>
    );
  }

  if (variant === 'bars') {
    const scale = size === 'sm' ? 'scale-75' : size === 'lg' ? 'scale-125' : '';
    return (
      <div className={`flex flex-col items-center gap-3 ${scale}`}>
        <div className="loader-bars"><span /><span /><span /><span /></div>
        {label && <span className="loading-text">{label}</span>}
      </div>
    );
  }

  if (variant === 'hex') {
    const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
    return (
      <div className="flex flex-col items-center gap-4">
        <div className={`loader-hex ${dim}`} />
        {label && <span className="loading-text">{label}</span>}
      </div>
    );
  }

  // Default: ring
  const dim = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`loader-ring ${dim}`} />
      {label && <span className="loading-text">{label}</span>}
    </div>
  );
}

export function PageLoader({ label = 'Connecting to Protocol' }: { label?: string }) {
  return (
    <div className="page-loader">
      <div className="loader-bars"><span /><span /><span /><span /></div>
      <span className="loading-text">{label}</span>
    </div>
  );
}

export function CardLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="glass-inner p-8 flex flex-col items-center gap-4">
      <div className="loader-bars"><span /><span /><span /><span /></div>
      <span className="loading-text">{label}</span>
    </div>
  );
}
