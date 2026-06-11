// Subscription billing occurrences. Like plan payments these are computed,
// never materialized as transactions: each occurrence contributes a virtual
// expense to the cycle containing its billing date.
import { cycleBounds, type CycleSettings } from './cycles';
import type { Subscription } from './types';

const FREQ_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** n-th billing date: first_bill_date stepped by frequency, day clamped. */
function occurrence(sub: Subscription, n: number): string {
  const [y, m, day] = sub.firstBillDate.split('-').map(Number);
  const total = y * 12 + (m - 1) + n * FREQ_MONTHS[sub.frequency];
  const oy = Math.floor(total / 12);
  const om = (total % 12) + 1;
  const lastDay = new Date(oy, om, 0).getDate();
  return `${oy}-${pad(om)}-${pad(Math.min(day, lastDay))}`;
}

/** Billing dates of `sub` that fall inside [from, to] (and before its end). */
export function occurrencesBetween(sub: Subscription, from: string, to: string): string[] {
  const out: string[] = [];
  const cap = sub.endsOn && sub.endsOn < to ? sub.endsOn : to;
  for (let n = 0; n < 1200; n++) {
    const d = occurrence(sub, n);
    if (d > cap) break;
    if (d >= from) out.push(d);
  }
  return out;
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
  for (let n = 0; n < 1200; n++) {
    const d = occurrence(sub, n);
    if (sub.endsOn && d > sub.endsOn) return null;
    if (d >= today) return d;
  }
  return null;
}
