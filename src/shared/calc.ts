// All derived numbers in the app come from this module. Pure functions over
// raw rows; every division is guarded so empty months can never produce NaN.
import { billExpensesForCycle } from './bills';
import { cycleKeyOf, type CycleSettings } from './cycles';
import { subExpensesForCycle } from './recurring';
import type {
  AppData,
  Category,
  PaymentPlan,
  PlanPayment,
  Settings,
  Transaction,
} from './types';

/**
 * Cycle label (YYYY-MM) a transaction date belongs to. With default settings
 * (salaryDay 1, exact) this is simply the calendar month.
 */
export const keyOf = (date: string, s: CycleSettings): string => cycleKeyOf(date, s);

export const currentCycleKey = (s: Settings, todayDate: string): string =>
  cycleKeyOf(todayDate, s);

const EPS = 0.005; // amounts are euros with 2 decimals
const MAX_SCHEDULE_MONTHS = 1200;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const monthOf = (date: string): string => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length <= MAX_SCHEDULE_MONTHS; m = addMonths(m, 1)) out.push(m);
  return out;
}

// ---------------------------------------------------------------------------
// Payment plan cascade
// ---------------------------------------------------------------------------

export interface ScheduleRow {
  month: string;
  scheduled: number; // installment capped at remaining balance before this month
  override: number | null; // user-entered actual amount, if any (0 = skipped)
  counted: number; // override ?? scheduled, capped at remaining
  remainingAfter: number;
}

export interface PlanState {
  plan: PaymentPlan;
  rows: ScheduleRow[];
  paidToDate: number; // counted amounts for months <= currentMonth
  remaining: number; // totalAmount - paidToDate
  status: 'active' | 'paid_off';
  monthsLeft: number; // scheduled months strictly after currentMonth
  endMonth: string | null; // month the plan reaches zero balance
}

export function planSchedule(
  plan: PaymentPlan,
  payments: PlanPayment[],
  currentMonth: string,
): PlanState {
  const overrides = new Map<string, number>();
  for (const p of payments) if (p.planId === plan.id) overrides.set(p.month, p.amountPaid);

  const rows: ScheduleRow[] = [];
  let remaining = round2(plan.totalAmount);
  let month = plan.startMonth;
  // Months with an override of 0 keep the plan open without progress, so the
  // loop is bounded by iteration count, not only by the balance.
  for (let i = 0; remaining > EPS && i < MAX_SCHEDULE_MONTHS; i++) {
    const scheduled = round2(Math.min(plan.installment, remaining));
    const override = overrides.has(month) ? overrides.get(month)! : null;
    const counted = round2(Math.min(override ?? scheduled, remaining));
    remaining = round2(remaining - counted);
    rows.push({ month, scheduled, override, counted, remainingAfter: remaining });
    month = addMonths(month, 1);
  }

  let paidToDate = 0;
  for (const r of rows) if (r.month <= currentMonth) paidToDate += r.counted;
  paidToDate = round2(paidToDate);
  const remainingNow = round2(plan.totalAmount - paidToDate);
  return {
    plan,
    rows,
    paidToDate,
    remaining: remainingNow,
    status: remainingNow <= EPS ? 'paid_off' : 'active',
    monthsLeft: rows.filter((r) => r.month > currentMonth).length,
    endMonth: rows.length ? rows[rows.length - 1].month : null,
  };
}

export function planStates(data: AppData, currentMonth: string): PlanState[] {
  return data.plans.map((p) => planSchedule(p, data.planPayments, currentMonth));
}

/** Counted plan payments that land in `month`, summed across all plans. */
export function planExpensesForMonth(data: AppData, month: string): number {
  let sum = 0;
  for (const plan of data.plans) {
    const st = planSchedule(plan, data.planPayments, month);
    const row = st.rows.find((r) => r.month === month);
    if (row) sum += row.counted;
  }
  return round2(sum);
}

// ---------------------------------------------------------------------------
// Monthly summary
// ---------------------------------------------------------------------------

export interface Summary {
  income: number;
  expenses: number; // transaction expenses + plan payments + subscriptions + bills
  transactionExpenses: number;
  planExpenses: number;
  subscriptionExpenses: number;
  billExpenses: number;
  saved: number;
  invested: number;
  leftOver: number;
  savingsRate: number; // (saved + invested) / income, 0 when income is 0
}

function sumByType(transactions: Transaction[], labels: Set<string>, s: CycleSettings) {
  const t = { income: 0, expense: 0, saving: 0, investment: 0 };
  for (const tx of transactions) {
    if (labels.has(keyOf(tx.date, s))) t[tx.type] += tx.amount;
  }
  return t;
}

/**
 * `bucket` selects how dates map to YYYY-MM keys: the user's salary cycles
 * (default) or CALENDAR for calendar-month reporting. Plan installments are
 * keyed YYYY-MM natively, so they are identical under both bucketings.
 */
export function summarize(data: AppData, months: string[], bucket?: CycleSettings): Summary {
  const s = bucket ?? data.settings;
  const set = new Set(months);
  const t = sumByType(data.transactions, set, s);
  let planExpenses = 0;
  let subscriptionExpenses = 0;
  let billExpenses = 0;
  for (const m of months) {
    planExpenses += planExpensesForMonth(data, m);
    subscriptionExpenses += subExpensesForCycle(data.subscriptions, m, s).total;
    billExpenses += billExpensesForCycle(data.bills, data.billPayments, m, s).total;
  }
  const expenses = round2(t.expense + planExpenses + subscriptionExpenses + billExpenses);
  const income = round2(t.income);
  const saved = round2(t.saving);
  const invested = round2(t.investment);
  return {
    income,
    expenses,
    transactionExpenses: round2(t.expense),
    planExpenses: round2(planExpenses),
    subscriptionExpenses: round2(subscriptionExpenses),
    billExpenses: round2(billExpenses),
    saved,
    invested,
    leftOver: round2(income - expenses - saved - invested),
    savingsRate: income > EPS ? (saved + invested) / income : 0,
  };
}

export const monthlySummary = (data: AppData, month: string, bucket?: CycleSettings): Summary =>
  summarize(data, [month], bucket);

// ---------------------------------------------------------------------------
// Months with data / active months
// ---------------------------------------------------------------------------

/** Every cycle that has any data (transactions, plan payments, subscriptions), ascending. */
export function monthsWithData(data: AppData, currentMonth: string, bucket?: CycleSettings): string[] {
  const s = bucket ?? data.settings;
  const set = new Set<string>();
  for (const tx of data.transactions) set.add(keyOf(tx.date, s));
  for (const st of planStates(data, currentMonth)) {
    for (const r of st.rows) if (r.counted > EPS) set.add(r.month);
  }
  for (const sub of data.subscriptions) {
    // subscriptions never extend the axis into the future beyond now
    let label = keyOf(sub.firstBillDate, s);
    const stop = sub.endsOn ? keyOf(sub.endsOn, s) : currentMonth;
    for (let i = 0; label <= stop && label <= currentMonth && i < MAX_SCHEDULE_MONTHS; i++) {
      if (subExpensesForCycle([sub], label, s).total > EPS) set.add(label);
      label = addMonths(label, 1);
    }
  }
  for (const bill of data.bills) {
    // bills, like subscriptions, never extend the axis past the current cycle
    let label = keyOf(bill.anchorDate, s);
    const stop = bill.endsOn ? keyOf(bill.endsOn, s) : currentMonth;
    for (let i = 0; label <= stop && label <= currentMonth && i < MAX_SCHEDULE_MONTHS; i++) {
      if (billExpensesForCycle([bill], data.billPayments, label, s).total > EPS) set.add(label);
      label = addMonths(label, 1);
    }
  }
  return [...set].sort();
}

/** Continuous month axis from the first data month through max(last data, current). */
export function monthAxis(data: AppData, currentMonth: string, bucket?: CycleSettings): string[] {
  const months = monthsWithData(data, currentMonth, bucket);
  if (months.length === 0) return [currentMonth];
  const last = months[months.length - 1] > currentMonth ? months[months.length - 1] : currentMonth;
  return monthRange(months[0], last);
}

/** Cycles in `year` (through `currentMonth`) that have any income or expense recorded. */
export function activeMonths(data: AppData, year: string, currentMonth: string): string[] {
  const set = new Set<string>();
  for (const tx of data.transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const m = keyOf(tx.date, data.settings);
    if (m.startsWith(year) && m <= currentMonth) set.add(m);
  }
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// Budget vs actual
// ---------------------------------------------------------------------------

export interface BudgetRow {
  id: string;
  name: string;
  kind: 'expense' | 'saving' | 'investment';
  budget: number;
  actual: number;
  /** expense: budget - actual (negative = overspent). saving/investment: actual - target (positive = good). */
  diff: number;
  /** actual / budget, 0 when budget is 0 */
  pct: number;
}

function categoryActuals(data: AppData, months: Set<string>, bucket?: CycleSettings): Map<string, number> {
  const s = bucket ?? data.settings;
  const map = new Map<string, number>();
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || !months.has(keyOf(tx.date, s))) continue;
    const key = tx.categoryId ?? '';
    map.set(key, (map.get(key) ?? 0) + tx.amount);
  }
  for (const m of months) {
    for (const [key, amount] of subExpensesForCycle(data.subscriptions, m, s).byCategory) {
      map.set(key, (map.get(key) ?? 0) + amount);
    }
    for (const [key, amount] of billExpensesForCycle(data.bills, data.billPayments, m, s).byCategory) {
      map.set(key, (map.get(key) ?? 0) + amount);
    }
  }
  return map;
}

/**
 * Budget vs actual for a set of months. `multiplier` scales the monthly
 * budgets/targets: 1 for a single month, activeMonths().length for YTD.
 */
export function budgetVsActual(
  data: AppData,
  months: string[],
  multiplier: number,
  bucket?: CycleSettings,
): BudgetRow[] {
  const set = new Set(months);
  const actuals = categoryActuals(data, set, bucket);
  const rows: BudgetRow[] = [];
  const sorted = [...data.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const cat of sorted) {
    const budget = round2(cat.budget * multiplier);
    const actual = round2(actuals.get(cat.id) ?? 0);
    rows.push({
      id: cat.id,
      name: cat.name,
      kind: 'expense',
      budget,
      actual,
      diff: round2(budget - actual),
      pct: budget > EPS ? actual / budget : actual > EPS ? Infinity : 0,
    });
  }
  const t = sumByType(data.transactions, set, bucket ?? data.settings);
  const targets: Array<['saving' | 'investment', string, number, number]> = [
    ['saving', 'Savings', data.settings.savingsTarget, t.saving],
    ['investment', 'Investments', data.settings.investmentsTarget, t.investment],
  ];
  for (const [kind, name, target, actualRaw] of targets) {
    const budget = round2(target * multiplier);
    const actual = round2(actualRaw);
    rows.push({
      id: kind,
      name,
      kind,
      budget,
      actual,
      diff: round2(actual - budget),
      pct: budget > EPS ? actual / budget : actual > EPS ? Infinity : 0,
    });
  }
  return rows;
}

export function budgetVsActualMonth(data: AppData, month: string, bucket?: CycleSettings): BudgetRow[] {
  return budgetVsActual(data, [month], 1, bucket);
}

export function budgetVsActualYtd(data: AppData, currentMonth: string): BudgetRow[] {
  const year = currentMonth.slice(0, 4);
  const active = activeMonths(data, year, currentMonth);
  const months = monthRange(`${year}-01`, currentMonth);
  return budgetVsActual(data, months, active.length);
}

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

export interface NetWorthPoint {
  month: string;
  value: number;
}

/** Outstanding plan balance at the end of cycle `label` (0 before a plan starts). */
function liabilitiesAt(data: AppData, label: string): number {
  let sum = 0;
  for (const plan of data.plans) {
    if (label < plan.startMonth) continue;
    const st = planSchedule(plan, data.planPayments, label);
    sum += st.remaining;
  }
  return round2(sum);
}

/**
 * Net worth per cycle: starting net worth + cumulative cash flow, minus the
 * outstanding payment-plan balance at that point (plans count as liabilities).
 */
export function netWorthSeries(data: AppData, currentMonth: string, bucket?: CycleSettings): NetWorthPoint[] {
  let cash = data.settings.startingNetWorth;
  // future scheduled plan installments are not "paid", so the series stops at
  // the current real month rather than projecting forward
  return monthAxis(data, currentMonth, bucket)
    .filter((m) => m <= currentMonth)
    .map((month) => {
      const s = monthlySummary(data, month, bucket);
      cash = round2(cash + s.income - s.expenses);
      return { month, value: round2(cash - liabilitiesAt(data, month)) };
    });
}

export interface NetWorthBreakdown {
  total: number;
  cash: number; // starting net worth + cumulative cash flow − savings − investments
  savings: { account: string; amount: number }[];
  investments: { account: string; amount: number }[];
  liabilities: { name: string; amount: number }[];
}

export function netWorthBreakdown(data: AppData, currentMonth: string): NetWorthBreakdown {
  const labels = monthAxis(data, currentMonth).filter((m) => m <= currentMonth);
  const all = summarize(data, labels);
  const grossCash = round2(data.settings.startingNetWorth + all.income - all.expenses);

  const byAccount = (type: 'saving' | 'investment') => {
    const map = new Map<string, number>();
    for (const tx of data.transactions) {
      if (tx.type !== type) continue;
      const key = tx.account || 'Unassigned';
      map.set(key, round2((map.get(key) ?? 0) + tx.amount));
    }
    return [...map.entries()]
      .map(([account, amount]) => ({ account, amount }))
      .sort((a, b) => b.amount - a.amount);
  };

  const savings = byAccount('saving');
  const investments = byAccount('investment');
  const savedTotal = savings.reduce((a, x) => a + x.amount, 0);
  const investedTotal = investments.reduce((a, x) => a + x.amount, 0);

  const liabilities = data.plans
    .map((p) => ({ name: p.name, amount: planSchedule(p, data.planPayments, currentMonth).remaining }))
    .filter((l) => l.amount > EPS)
    .sort((a, b) => b.amount - a.amount);
  const liabilityTotal = liabilities.reduce((a, x) => a + x.amount, 0);

  // grossCash (cash-basis wealth) already contains money parked in savings and
  // investments — the cash row is what's left after splitting those out.
  return {
    total: round2(grossCash - liabilityTotal),
    cash: round2(grossCash - savedTotal - investedTotal),
    savings,
    investments,
    liabilities,
  };
}

export interface PlanAggregate {
  total: number;
  paid: number;
  remaining: number;
  progress: number; // 0..1
  active: number; // number of active plans
}

export function planAggregate(data: AppData, currentMonth: string): PlanAggregate {
  let total = 0;
  let paid = 0;
  let active = 0;
  for (const st of planStates(data, currentMonth)) {
    total += st.plan.totalAmount;
    paid += st.paidToDate;
    if (st.status === 'active') active++;
  }
  return {
    total: round2(total),
    paid: round2(paid),
    remaining: round2(total - paid),
    progress: total > EPS ? paid / total : 0,
    active,
  };
}

// ---------------------------------------------------------------------------
// Top spending categories
// ---------------------------------------------------------------------------

export interface CategorySpend {
  id: string;
  name: string;
  amount: number;
}

export function topCategories(data: AppData, months: string[], bucket?: CycleSettings): CategorySpend[] {
  const actuals = categoryActuals(data, new Set(months), bucket);
  const byId = new Map(data.categories.map((c) => [c.id, c] as [string, Category]));
  const out: CategorySpend[] = [];
  for (const [id, amount] of actuals) {
    if (amount <= EPS) continue;
    out.push({ id, name: byId.get(id)?.name ?? 'Uncategorized', amount: round2(amount) });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Dashboard ranges
// ---------------------------------------------------------------------------

export type DashboardRange = 'month' | 'ytd' | 'all';

export function rangeMonths(data: AppData, range: DashboardRange, currentMonth: string): string[] {
  if (range === 'month') return [currentMonth];
  if (range === 'ytd') return monthRange(`${currentMonth.slice(0, 4)}-01`, currentMonth);
  const axis = monthAxis(data, currentMonth);
  return axis.filter((m) => m <= currentMonth);
}
