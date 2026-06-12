import { useMemo, useState } from 'react';
import {
  budgetVsActualYtd,
  monthAxis,
  monthlySummary,
  netWorthBreakdown,
  netWorthSeries,
  planAggregate,
  rangeMonths,
  summarize,
  topCategories,
  type DashboardRange,
} from '../../shared/calc';
import { CALENDAR, cycleBounds } from '../../shared/cycles';
import { currentMonthISO, fmtDate, fmtEUR, fmtPct } from '../../shared/format';
import { useAppData, useCurrentCycle } from '../api/data';
import { Progress } from '../components/ui/primitives';
import { BudgetBars, CategoryBars } from '../components/BudgetBars';
import { Ribbon } from '../components/Ribbon';
import {
  AllocationChart,
  CashFlowChart,
  NetWorthChart,
  RateChart,
  type MonthDatum,
} from '../components/charts';
import { AnimatedAmount, CardSkeleton, Section, Segmented } from '../components/ui/primitives';
import { useChartColors, useTheme } from '../theme/theme';

const rangeOptions = (cyclic: boolean): { value: DashboardRange; label: string }[] => [
  { value: 'month', label: cyclic ? 'This cycle' : 'This month' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All time' },
];

export function Dashboard() {
  const { data, isLoading } = useAppData();
  const { resolved } = useTheme();
  const colors = useChartColors(resolved);
  const [range, setRange] = useState<DashboardRange>('month');
  const currentMonth = useCurrentCycle();

  const derived = useMemo(() => {
    if (!data) return null;
    const months = rangeMonths(data, range, currentMonth);
    const summary = summarize(data, months);
    // trend charts report by true calendar months; ribbon/stats/budgets by cycle
    const calNow = currentMonthISO();
    const axis = monthAxis(data, calNow, CALENDAR).filter((m) => m <= calNow);
    const series: MonthDatum[] = axis.map((m) => ({ month: m, ...monthlySummary(data, m, CALENDAR) }));
    const periodText =
      months.length > 0
        ? `${fmtDate(cycleBounds(months[0], data.settings).start)} – ${fmtDate(cycleBounds(months[months.length - 1], data.settings).end)}`
        : undefined;
    return {
      summary,
      periodText,
      series,
      netWorth: netWorthSeries(data, calNow, CALENDAR),
      breakdown: netWorthBreakdown(data, currentMonth),
      plansAgg: planAggregate(data, currentMonth),
      top: topCategories(data, months),
      budgetYtd: budgetVsActualYtd(data, currentMonth),
    };
  }, [data, range, currentMonth]);

  if (isLoading || !derived) {
    return (
      <div className="stack">
        <CardSkeleton lines={4} />
        <div className="stat-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} lines={1} />
          ))}
        </div>
      </div>
    );
  }

  const { summary, periodText, series, netWorth, breakdown, plansAgg, top, budgetYtd } = derived;

  const stats: { label: string; value: number; cls?: string; format?: (n: number) => string }[] = [
    { label: 'Total income', value: summary.income, cls: 'amount--income' },
    { label: 'Total expenses', value: summary.expenses, cls: 'amount--expense' },
    { label: 'Total savings', value: summary.saved, cls: 'amount--saving' },
    { label: 'Total investments', value: summary.invested, cls: 'amount--investment' },
    { label: 'Net cash flow', value: summary.income - summary.expenses },
    { label: 'Savings rate', value: summary.savingsRate, format: fmtPct },
  ];

  return (
    <div className="stack">
      <div className="screen-head">
        <h1 className="screen-title">Dashboard</h1>
        <Segmented
          value={range}
          onChange={setRange}
          options={rangeOptions((data?.settings.salaryDay ?? 1) !== 1)}
          ariaLabel="Dashboard range"
        />
      </div>

      <Ribbon summary={summary} netWorth={breakdown.total} periodText={periodText} />

      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="card stat-card">
            <span className="label">{s.label}</span>
            <AnimatedAmount value={s.value} format={s.format} className={`amount ${s.cls ?? ''}`} />
          </div>
        ))}
      </div>

      {plansAgg.total > 0 && (
        <section className="card" aria-label="Payment plans overview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>
              Payment plans · {plansAgg.active} active
            </h3>
            <span className="amount" style={{ fontSize: 'var(--text-sm)' }}>
              {fmtEUR(plansAgg.paid)}
              <span style={{ color: 'var(--faint)', fontWeight: 400 }}> / {fmtEUR(plansAgg.total)}</span>
              <span className="amount--debt"> · {fmtEUR(plansAgg.remaining)} left</span>
            </span>
          </div>
          <Progress ratio={plansAgg.progress} color="var(--saving)" />
        </section>
      )}

      <div className="chart-grid">
        <Section title="Monthly cash flow">
          <div className="chart-card__body">
            <CashFlowChart data={series} colors={colors} />
          </div>
        </Section>
        <Section title="Income allocation">
          <div className="chart-card__body">
            <AllocationChart data={series} colors={colors} />
          </div>
        </Section>
        <Section title="Savings rate trend">
          <div className="chart-card__body">
            <RateChart data={series} colors={colors} />
          </div>
        </Section>
        <Section title="Net worth growth">
          <div className="chart-card__body">
            <NetWorthChart data={netWorth} colors={colors} />
          </div>
        </Section>
        <Section
          title="Net worth breakdown"
          right={<span className="amount" style={{ fontSize: 'var(--text-md)' }}>{fmtEUR(breakdown.total)}</span>}
        >
          <div>
            {[
              { name: 'Cash', amount: breakdown.cash, color: 'var(--income)' },
              ...breakdown.savings.map((s) => ({ name: s.account, amount: s.amount, color: 'var(--saving)' })),
              ...breakdown.investments.map((s) => ({ name: s.account, amount: s.amount, color: 'var(--investment)' })),
              ...breakdown.liabilities.map((l) => ({ name: `${l.name} (remaining)`, amount: -l.amount, color: 'var(--debt)' })),
            ].map((row) => (
              <div key={row.name + row.color} className="budget-row__top" style={{ padding: '8px 0' }}>
                <span className="budget-row__name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="dot" style={{ background: row.color }} />
                  {row.name}
                </span>
                <span className={`amount budget-row__amount${row.amount < 0 ? ' amount--debt' : ''}`}>
                  {fmtEUR(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Top spending categories">
          <CategoryBars items={top} />
        </Section>
        <Section title="Budget vs actual · YTD">
          <BudgetBars rows={budgetYtd} />
        </Section>
      </div>
    </div>
  );
}
