export type TransactionType = 'income' | 'expense' | 'saving' | 'investment';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  description: string;
  categoryId: string | null; // expenses only
  account: string | null; // savings & investments only
  amount: number; // always positive; sign is implied by type
}

export interface Category {
  id: string;
  name: string;
  budget: number; // monthly budget
  sortOrder: number;
}

export interface Settings {
  savingsTarget: number;
  investmentsTarget: number;
  startingNetWorth: number;
  /** cushion the "okay until payday" verdict must stay above before it warns */
  safetyBuffer: number;
  /** day of month the salary arrives; cycles run salary date → day before next */
  salaryDay: number;
  weekendRule: 'previous' | 'exact' | 'next';
  currency: string; // ISO 4217, e.g. EUR
  locale: string; // BCP 47, e.g. nl-NL
}

export const DEFAULT_SETTINGS: Settings = {
  savingsTarget: 0,
  investmentsTarget: 0,
  startingNetWorth: 0,
  safetyBuffer: 100,
  salaryDay: 1,
  weekendRule: 'exact',
  currency: 'EUR',
  locale: 'nl-NL',
};

export type BillingFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  categoryId: string | null;
  description: string;
  firstBillDate: string; // YYYY-MM-DD anchor; subsequent bills step by frequency
  frequency: BillingFrequency;
  endsOn: string | null; // set when disabled so past cycles keep the expense
}

export interface ExpenseTemplate {
  id: string;
  name: string;
  amount: number;
  categoryId: string | null;
  description: string;
  frequency: BillingFrequency; // informational
  defaultDay: number | null; // pre-fills the date field (clamped), else today
}

export type IncomeFrequency = 'monthly' | 'weekly' | 'biweekly' | 'four_weekly' | 'custom';

export interface RecurringIncome {
  id: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  /** first/reference payout; monthly repeats its day-of-month (clamped) */
  anchorDate: string; // YYYY-MM-DD
  /** custom frequency only: payout every N days from the anchor */
  intervalDays: number | null;
  weekendRule: 'previous' | 'exact' | 'next';
  endsOn: string | null;
}

export type BillFrequency =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'four_weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom';

export interface Bill {
  id: string;
  name: string;
  amount: number; // expected/estimated amount per occurrence
  categoryId: string | null;
  description: string;
  frequency: BillFrequency;
  /** first/reference due date; 'once' => the single due date */
  anchorDate: string; // YYYY-MM-DD
  /** custom frequency only: due every N days from the anchor */
  intervalDays: number | null;
  weekendRule: 'previous' | 'exact' | 'next';
  endsOn: string | null;
  /** true => amount is an estimate (utilities ~€80) the user may adjust per occurrence */
  estimated: boolean;
}

export interface BillPayment {
  billId: string;
  date: string; // YYYY-MM-DD occurrence date
  amount: number; // actual amount; overrides the estimate for that occurrence
}

export interface PaymentPlan {
  id: string;
  name: string;
  totalAmount: number;
  installment: number;
  startMonth: string; // YYYY-MM
}

export interface PlanPayment {
  planId: string;
  month: string; // YYYY-MM
  amountPaid: number; // override of the scheduled installment (0 = skipped)
}

export interface AppData {
  transactions: Transaction[];
  categories: Category[];
  settings: Settings;
  plans: PaymentPlan[];
  planPayments: PlanPayment[];
  subscriptions: Subscription[];
  templates: ExpenseTemplate[];
  incomes: RecurringIncome[];
  bills: Bill[];
  billPayments: BillPayment[];
  auth: { enabled: boolean };
}
