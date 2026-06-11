import type { TransactionType } from './types';

export const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  saving: 'Saving',
  investment: 'Investment',
};

export const TYPE_PLURALS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expenses',
  saving: 'Savings',
  investment: 'Investments',
};

export const TYPE_ORDER: TransactionType[] = ['income', 'expense', 'saving', 'investment'];

/** Sign shown before a transaction amount, per type. */
export const TYPE_SIGNS: Record<TransactionType, '+' | '-'> = {
  income: '+',
  expense: '-',
  saving: '-',
  investment: '-',
};
