// "Am I okay until payday?" — pure derivations for the dashboard Upcoming
// card. Everything is computed from raw rows; no value here is ever stored.
import { billCountedAmount, billOccurrencesBetween } from './bills';
import { planExpensesForMonth, round2 } from './calc';
import { addDays, addMonths, cycleBounds, cycleKeyOf, salaryDate } from './cycles';
import { daysBetween, nextPayday } from './income';
import { occurrencesBetween } from './recurring';
import type { AppData } from './types';

export interface UpcomingBill {
  name: string;
  date: string;
  amount: number;
}

/** The one-glance answer: are you okay until payday? */
export type VerdictStatus = 'okay' | 'tight' | 'trouble';

export interface UpcomingView {
  /** amount/name are null when the date comes from cycle settings, not a recurring income */
  payday: { date: string; amount: number | null; name: string | null };
  daysUntil: number;
  /** bills strictly after today and before payday (payday-dated bills are paid from the arriving salary) */
  bills: UpcomingBill[];
  billsTotal: number;
  /**
   * Spendable money until payday: recorded cycle cash flow so far (income −
   * expenses − savings − investments), minus virtual charges that already hit
   * this cycle (subscriptions to date + the cycle's plan installment, which is
   * committed on the payday that opened the cycle), minus upcoming bills.
   */
  leftUntilPayday: number;
  /** the safety buffer the verdict is measured against (from settings) */
  buffer: number;
  /**
   * 🟢 okay: stays above the buffer · 🟡 tight: positive but under the buffer ·
   * 🔴 trouble: would go negative before payday.
   */
  status: VerdictStatus;
}

export function upcomingView(data: AppData, today: string): UpcomingView {
  const s = data.settings;
  // recurring incomes are the source of truth for paydays; without any, the
  // budget-cycle settings still give the next salary date
  const hit = nextPayday(data.incomes, today);
  const payday = hit
    ? { date: hit.date, amount: hit.income.amount, name: hit.income.name }
    : { date: salaryDate(addMonths(cycleKeyOf(today, s), 1), s), amount: null, name: null };

  const bills: UpcomingBill[] = [];
  const from = addDays(today, 1);
  const to = addDays(payday.date, -1);
  for (const sub of data.subscriptions) {
    for (const date of occurrencesBetween(sub, from, to)) {
      bills.push({ name: sub.name, date, amount: sub.amount });
    }
  }
  for (const bill of data.bills) {
    for (const date of billOccurrencesBetween(bill, from, to)) {
      bills.push({ name: bill.name, date, amount: billCountedAmount(bill, date, data.billPayments) });
    }
  }
  bills.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const billsTotal = round2(bills.reduce((sum, b) => sum + b.amount, 0));

  const cycle = cycleKeyOf(today, s);
  const { start } = cycleBounds(cycle, s);
  let flow = 0;
  for (const tx of data.transactions) {
    if (tx.date < start || tx.date > today) continue;
    // savings/investments also leave the spendable pot
    flow += tx.type === 'income' ? tx.amount : -tx.amount;
  }
  let pastVirtual = 0;
  for (const sub of data.subscriptions) {
    pastVirtual += occurrencesBetween(sub, start, today).length * sub.amount;
  }
  for (const bill of data.bills) {
    for (const date of billOccurrencesBetween(bill, start, today)) {
      pastVirtual += billCountedAmount(bill, date, data.billPayments);
    }
  }
  const planDue = planExpensesForMonth(data, cycle);

  const leftUntilPayday = round2(flow - pastVirtual - planDue - billsTotal);
  const buffer = Math.max(0, s.safetyBuffer);
  const status: VerdictStatus =
    leftUntilPayday < 0 ? 'trouble' : leftUntilPayday < buffer ? 'tight' : 'okay';

  return {
    payday,
    daysUntil: Math.max(0, daysBetween(today, payday.date)),
    bills,
    billsTotal,
    leftUntilPayday,
    buffer,
    status,
  };
}
