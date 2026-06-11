import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DB } from './db';
import { readAll, readSettings, replaceAll, writeSettings } from './db';

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
});

// --- app ----------------------------------------------------------------------

export function createApp(db: DB) {
  const app = new Hono();
  const api = new Hono();

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
    const inUse = (db.prepare('SELECT COUNT(*) n FROM transactions WHERE category_id = ?').get(id) as { n: number }).n;
    if (inUse > 0) {
      if (!reassignTo || reassignTo === id || !categoryExists(reassignTo)) {
        return c.json({ error: 'category in use: provide a valid reassignTo category' }, 400);
      }
      db.prepare('UPDATE transactions SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
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
    replaceAll(db, data);
    return c.json({ ok: true });
  });

  app.route('/api', api);
  return app;
}
