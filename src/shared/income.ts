// Recurring income (payday) occurrences. Like subscriptions and plan
// installments these are computed, never materialized as transactions: past
// income stays manual (recorded transactions), recurring incomes model the
// future — projections only ever use occurrences after "today", so the two
// can never double count.
import { applyWeekendRule } from './cycles';
import type { RecurringIncome } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

const DAY_STEPS = { weekly: 7, biweekly: 14, four_weekly: 28 } as const;

const MS_PER_DAY = 86_400_000;

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/** Days between two payouts; monthly has no fixed step and returns null. */
export function stepDays(inc: RecurringIncome): number | null {
  if (inc.frequency === 'monthly') return null;
  if (inc.frequency === 'custom') return Math.max(1, inc.intervalDays ?? 1);
  return DAY_STEPS[inc.frequency];
}

/** n-th nominal payout date (before the weekend rule is applied). */
function occurrence(inc: RecurringIncome, n: number): string {
  const [y, m, day] = inc.anchorDate.split('-').map(Number);
  if (inc.frequency === 'monthly') {
    const total = y * 12 + (m - 1) + n;
    const oy = Math.floor(total / 12);
    const om = (total % 12) + 1;
    const lastDay = new Date(oy, om, 0).getDate();
    return `${oy}-${pad(om)}-${pad(Math.min(day, lastDay))}`;
  }
  const step = stepDays(inc)!;
  const dt = new Date(y, m - 1, day + n * step);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** First n whose nominal date could land in/after `from` (cheap skip-ahead). */
function startIndex(inc: RecurringIncome, from: string): number {
  const diff = daysBetween(inc.anchorDate, from);
  if (diff <= 0) return 0;
  // -2 steps of margin absorbs day clamping and weekend shifts
  const step = stepDays(inc) ?? 28; // monthly: a month is at least 28 days
  return Math.max(0, Math.floor(diff / step) - 2);
}

/**
 * Actual payout dates of `inc` inside [from, to], weekend rule applied.
 * `endsOn` caps the nominal date (a shifted payout of a source that has not
 * ended yet still counts even if the shift crosses endsOn).
 */
export function incomeOccurrencesBetween(inc: RecurringIncome, from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  const first = startIndex(inc, from);
  for (let n = first; n < first + 1200; n++) {
    const nominal = occurrence(inc, n);
    if (inc.endsOn && nominal > inc.endsOn) break;
    const actual = applyWeekendRule(nominal, inc.weekendRule);
    if (actual > to && nominal > to) break;
    if (actual >= from && actual <= to) out.push(actual);
  }
  return out;
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
    const [hit] = incomeOccurrencesBetween(income, addDaysISO(today, 1), addDaysISO(today, 366));
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

function addDaysISO(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
