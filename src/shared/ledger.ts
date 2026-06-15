// The ledger view = real transactions + the virtual expenses that never become
// transactions (subscription charges, bill occurrences, plan installments). Used
// by History so the list reconciles with the expense totals shown everywhere
// else. Virtual rows are read-only — they are managed on their own screens.
import { billCountedAmount, billOccurrencesBetween } from './bills';
import { planStates, round2 } from './calc';
import { cycleBounds } from './cycles';
import { occurrencesBetween } from './recurring';
import type { AppData } from './types';

export type VirtualKind = 'subscription' | 'bill' | 'plan';

export interface VirtualExpense {
  id: string; // stable synthetic id (source + date)
  date: string; // YYYY-MM-DD
  type: 'expense';
  description: string;
  categoryId: string | null;
  account: null;
  amount: number;
  /** marks a computed row and points at the screen that owns it */
  source: { kind: VirtualKind; sourceId: string };
}

/**
 * Computed expense occurrences (subscriptions, bills, plan installments) whose
 * date falls in [from, to]. Plan installments are dated at the start of their
 * cycle (the payday that opens it), matching the forecast.
 */
export function virtualExpensesBetween(
  data: AppData,
  from: string,
  to: string,
  currentCycle: string,
): VirtualExpense[] {
  const out: VirtualExpense[] = [];

  for (const sub of data.subscriptions) {
    for (const date of occurrencesBetween(sub, from, to)) {
      out.push({
        id: `sub:${sub.id}:${date}`,
        date,
        type: 'expense',
        description: sub.name,
        categoryId: sub.categoryId,
        account: null,
        amount: round2(sub.amount),
        source: { kind: 'subscription', sourceId: sub.id },
      });
    }
  }

  for (const bill of data.bills) {
    for (const date of billOccurrencesBetween(bill, from, to)) {
      out.push({
        id: `bill:${bill.id}:${date}`,
        date,
        type: 'expense',
        description: bill.name,
        categoryId: bill.categoryId,
        account: null,
        amount: billCountedAmount(bill, date, data.billPayments),
        source: { kind: 'bill', sourceId: bill.id },
      });
    }
  }

  for (const st of planStates(data, currentCycle)) {
    for (const row of st.rows) {
      if (row.counted <= 0) continue;
      const date = cycleBounds(row.month, data.settings).start;
      if (date < from || date > to) continue;
      out.push({
        id: `plan:${st.plan.id}:${row.month}`,
        date,
        type: 'expense',
        description: st.plan.name,
        categoryId: null,
        account: null,
        amount: round2(row.counted),
        source: { kind: 'plan', sourceId: st.plan.id },
      });
    }
  }

  return out;
}
