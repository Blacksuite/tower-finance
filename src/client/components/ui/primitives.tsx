import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { fmtEUR } from '../../../shared/format';
import { Icon, type IconName } from './Icon';

// --- segmented control -------------------------------------------------------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  block,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  block?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className={`segmented${block ? ' segmented--block' : ''}`} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`segmented__btn${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- animated amount (count up on change) ----------------------------------------

export function AnimatedAmount({
  value,
  format = fmtEUR,
  className,
  duration = 600,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0); // count up from 0 on first mount
  const raf = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (reduced || from === value) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, reduced]);

  return <span className={className}>{format(display)}</span>;
}

// --- empty state -------------------------------------------------------------------

export function EmptyState({
  icon = 'tag',
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={20} />
      </div>
      <span>{message}</span>
      {actionLabel && onAction && (
        <button className="empty__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// --- skeleton -------------------------------------------------------------------------

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton width={120} height={12} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={i === 0 ? 28 : 14} width={i === 0 ? '50%' : '100%'} />
      ))}
    </div>
  );
}

// --- progress bar ------------------------------------------------------------------------

export function Progress({ ratio, color }: { ratio: number; color: string }) {
  const pct = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 1;
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress__fill" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}

// --- section card -----------------------------------------------------------------------------

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card chart-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h3 className="section-title">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
