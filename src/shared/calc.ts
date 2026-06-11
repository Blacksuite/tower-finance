// All derived numbers in the app come from this module. Pure functions over
// raw rows; every division is guarded so empty months can never produce NaN.
import type {
  AppData,
  Category,
  PaymentPlan,
  PlanPayment,
  Transaction,
} from './types';

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
  expenses: number; // transaction expenses + counted plan payments
  transactionExpenses: number;
  planExpenses: number;
  saved: number;
  invested: number;
  leftOver: number;
  savingsRate: number; // (saved + invested) / income, 0 when income is 0
}

function sumByType(transactions: Transaction[], months: Set<string>) {
  const t = { income: 0, expense: 0, saving: 0, investment: 0 };
  for (const tx of transactions) {
    if (months.has(monthOf(tx.date))) t[tx.type] += tx.amount;
  }
  return t;
}

export function summarize(data: AppData, months: string[]): Summary {
  const set = new Set(months);
  const t = sumByType(data.transactions, set);
  let planExpenses = 0;
  for (const m of months) planExpenses += planExpensesForMonth(data, m);
  const expenses = round2(t.expense + planExpenses);
  const income = round2(t.income);
  const saved = round2(t.saving);
  const invested = round2(t.investment);
  return {
    income,
    expenses,
    transactionExpenses: round2(t.expense),
    planExpenses: round2(planExpenses),
    saved,
    invested,
    leftOver: round2(income - expenses - saved - invested),
    savingsRate: income > EPS ? (saved + invested) / income : 0,
  };
}

export const monthlySummary = (data: AppData, month: string): Summary =>
  summarize(data, [month]);

// ---------------------------------------------------------------------------
// Months with data / active months
// ---------------------------------------------------------------------------

/** Every month that has any data (transactions or counted plan payments), ascending. */
export function monthsWithData(data: AppData, currentMonth: string): string[] {
  const set = new Set<string>();
  for (const tx of data.transactions) set.add(monthOf(tx.date));
  for (const st of planStates(data, currentMonth)) {
    for (const r of st.rows) if (r.counted > EPS) set.add(r.month);
  }
  return [...set].sort();
}

/** Continuous month axis from the first data month through max(last data, current). */
export function monthAxis(data: AppData, currentMonth: string): string[] {
  const months = monthsWithData(data, currentMonth);
  if (months.length === 0) return [currentMonth];
  const last = months[months.length - 1] > currentMonth ? months[months.length - 1] : currentMonth;
  return monthRange(months[0], last);
}

/** Months in `year` (through `currentMonth`) that have any income or expense recorded. */
export function activeMonths(data: AppData, year: string, currentMonth: string): string[] {
  const set = new Set<string>();
  for (const tx of data.transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const m = monthOf(tx.date);
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

function categoryActuals(data: AppData, months: Set<string>): Map<string, number> {
  const map = new Map<string, number>();
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || !months.has(monthOf(tx.date))) continue;
    const key = tx.categoryId ?? '';
    map.set(key, (map.get(key) ?? 0) + tx.amount);
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
): BudgetRow[] {
  const set = new Set(months);
  const actuals = categoryActuals(data, set);
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
  const t = sumByType(data.transactions, set);
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

export function budgetVsActualMonth(data: AppData, month: string): BudgetRow[] {
  return budgetVsActual(data, [month], 1);
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

export function netWorthSeries(data: AppData, currentMonth: string): NetWorthPoint[] {
  let value = data.settings.startingNetWorth;
  // future scheduled plan installments are not "paid", so the series stops at
  // the current real month rather than projecting forward
  return monthAxis(data, currentMonth)
    .filter((m) => m <= currentMonth)
    .map((month) => {
      const s = monthlySummary(data, month);
      value = round2(value + s.income - s.expenses);
      return { month, value };
    });
}

// ---------------------------------------------------------------------------
// Top spending categories
// ---------------------------------------------------------------------------

export interface CategorySpend {
  id: string;
  name: string;
  amount: number;
}

export function topCategories(data: AppData, months: string[]): CategorySpend[] {
  const actuals = categoryActuals(data, new Set(months));
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
