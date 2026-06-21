import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  budgetVsActualYtd,
  monthAxis,
  monthlySummary,
  rangeMonths,
  topCategories,
  type DashboardRange,
} from '../../shared/calc';
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
    // Bucket the allocation + savings-rate trends by PAY CYCLE, not calendar
    // month: a paycheck and the spending it funds straddle two calendar months
    // when payday isn't the 1st, so calendar buckets misreport allocation (income
    // in one month, its outflow in the next). Cycle bucketing matches the
    // dashboard ribbon exactly. With salaryDay 1 the two are identical.
    const axis = monthAxis(data, currentMonth).filter((m) => m <= currentMonth);
    const series: MonthDatum[] = axis.map((m) => ({ month: m, ...monthlySummary(data, m) }));
    return {
      series,
      top: topCategories(data, months),
      budgetYtd: budgetVsActualYtd(data, currentMonth),
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

  const { series, top, budgetYtd } = derived;
  const cyclic = (data?.settings.salaryDay ?? 1) !== 1;
  const cal = cyclic ? ' · pay cycles' : ' · calendar months';
  const rangeLabel =
    range === 'month' ? (cyclic ? 'this pay cycle' : 'this month') : range === 'ytd' ? (cyclic ? 'YTD pay cycles' : 'YTD') : 'all time';

  // a category row drills through to its expenses in Transactions
  const seeCategory = (categoryId: string) =>
    navigate(`/transactions?type=expense&categoryId=${encodeURIComponent(categoryId)}`);

  return (
    <div className="stack">
      <div className="screen-head">
        <h1 className="screen-title">Insights</h1>
        <Segmented
          value={range}
          onChange={setRange}
          options={rangeOptions(cyclic)}
          ariaLabel="Insights range"
        />
      </div>

      <div className="chart-grid">
        <Section title={`Top spending · ${rangeLabel}`}>
          <CategoryBars items={top} onSelect={seeCategory} />
        </Section>
        <Section title={`Budget vs actual · ${cyclic ? 'YTD pay cycles' : 'YTD'}`}>
          <BudgetBars rows={budgetYtd} onSelect={seeCategory} />
        </Section>
        <Section title={`Income allocation${cal}`}>
          <div className="chart-card__body">
            <AllocationChart data={series} colors={colors} />
          </div>
        </Section>
        <Section title={`Savings rate${cal}`}>
          <div className="chart-card__body">
            <RateChart data={series} colors={colors} />
          </div>
        </Section>
      </div>
    </div>
  );
}
