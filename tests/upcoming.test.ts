import { describe, expect, it } from 'vitest';
import { upcomingView } from '../src/shared/upcoming';
import { DEFAULT_SETTINGS, type AppData, type Settings, type Transaction } from '../src/shared/types';

let id = 0;
const tx = (date: string, type: Transaction['type'], amount: number): Transaction => ({
  id: `t${++id}`, date, type, description: '', categoryId: null, account: null, amount,
});

const data = (
  over: Partial<Omit<AppData, 'settings'>> & { settings?: Partial<Settings> } = {},
): AppData => ({
  transactions: [], categories: [], plans: [], planPayments: [],
  subscriptions: [], templates: [], incomes: [], auth: { enabled: false },
  ...over,
  settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) },
});

const salary = {
  id: 'i1', name: 'Salary', amount: 3200, frequency: 'monthly' as const,
  anchorDate: '2026-05-26', intervalDays: null, weekendRule: 'previous' as const, endsOn: null,
};

const sub = (name: string, amount: number, firstBillDate: string) => ({
  id: `s-${name}`, name, amount, categoryId: null, description: '',
  firstBillDate, frequency: 'monthly' as const, endsOn: null,
});

describe('upcomingView', () => {
  it('payday comes from recurring income when present', () => {
    const v = upcomingView(data({ incomes: [salary] }), '2026-06-13');
    // 26 Jun 2026 is a Friday — no weekend shift
    expect(v.payday).toEqual({ date: '2026-06-26', amount: 3200, name: 'Salary' });
    expect(v.daysUntil).toBe(13);
  });

  it('falls back to cycle settings without recurring income', () => {
    const v = upcomingView(data({ settings: { salaryDay: 26, weekendRule: 'previous' } }), '2026-06-13');
    expect(v.payday).toEqual({ date: '2026-06-26', amount: null, name: null });
    expect(v.daysUntil).toBe(13);
  });

  it('collects bills strictly between today and payday', () => {
    const d = data({
      incomes: [salary],
      subscriptions: [
        sub('Netflix', 15.99, '2026-01-20'), // 20 Jun — inside window
        sub('Gym', 30, '2026-01-13'), // 13 Jun — today, NOT upcoming
        sub('Insurance', 120, '2026-01-26'), // 26 Jun — payday itself, excluded
      ],
    });
    const v = upcomingView(d, '2026-06-13');
    expect(v.bills).toEqual([{ name: 'Netflix', date: '2026-06-20', amount: 15.99 }]);
    expect(v.billsTotal).toBe(15.99);
  });

  it('left until payday = cycle flow − past virtuals − plan installment − upcoming bills', () => {
    const d = data({
      settings: { salaryDay: 26, weekendRule: 'previous' },
      incomes: [salary],
      transactions: [
        tx('2026-05-26', 'income', 3200),
        tx('2026-06-01', 'expense', 1000),
        tx('2026-06-05', 'saving', 300),
        tx('2026-06-30', 'expense', 999), // after today: ignored
      ],
      subscriptions: [
        sub('Gym', 30, '2026-01-01'), // charged 1 Jun (past in cycle)
        sub('Netflix', 15.99, '2026-01-20'), // upcoming 20 Jun
      ],
      plans: [{ id: 'p1', name: 'Phone', totalAmount: 1200, installment: 100, startMonth: '2026-03' }],
    });
    const v = upcomingView(d, '2026-06-13');
    // 3200 − 1000 − 300 − 30 (gym charged) − 100 (installment) − 15.99 (upcoming)
    expect(v.leftUntilPayday).toBe(1754.01);
  });

  it('handles empty data without NaN', () => {
    const v = upcomingView(data(), '2026-06-13');
    expect(v.leftUntilPayday).toBe(0);
    expect(v.billsTotal).toBe(0);
    expect(Number.isFinite(v.daysUntil)).toBe(true);
  });
});

describe('payday verdict', () => {
  const cyc = { salaryDay: 26, weekendRule: 'previous' as const };

  it('okay when what is left stays above the buffer', () => {
    const v = upcomingView(
      data({ settings: cyc, incomes: [salary], transactions: [tx('2026-05-26', 'income', 3200), tx('2026-06-01', 'expense', 500)] }),
      '2026-06-13',
    );
    expect(v.buffer).toBe(100);
    expect(v.leftUntilPayday).toBe(2700);
    expect(v.status).toBe('okay');
  });

  it('tight when what is left is positive but under the buffer', () => {
    const v = upcomingView(
      data({ settings: cyc, incomes: [salary], transactions: [tx('2026-05-26', 'income', 3200), tx('2026-06-01', 'expense', 3150)] }),
      '2026-06-13',
    );
    expect(v.leftUntilPayday).toBe(50);
    expect(v.status).toBe('tight');
  });

  it('trouble when it would go negative before payday', () => {
    const v = upcomingView(
      data({ settings: cyc, incomes: [salary], transactions: [tx('2026-05-26', 'income', 3200), tx('2026-06-01', 'expense', 3300)] }),
      '2026-06-13',
    );
    expect(v.leftUntilPayday).toBe(-100);
    expect(v.status).toBe('trouble');
  });

  it('a zero buffer makes the verdict pure above/below zero', () => {
    const v = upcomingView(
      data({ settings: { ...cyc, safetyBuffer: 0 }, incomes: [salary], transactions: [tx('2026-05-26', 'income', 3200), tx('2026-06-01', 'expense', 3200)] }),
      '2026-06-13',
    );
    expect(v.leftUntilPayday).toBe(0);
    expect(v.status).toBe('okay');
  });
});
