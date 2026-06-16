// Sample ("Explore") data — a realistic single-person budget across a few pay
// cycles, so a new user lands on a populated, working dashboard instead of a
// blank one (research: pre-loaded data beats an empty canvas). Built relative to
// the current cycle so it always looks live. Loaded and cleared via the existing
// /api/import (atomic replace) — see Settings "Sample data" and Onboarding.
//
// Pure + deterministic given `today`. Uses salaryDay 25 deliberately to show off
// the pay-cycle feature (the thing that makes Tower different). Category names
// mirror db.ts SEED_CATEGORIES but carry budgets here so the budget charts fill.
import { addDays, addMonths, cycleBounds, cycleKeyOf, type CycleSettings } from './cycles';
import { todayISO } from './format';
import { DEFAULT_SETTINGS, type AppData, type Settings, type Transaction } from './types';

/** What /api/import accepts: the whole dataset except server-owned `auth`. */
export type ImportPayload = Omit<AppData, 'auth'>;

// [name, monthly budget]
const CATS: [string, number][] = [
  ['Housing', 1150], ['Groceries', 350], ['Utilities', 120], ['Transport', 120],
  ['Insurance', 160], ['Subscriptions', 40], ['Dining Out', 180],
  ['Entertainment', 80], ['Shopping', 120], ['Health', 60], ['Travel', 0], ['Other', 60],
];

const SETTINGS: Settings = {
  savingsTarget: 400,
  investmentsTarget: 150,
  safetyBuffer: 200,
  salaryDay: 25,
  weekendRule: 'exact',
  currency: 'EUR',
  locale: 'nl-NL',
};

/** True once the loaded sample data is present (so we can offer "clear"). */
export const SAMPLE_MARKER = 'tower-sample';

export function buildSampleData(today: string = todayISO()): ImportPayload {
  const cs: CycleSettings = { salaryDay: SETTINGS.salaryDay, weekendRule: SETTINGS.weekendRule };

  const categories = CATS.map(([name, budget], i) => ({ id: `cat-${i}`, name, budget, sortOrder: i }));
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;

  const cycleKey = cycleKeyOf(today, cs);
  const start = cycleBounds(cycleKey, cs).start; // payday that began the current cycle
  const histMonth = addMonths(cycleKey, -3); // anchor recurring things 3 cycles back for history

  // --- transactions ---------------------------------------------------------
  const txns: Transaction[] = [];
  let n = 0;
  // clamp to today so "recorded" rows never sit in the future
  const onDay = (anchor: string, offset: number) => {
    const d = addDays(anchor, offset);
    return d > today ? today : d;
  };
  const tx = (
    date: string,
    type: Transaction['type'],
    description: string,
    amount: number,
    extra?: { categoryId?: string; account?: string },
  ) => {
    txns.push({
      id: `tx-${n++}`,
      date,
      type,
      description,
      categoryId: extra?.categoryId ?? null,
      account: extra?.account ?? null,
      amount,
    });
  };

  // salary that funds the current cycle (already received). The recurring income
  // below models only the *next* one, so the two never double-count.
  tx(start, 'income', 'Salary', 3200);
  // discretionary spend spread across the elapsed part of the current cycle
  tx(onDay(start, 1), 'expense', 'Weekly groceries', 72.4, { categoryId: cat('Groceries') });
  tx(onDay(start, 3), 'expense', 'Coffee & lunch', 18.5, { categoryId: cat('Dining Out') });
  tx(onDay(start, 5), 'expense', 'Fuel', 61.0, { categoryId: cat('Transport') });
  tx(onDay(start, 6), 'expense', 'Pharmacy', 24.95, { categoryId: cat('Health') });
  tx(onDay(start, 8), 'expense', 'Weekly groceries', 68.2, { categoryId: cat('Groceries') });
  tx(onDay(start, 10), 'expense', 'Dinner out', 47.0, { categoryId: cat('Dining Out') });
  tx(onDay(start, 12), 'expense', 'New jacket', 89.99, { categoryId: cat('Shopping') });
  tx(onDay(start, 14), 'expense', 'Weekly groceries', 75.6, { categoryId: cat('Groceries') });
  tx(onDay(start, 15), 'expense', 'Cinema', 26.0, { categoryId: cat('Entertainment') });
  tx(onDay(start, 2), 'saving', 'Monthly transfer', 400, { account: 'Savings' });
  tx(onDay(start, 2), 'investment', 'Index fund', 150, { account: 'Brokerage' });

  // two prior cycles, so the Insights trends have points to draw
  for (let k = 1; k <= 2; k++) {
    const pStart = cycleBounds(addMonths(cycleKey, -k), cs).start;
    tx(pStart, 'income', 'Salary', 3200);
    tx(addDays(pStart, 4), 'expense', 'Groceries', 248.3 + k * 7, { categoryId: cat('Groceries') });
    tx(addDays(pStart, 9), 'expense', 'Dining out', 96.5 - k * 5, { categoryId: cat('Dining Out') });
    tx(addDays(pStart, 12), 'expense', 'Misc', 54.0, { categoryId: cat('Other') });
    tx(addDays(pStart, 3), 'saving', 'Monthly transfer', 400, { account: 'Savings' });
    tx(addDays(pStart, 3), 'investment', 'Index fund', 150, { account: 'Brokerage' });
  }

  // --- recurring (virtual) commitments --------------------------------------
  const m1 = `${histMonth}-01`; // 1st-of-month anchor, 3 cycles back
  const incomes = [
    {
      id: 'inc-salary',
      name: 'Salary',
      amount: 3200,
      frequency: 'monthly' as const,
      anchorDate: start, // repeats this day-of-month → next payday is start + 1 month
      intervalDays: null,
      weekendRule: SETTINGS.weekendRule,
      endsOn: null,
    },
  ];

  const bills = [
    bill('bill-rent', 'Rent', 1150, cat('Housing'), 'monthly', m1, false),
    bill('bill-utils', 'Energy & water', 95, cat('Utilities'), 'monthly', `${histMonth}-05`, true),
    bill('bill-ins', 'Health insurance', 140, cat('Insurance'), 'monthly', m1, false),
  ];

  const subscriptions = [
    sub('sub-netflix', 'Netflix', 13.99, cat('Subscriptions'), `${histMonth}-12`),
    sub('sub-spotify', 'Spotify', 10.99, cat('Subscriptions'), `${histMonth}-18`),
  ];

  const plans = [
    { id: 'plan-sofa', name: 'New sofa (0% finance)', totalAmount: 1200, installment: 100, startMonth: histMonth },
  ];

  return {
    transactions: txns,
    categories,
    settings: SETTINGS,
    plans,
    planPayments: [],
    subscriptions,
    templates: [],
    incomes,
    bills,
    billPayments: [],
  };
}

function bill(
  id: string,
  name: string,
  amount: number,
  categoryId: string,
  frequency: 'monthly',
  anchorDate: string,
  estimated: boolean,
) {
  return {
    id,
    name,
    amount,
    categoryId,
    description: '',
    frequency,
    anchorDate,
    intervalDays: null,
    weekendRule: 'exact' as const,
    endsOn: null,
    estimated,
  };
}

function sub(id: string, name: string, amount: number, categoryId: string, firstBillDate: string) {
  return {
    id,
    name,
    amount,
    categoryId,
    description: '',
    firstBillDate,
    frequency: 'monthly' as const,
    endsOn: null,
  };
}

/** A fresh dataset — "Clear all data & start fresh": default categories (no
 *  budgets), default settings, nothing else. Mirrors a brand-new install. */
export function buildEmptyData(): ImportPayload {
  return {
    transactions: [],
    categories: CATS.map(([name], i) => ({ id: `cat-${i}`, name, budget: 0, sortOrder: i })),
    settings: { ...DEFAULT_SETTINGS },
    plans: [],
    planPayments: [],
    subscriptions: [],
    templates: [],
    incomes: [],
    bills: [],
    billPayments: [],
  };
}
