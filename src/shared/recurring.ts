// Subscription billing occurrences. Like plan payments these are computed,
// never materialized as transactions: each occurrence contributes a virtual
// expense to the cycle containing its billing date. Date math is shared via
// cadence.ts; subscriptions map onto it with no weekend rule.
import {
  nextOccurrence,
  occurrencesBetween as cadenceOccurrences,
  type Cadence,
} from './cadence';
import { cycleBounds, type CycleSettings } from './cycles';
import type { Subscription } from './types';

const FREQ_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;

const toCadence = (sub: Subscription): Cadence => ({
  anchorDate: sub.firstBillDate,
  frequency: sub.frequency,
  endsOn: sub.endsOn,
});

/** Billing dates of `sub` that fall inside [from, to] (and before its end). */
export function occurrencesBetween(sub: Subscription, from: string, to: string): string[] {
  return cadenceOccurrences(toCadence(sub), from, to);
}

export interface SubOccurrence {
  sub: Subscription;
  date: string;
}

/** All subscription charges that land in the cycle labeled `label`. */
export function subOccurrencesForCycle(
  subs: Subscription[],
  label: string,
  s: CycleSettings,
): SubOccurrence[] {
  const { start, end } = cycleBounds(label, s);
  const out: SubOccurrence[] = [];
  for (const sub of subs) {
    for (const date of occurrencesBetween(sub, start, end)) out.push({ sub, date });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Total subscription expense for a cycle, and per-category amounts. */
export function subExpensesForCycle(
  subs: Subscription[],
  label: string,
  s: CycleSettings,
): { total: number; byCategory: Map<string, number> } {
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const { sub } of subOccurrencesForCycle(subs, label, s)) {
    total += sub.amount;
    const key = sub.categoryId ?? '';
    byCategory.set(key, (byCategory.get(key) ?? 0) + sub.amount);
  }
  return { total: Math.round(total * 100) / 100, byCategory };
}

/** Normalized monthly cost of a subscription (for list display). */
export function monthlyCost(sub: Subscription): number {
  return Math.round((sub.amount / FREQ_MONTHS[sub.frequency]) * 100) / 100;
}

/** Next upcoming billing date on/after `today`, or null when ended. */
export function nextBillDate(sub: Subscription, today: string): string | null {
  return nextOccurrence(toCadence(sub), today);
}
