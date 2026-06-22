import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { upcomingTimeline, upcomingView, type VerdictStatus } from '../../shared/upcoming';
import { fmtDate, fmtEUR, fmtSigned, todayISO } from '../../shared/format';
import type { AppData } from '../../shared/types';
import { EmptyState } from './ui/primitives';

/** "today" / "tomorrow" / "in N days" for a relative day count. */
const relDay = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

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
  const timeline = useMemo(() => upcomingTimeline(data, today), [data, today]);
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
      </div>

      {/* mini timeline — the next few things that happen before payday */}
      <div className="timeline">
        <span className="label">What's coming</span>
        {timeline.length === 0 ? (
          <span className="hint" style={{ display: 'block', paddingTop: 6 }}>
            Nothing due before payday.
          </span>
        ) : (
          timeline.map((e) => (
            <div key={`${e.kind}-${e.name}-${e.date}`} className="timeline__row">
              <span
                className="dot"
                style={{ background: e.kind === 'income' ? 'var(--income)' : 'var(--expense)' }}
                aria-hidden
              />
              <span className="timeline__name">{e.name}</span>
              <span className="timeline__when hint">{relDay(e.daysUntil)}</span>
              <span className={`amount timeline__amount amount--${e.kind === 'income' ? 'income' : 'expense'}`}>
                {fmtSigned(e.amount, e.kind === 'income' ? '+' : '-')}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
