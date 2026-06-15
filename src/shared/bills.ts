// Recurring & one-off bills. Like subscriptions and plan installments these are
// computed, never materialized as transactions: each occurrence contributes a
// virtual expense to the cycle containing its due date. A bill's `amount` is the
// expected figure; for estimated bills the user may pin an actual per occurrence
// via a BillPayment override (counted = override ?? amount).
import { applyWeekendRule, cycleBounds, type CycleSettings } from './cycles';
import { daysBetween } from './income';
import type { Bill, BillFrequency, BillPayment } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const r2 = (n: number) => Math.round(n * 100) / 100;

const MONTH_STEPS: Partial<Record<BillFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};
const DAY_STEPS: Partial<Record<BillFrequency, number>> = {
  weekly: 7,
  biweekly: 14,
  four_weekly: 28,
};

/** Days between two occurrences; month-based frequencies have no fixed step. */
function stepDays(bill: Bill): number | null {
  if (bill.frequency === 'custom') return Math.max(1, bill.intervalDays ?? 1);
  return DAY_STEPS[bill.frequency] ?? null;
}

/** n-th nominal due date (before the weekend rule), or null past the last one. */
function occurrence(bill: Bill, n: number): string | null {
  const [y, m, day] = bill.anchorDate.split('-').map(Number);
  if (bill.frequency === 'once') return n === 0 ? bill.anchorDate : null;
  const months = MONTH_STEPS[bill.frequency];
  if (months !== undefined) {
    const total = y * 12 + (m - 1) + n * months;
    const oy = Math.floor(total / 12);
    const om = (total % 12) + 1;
    const lastDay = new Date(oy, om, 0).getDate();
    return `${oy}-${pad(om)}-${pad(Math.min(day, lastDay))}`;
  }
  const step = stepDays(bill)!;
  const dt = new Date(y, m - 1, day + n * step);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** First n whose nominal date could land in/after `from` (cheap skip-ahead). */
function startIndex(bill: Bill, from: string): number {
  if (bill.frequency === 'once') return 0;
  const diff = daysBetween(bill.anchorDate, from);
  if (diff <= 0) return 0;
  // -2 steps of margin absorbs day clamping and weekend shifts; month-based
  // frequencies under-estimate (a month is ≥ 28 days) so we start a touch early.
  const step = stepDays(bill) ?? 28;
  return Math.max(0, Math.floor(diff / step) - 2);
}

/**
 * Actual due dates of `bill` inside [from, to], weekend rule applied. `endsOn`
 * caps the nominal date (mirrors recurring.ts / income.ts semantics).
 */
export function billOccurrencesBetween(bill: Bill, from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  const first = startIndex(bill, from);
  for (let n = first; n < first + 1200; n++) {
    const nominal = occurrence(bill, n);
    if (nominal === null) break;
    if (bill.endsOn && nominal > bill.endsOn) break;
    const actual = applyWeekendRule(nominal, bill.weekendRule);
    if (actual > to && nominal > to) break;
    if (actual >= from && actual <= to) out.push(actual);
  }
  return out;
}

/** Counted amount for one occurrence: the per-occurrence override, else the estimate. */
export function billCountedAmount(bill: Bill, date: string, payments: BillPayment[]): number {
  const o = payments.find((p) => p.billId === bill.id && p.date === date);
  return r2(o ? o.amount : bill.amount);
}

export interface BillOccurrence {
  bill: Bill;
  date: string;
  amount: number; // counted amount (override ?? estimate)
}

/** All bill charges that land in the cycle labeled `label`, ascending by date. */
export function billsForCycle(
  bills: Bill[],
  payments: BillPayment[],
  label: string,
  s: CycleSettings,
): BillOccurrence[] {
  const { start, end } = cycleBounds(label, s);
  const out: BillOccurrence[] = [];
  for (const bill of bills) {
    for (const date of billOccurrencesBetween(bill, start, end)) {
      out.push({ bill, date, amount: billCountedAmount(bill, date, payments) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Total bill expense for a cycle, and per-category amounts (analogue of subExpensesForCycle). */
export function billExpensesForCycle(
  bills: Bill[],
  payments: BillPayment[],
  label: string,
  s: CycleSettings,
): { total: number; byCategory: Map<string, number> } {
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const { bill, amount } of billsForCycle(bills, payments, label, s)) {
    total += amount;
    const key = bill.categoryId ?? '';
    byCategory.set(key, (byCategory.get(key) ?? 0) + amount);
  }
  return { total: r2(total), byCategory };
}

/** Normalized monthly cost for list/aggregate display; one-off bills contribute 0. */
export function billMonthlyCost(bill: Bill): number {
  switch (bill.frequency) {
    case 'once':
      return 0;
    case 'weekly':
      return r2((bill.amount * 52) / 12);
    case 'biweekly':
      return r2((bill.amount * 26) / 12);
    case 'four_weekly':
      return r2((bill.amount * 13) / 12);
    case 'monthly':
      return r2(bill.amount);
    case 'quarterly':
      return r2(bill.amount / 3);
    case 'yearly':
      return r2(bill.amount / 12);
    case 'custom':
      return r2((bill.amount * (365 / Math.max(1, bill.intervalDays ?? 1))) / 12);
  }
}

/** Next due date on/after `today`, or null when the bill has ended. */
export function nextBillOccurrence(bill: Bill, today: string): string | null {
  const first = startIndex(bill, today);
  for (let n = first; n < first + 1200; n++) {
    const nominal = occurrence(bill, n);
    if (nominal === null) return null;
    if (bill.endsOn && nominal > bill.endsOn) return null;
    const actual = applyWeekendRule(nominal, bill.weekendRule);
    if (actual >= today) return actual;
  }
  return null;
}
