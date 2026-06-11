import { Hono } from 'hono';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DB } from './db';
import { readAll, readAuthHash, readSettings, replaceAll, writeAuthHash, writeSettings } from './db';

// --- password hashing ---------------------------------------------------------

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `s1:${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(pw, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function tokenMatches(token: string | undefined, stored: string): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- validation schemas ------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}, 'invalid date');

const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const amount = z.number().finite().positive().max(1e9);

const transactionInput = z
  .object({
    date: isoDate,
    type: z.enum(['income', 'expense', 'saving', 'investment']),
    description: z.string().trim().max(200).default(''),
    categoryId: z.string().nullable().default(null),
    account: z.string().trim().max(100).nullable().default(null),
    amount,
  })
  .transform((t) => ({
    ...t,
    // category applies to expenses only, account to savings/investments only
    categoryId: t.type === 'expense' ? t.categoryId : null,
    account: t.type === 'saving' || t.type === 'investment' ? t.account : null,
  }));

const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  budget: z.number().finite().min(0).max(1e9).default(0),
  sortOrder: z.number().int().min(0).optional(),
});

const planInput = z.object({
  name: z.string().trim().min(1).max(100),
  totalAmount: amount,
  installment: amount,
  startMonth: isoMonth,
});

const paymentInput = z.object({
  amountPaid: z.number().finite().min(0).max(1e9),
});

const settingsInput = z.object({
  savingsTarget: z.number().finite().min(0).max(1e9).optional(),
  investmentsTarget: z.number().finite().min(0).max(1e9).optional(),
  startingNetWorth: z.number().finite().min(-1e9).max(1e9).optional(),
  salaryDay: z.number().int().min(1).max(31).optional(),
  weekendRule: z.enum(['previous', 'exact', 'next']).optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  locale: z.string().min(2).max(20).optional(),
});

const frequency = z.enum(['monthly', 'quarterly', 'yearly']);

const subscriptionInput = z.object({
  name: z.string().trim().min(1).max(100),
  amount,
  categoryId: z.string().nullable().default(null),
  description: z.string().trim().max(200).default(''),
  firstBillDate: isoDate,
  frequency,
  endsOn: isoDate.nullable().default(null),
});

const templateInput = z.object({
  name: z.string().trim().min(1).max(100),
  amount,
  categoryId: z.string().nullable().default(null),
  description: z.string().trim().max(200).default(''),
  frequency: frequency.default('monthly'),
  defaultDay: z.number().int().min(1).max(31).nullable().default(null),
});

const importInput = z.object({
  transactions: z.array(z.object({
    id: z.string().min(1),
    date: isoDate,
    type: z.enum(['income', 'expense', 'saving', 'investment']),
    description: z.string().max(200),
    categoryId: z.string().nullable(),
    account: z.string().nullable(),
    amount,
  })),
  categories: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(60),
    budget: z.number().finite().min(0),
    sortOrder: z.number().int(),
  })),
  settings: z.object({
    savingsTarget: z.number().finite(),
    investmentsTarget: z.number().finite(),
    startingNetWorth: z.number().finite(),
    // optional for backups made before salary cycles existed
    salaryDay: z.number().int().min(1).max(31).default(1),
    weekendRule: z.enum(['previous', 'exact', 'next']).default('exact'),
    currency: z.string().regex(/^[A-Za-z]{3}$/).default('EUR'),
    locale: z.string().min(2).max(20).default('nl-NL'),
  }),
  plans: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    totalAmount: amount,
    installment: amount,
    startMonth: isoMonth,
  })),
  planPayments: z.array(z.object({
    planId: z.string().min(1),
    month: isoMonth,
    amountPaid: z.number().finite().min(0),
  })),
  subscriptions: z.array(subscriptionInput.extend({ id: z.string().min(1) })).default([]),
  templates: z.array(templateInput.extend({ id: z.string().min(1) })).default([]),
});

// --- app ----------------------------------------------------------------------

export function createApp(db: DB) {
  const app = new Hono();
  const api = new Hono();

  // Optional password protection. The session token is the stored hash; it is
  // kept in the DB (settings key auth_hash) and never exported or bootstrapped.
  api.use('*', async (c, next) => {
    const stored = readAuthHash(db);
    if (!stored || c.req.path === '/api/login') return next();
    if (!tokenMatches(c.req.header('x-tower-key'), stored)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  });

  api.post('/login', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    const stored = readAuthHash(db);
    if (!stored) return c.json({ token: null });
    if (typeof body.password === 'string' && verifyPassword(body.password, stored)) {
      return c.json({ token: stored });
    }
    return c.json({ error: 'wrong password' }, 401);
  });

  // enable / change / disable the password (requires a valid session when enabled)
  api.post('/auth', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      current?: string;
      next?: string;
      enabled?: boolean;
    };
    const stored = readAuthHash(db);
    if (stored && (typeof body.current !== 'string' || !verifyPassword(body.current, stored))) {
      return c.json({ error: 'current password is incorrect' }, 400);
    }
    if (body.enabled === false) {
      writeAuthHash(db, null);
      return c.json({ enabled: false, token: null });
    }
    if (typeof body.next !== 'string' || body.next.length < 4 || body.next.length > 100) {
      return c.json({ error: 'password must be at least 4 characters' }, 400);
    }
    const hash = hashPassword(body.next);
    writeAuthHash(db, hash);
    return c.json({ enabled: true, token: hash });
  });

  const categoryExists = (id: string) =>
    !!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);
  const planExists = (id: string) =>
    !!db.prepare('SELECT 1 FROM plans WHERE id = ?').get(id);

  api.get('/bootstrap', (c) => c.json(readAll(db)));

  // transactions ---------------------------------------------------------------
  api.post('/transactions', async (c) => {
    const parsed = transactionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const t = parsed.data;
    if (t.categoryId && !categoryExists(t.categoryId)) {
      return c.json({ error: 'unknown category' }, 400);
    }
    const id = randomUUID();
    db.prepare(
      'INSERT INTO transactions (id, date, type, description, category_id, account, amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, t.date, t.type, t.description, t.categoryId, t.account, t.amount);
    return c.json({ ...t, id }, 201);
  });

  api.put('/transactions/:id', async (c) => {
    const id = c.req.param('id');
    if (!db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(id)) {
      return c.json({ error: 'not found' }, 404);
    }
    const parsed = transactionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const t = parsed.data;
    if (t.categoryId && !categoryExists(t.categoryId)) {
      return c.json({ error: 'unknown category' }, 400);
    }
    db.prepare(
      'UPDATE transactions SET date = ?, type = ?, description = ?, category_id = ?, account = ?, amount = ? WHERE id = ?',
    ).run(t.date, t.type, t.description, t.categoryId, t.account, t.amount, id);
    return c.json({ ...t, id });
  });

  api.delete('/transactions/:id', (c) => {
    const res = db.prepare('DELETE FROM transactions WHERE id = ?').run(c.req.param('id'));
    if (res.changes === 0) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  // categories -------------------------------------------------------------------
  api.post('/categories', async (c) => {
    const parsed = categoryInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const { name, budget, sortOrder } = parsed.data;
    const id = randomUUID();
    const order = sortOrder ?? ((db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM categories').get() as { m: number }).m + 1);
    db.prepare('INSERT INTO categories (id, name, budget, sort_order) VALUES (?, ?, ?, ?)').run(id, name, budget, order);
    return c.json({ id, name, budget, sortOrder: order }, 201);
  });

  api.put('/categories/:id', async (c) => {
    const id = c.req.param('id');
    if (!categoryExists(id)) return c.json({ error: 'not found' }, 404);
    const parsed = categoryInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const { name, budget, sortOrder } = parsed.data;
    db.prepare('UPDATE categories SET name = ?, budget = ?, sort_order = COALESCE(?, sort_order) WHERE id = ?')
      .run(name, budget, sortOrder ?? null, id);
    return c.json({ ok: true });
  });

  api.delete('/categories/:id', async (c) => {
    const id = c.req.param('id');
    if (!categoryExists(id)) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const reassignTo = typeof body?.reassignTo === 'string' ? body.reassignTo : null;
    const inUse =
      (db.prepare('SELECT COUNT(*) n FROM transactions WHERE category_id = ?').get(id) as { n: number }).n +
      (db.prepare('SELECT COUNT(*) n FROM subscriptions WHERE category_id = ?').get(id) as { n: number }).n +
      (db.prepare('SELECT COUNT(*) n FROM templates WHERE category_id = ?').get(id) as { n: number }).n;
    if (inUse > 0) {
      if (!reassignTo || reassignTo === id || !categoryExists(reassignTo)) {
        return c.json({ error: 'category in use: provide a valid reassignTo category' }, 400);
      }
      db.prepare('UPDATE transactions SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
      db.prepare('UPDATE subscriptions SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
      db.prepare('UPDATE templates SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return c.json({ ok: true });
  });

  // subscriptions ----------------------------------------------------------------
  api.post('/subscriptions', async (c) => {
    const parsed = subscriptionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const s = parsed.data;
    if (s.categoryId && !categoryExists(s.categoryId)) return c.json({ error: 'unknown category' }, 400);
    const id = randomUUID();
    db.prepare('INSERT INTO subscriptions (id, name, amount, category_id, description, first_bill_date, frequency, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, s.name, s.amount, s.categoryId, s.description, s.firstBillDate, s.frequency, s.endsOn);
    return c.json({ ...s, id }, 201);
  });

  api.put('/subscriptions/:id', async (c) => {
    const id = c.req.param('id');
    if (!db.prepare('SELECT 1 FROM subscriptions WHERE id = ?').get(id)) return c.json({ error: 'not found' }, 404);
    const parsed = subscriptionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const s = parsed.data;
    if (s.categoryId && !categoryExists(s.categoryId)) return c.json({ error: 'unknown category' }, 400);
    db.prepare('UPDATE subscriptions SET name = ?, amount = ?, category_id = ?, description = ?, first_bill_date = ?, frequency = ?, ends_on = ? WHERE id = ?')
      .run(s.name, s.amount, s.categoryId, s.description, s.firstBillDate, s.frequency, s.endsOn, id);
    return c.json({ ...s, id });
  });

  api.delete('/subscriptions/:id', (c) => {
    const res = db.prepare('DELETE FROM subscriptions WHERE id = ?').run(c.req.param('id'));
    if (res.changes === 0) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  // templates ----------------------------------------------------------------------
  api.post('/templates', async (c) => {
    const parsed = templateInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const t = parsed.data;
    if (t.categoryId && !categoryExists(t.categoryId)) return c.json({ error: 'unknown category' }, 400);
    const id = randomUUID();
    db.prepare('INSERT INTO templates (id, name, amount, category_id, description, frequency, default_day) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, t.name, t.amount, t.categoryId, t.description, t.frequency, t.defaultDay);
    return c.json({ ...t, id }, 201);
  });

  api.put('/templates/:id', async (c) => {
    const id = c.req.param('id');
    if (!db.prepare('SELECT 1 FROM templates WHERE id = ?').get(id)) return c.json({ error: 'not found' }, 404);
    const parsed = templateInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const t = parsed.data;
    if (t.categoryId && !categoryExists(t.categoryId)) return c.json({ error: 'unknown category' }, 400);
    db.prepare('UPDATE templates SET name = ?, amount = ?, category_id = ?, description = ?, frequency = ?, default_day = ? WHERE id = ?')
      .run(t.name, t.amount, t.categoryId, t.description, t.frequency, t.defaultDay, id);
    return c.json({ ...t, id });
  });

  api.delete('/templates/:id', (c) => {
    const res = db.prepare('DELETE FROM templates WHERE id = ?').run(c.req.param('id'));
    if (res.changes === 0) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  // plans -------------------------------------------------------------------------
  api.post('/plans', async (c) => {
    const parsed = planInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const id = randomUUID();
    const p = parsed.data;
    db.prepare('INSERT INTO plans (id, name, total_amount, installment, start_month) VALUES (?, ?, ?, ?, ?)')
      .run(id, p.name, p.totalAmount, p.installment, p.startMonth);
    return c.json({ ...p, id }, 201);
  });

  api.put('/plans/:id', async (c) => {
    const id = c.req.param('id');
    if (!planExists(id)) return c.json({ error: 'not found' }, 404);
    const parsed = planInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const p = parsed.data;
    db.prepare('UPDATE plans SET name = ?, total_amount = ?, installment = ?, start_month = ? WHERE id = ?')
      .run(p.name, p.totalAmount, p.installment, p.startMonth, id);
    return c.json({ ...p, id });
  });

  api.delete('/plans/:id', (c) => {
    const res = db.prepare('DELETE FROM plans WHERE id = ?').run(c.req.param('id'));
    if (res.changes === 0) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  api.put('/plans/:id/payments/:month', async (c) => {
    const id = c.req.param('id');
    const month = c.req.param('month');
    if (!planExists(id)) return c.json({ error: 'not found' }, 404);
    if (!isoMonth.safeParse(month).success) return c.json({ error: 'invalid month' }, 400);
    const parsed = paymentInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    db.prepare(
      'INSERT INTO plan_payments (plan_id, month, amount_paid) VALUES (?, ?, ?) ON CONFLICT(plan_id, month) DO UPDATE SET amount_paid = excluded.amount_paid',
    ).run(id, month, parsed.data.amountPaid);
    return c.json({ planId: id, month, amountPaid: parsed.data.amountPaid });
  });

  api.delete('/plans/:id/payments/:month', (c) => {
    db.prepare('DELETE FROM plan_payments WHERE plan_id = ? AND month = ?')
      .run(c.req.param('id'), c.req.param('month'));
    return c.json({ ok: true });
  });

  // settings ------------------------------------------------------------------------
  api.put('/settings', async (c) => {
    const parsed = settingsInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    writeSettings(db, parsed.data);
    return c.json(readSettings(db));
  });

  // backup --------------------------------------------------------------------------
  api.get('/export', (c) => {
    c.header('Content-Disposition', `attachment; filename="tower-finance-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(readAll(db));
  });

  api.post('/import', async (c) => {
    const parsed = importInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: `${issue.path.join('.')}: ${issue.message}` }, 400);
    }
    const data = parsed.data;
    const catIds = new Set(data.categories.map((cat) => cat.id));
    const planIds = new Set(data.plans.map((p) => p.id));
    if (data.transactions.some((t) => t.categoryId && !catIds.has(t.categoryId))) {
      return c.json({ error: 'transaction references unknown category' }, 400);
    }
    if (data.planPayments.some((p) => !planIds.has(p.planId))) {
      return c.json({ error: 'payment references unknown plan' }, 400);
    }
    if (
      data.subscriptions.some((s) => s.categoryId && !catIds.has(s.categoryId)) ||
      data.templates.some((t) => t.categoryId && !catIds.has(t.categoryId))
    ) {
      return c.json({ error: 'subscription/template references unknown category' }, 400);
    }
    replaceAll(db, data);
    return c.json({ ok: true });
  });

  app.route('/api', api);
  return app;
}
