import { describe, expect, it } from 'vitest';
import {
  cycleBounds,
  cycleKeyOf,
  salaryDate,
  type CycleSettings,
} from '../src/shared/cycles';
import {
  monthlySummary,
  netWorthBreakdown,
  netWorthSeries,
  planAggregate,
  budgetVsActualMonth,
} from '../src/shared/calc';
import { monthlyCost, nextBillDate, occurrencesBetween, subOccurrencesForCycle } from '../src/shared/recurring';
import { DEFAULT_SETTINGS, type AppData, type Settings, type Subscription, type Transaction } from '../src/shared/types';

const cs = (salaryDay: number, weekendRule: CycleSettings['weekendRule'] = 'exact'): CycleSettings => ({
  salaryDay,
  weekendRule,
});

let id = 0;
const tx = (date: string, type: Transaction['type'], amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++id}`, date, type, description: '', categoryId: null, account: null, amount, ...extra,
});

const data = (
  over: Partial<Omit<AppData, 'settings'>> & { settings?: Partial<Settings> } = {},
): AppData => ({
  transactions: [], categories: [], plans: [], planPayments: [],
  subscriptions: [], templates: [], auth: { enabled: false },
  ...over,
  settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) },
});

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's1', name: 'Netflix', amount: 15, categoryId: null, description: '',
  firstBillDate: '2026-01-07', frequency: 'monthly', endsOn: null, ...over,
});

describe('salary dates', () => {
  it('clamps the salary day to the month length', () => {
    expect(salaryDate('2026-02', cs(31))).toBe('2026-02-28');
    expect(salaryDate('2026-04', cs(31))).toBe('2026-04-30');
  });

  it('applies weekend rules (25 Apr 2026 is a Saturday)', () => {
    expect(salaryDate('2026-04', cs(25, 'exact'))).toBe('2026-04-25');
    expect(salaryDate('2026-04', cs(25, 'previous'))).toBe('2026-04-24');
    expect(salaryDate('2026-04', cs(25, 'next'))).toBe('2026-04-27');
  });

  it('shifts Sundays two days back / one day forward (26 Apr 2026)', () => {
    expect(salaryDate('2026-04', cs(26, 'previous'))).toBe('2026-04-24');
    expect(salaryDate('2026-04', cs(26, 'next'))).toBe('2026-04-27');
  });
});

describe('cycle mapping', () => {
  it('defaults (day 1, exact) behave exactly like calendar months', () => {
    expect(cycleKeyOf('2026-06-11', DEFAULT_SETTINGS)).toBe('2026-06');
    expect(cycleBounds('2026-06', DEFAULT_SETTINGS)).toEqual({ start: '2026-06-01', end: '2026-06-30' });
  });

  it('a late salary day labels the cycle after the month it funds', () => {
    const s = cs(25);
    // 25 Jun – 24 Jul = "July"
    expect(cycleBounds('2026-07', s)).toEqual({ start: '2026-06-25', end: '2026-07-24' });
    expect(cycleKeyOf('2026-06-26', s)).toBe('2026-07');
    expect(cycleKeyOf('2026-06-24', s)).toBe('2026-06');
    expect(cycleKeyOf('2026-07-24', s)).toBe('2026-07');
    expect(cycleKeyOf('2026-07-25', s)).toBe('2026-08');
  });

  it('an early salary day keeps the starting month label', () => {
    const s = cs(5);
    expect(cycleBounds('2026-06', s)).toEqual({ start: '2026-06-05', end: '2026-07-04' });
    expect(cycleKeyOf('2026-06-04', s)).toBe('2026-05');
    expect(cycleKeyOf('2026-06-05', s)).toBe('2026-06');
  });

  it('weekend shifting keeps boundaries consistent', () => {
    const s = cs(25, 'previous');
    const b = cycleBounds('2026-05', s); // pay month apr: 24 Apr (Sat→Fri) .. 24 May (Mon) − 1
    expect(b.start).toBe('2026-04-24');
    expect(cycleKeyOf(b.start, s)).toBe('2026-05');
    expect(cycleKeyOf(b.end, s)).toBe('2026-05');
  });
});

describe('cycle-aware summaries', () => {
  it('assigns transactions to salary cycles, not calendar months', () => {
    const d = data({
      settings: { salaryDay: 25 },
      transactions: [
        tx('2026-06-26', 'income', 3000), // salary paid 25 Jun → July cycle
        tx('2026-07-10', 'expense', 500),
        tx('2026-06-20', 'expense', 100), // still June cycle
      ],
    });
    const july = monthlySummary(d, '2026-07');
    expect(july.income).toBe(3000);
    expect(july.expenses).toBe(500);
    expect(monthlySummary(d, '2026-06').expenses).toBe(100);
  });
});

describe('subscriptions', () => {
  it('generates monthly occurrences with day clamping', () => {
    const s31 = sub({ firstBillDate: '2026-01-31' });
    expect(occurrencesBetween(s31, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('supports quarterly and yearly frequencies', () => {
    expect(occurrencesBetween(sub({ frequency: 'quarterly' }), '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-07', '2026-04-07', '2026-07-07', '2026-10-07',
    ]);
    expect(occurrencesBetween(sub({ frequency: 'yearly' }), '2026-01-01', '2028-12-31')).toEqual([
      '2026-01-07', '2027-01-07', '2028-01-07',
    ]);
  });

  it('stops contributing after endsOn but keeps history before it', () => {
    const ended = sub({ endsOn: '2026-03-15' });
    expect(occurrencesBetween(ended, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-07', '2026-02-07', '2026-03-07',
    ]);
    expect(nextBillDate(ended, '2026-06-01')).toBeNull();
    expect(nextBillDate(sub(), '2026-06-11')).toBe('2026-07-07');
  });

  it('flows into expenses and budget actuals automatically', () => {
    const d = data({
      categories: [{ id: 'c1', name: 'Subscriptions', budget: 50, sortOrder: 0 }],
      subscriptions: [sub({ categoryId: 'c1' })],
      transactions: [tx('2026-06-01', 'income', 1000)],
    });
    expect(monthlySummary(d, '2026-06').subscriptionExpenses).toBe(15);
    expect(monthlySummary(d, '2026-06').expenses).toBe(15);
    const row = budgetVsActualMonth(d, '2026-06').find((r) => r.id === 'c1')!;
    expect(row.actual).toBe(15);
    expect(subOccurrencesForCycle([sub()], '2026-06', DEFAULT_SETTINGS)).toHaveLength(1);
    expect(monthlyCost(sub({ frequency: 'yearly', amount: 120 }))).toBe(10);
  });
});

describe('net worth with liabilities', () => {
  const d = data({
    settings: { startingNetWorth: 10000 },
    transactions: [
      tx('2026-01-10', 'income', 3000),
      tx('2026-01-12', 'expense', 1000),
      tx('2026-01-20', 'saving', 500, { account: 'Bank A' }),
      tx('2026-01-22', 'investment', 200, { account: 'ETF' }),
    ],
    plans: [{ id: 'p1', name: 'Sofa', totalAmount: 900, installment: 300, startMonth: '2026-01' }],
  });

  it('subtracts outstanding plan balances from the trend', () => {
    const series = netWorthSeries(d, '2026-02');
    // jan: 10000 + 3000 − (1000 + 300 plan) = 11700 cash-basis; liability 600 → 11100
    expect(series[0]).toEqual({ month: '2026-01', value: 11100 });
    // feb: 11700 − 300 = 11400; liability 300 → 11100
    expect(series[1]).toEqual({ month: '2026-02', value: 11100 });
  });

  it('breaks down assets per account and plans as liabilities', () => {
    const b = netWorthBreakdown(d, '2026-02');
    expect(b.savings).toEqual([{ account: 'Bank A', amount: 500 }]);
    expect(b.investments).toEqual([{ account: 'ETF', amount: 200 }]);
    expect(b.liabilities).toEqual([{ name: 'Sofa', amount: 300 }]);
    expect(b.cash).toBe(10700); // 11400 gross − 500 − 200
    expect(b.total).toBe(11100);
  });

  it('aggregates plans for the dashboard widget', () => {
    const agg = planAggregate(d, '2026-02');
    expect(agg).toEqual({ total: 900, paid: 600, remaining: 300, progress: 600 / 900, active: 1 });
  });
});
