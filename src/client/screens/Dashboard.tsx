import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { planAggregate, summarize } from '../../shared/calc';
import { billMonthlyCost } from '../../shared/bills';
import { cycleBounds } from '../../shared/cycles';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import { useAppData, useCurrentCycle } from '../api/data';
import { Ribbon } from '../components/Ribbon';
import { UpcomingCard } from '../components/UpcomingCard';
import { Icon } from '../components/ui/Icon';
import { CardSkeleton } from '../components/ui/primitives';

export function Dashboard() {
  const { data, isLoading } = useAppData();
  const navigate = useNavigate();
  const currentMonth = useCurrentCycle();

  // The dashboard is always "this cycle" — one screen, one timeframe. Other
  // ranges (YTD / all-time) live on Insights and Months.
  const derived = useMemo(() => {
    if (!data) return null;
    const summary = summarize(data, [currentMonth]);
    const today = todayISO();
    const activeBills = data.bills.filter((b) => !b.endsOn || b.endsOn >= today);
    const bounds = cycleBounds(currentMonth, data.settings);
    return {
      summary,
      cycleText: `${fmtDate(bounds.start)} – ${fmtDate(bounds.end)}`,
      plansAgg: planAggregate(data, currentMonth),
      billsMonthly: activeBills.reduce((a, b) => a + billMonthlyCost(b), 0),
      billsCount: activeBills.length,
    };
  }, [data, currentMonth]);

  if (isLoading || !derived) {
    return (
      <div className="stack">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={2} />
      </div>
    );
  }

  const { summary, cycleText, plansAgg, billsMonthly, billsCount } = derived;

  return (
    <div className="stack">
      <div className="screen-head" style={{ justifyContent: 'flex-end' }}>
        {/* tap the cycle date range to browse past cycles (Months) */}
        <button type="button" className="cycle-link" onClick={() => navigate('/months')}>
          {cycleText}
          <Icon name="chevronRight" size={15} />
        </button>
      </div>

      {data && <UpcomingCard data={data} />}

      <Ribbon summary={summary} periodText={cycleText} />

      <div className="stat-grid">
        <CommitmentCard
          label={`Plans${plansAgg.active ? ` · ${plansAgg.active} active` : ''}`}
          value={plansAgg.remaining > 0 ? `${fmtEUR(plansAgg.remaining)} left` : '—'}
          onClick={() => navigate('/plans')}
        />
        <CommitmentCard
          label={`Bills${billsCount ? ` · ${billsCount}` : ''}`}
          value={billsMonthly > 0 ? `${fmtEUR(billsMonthly)}/mo` : '—'}
          onClick={() => navigate('/bills')}
        />
      </div>
    </div>
  );
}

function CommitmentCard({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" className="card stat-card commit-card" onClick={onClick}>
      <span className="label">{label}</span>
      <span className="amount" style={{ fontSize: 'var(--text-md)' }}>{value}</span>
    </button>
  );
}
