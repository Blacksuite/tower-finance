// One occurrence engine for every recurring concept (subscriptions, recurring
// income, bills). Given an anchor date + frequency it yields the actual dates
// that fall in a range, applying the weekend rule and respecting `endsOn`. The
// domain modules (recurring.ts / income.ts / bills.ts) wrap these with their own
// field names and amount logic — this file owns the date math, nothing else.
import { applyWeekendRule, pad, toISO, type WeekendRule } from './cycles';
import type { BillFrequency } from './types';

/** Normalized shape every recurring concept maps onto. */
export interface Cadence {
  anchorDate: string; // YYYY-MM-DD; for 'once' this is the single date
  frequency: BillFrequency;
  intervalDays?: number | null; // custom frequency only
  weekendRule?: WeekendRule; // omitted / 'exact' => no shift (subscriptions)
  endsOn?: string | null; // caps the nominal date
}

const MS_PER_DAY = 86_400_000;
const MONTH_STEPS: Partial<Record<BillFrequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 };
const DAY_STEPS: Partial<Record<BillFrequency, number>> = { weekly: 7, biweekly: 14, four_weekly: 28 };

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/** Days between two occurrences; month-based & 'once' have no fixed step. */
function stepDays(c: Cadence): number | null {
  if (c.frequency === 'custom') return Math.max(1, c.intervalDays ?? 1);
  return DAY_STEPS[c.frequency] ?? null;
}

/** n-th nominal date (before the weekend rule), or null past the last one. */
function occurrence(c: Cadence, n: number): string | null {
  const [y, m, day] = c.anchorDate.split('-').map(Number);
  if (c.frequency === 'once') return n === 0 ? c.anchorDate : null;
  const months = MONTH_STEPS[c.frequency];
  if (months !== undefined) {
    const total = y * 12 + (m - 1) + n * months;
    const oy = Math.floor(total / 12);
    const om = (total % 12) + 1;
    const lastDay = new Date(oy, om, 0).getDate();
    return `${oy}-${pad(om)}-${pad(Math.min(day, lastDay))}`;
  }
  const step = stepDays(c)!;
  return toISO(new Date(y, m - 1, day + n * step));
}

/** First n whose nominal date could land in/after `from` (cheap skip-ahead). */
function startIndex(c: Cadence, from: string): number {
  if (c.frequency === 'once') return 0;
  const diff = daysBetween(c.anchorDate, from);
  if (diff <= 0) return 0;
  // -2 steps of margin absorbs day clamping and weekend shifts; month-based
  // frequencies under-estimate (a month is ≥ 28 days) so we start a touch early.
  const step = stepDays(c) ?? 28;
  return Math.max(0, Math.floor(diff / step) - 2);
}

/**
 * Actual dates of `c` inside [from, to], weekend rule applied. `endsOn` caps the
 * nominal date (a shifted occurrence of a source that has not ended yet still
 * counts even if the shift crosses endsOn).
 */
export function occurrencesBetween(c: Cadence, from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  const first = startIndex(c, from);
  for (let n = first; n < first + 1200; n++) {
    const nominal = occurrence(c, n);
    if (nominal === null) break;
    if (c.endsOn && nominal > c.endsOn) break;
    const actual = applyWeekendRule(nominal, c.weekendRule ?? 'exact');
    if (actual > to && nominal > to) break;
    if (actual >= from && actual <= to) out.push(actual);
  }
  return out;
}

/** Next actual date on/after `onOrAfter`, or null when the cadence has ended. */
export function nextOccurrence(c: Cadence, onOrAfter: string): string | null {
  const first = startIndex(c, onOrAfter);
  for (let n = first; n < first + 1200; n++) {
    const nominal = occurrence(c, n);
    if (nominal === null) return null;
    if (c.endsOn && nominal > c.endsOn) return null;
    const actual = applyWeekendRule(nominal, c.weekendRule ?? 'exact');
    if (actual >= onOrAfter) return actual;
  }
  return null;
}
