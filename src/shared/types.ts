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
}
