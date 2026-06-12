// Salary-cycle engine. A budget period ("cycle") runs from one salary date to
// the day before the next. Cycles are keyed YYYY-MM like calendar months —
// labeled by the month they fund — so all aggregation code keys stay stable.
// With the default settings (salaryDay 1, exact) cycles ARE calendar months.

export type WeekendRule = 'previous' | 'exact' | 'next';

export interface CycleSettings {
  salaryDay: number; // 1..31, clamped to month length
  weekendRule: WeekendRule;
}

export const DEFAULT_CYCLE: CycleSettings = { salaryDay: 1, weekendRule: 'exact' };

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toISO(dt);
}

/** Actual payout date of the salary nominally due in `month` (YYYY-MM). */
export function salaryDate(month: string, s: CycleSettings): string {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = new Date(y, m - 1, Math.min(Math.max(1, s.salaryDay), lastDay));
  const dow = d.getDay();
  if (s.weekendRule !== 'exact' && (dow === 0 || dow === 6)) {
    if (s.weekendRule === 'previous') d.setDate(d.getDate() - (dow === 6 ? 1 : 2));
    else d.setDate(d.getDate() + (dow === 6 ? 2 : 1));
  }
  return toISO(d);
}

/**
 * A cycle is keyed by the month its salary lands in: cycle "2026-06" runs
 * from salaryDate(2026-06) until the day before salaryDate(2026-07).
 * Displayed as the actual date range ("26 jun – 25 jul 2026"); with the
 * default salaryDay 1 a cycle is exactly its calendar month.
 */
export function cycleKeyOf(date: string, s: CycleSettings): string {
  let pay = addMonths(date.slice(0, 7), 1);
  // walk back to the latest salary date on or before `date` (≤3 steps)
  while (salaryDate(pay, s) > date) pay = addMonths(pay, -1);
  return pay;
}

/** Inclusive [start, end] dates of the cycle keyed `label`. */
export function cycleBounds(label: string, s: CycleSettings): { start: string; end: string } {
  return {
    start: salaryDate(label, s),
    end: addDays(salaryDate(addMonths(label, 1), s), -1),
  };
}

/** Calendar-month bucketing, used for reporting/trend views. */
export const CALENDAR: CycleSettings = DEFAULT_CYCLE;
