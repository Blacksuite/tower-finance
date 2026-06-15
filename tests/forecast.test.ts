import { describe, expect, it } from 'vitest';
import { balanceAt, forecast, forecastEvents, spendableBalance } from '../src/shared/forecast';
import { DEFAULT_SETTINGS, type AppData, type Settings, type Transaction } from '../src/shared/types';

let id = 0;
const tx = (date: string, type: Transaction['type'], amount: number): Transaction => ({
  id: `t${++id}`, date, type, description: '', categoryId: null, account: null, amount,
});

const data = (
  over: Partial<Omit<AppData, 'settings'>> & { settings?: Partial<Settings> } = {},
): AppData => ({
  transactions: [], categories: [], plans: [], planPayments: [],
  subscriptions: [], templates: [], incomes: [], bills: [], billPayments: [], auth: { enabled: false },
  ...over,
  settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) },
});

const salary = {
  id: 'i1', name: 'Salary', amount: 3000, frequency: 'monthly' as const,
  anchorDate: '2026-05-26', intervalDays: null, weekendRule: 'previous' as const, endsOn: null,
};

const sub = (name: string, amount: number, firstBillDate: string) => ({
  id: `s-${name}`, name, amount, categoryId: null, description: '',
  firstBillDate, frequency: 'monthly' as const, endsOn: null,
});

const TODAY = '2026-06-13';

describe('spendableBalance', () => {
  it('sums starting net worth and recorded flows up to today', () => {
    const d = data({
      settings: { startingNetWorth: 1000 },
      transactions: [
        tx('2026-06-01', 'income', 3000),
        tx('2026-06-05', 'expense', 800),
        tx('2026-06-06', 'saving', 200),
        tx('2026-06-07', 'investment', 100),
        tx('2026-07-01', 'income', 9999), // future: ignored
      ],
    });
    expect(spendableBalance(d, TODAY)).toBe(1000 + 3000 - 800 - 200 - 100);
  });

  it('subtracts past subscription charges and plan payments through the current cycle', () => {
    const d = data({
      subscriptions: [sub('Gym', 30, '2026-04-10')], // 10 Apr, 10 May, 10 Jun = 3 charges
      plans: [{ id: 'p1', name: 'Phone', totalAmount: 1200, installment: 100, startMonth: '2026-05' }],
    });
    // plan: May + June installments = 200 (June is the current cycle)
    expect(spendableBalance(d, TODAY)).toBe(-90 - 200);
  });
});

describe('forecastEvents', () => {
  it('collects income, bills and plan installments in the window, sorted', () => {
    const d = data({
      incomes: [salary],
      subscriptions: [sub('Netflix', 15.99, '2026-01-20')],
      plans: [{ id: 'p1', name: 'Phone', totalAmount: 1200, installment: 100, startMonth: '2026-05' }],
    });
    const events = forecastEvents(d, TODAY, 30);
    expect(events).toEqual([
      { date: '2026-06-20', name: 'Netflix', amount: -15.99, kind: 'bill' },
      { date: '2026-06-26', name: 'Salary', amount: 3000, kind: 'income' },
      // July's installment is due on the cycle-start payday (1 Jul, default settings)
      { date: '2026-07-01', name: 'Phone', amount: -100, kind: 'plan' },
    ]);
  });

  it('stops plan installments when the plan is paid off', () => {
    const d = data({
      plans: [{ id: 'p1', name: 'TV', totalAmount: 150, installment: 100, startMonth: '2026-06' }],
    });
    const events = forecastEvents(d, TODAY, 90);
    // June (current cycle) is in the start balance; only July's final 50 remains
    expect(events).toEqual([{ date: '2026-07-01', name: 'TV', amount: -50, kind: 'plan' }]);
  });
});

describe('forecast', () => {
  it('projects daily balances over the horizon', () => {
    const d = data({
      settings: { startingNetWorth: 500 },
      incomes: [salary],
      subscriptions: [sub('Netflix', 15.99, '2026-01-20')],
    });
    const f = forecast(d, TODAY, 90);
    expect(f.points).toHaveLength(91);
    expect(f.startBalance).toBe(500 - 5 * 15.99); // Netflix charged 20 Jan…20 May (20 Jun is after today)
    expect(balanceAt(f, 0)).toBe(f.startBalance);
    // day 7 (20 Jun): one Netflix bill
    expect(balanceAt(f, 7)).toBe(round2(f.startBalance - 15.99));
    // day 13 (26 Jun): salary arrives
    expect(balanceAt(f, 13)).toBe(round2(f.startBalance - 15.99 + 3000));
    // day 90 (11 Sep): + salaries 26 Jun, 24 Jul (26th is a Sunday → previous Fri), 26 Aug − bills 20 Jun/Jul/Aug (20 Sep is past the horizon)
    expect(balanceAt(f, 90)).toBe(round2(f.startBalance + 3 * 3000 - 3 * 15.99));
  });

  it('clamps balanceAt to the horizon and never returns NaN on empty data', () => {
    const f = forecast(data(), TODAY, 30);
    expect(balanceAt(f, 999)).toBe(0);
    expect(f.points.every((p) => Number.isFinite(p.balance))).toBe(true);
  });
});

const round2 = (n: number) => Math.round(n * 100) / 100;
