// Projected balance: where is my spendable cash heading over the next 30/60/90
// days? Pure functions over raw rows — no bank sync, no stored projections.
//
// Start balance is the cash component of net worth cut off at *today* (recorded
// flows, subscription charges to date, plan payments through the current
// cycle). Future events then never overlap with it: recurring income payouts
// (+), subscription bills (−) and plan installments (−, due on the payday that
// opens their cycle) from tomorrow onward.
import { planStates, round2 } from './calc';
import { addDays, cycleBounds, cycleKeyOf } from './cycles';
import { paydaysBetween } from './income';
import { occurrencesBetween } from './recurring';
import type { AppData } from './types';

export interface ForecastEvent {
  date: string;
  name: string;
  /** signed: income positive, bills/installments negative */
  amount: number;
  kind: 'income' | 'bill' | 'plan';
}

export interface ForecastPoint {
  date: string;
  balance: number;
}

export interface Forecast {
  startBalance: number;
  /** one point per day: index 0 = today, index N = today + N days */
  points: ForecastPoint[];
  events: ForecastEvent[];
}

/** Estimated spendable cash at the end of `today` (savings/investments excluded). */
export function spendableBalance(data: AppData, today: string): number {
  let cash = data.settings.startingNetWorth;
  for (const tx of data.transactions) {
    if (tx.date > today) continue;
    cash += tx.type === 'income' ? tx.amount : -tx.amount;
  }
  for (const sub of data.subscriptions) {
    cash -= occurrencesBetween(sub, sub.firstBillDate, today).length * sub.amount;
  }
  const cycle = cycleKeyOf(today, data.settings);
  for (const st of planStates(data, cycle)) cash -= st.paidToDate;
  return round2(cash);
}

/** All forecastable events in (today, today + horizonDays], ascending. */
export function forecastEvents(data: AppData, today: string, horizonDays: number): ForecastEvent[] {
  const from = addDays(today, 1);
  const to = addDays(today, horizonDays);
  const events: ForecastEvent[] = [];

  for (const hit of paydaysBetween(data.incomes, from, to)) {
    events.push({ date: hit.date, name: hit.income.name, amount: hit.income.amount, kind: 'income' });
  }
  for (const sub of data.subscriptions) {
    for (const date of occurrencesBetween(sub, from, to)) {
      events.push({ date, name: sub.name, amount: -sub.amount, kind: 'bill' });
    }
  }
  const cycle = cycleKeyOf(today, data.settings);
  for (const st of planStates(data, cycle)) {
    for (const row of st.rows) {
      if (row.month <= cycle || row.counted <= 0) continue;
      const due = cycleBounds(row.month, data.settings).start;
      if (due >= from && due <= to) {
        events.push({ date: due, name: st.plan.name, amount: -row.counted, kind: 'plan' });
      }
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function forecast(data: AppData, today: string, horizonDays: number): Forecast {
  const startBalance = spendableBalance(data, today);
  const events = forecastEvents(data, today, horizonDays);

  const byDate = new Map<string, number>();
  for (const e of events) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amount);

  const points: ForecastPoint[] = [{ date: today, balance: startBalance }];
  let balance = startBalance;
  for (let i = 1; i <= horizonDays; i++) {
    const date = addDays(today, i);
    balance = round2(balance + (byDate.get(date) ?? 0));
    points.push({ date, balance });
  }
  return { startBalance, points, events };
}

/** Balance `days` from today (clamped to the forecast horizon). */
export function balanceAt(f: Forecast, days: number): number {
  const i = Math.max(0, Math.min(days, f.points.length - 1));
  return f.points[i].balance;
}
