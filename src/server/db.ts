import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AppData,
  Category,
  PaymentPlan,
  PlanPayment,
  Settings,
  Transaction,
} from '../shared/types';

export const SEED_CATEGORIES = [
  'Housing', 'Groceries', 'Utilities', 'Transport', 'Insurance', 'Subscriptions',
  'Dining Out', 'Entertainment', 'Shopping', 'Health', 'Travel', 'Other',
];

const DEFAULT_SETTINGS: Settings = {
  savingsTarget: 0,
  investmentsTarget: 0,
  startingNetWorth: 0,
};

export type DB = ReturnType<typeof createDb>;

export function createDb(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      budget REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income','expense','saving','investment')),
      description TEXT NOT NULL DEFAULT '',
      category_id TEXT REFERENCES categories(id),
      account TEXT,
      amount REAL NOT NULL CHECK (amount > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      total_amount REAL NOT NULL CHECK (total_amount > 0),
      installment REAL NOT NULL CHECK (installment > 0),
      start_month TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plan_payments (
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      amount_paid REAL NOT NULL CHECK (amount_paid >= 0),
      PRIMARY KEY (plan_id, month)
    );
  `);

  const catCount = (db.prepare('SELECT COUNT(*) n FROM categories').get() as { n: number }).n;
  if (catCount === 0) {
    const ins = db.prepare('INSERT INTO categories (id, name, budget, sort_order) VALUES (?, ?, 0, ?)');
    const seed = db.transaction(() => {
      SEED_CATEGORIES.forEach((name, i) => ins.run(randomUUID(), name, i));
    });
    seed();
  }

  return db;
}

// --- row mapping -----------------------------------------------------------

type TxRow = {
  id: string; date: string; type: Transaction['type']; description: string;
  category_id: string | null; account: string | null; amount: number;
};
type CatRow = { id: string; name: string; budget: number; sort_order: number };
type PlanRow = { id: string; name: string; total_amount: number; installment: number; start_month: string };
type PayRow = { plan_id: string; month: string; amount_paid: number };

const toTx = (r: TxRow): Transaction => ({
  id: r.id, date: r.date, type: r.type, description: r.description,
  categoryId: r.category_id, account: r.account, amount: r.amount,
});
const toCat = (r: CatRow): Category => ({
  id: r.id, name: r.name, budget: r.budget, sortOrder: r.sort_order,
});
const toPlan = (r: PlanRow): PaymentPlan => ({
  id: r.id, name: r.name, totalAmount: r.total_amount,
  installment: r.installment, startMonth: r.start_month,
});
const toPay = (r: PayRow): PlanPayment => ({
  planId: r.plan_id, month: r.month, amountPaid: r.amount_paid,
});

export function readSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in s) s[r.key as keyof Settings] = Number(r.value) || 0;
  }
  return s;
}

export function writeSettings(db: DB, patch: Partial<Settings>) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) up.run(k, String(v));
}

export function readAll(db: DB): AppData {
  return {
    transactions: (db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all() as TxRow[]).map(toTx),
    categories: (db.prepare('SELECT * FROM categories ORDER BY sort_order').all() as CatRow[]).map(toCat),
    settings: readSettings(db),
    plans: (db.prepare('SELECT * FROM plans ORDER BY start_month').all() as PlanRow[]).map(toPlan),
    planPayments: (db.prepare('SELECT * FROM plan_payments ORDER BY month').all() as PayRow[]).map(toPay),
  };
}

/** Replaces the whole database content (JSON import). Runs in a transaction. */
export function replaceAll(db: DB, data: AppData) {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM plan_payments').run();
    db.prepare('DELETE FROM plans').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM categories').run();
    db.prepare('DELETE FROM settings').run();

    const insCat = db.prepare('INSERT INTO categories (id, name, budget, sort_order) VALUES (?, ?, ?, ?)');
    for (const c of data.categories) insCat.run(c.id, c.name, c.budget, c.sortOrder);

    const insTx = db.prepare('INSERT INTO transactions (id, date, type, description, category_id, account, amount) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const t of data.transactions) insTx.run(t.id, t.date, t.type, t.description, t.categoryId, t.account, t.amount);

    const insPlan = db.prepare('INSERT INTO plans (id, name, total_amount, installment, start_month) VALUES (?, ?, ?, ?, ?)');
    for (const p of data.plans) insPlan.run(p.id, p.name, p.totalAmount, p.installment, p.startMonth);

    const insPay = db.prepare('INSERT INTO plan_payments (plan_id, month, amount_paid) VALUES (?, ?, ?)');
    for (const p of data.planPayments) insPay.run(p.planId, p.month, p.amountPaid);

    writeSettings(db, data.settings);
  });
  run();
}
