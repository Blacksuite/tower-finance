import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  type AppData,
  type Bill,
  type BillPayment,
  type Category,
  type ExpenseTemplate,
  type PaymentPlan,
  type PlanPayment,
  type RecurringIncome,
  type Settings,
  type Subscription,
  type Transaction,
} from '../shared/types';

export const SEED_CATEGORIES = [
  'Housing', 'Groceries', 'Utilities', 'Transport', 'Insurance', 'Subscriptions',
  'Dining Out', 'Entertainment', 'Shopping', 'Health', 'Travel', 'Other',
];

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
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      category_id TEXT REFERENCES categories(id),
      description TEXT NOT NULL DEFAULT '',
      first_bill_date TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','yearly')),
      ends_on TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      category_id TEXT REFERENCES categories(id),
      description TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','yearly')),
      default_day INTEGER
    );
    CREATE TABLE IF NOT EXISTS incomes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      frequency TEXT NOT NULL CHECK (frequency IN ('monthly','weekly','biweekly','four_weekly','custom')),
      anchor_date TEXT NOT NULL,
      interval_days INTEGER,
      weekend_rule TEXT NOT NULL DEFAULT 'exact' CHECK (weekend_rule IN ('previous','exact','next')),
      ends_on TEXT
    );
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      category_id TEXT REFERENCES categories(id),
      description TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL CHECK (frequency IN ('once','weekly','biweekly','four_weekly','monthly','quarterly','yearly','custom')),
      anchor_date TEXT NOT NULL,
      interval_days INTEGER,
      weekend_rule TEXT NOT NULL DEFAULT 'exact' CHECK (weekend_rule IN ('previous','exact','next')),
      ends_on TEXT,
      estimated INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bill_payments (
      bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      PRIMARY KEY (bill_id, date)
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

type SubRow = {
  id: string; name: string; amount: number; category_id: string | null;
  description: string; first_bill_date: string; frequency: Subscription['frequency']; ends_on: string | null;
};
type TemplateRow = {
  id: string; name: string; amount: number; category_id: string | null;
  description: string; frequency: ExpenseTemplate['frequency']; default_day: number | null;
};

const toSub = (r: SubRow): Subscription => ({
  id: r.id, name: r.name, amount: r.amount, categoryId: r.category_id,
  description: r.description, firstBillDate: r.first_bill_date,
  frequency: r.frequency, endsOn: r.ends_on,
});
const toTemplate = (r: TemplateRow): ExpenseTemplate => ({
  id: r.id, name: r.name, amount: r.amount, categoryId: r.category_id,
  description: r.description, frequency: r.frequency, defaultDay: r.default_day,
});

type IncomeRow = {
  id: string; name: string; amount: number; frequency: RecurringIncome['frequency'];
  anchor_date: string; interval_days: number | null;
  weekend_rule: RecurringIncome['weekendRule']; ends_on: string | null;
};

const toIncome = (r: IncomeRow): RecurringIncome => ({
  id: r.id, name: r.name, amount: r.amount, frequency: r.frequency,
  anchorDate: r.anchor_date, intervalDays: r.interval_days,
  weekendRule: r.weekend_rule, endsOn: r.ends_on,
});

type BillRow = {
  id: string; name: string; amount: number; category_id: string | null;
  description: string; frequency: Bill['frequency']; anchor_date: string;
  interval_days: number | null; weekend_rule: Bill['weekendRule'];
  ends_on: string | null; estimated: number;
};
type BillPaymentRow = { bill_id: string; date: string; amount: number };

const toBill = (r: BillRow): Bill => ({
  id: r.id, name: r.name, amount: r.amount, categoryId: r.category_id,
  description: r.description, frequency: r.frequency, anchorDate: r.anchor_date,
  intervalDays: r.interval_days, weekendRule: r.weekend_rule,
  endsOn: r.ends_on, estimated: r.estimated !== 0,
});
const toBillPayment = (r: BillPaymentRow): BillPayment => ({
  billId: r.bill_id, date: r.date, amount: r.amount,
});

export function readSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s: Settings = { ...DEFAULT_SETTINGS };
  const rec = s as unknown as Record<string, number | string>;
  for (const r of rows) {
    if (!(r.key in s)) continue;
    rec[r.key] = typeof rec[r.key] === 'number' ? Number(r.value) || 0 : r.value;
  }
  return s;
}

// --- auth (stored outside Settings; never exported or sent to the client) ----

export function readAuthHash(db: DB): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'auth_hash'").get() as
    | { value: string }
    | undefined;
  return row?.value || null;
}

// --- sessions (token hashes only; raw tokens live in httpOnly cookies) -------

export function insertSession(db: DB, tokenHash: string) {
  // opportunistic pruning keeps the table tiny
  db.prepare("DELETE FROM sessions WHERE created_at < datetime('now', '-180 day')").run();
  db.prepare(
    "INSERT OR REPLACE INTO sessions (token_hash, created_at, last_seen) VALUES (?, datetime('now'), datetime('now'))",
  ).run(tokenHash);
}

export function sessionExists(db: DB, tokenHash: string): boolean {
  // expiry is enforced at lookup too — a session must not outlive its cookie
  // just because nobody logged in again to trigger the pruning above
  const row = db
    .prepare("SELECT 1 FROM sessions WHERE token_hash = ? AND created_at >= datetime('now', '-180 day')")
    .get(tokenHash);
  if (row) db.prepare("UPDATE sessions SET last_seen = datetime('now') WHERE token_hash = ?").run(tokenHash);
  return !!row;
}

export function deleteSession(db: DB, tokenHash: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function clearSessions(db: DB) {
  db.prepare('DELETE FROM sessions').run();
}

export function writeAuthHash(db: DB, hash: string | null) {
  if (hash === null) db.prepare("DELETE FROM settings WHERE key = 'auth_hash'").run();
  else {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('auth_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(hash);
  }
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
    subscriptions: (db.prepare('SELECT * FROM subscriptions ORDER BY name').all() as SubRow[]).map(toSub),
    templates: (db.prepare('SELECT * FROM templates ORDER BY name').all() as TemplateRow[]).map(toTemplate),
    incomes: (db.prepare('SELECT * FROM incomes ORDER BY name').all() as IncomeRow[]).map(toIncome),
    bills: (db.prepare('SELECT * FROM bills ORDER BY name').all() as BillRow[]).map(toBill),
    billPayments: (db.prepare('SELECT * FROM bill_payments ORDER BY date').all() as BillPaymentRow[]).map(toBillPayment),
    auth: { enabled: readAuthHash(db) !== null },
  };
}

/** Replaces the whole database content (JSON import). Runs in a transaction. */
export function replaceAll(db: DB, data: Omit<AppData, 'auth'>) {
  const run = db.transaction(() => {
    const authHash = readAuthHash(db); // imports must never clobber the password
    db.prepare('DELETE FROM plan_payments').run();
    db.prepare('DELETE FROM plans').run();
    db.prepare('DELETE FROM bill_payments').run();
    db.prepare('DELETE FROM bills').run();
    db.prepare('DELETE FROM subscriptions').run();
    db.prepare('DELETE FROM templates').run();
    db.prepare('DELETE FROM incomes').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM categories').run();
    db.prepare('DELETE FROM settings').run();
    if (authHash) writeAuthHash(db, authHash);

    const insCat = db.prepare('INSERT INTO categories (id, name, budget, sort_order) VALUES (?, ?, ?, ?)');
    for (const c of data.categories) insCat.run(c.id, c.name, c.budget, c.sortOrder);

    const insTx = db.prepare('INSERT INTO transactions (id, date, type, description, category_id, account, amount) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const t of data.transactions) insTx.run(t.id, t.date, t.type, t.description, t.categoryId, t.account, t.amount);

    const insPlan = db.prepare('INSERT INTO plans (id, name, total_amount, installment, start_month) VALUES (?, ?, ?, ?, ?)');
    for (const p of data.plans) insPlan.run(p.id, p.name, p.totalAmount, p.installment, p.startMonth);

    const insPay = db.prepare('INSERT INTO plan_payments (plan_id, month, amount_paid) VALUES (?, ?, ?)');
    for (const p of data.planPayments) insPay.run(p.planId, p.month, p.amountPaid);

    const insSub = db.prepare('INSERT INTO subscriptions (id, name, amount, category_id, description, first_bill_date, frequency, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of data.subscriptions) insSub.run(s.id, s.name, s.amount, s.categoryId, s.description, s.firstBillDate, s.frequency, s.endsOn);

    const insTpl = db.prepare('INSERT INTO templates (id, name, amount, category_id, description, frequency, default_day) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const t of data.templates) insTpl.run(t.id, t.name, t.amount, t.categoryId, t.description, t.frequency, t.defaultDay);

    const insInc = db.prepare('INSERT INTO incomes (id, name, amount, frequency, anchor_date, interval_days, weekend_rule, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const i of data.incomes) insInc.run(i.id, i.name, i.amount, i.frequency, i.anchorDate, i.intervalDays, i.weekendRule, i.endsOn);

    const insBill = db.prepare('INSERT INTO bills (id, name, amount, category_id, description, frequency, anchor_date, interval_days, weekend_rule, ends_on, estimated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const b of data.bills) insBill.run(b.id, b.name, b.amount, b.categoryId, b.description, b.frequency, b.anchorDate, b.intervalDays, b.weekendRule, b.endsOn, b.estimated ? 1 : 0);

    const insBillPay = db.prepare('INSERT INTO bill_payments (bill_id, date, amount) VALUES (?, ?, ?)');
    for (const p of data.billPayments) insBillPay.run(p.billId, p.date, p.amount);

    writeSettings(db, data.settings);
  });
  run();
}
