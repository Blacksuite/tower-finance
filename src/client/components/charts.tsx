import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Summary } from '../../shared/calc';
import type { ForecastPoint } from '../../shared/forecast';
import { fmtDate, fmtEUR, fmtEURWhole, fmtMonthTick, fmtPct } from '../../shared/format';
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

function monthTicks(data: MonthDatum[]): string[] | undefined {
  if (data.length <= 8) return undefined;
  const step = Math.ceil(data.length / 8);
  return data.filter((_, i) => i % step === 0).map((d) => d.month);
}

const eurTick = (v: number) =>
  Math.abs(v) >= 1000 ? `${parseFloat((v / 1000).toFixed(1))}k` : String(Math.round(v));

/** Grouped bars: income / expenses / saved / invested per month. */
export function CashFlowChart({ data, colors }: { data: MonthDatum[]; colors: Colors }) {
  if (data.length === 0) return <ChartEmpty />;
  const series: [keyof Summary & string, string, string][] = [
    ['income', 'Income', colors.income],
    ['expenses', 'Expenses', colors.expense],
    ['saved', 'Savings', colors.saving],
    ['invested', 'Investments', colors.investment],
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={1}>
        <XAxis dataKey="month" {...AXIS} stroke={colors.faint} tickFormatter={(m) => fmtMonthTick(m)} ticks={monthTicks(data)} />
        <YAxis {...AXIS} stroke={colors.faint} width={34} tickFormatter={eurTick} />
        <Tooltip
          cursor={{ fill: colors.neutral }}
          content={makeTooltip((d) =>
            series.map(([k, name, color]) => ({
              name,
              color,
              value:
                k === 'income' || d.income <= 0
                  ? fmtEUR(d[k] as number)
                  : `${fmtEUR(d[k] as number)} · ${fmtPct((d[k] as number) / d.income)}`,
            })),
          )}
        />
        {series.map(([key, , color]) => (
          <Bar key={key} dataKey={key} fill={color} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
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

/** Net-worth growth line. */
export function NetWorthChart({
  data,
  colors,
}: {
  data: { month: string; value: number }[];
  colors: Colors;
}) {
  if (data.length === 0) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <XAxis dataKey="month" {...AXIS} stroke={colors.faint} tickFormatter={(m) => fmtMonthTick(m)} ticks={data.length > 8 ? data.filter((_, i) => i % Math.ceil(data.length / 8) === 0).map((d) => d.month) : undefined} />
        <YAxis {...AXIS} stroke={colors.faint} width={40} tickFormatter={eurTick} domain={['auto', 'auto']} />
        <Tooltip
          cursor={{ stroke: colors.border }}
          content={(props: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
            if (!props.active || !props.payload?.length) return null;
            const d = props.payload[0].payload as { month: string; value: number } | undefined;
            if (!d) return null;
            return (
              <div className="chart-tooltip">
                <span className="label" style={{ textTransform: 'capitalize' }}>{fmtMonthTick(d.month, true)}</span>
                <div className="chart-tooltip__row">
                  <span className="chart-tooltip__name">
                    <span className="dot" style={{ background: colors.income }} />
                    Net worth
                  </span>
                  <span className="amount">{fmtEURWhole(d.value)}</span>
                </div>
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="value" stroke={colors.income} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Projected spendable balance, one point per day. */
export function ForecastChart({ data, colors }: { data: ForecastPoint[]; colors: Colors }) {
  if (data.length === 0) return <ChartEmpty />;
  const step = Math.max(1, Math.ceil(data.length / 6));
  const ticks = data.filter((_, i) => i % step === 0).map((d) => d.date);
  const hasNegative = data.some((d) => d.balance < 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <XAxis dataKey="date" {...AXIS} stroke={colors.faint} tickFormatter={fmtDate} ticks={ticks} />
        <YAxis {...AXIS} stroke={colors.faint} width={40} tickFormatter={eurTick} domain={['auto', 'auto']} />
        {hasNegative && <ReferenceLine y={0} stroke={colors.expense} strokeDasharray="4 4" />}
        <Tooltip
          cursor={{ stroke: colors.border }}
          content={(props: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
            if (!props.active || !props.payload?.length) return null;
            const d = props.payload[0].payload as ForecastPoint | undefined;
            if (!d) return null;
            return (
              <div className="chart-tooltip">
                <span className="label">{fmtDate(d.date)}</span>
                <div className="chart-tooltip__row">
                  <span className="chart-tooltip__name">
                    <span className="dot" style={{ background: colors.saving }} />
                    Projected
                  </span>
                  <span className="amount">{fmtEURWhole(d.balance)}</span>
                </div>
              </div>
            );
          }}
        />
        <Line type="stepAfter" dataKey="balance" stroke={colors.saving} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartEmpty() {
  return <EmptyState icon="trend" message="No data yet — charts appear once you add transactions." />;
}
