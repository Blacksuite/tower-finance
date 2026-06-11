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
 * Cycles paid late in the month fund the NEXT month: the 25 Jun – 24 Jul
 * cycle is labeled "July". Paid on/before the 15th, the cycle keeps the
 * month it starts in. The offset is constant per settings, so labels are
 * consecutive and collision-free.
 */
export const cycleOffset = (s: CycleSettings): number => (s.salaryDay > 15 ? 1 : 0);

/** Cycle label (YYYY-MM) that a calendar date falls into. */
export function cycleKeyOf(date: string, s: CycleSettings): string {
  let pay = addMonths(date.slice(0, 7), 1);
  // walk back to the latest salary date on or before `date` (≤3 steps)
  while (salaryDate(pay, s) > date) pay = addMonths(pay, -1);
  return addMonths(pay, cycleOffset(s));
}

/** Inclusive [start, end] dates of the cycle labeled `label`. */
export function cycleBounds(label: string, s: CycleSettings): { start: string; end: string } {
  const pay = addMonths(label, -cycleOffset(s));
  return {
    start: salaryDate(pay, s),
    end: addDays(salaryDate(addMonths(pay, 1), s), -1),
  };
}
