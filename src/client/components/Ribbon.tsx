import { motion, useReducedMotion } from 'framer-motion';
import type { Summary } from '../../shared/calc';
import { fmtEUR, fmtPct } from '../../shared/format';
import { AnimatedAmount, EmptyState } from './ui/primitives';
import { useQuickAdd } from './QuickAdd';

interface Seg {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * The dashboard hero: income splitting into expenses / savings / investments /
 * left over as one full-width segmented bar, segments growing in from the left.
 */
export function Ribbon({
  summary,
  netWorth,
  periodText,
}: {
  summary: Summary;
  netWorth?: number;
  periodText?: string;
}) {
  const reduced = useReducedMotion();
  const { openNew } = useQuickAdd();
  const { income, expenses, saved, invested, leftOver } = summary;

  const segs: Seg[] = [
    { key: 'expenses', label: 'Expenses', value: expenses, color: 'var(--expense)' },
    { key: 'saved', label: 'Savings', value: saved, color: 'var(--saving)' },
    { key: 'invested', label: 'Investments', value: invested, color: 'var(--investment)' },
    { key: 'left', label: 'Left over', value: Math.max(0, leftOver), color: 'var(--debt)' },
  ].filter((s) => s.value > 0);

  const outflow = expenses + saved + invested;
  const base = Math.max(income, outflow);
  const hasData = base > 0;

  return (
    <section className="card ribbon-card" aria-label="Cash flow">
      <div className="ribbon__head">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            Income{periodText ? ` · ${periodText}` : ''}
          </div>
          <AnimatedAmount value={income} className="amount ribbon__income" />
        </div>
        {/* Net worth sits in its own in-flow slot and never changes on
            interaction — no overlay, no swap, so it can neither overlap the
            income figure nor reflow the bar (the per-segment amounts and % live
            in the always-visible legend below, so no hover detail is needed). */}
        {netWorth !== undefined && (
          <div className="ribbon__aside">
            <div className="label" style={{ marginBottom: 4 }}>Net worth</div>
            <AnimatedAmount value={netWorth} className="amount" style={{ fontSize: 'var(--text-lg)' }} />
          </div>
        )}
      </div>

      {hasData ? (
        <>
          <div className="ribbon__bar" role="img" aria-label={segs.map((s) => `${s.label} ${fmtEUR(s.value)}`).join(', ')}>
            {segs.map((s, i) => (
              <motion.div
                key={s.key}
                className="ribbon__seg"
                style={{ width: `${(s.value / base) * 100}%`, background: s.color }}
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.55, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </div>
          <div className="ribbon__legend">
            {segs.map((s) => (
              <div key={s.key} className="ribbon__legend-item">
                <span className="ribbon__legend-label label">
                  <span className="dot" style={{ background: s.color }} />
                  {s.label}
                  {income > 0 && (
                    <span style={{ textTransform: 'none', letterSpacing: 0 }}>
                      · {fmtPct(s.value / income)}
                    </span>
                  )}
                </span>
                <AnimatedAmount value={s.value} className="amount ribbon__legend-amount" />
              </div>
            ))}
            {leftOver < 0 && (
              <div className="ribbon__legend-item">
                <span className="ribbon__legend-label label">
                  <span className="dot" style={{ background: 'var(--expense)' }} />
                  Shortfall
                </span>
                <AnimatedAmount value={leftOver} className="amount ribbon__legend-amount amount--expense" />
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyState
          icon="wallet"
          message="Nothing recorded for this period yet."
          actionLabel="Add your first transaction"
          onAction={() => openNew()}
        />
      )}
    </section>
  );
}
