// Recurring income (payday) occurrences. Like subscriptions and plan
// installments these are computed, never materialized as transactions: past
// income stays manual (recorded transactions), recurring incomes model the
// future — projections only ever use occurrences after "today", so the two
// can never double count. The date math lives in cadence.ts.
import { occurrencesBetween } from './cadence';
import { addDays } from './cycles';
import type { RecurringIncome } from './types';

export { daysBetween } from './cadence';

/** Actual payout dates of `inc` inside [from, to], weekend rule applied. */
export function incomeOccurrencesBetween(inc: RecurringIncome, from: string, to: string): string[] {
  return occurrencesBetween(inc, from, to);
}

export interface PaydayHit {
  income: RecurringIncome;
  date: string;
}

/** All payouts of all incomes inside [from, to], ascending by date. */
export function paydaysBetween(incomes: RecurringIncome[], from: string, to: string): PaydayHit[] {
  const out: PaydayHit[] = [];
  for (const income of incomes) {
    for (const date of incomeOccurrencesBetween(income, from, to)) out.push({ income, date });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Earliest payout strictly after `today` across all incomes, or null. */
export function nextPayday(incomes: RecurringIncome[], today: string): PaydayHit | null {
  let best: PaydayHit | null = null;
  for (const income of incomes) {
    // a one-year window is enough for every supported frequency
    const [hit] = incomeOccurrencesBetween(income, addDays(today, 1), addDays(today, 366));
    if (hit && (!best || hit < best.date)) best = { income, date: hit };
  }
  return best;
}

/** Expected income total inside [from, to] across all sources. */
export function expectedIncomeBetween(incomes: RecurringIncome[], from: string, to: string): number {
  let sum = 0;
  for (const hit of paydaysBetween(incomes, from, to)) sum += hit.income.amount;
  return Math.round(sum * 100) / 100;
}
