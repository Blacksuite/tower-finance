import { useEffect, useState } from 'react';
import type { PlanState, ScheduleRow } from '../../shared/calc';
import { fmtEUR, fmtMonth } from '../../shared/format';
import { useClearPlanPayment, useSetPlanPayment } from '../api/data';
import { parseAmount } from './QuickAdd';
import { Icon } from './ui/Icon';
import { Progress } from './ui/primitives';

/**
 * Inline editable override amount for one plan-month. Shows the counted
 * amount; committing a value sets an override, clearing reverts to schedule.
 */
export function OverrideInput({ planId, row }: { planId: string; row: ScheduleRow }) {
  const setPayment = useSetPlanPayment();
  const clearPayment = useClearPlanPayment();
  const display = String((row.override ?? row.scheduled).toFixed(2)).replace('.', ',');
  const [value, setValue] = useState(display);

  useEffect(() => setValue(display), [display]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === '' || parseAmount(trimmed) === row.scheduled) {
      if (row.override !== null) clearPayment.mutate({ planId, month: row.month });
      setValue(display);
      return;
    }
    const n = trimmed === '0' || trimmed === '0,00' ? 0 : parseAmount(trimmed);
    if (n === null && trimmed !== '0') {
      setValue(display);
      return;
    }
    setPayment.mutate({ planId, month: row.month, amountPaid: n ?? 0 });
  };

  return (
    <input
      className={`override-input${row.override !== null ? ' is-overridden' : ''}`}
      inputMode="decimal"
      aria-label={`Payment for ${fmtMonth(row.month)}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setValue(display);
      }}
    />
  );
}

export function PlanCard({
  state,
  currentMonth,
  onEdit,
  onDelete,
}: {
  state: PlanState;
  currentMonth: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { plan, paidToDate, remaining, status, monthsLeft, rows } = state;
  const paidOff = status === 'paid_off';

  return (
    <article className="card plan-card">
      <div className="plan-card__head">
        <span className="plan-card__name">{plan.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className={`pill ${paidOff ? 'pill--done' : 'pill--active'}`}>
            {paidOff ? 'Paid off' : 'Active'}
          </span>
          <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${plan.name}`}>
            <Icon name="pencil" size={15} />
          </button>
          <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${plan.name}`}>
            <Icon name="trash" size={15} />
          </button>
        </span>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="amount" style={{ fontSize: 'var(--text-md)' }}>
            {fmtEUR(paidToDate)}
            <span style={{ color: 'var(--faint)', fontWeight: 400 }}> / {fmtEUR(plan.totalAmount)}</span>
          </span>
          <span className="label" style={{ alignSelf: 'flex-end' }}>
            {Math.round((paidToDate / Math.max(plan.totalAmount, 0.01)) * 100)}% paid
          </span>
        </div>
        <Progress
          ratio={paidToDate / Math.max(plan.totalAmount, 0.01)}
          color={paidOff ? 'var(--income)' : 'var(--saving)'}
        />
      </div>

      <div className="plan-card__meta">
        <span className="plan-card__meta-item">
          <span className="label">Remaining</span>
          <span className={`amount ${paidOff ? 'amount--muted' : 'amount--debt'}`}>{fmtEUR(remaining)}</span>
        </span>
        <span className="plan-card__meta-item">
          <span className="label">Installment</span>
          <span className="amount">{fmtEUR(plan.installment)}</span>
        </span>
        <span className="plan-card__meta-item">
          <span className="label">Months left</span>
          <span className="amount">{monthsLeft}</span>
        </span>
        {state.endMonth && (
          <span className="plan-card__meta-item">
            <span className="label">{paidOff ? 'Finished' : 'Ends'}</span>
            <span className="amount" style={{ textTransform: 'capitalize' }}>{fmtMonth(state.endMonth)}</span>
          </span>
        )}
      </div>

      <div className="plan-sched">
        <button
          className="btn btn--sm btn--ghost"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide schedule' : 'Show schedule'}
        </button>
        {expanded && (
          <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 8 }}>
            {rows.map((row) => (
              <div key={row.month} className="plan-sched__row">
                <span className="plan-sched__month">
                  {fmtMonth(row.month)}
                  {row.month === currentMonth && (
                    <span className="pill pill--active" style={{ marginLeft: 8 }}>now</span>
                  )}
                </span>
                <span className="amount amount--muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {fmtEUR(row.remainingAfter)} left
                </span>
                <OverrideInput planId={plan.id} row={row} />
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
