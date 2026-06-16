import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { upcomingView, type VerdictStatus } from '../../shared/upcoming';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import type { AppData } from '../../shared/types';
import { EmptyState } from './ui/primitives';

const TIP_KEY = 'tower-tips-seen';

const STATUS: Record<VerdictStatus, { color: string; tint: string; title: string }> = {
  okay: { color: 'var(--income)', tint: 'var(--income-tint)', title: "You're okay until payday" },
  tight: { color: 'var(--debt)', tint: 'var(--debt-tint)', title: 'Cutting it close' },
  trouble: { color: 'var(--expense)', tint: 'var(--expense-tint)', title: 'Short before payday' },
};

/** Dashboard answer to "Am I okay until payday?". */
export function UpcomingCard({ data }: { data: AppData }) {
  const today = todayISO();
  const navigate = useNavigate();
  const v = useMemo(() => upcomingView(data, today), [data, today]);
  const [tipSeen, setTipSeen] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) === '1';
    } catch {
      return true;
    }
  });

  // Fresh install / "Skip" with nothing recorded: a €0 verdict is misleading, so
  // guide the user to add income instead.
  if (data.incomes.length === 0 && data.transactions.length === 0) {
    return (
      <section className="card" aria-label="Get started">
        <h3 className="section-title">Until payday</h3>
        <EmptyState
          icon="wallet"
          message="Add your salary and Tower tells you whether you're okay until payday."
          actionLabel="Add income"
          onAction={() => navigate('/settings')}
        />
      </section>
    );
  }

  const dismissTip = () => {
    try {
      localStorage.setItem(TIP_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    setTipSeen(true);
  };

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
      <div className="verdict" role="status" style={{ background: verdict.tint }}>
        <span className="verdict__dot" style={{ background: verdict.color }} aria-hidden />
        <div className="verdict__body">
          <div className="amount verdict__title" style={{ color: verdict.color }}>
            {verdict.title}
          </div>
          <span className="hint">{subtitle}</span>
        </div>
      </div>
      {!tipSeen && (
        <div className="row row--top coach-tip">
          <span className="hint" style={{ flex: 1 }}>
            This is your one answer — green means you're okay until payday, amber is tight, red means
            you'd fall short. Everything below is the detail behind it.
          </span>
          <button type="button" className="btn btn--sm" onClick={dismissTip}>Got it</button>
        </div>
      )}
      <div className="cluster verdict-cols" style={{ '--gap': 'var(--space-6)', alignItems: 'flex-start' } as CSSProperties}>
        <div>
          <span className="label">Next payday</span>
          <div className="amount" style={{ fontSize: 'var(--text-lg)' }}>{fmtDate(v.payday.date)}</div>
          <span className="hint">
            {paydayLine}
            {v.payday.amount !== null ? ` · ${v.payday.name} ${fmtEUR(v.payday.amount)}` : ''}
          </span>
        </div>
        <div>
          <span className="label">Left to spend</span>
          <div className="amount" style={{ fontSize: 'var(--text-lg)', color: verdict.color }}>
            {fmtEUR(v.leftUntilPayday)}
          </div>
          <span className="hint">after upcoming bills</span>
        </div>
        <div className="verdict-cols__bills">
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
