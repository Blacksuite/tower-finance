import { useMemo } from 'react';
import { upcomingView, type VerdictStatus } from '../../shared/upcoming';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import type { AppData } from '../../shared/types';

const STATUS: Record<VerdictStatus, { color: string; tint: string; title: string }> = {
  okay: { color: 'var(--income)', tint: 'var(--income-tint)', title: "You're okay until payday" },
  tight: { color: 'var(--debt)', tint: 'var(--debt-tint)', title: 'Cutting it close' },
  trouble: { color: 'var(--expense)', tint: 'var(--expense-tint)', title: 'Short before payday' },
};

/** Dashboard answer to "Am I okay until payday?". */
export function UpcomingCard({ data }: { data: AppData }) {
  const today = todayISO();
  const v = useMemo(() => upcomingView(data, today), [data, today]);

  const paydayLine =
    v.daysUntil === 0 ? 'today' : v.daysUntil === 1 ? 'tomorrow' : `in ${v.daysUntil} days`;

  const verdict = STATUS[v.status];
  const subtitle =
    v.status === 'okay'
      ? `${fmtEUR(v.leftUntilPayday)} free after upcoming bills — above your ${fmtEUR(v.buffer)} buffer.`
      : v.status === 'tight'
        ? `${fmtEUR(v.leftUntilPayday)} left, under your ${fmtEUR(v.buffer)} buffer. Go easy until payday.`
        : `You're ${fmtEUR(-v.leftUntilPayday)} short before payday. Time to adjust.`;

  return (
    <section className="card" aria-label="Are you okay until payday?">
      <h3 className="section-title">Until payday</h3>
      <div
        role="status"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '12px 14px',
          borderRadius: 12,
          background: verdict.tint,
          marginBottom: 16,
        }}
      >
        <span
          style={{ width: 10, height: 10, borderRadius: '50%', background: verdict.color, flex: '0 0 auto' }}
          aria-hidden
        />
        <div style={{ minWidth: 0 }}>
          <div className="amount" style={{ fontSize: 'var(--text-lg)', color: verdict.color }}>
            {verdict.title}
          </div>
          <span className="hint">{subtitle}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 150 }}>
          <span className="label">Next payday</span>
          <div className="amount" style={{ fontSize: 'var(--text-lg)' }}>{fmtDate(v.payday.date)}</div>
          <span className="hint">
            {paydayLine}
            {v.payday.amount !== null ? ` · ${v.payday.name} ${fmtEUR(v.payday.amount)}` : ''}
          </span>
        </div>
        <div style={{ minWidth: 150 }}>
          <span className="label">Left to spend</span>
          <div className="amount" style={{ fontSize: 'var(--text-lg)', color: verdict.color }}>
            {fmtEUR(v.leftUntilPayday)}
          </div>
          <span className="hint">after upcoming bills</span>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <span className="label">
            Bills before payday{v.bills.length > 0 ? ` · ${fmtEUR(v.billsTotal)}` : ''}
          </span>
          {v.bills.length === 0 ? (
            <span className="hint" style={{ display: 'block', paddingTop: 6 }}>
              No bills due before payday.
            </span>
          ) : (
            v.bills.slice(0, 5).map((b) => (
              <div
                key={`${b.name}-${b.date}`}
                className="budget-row__top"
                style={{ padding: '5px 0' }}
              >
                <span className="budget-row__name">
                  {b.name}
                  <span style={{ color: 'var(--faint)' }}> · {fmtDate(b.date)}</span>
                </span>
                <span className="amount budget-row__amount">{fmtEUR(b.amount)}</span>
              </div>
            ))
          )}
          {v.bills.length > 5 && (
            <span className="hint">+ {v.bills.length - 5} more before payday</span>
          )}
        </div>
      </div>
    </section>
  );
}
