import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  planAggregate,
  rangeMonths,
  summarize,
  type DashboardRange,
} from '../../shared/calc';
import { billMonthlyCost } from '../../shared/bills';
import { cycleBounds } from '../../shared/cycles';
import { monthlyCost } from '../../shared/recurring';
import { fmtDate, fmtEUR, todayISO } from '../../shared/format';
import { useAppData, useCurrentCycle } from '../api/data';
import { Ribbon } from '../components/Ribbon';
import { UpcomingCard } from '../components/UpcomingCard';
import { CardSkeleton, Segmented } from '../components/ui/primitives';

const rangeOptions = (cyclic: boolean): { value: DashboardRange; label: string }[] => [
  { value: 'month', label: cyclic ? 'This cycle' : 'This month' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All time' },
];

export function Dashboard() {
  const { data, isLoading } = useAppData();
  const navigate = useNavigate();
  const [range, setRange] = useState<DashboardRange>('month');
  const currentMonth = useCurrentCycle();

  const derived = useMemo(() => {
    if (!data) return null;
    const months = rangeMonths(data, range, currentMonth);
    const summary = summarize(data, months);
    const today = todayISO();
    const activeSubs = data.subscriptions.filter((s) => !s.endsOn || s.endsOn >= today);
    const activeBills = data.bills.filter((b) => !b.endsOn || b.endsOn >= today);
    const periodText =
      months.length > 0
        ? `${fmtDate(cycleBounds(months[0], data.settings).start)} – ${fmtDate(cycleBounds(months[months.length - 1], data.settings).end)}`
        : undefined;
    return {
      summary,
      periodText,
      plansAgg: planAggregate(data, currentMonth),
      subsMonthly: activeSubs.reduce((a, s) => a + monthlyCost(s), 0),
      subsCount: activeSubs.length,
      billsMonthly: activeBills.reduce((a, b) => a + billMonthlyCost(b), 0),
      billsCount: activeBills.length,
    };
  }, [data, range, currentMonth]);

  if (isLoading || !derived) {
    return (
      <div className="stack">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={2} />
      </div>
    );
  }

  const { summary, periodText, plansAgg, subsMonthly, subsCount, billsMonthly, billsCount } = derived;
  const cyclic = (data?.settings.salaryDay ?? 1) !== 1;

  return (
    <div className="stack">
      <div className="screen-head">
        <h1 className="screen-title">Dashboard</h1>
        <Segmented
          value={range}
          onChange={setRange}
          options={rangeOptions(cyclic)}
          ariaLabel="Dashboard range"
        />
      </div>

      {data && <UpcomingCard data={data} />}

      <Ribbon summary={summary} periodText={periodText} />

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
        <CommitmentCard
          label={`Subscriptions${subsCount ? ` · ${subsCount}` : ''}`}
          value={subsMonthly > 0 ? `${fmtEUR(subsMonthly)}/mo` : '—'}
          onClick={() => navigate('/subscriptions')}
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
