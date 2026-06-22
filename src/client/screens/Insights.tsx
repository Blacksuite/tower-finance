import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  budgetVsActual,
  monthAxis,
  monthlySummary,
  rangeMonths,
  summarize,
  topCategories,
  type DashboardRange,
} from '../../shared/calc';
import { fmtEUR, fmtPct } from '../../shared/format';
import { useAppData, useCurrentCycle } from '../api/data';
import { BudgetBars, CategoryBars } from '../components/BudgetBars';
import { AllocationChart, RateChart, type MonthDatum } from '../components/charts';
import { CardSkeleton, Section, Segmented } from '../components/ui/primitives';
import { useChartColors, useTheme } from '../theme/theme';

const rangeOptions = (cyclic: boolean): { value: DashboardRange; label: string }[] => [
  { value: 'month', label: cyclic ? 'This cycle' : 'This month' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All time' },
];

export function Insights() {
  const { data, isLoading } = useAppData();
  const { resolved } = useTheme();
  const colors = useChartColors(resolved);
  const navigate = useNavigate();
  const [range, setRange] = useState<DashboardRange>('month');
  const currentMonth = useCurrentCycle();

  const derived = useMemo(() => {
    if (!data) return null;
    const months = rangeMonths(data, range, currentMonth);
    // Everything the range selector drives is computed over `months`: the top
    // categories, the budget bars, and a summary the takeaways read from.
    const rangeSummary = summarize(data, months);
    // budget bars scale the monthly budgets by how many active cycles the range spans
    const activeInRange =
      months.filter((m) => {
        const s = monthlySummary(data, m);
        return s.income > 0 || s.expenses > 0;
      }).length || 1;
    const budgetRows = budgetVsActual(data, months, activeInRange);
    // The allocation + savings-rate charts are TREND views — they always show the
    // full cycle history regardless of the range selector. Bucketed by PAY CYCLE,
    // not calendar month: a paycheck and the spending it funds straddle two
    // calendar months when payday isn't the 1st, so calendar buckets misreport
    // allocation. Cycle bucketing matches the dashboard ribbon. (Identical when
    // salaryDay is 1.)
    const axis = monthAxis(data, currentMonth).filter((m) => m <= currentMonth);
    const series: MonthDatum[] = axis.map((m) => ({ month: m, ...monthlySummary(data, m) }));
    return {
      series,
      top: topCategories(data, months),
      budgetRows,
      rangeSummary,
    };
  }, [data, range, currentMonth]);

  if (isLoading || !derived) {
    return (
      <div className="stack">
        <CardSkeleton lines={2} />
        <div className="chart-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <CardSkeleton key={i} lines={4} />
          ))}
        </div>
      </div>
    );
  }

  const { series, top, budgetRows, rangeSummary } = derived;
  const cyclic = (data?.settings.salaryDay ?? 1) !== 1;
  const cal = cyclic ? ' · pay cycles' : ' · calendar months';
  const rangeLabel =
    range === 'month' ? (cyclic ? 'this pay cycle' : 'this month') : range === 'ytd' ? (cyclic ? 'YTD pay cycles' : 'YTD') : 'all time';

  // a category row drills through to its expenses in Transactions
  const seeCategory = (categoryId: string) =>
    navigate(`/transactions?type=expense&categoryId=${encodeURIComponent(categoryId)}`);

  // plain-language lead per section — the takeaway before the chart, all over
  // the selected range so they track the This cycle / YTD / All time selector.
  const topTakeaway = top.length
    ? `${top[0].name} is your biggest expense at ${fmtEUR(top[0].amount)}.`
    : `Nothing spent ${rangeLabel}.`;

  const budgeted = budgetRows.filter((r) => r.kind === 'expense' && r.budget > 0);
  const onTrack = budgeted.filter((r) => r.diff >= 0).length;
  const budgetTakeaway = budgeted.length
    ? `You're on track on ${onTrack} of ${budgeted.length} budget${budgeted.length === 1 ? '' : 's'}.`
    : 'No budgets set yet. You can add them in Settings.';

  const allocationTakeaway =
    rangeSummary.income <= 0
      ? `No income recorded ${rangeLabel}.`
      : rangeSummary.leftOver < 0
        ? `You spent more than you earned ${rangeLabel}.`
        : `You have ${fmtPct(rangeSummary.leftOver / rangeSummary.income)} of your income left over.`;

  // a savings trend only makes sense cycle-to-cycle, so show it for "This cycle" only
  const prev = range === 'month' && series.length >= 2 ? series[series.length - 2] : null;
  const trend =
    prev && prev.income > 0
      ? (() => {
          const d = rangeSummary.savingsRate - prev.savingsRate;
          const word = d > 0.005 ? 'up from' : d < -0.005 ? 'down from' : 'about the same as';
          return `, ${word} ${fmtPct(prev.savingsRate)} last cycle`;
        })()
      : '';
  const rateTakeaway =
    rangeSummary.income > 0
      ? `You're saving ${fmtPct(rangeSummary.savingsRate)} of your income${trend}.`
      : 'Add income to see your savings rate.';

  return (
    <div className="stack">
      <div className="screen-head" style={{ justifyContent: 'flex-end' }}>
        <Segmented
          value={range}
          onChange={setRange}
          options={rangeOptions(cyclic)}
          ariaLabel="Insights range"
        />
      </div>

      <div className="chart-grid">
        <Section title={`Top spending · ${rangeLabel}`}>
          <p className="takeaway">{topTakeaway}</p>
          <CategoryBars items={top} onSelect={seeCategory} />
        </Section>
        <Section title={`Budget vs actual · ${rangeLabel}`}>
          <p className="takeaway">{budgetTakeaway}</p>
          <BudgetBars rows={budgetRows} onSelect={seeCategory} />
        </Section>
        <Section title={`Income allocation${cal}`}>
          <p className="takeaway">{allocationTakeaway}</p>
          <div className="chart-card__body">
            <AllocationChart data={series} colors={colors} />
          </div>
        </Section>
        <Section title={`Savings rate${cal}`}>
          <p className="takeaway">{rateTakeaway}</p>
          <div className="chart-card__body">
            <RateChart data={series} colors={colors} />
          </div>
        </Section>
      </div>
    </div>
  );
}
