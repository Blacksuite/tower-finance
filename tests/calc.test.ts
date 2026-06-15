import { describe, expect, it } from 'vitest';
import {
  activeMonths,
  addMonths,
  budgetVsActualMonth,
  budgetVsActualYtd,
  monthAxis,
  monthlySummary,
  netWorthSeries,
  rangeMonths,
  summarize,
  topCategories,
} from '../src/shared/calc';
import { DEFAULT_SETTINGS, type AppData, type Bill, type Settings, type Transaction } from '../src/shared/types';

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1', name: 'Rent', amount: 1200, categoryId: null, description: '',
  frequency: 'monthly', anchorDate: '2026-01-01', intervalDays: null,
  weekendRule: 'exact', endsOn: null, estimated: false, ...over,
});

let id = 0;
const tx = (
  date: string,
  type: Transaction['type'],
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `t${++id}`,
  date,
  type,
  description: '',
  categoryId: null,
  account: null,
  amount,
  ...extra,
});

const emptyData = (
  over: Partial<Omit<AppData, 'settings'>> & { settings?: Partial<Settings> } = {},
): AppData => ({
  transactions: [],
  categories: [],
  plans: [],
  planPayments: [],
  subscriptions: [],
  templates: [],
  incomes: [],
  bills: [],
  billPayments: [],
  auth: { enabled: false },
  ...over,
  settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) },
});

describe('addMonths', () => {
  it('crosses year boundaries in both directions', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-06', 0)).toBe('2026-06');
  });
});

describe('monthlySummary', () => {
  const data = emptyData({
    transactions: [
      tx('2026-06-01', 'income', 3000),
      tx('2026-06-05', 'expense', 800, { categoryId: 'c1' }),
      tx('2026-06-10', 'saving', 400, { account: 'Savings' }),
      tx('2026-06-15', 'investment', 200, { account: 'ETF' }),
      tx('2026-05-01', 'income', 9999), // other month, must be excluded
    ],
  });

  it('computes income, expenses, saved, invested, left over', () => {
    const s = monthlySummary(data, '2026-06');
    expect(s.income).toBe(3000);
    expect(s.expenses).toBe(800);
    expect(s.saved).toBe(400);
    expect(s.invested).toBe(200);
    expect(s.leftOver).toBe(1600);
  });

  it('savings rate = (saved + invested) / income', () => {
    expect(monthlySummary(data, '2026-06').savingsRate).toBeCloseTo(0.2);
  });

  it('is 0 (not NaN) for a month with no income', () => {
    const s = monthlySummary(data, '2026-04');
    expect(s.savingsRate).toBe(0);
    expect(s.leftOver).toBe(0);
    expect(Number.isNaN(s.savingsRate)).toBe(false);
  });

  it('aggregates ranges with the rate over totals', () => {
    const s = summarize(data, ['2026-05', '2026-06']);
    expect(s.income).toBe(12999);
    expect(s.savingsRate).toBeCloseTo(600 / 12999);
  });
});

describe('bills as virtual expenses', () => {
  it('count toward cycle expenses in the summary', () => {
    const data = emptyData({
      transactions: [tx('2026-06-01', 'income', 3000)],
      bills: [
        bill({ id: 'rent', amount: 1200, anchorDate: '2026-01-01' }), // 1 Jun
        bill({ id: 'utils', amount: 80, anchorDate: '2026-01-10', estimated: true }), // 10 Jun
      ],
      billPayments: [{ billId: 'utils', date: '2026-06-10', amount: 100 }],
    });
    const s = monthlySummary(data, '2026-06');
    expect(s.billExpenses).toBe(1300); // 1200 + 100 override
    expect(s.expenses).toBe(1300);
    expect(s.leftOver).toBe(1700);
  });

  it('land in the matching category for budget vs actual', () => {
    const data = emptyData({
      categories: [{ id: 'housing', name: 'Housing', budget: 1500, sortOrder: 1 }],
      bills: [bill({ id: 'rent', categoryId: 'housing', amount: 1200, anchorDate: '2026-01-01' })],
    });
    const row = budgetVsActualMonth(data, '2026-06').find((r) => r.id === 'housing')!;
    expect(row.actual).toBe(1200);
    expect(row.diff).toBe(300);
  });
});

describe('budget vs actual — sign conventions', () => {
  const data = emptyData({
    categories: [
      { id: 'c1', name: 'Groceries', budget: 400, sortOrder: 1 },
      { id: 'c2', name: 'Transport', budget: 150, sortOrder: 2 },
    ],
    settings: { savingsTarget: 500, investmentsTarget: 250, startingNetWorth: 0 },
    transactions: [
      tx('2026-06-02', 'expense', 450, { categoryId: 'c1' }), // overspent by 50
      tx('2026-06-03', 'expense', 100, { categoryId: 'c2' }), // 50 under
      tx('2026-06-04', 'saving', 600), // 100 over target = good
      tx('2026-06-05', 'investment', 200), // 50 under target = bad
    ],
  });

  it('expense diff = budget - actual (negative = overspent)', () => {
    const rows = budgetVsActualMonth(data, '2026-06');
    const groceries = rows.find((r) => r.id === 'c1')!;
    expect(groceries.diff).toBe(-50);
    expect(groceries.pct).toBeCloseTo(450 / 400);
    const transport = rows.find((r) => r.id === 'c2')!;
    expect(transport.diff).toBe(50);
  });

  it('savings/investments diff = actual - target (inverted: exceeding is positive)', () => {
    const rows = budgetVsActualMonth(data, '2026-06');
    const savings = rows.find((r) => r.id === 'saving')!;
    expect(savings.budget).toBe(500);
    expect(savings.diff).toBe(100);
    const inv = rows.find((r) => r.id === 'investment')!;
    expect(inv.diff).toBe(-50);
  });

  it('handles zero budgets without NaN', () => {
    const d = emptyData({
      categories: [{ id: 'c0', name: 'Other', budget: 0, sortOrder: 1 }],
      transactions: [tx('2026-06-01', 'expense', 10, { categoryId: 'c0' })],
    });
    const row = budgetVsActualMonth(d, '2026-06')[0];
    expect(row.pct).toBe(Infinity); // rendered as full bar, never NaN
    expect(row.diff).toBe(-10);
  });
});

describe('YTD budgets use active months', () => {
  const data = emptyData({
    categories: [{ id: 'c1', name: 'Groceries', budget: 400, sortOrder: 1 }],
    settings: { savingsTarget: 500, investmentsTarget: 0, startingNetWorth: 0 },
    transactions: [
      // active months: jan (income), feb (expense), jun (expense). mar–may inactive.
      tx('2026-01-15', 'income', 3000),
      tx('2026-02-10', 'expense', 350, { categoryId: 'c1' }),
      tx('2026-06-05', 'expense', 500, { categoryId: 'c1' }),
      tx('2026-03-10', 'saving', 100), // saving alone does NOT make a month active
    ],
  });

  it('counts only months with income or expense recorded', () => {
    expect(activeMonths(data, '2026', '2026-06')).toEqual(['2026-01', '2026-02', '2026-06']);
  });

  it('YTD budget = monthly budget x active months', () => {
    const rows = budgetVsActualYtd(data, '2026-06');
    const groceries = rows.find((r) => r.id === 'c1')!;
    expect(groceries.budget).toBe(1200); // 400 x 3
    expect(groceries.actual).toBe(850);
    expect(groceries.diff).toBe(350);
    const savings = rows.find((r) => r.id === 'saving')!;
    expect(savings.budget).toBe(1500); // 500 x 3
    expect(savings.actual).toBe(100);
    expect(savings.diff).toBe(-1400);
  });

  it('zero active months → zero budgets, no NaN', () => {
    const rows = budgetVsActualYtd(emptyData({
      categories: [{ id: 'c1', name: 'Groceries', budget: 400, sortOrder: 1 }],
    }), '2026-06');
    expect(rows[0].budget).toBe(0);
    expect(rows[0].pct).toBe(0);
  });
});

describe('net worth series', () => {
  it('starts from startingNetWorth and accumulates income - expenses', () => {
    const data = emptyData({
      settings: { savingsTarget: 0, investmentsTarget: 0, startingNetWorth: 10000 },
      transactions: [
        tx('2026-01-10', 'income', 3000),
        tx('2026-01-12', 'expense', 1000),
        tx('2026-02-10', 'income', 3000),
        tx('2026-02-12', 'expense', 3500),
      ],
    });
    const series = netWorthSeries(data, '2026-02');
    expect(series).toEqual([
      { month: '2026-01', value: 12000 },
      { month: '2026-02', value: 11500 },
    ]);
  });

  it('fills gap months so the line is continuous', () => {
    const data = emptyData({
      transactions: [tx('2026-01-10', 'income', 100), tx('2026-04-10', 'income', 100)],
    });
    expect(netWorthSeries(data, '2026-04').map((p) => p.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04',
    ]);
  });

  it('includes plan payments as expenses', () => {
    const data = emptyData({
      settings: { savingsTarget: 0, investmentsTarget: 0, startingNetWorth: 1000 },
      plans: [{ id: 'p1', name: 'TV', totalAmount: 300, installment: 100, startMonth: '2026-01' }],
    });
    const series = netWorthSeries(data, '2026-03');
    expect(series[2]).toEqual({ month: '2026-03', value: 700 });
  });
});

describe('top categories and ranges', () => {
  const data = emptyData({
    categories: [
      { id: 'c1', name: 'Groceries', budget: 0, sortOrder: 1 },
      { id: 'c2', name: 'Dining Out', budget: 0, sortOrder: 2 },
    ],
    transactions: [
      tx('2026-06-01', 'expense', 100, { categoryId: 'c2' }),
      tx('2026-06-02', 'expense', 300, { categoryId: 'c1' }),
      tx('2026-06-03', 'expense', 50, { categoryId: null }),
    ],
  });

  it('sorts categories high to low and labels uncategorized', () => {
    const top = topCategories(data, ['2026-06']);
    expect(top.map((t) => [t.name, t.amount])).toEqual([
      ['Groceries', 300],
      ['Dining Out', 100],
      ['Uncategorized', 50],
    ]);
  });

  it('rangeMonths covers month / ytd / all', () => {
    expect(rangeMonths(data, 'month', '2026-06')).toEqual(['2026-06']);
    expect(rangeMonths(data, 'ytd', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(rangeMonths(data, 'all', '2026-07')).toEqual(['2026-06', '2026-07']);
  });

  it('monthAxis for empty data is just the current month', () => {
    expect(monthAxis(emptyData(), '2026-06')).toEqual(['2026-06']);
  });
});
