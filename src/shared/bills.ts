// Recurring & one-off bills. Like subscriptions and plan installments these are
// computed, never materialized as transactions: each occurrence contributes a
// virtual expense to the cycle containing its due date. A bill's `amount` is the
// expected figure; for estimated bills the user may pin an actual per occurrence
// via a BillPayment override (counted = override ?? amount). Date math is shared
// via cadence.ts (a Bill is already a Cadence).
import { nextOccurrence, occurrencesBetween } from './cadence';
import { cycleBounds, type CycleSettings } from './cycles';
import type { Bill, BillPayment } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Actual due dates of `bill` inside [from, to], weekend rule applied. */
export function billOccurrencesBetween(bill: Bill, from: string, to: string): string[] {
  return occurrencesBetween(bill, from, to);
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
  return nextOccurrence(bill, today);
}
