import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Summary } from '../../shared/calc';
import { fmtMonthTick, fmtPct } from '../../shared/format';
import type { useChartColors } from '../theme/theme';
import { EmptyState } from './ui/primitives';

type Colors = ReturnType<typeof useChartColors>;

export interface MonthDatum extends Summary {
  month: string;
}

const AXIS = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
} as const;

interface TipRow {
  name: string;
  color: string;
  value: string;
}

// Recharts custom tooltip: receives { active, payload, label }
function makeTooltip(build: (d: MonthDatum) => TipRow[]) {
  return function ChartTip(props: { active?: boolean; payload?: readonly { payload?: unknown }[] }) {
    if (!props.active || !props.payload?.length) return null;
    const d = props.payload[0].payload as MonthDatum | undefined;
    if (!d) return null;
    return (
      <div className="chart-tooltip">
        <span className="label" style={{ textTransform: 'capitalize' }}>{fmtMonthTick(d.month, true)}</span>
        {build(d).map((r) => (
          <div key={r.name} className="chart-tooltip__row">
            <span className="chart-tooltip__name">
              <span className="dot" style={{ background: r.color }} />
              {r.name}
            </span>
            <span className="amount">{r.value}</span>
          </div>
        ))}
      </div>
    );
  };
}

function monthTicks(data: { month: string }[]): string[] | undefined {
  if (data.length <= 8) return undefined;
  const step = Math.ceil(data.length / 8);
  return data.filter((_, i) => i % step === 0).map((d) => d.month);
}

/** 100% stacked bars: where each month's income went. */
export function AllocationChart({ data, colors }: { data: MonthDatum[]; colors: Colors }) {
  // allocation of income only makes sense for months that had income
  const rows = data
    .filter((d) => d.income > 0)
    .map((d) => ({
      ...d,
      allocExpenses: d.expenses,
      allocSaved: d.saved,
      allocInvested: d.invested,
      allocLeft: Math.max(0, d.leftOver),
    }));
  if (rows.length === 0) return <ChartEmpty />;
  const series: [string, string, string][] = [
    ['allocExpenses', 'Expenses', colors.expense],
    ['allocSaved', 'Savings', colors.saving],
    ['allocInvested', 'Investments', colors.investment],
    ['allocLeft', 'Left over', colors.debt],
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} stackOffset="expand" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="month" {...AXIS} stroke={colors.faint} tickFormatter={(m) => fmtMonthTick(m)} ticks={monthTicks(rows)} />
        <YAxis hide domain={[0, 1]} />
        <Tooltip
          cursor={{ fill: colors.neutral }}
          content={makeTooltip((d) => {
            const total = d.expenses + d.saved + d.invested + Math.max(0, d.leftOver);
            const pct = (v: number) => (total > 0 ? fmtPct(v / total) : '—');
            return series.map(([key, name, color]) => ({
              name,
              color,
              value: pct((d as unknown as Record<string, number>)[key]),
            }));
          })}
        />
        {series.map(([key, , color], i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="a"
            fill={color}
            radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
            maxBarSize={26}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Savings-rate trend line. */
export function RateChart({ data, colors }: { data: MonthDatum[]; colors: Colors }) {
  if (data.length === 0) return <ChartEmpty />;
  const rows = data.map((d) => ({ ...d, rate: d.savingsRate * 100 }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <XAxis dataKey="month" {...AXIS} stroke={colors.faint} tickFormatter={(m) => fmtMonthTick(m)} ticks={monthTicks(rows)} />
        <YAxis {...AXIS} stroke={colors.faint} width={34} tickFormatter={(v: number) => `${Math.round(v)}%`} />
        <Tooltip
          cursor={{ stroke: colors.border }}
          content={makeTooltip((d) => [{ name: 'Savings rate', color: colors.saving, value: fmtPct(d.savingsRate) }])}
        />
        <Line type="monotone" dataKey="rate" stroke={colors.saving} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartEmpty() {
  return <EmptyState icon="trend" message="No data yet — charts appear once you add transactions." />;
}
