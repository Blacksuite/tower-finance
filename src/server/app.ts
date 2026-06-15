import { Hono, type Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DB } from './db';
import {
  clearSessions,
  deleteSession,
  insertSession,
  readAll,
  readAuthHash,
  readSettings,
  replaceAll,
  sessionExists,
  writeAuthHash,
  writeSettings,
} from './db';

// --- password hashing & sessions ----------------------------------------------

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

const SESSION_COOKIE = 'tower_session';
const SESSION_DAYS = 180;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// brute-force throttle for the auth endpoints (in-memory, per app instance)
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/**
 * x-forwarded-for is client-controlled, so trusting it unconditionally lets an
 * attacker rotate the header to dodge the throttle. It is only honored behind
 * a reverse proxy the operator vouches for (TRUST_PROXY=1); otherwise the key
 * is the real socket address.
 */
function clientKey(c: Context): string {
  if (process.env.TRUST_PROXY) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address || 'local';
  } catch {
    return 'local'; // no socket (e.g. app.request() in tests)
  }
}

function createThrottle() {
  const attempts = new Map<string, { count: number; windowStart: number }>();
  return {
    limited(key: string): boolean {
      const a = attempts.get(key);
      if (!a || Date.now() - a.windowStart > ATTEMPT_WINDOW_MS) return false;
      return a.count >= MAX_ATTEMPTS;
    },
    recordFailure(key: string) {
      const now = Date.now();
      // expired entries are dropped so the map cannot grow without bound
      for (const [k, v] of attempts) if (now - v.windowStart > ATTEMPT_WINDOW_MS) attempts.delete(k);
      const a = attempts.get(key);
      if (!a || now - a.windowStart > ATTEMPT_WINDOW_MS) {
        attempts.set(key, { count: 1, windowStart: now });
      } else {
        a.count++;
      }
    },
    clear(key: string) {
      attempts.delete(key);
    },
  };
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
  safetyBuffer: z.number().finite().min(0).max(1e9).optional(),
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

const incomeBase = z.object({
  name: z.string().trim().min(1).max(100),
  amount,
  frequency: z.enum(['monthly', 'weekly', 'biweekly', 'four_weekly', 'custom']),
  anchorDate: isoDate,
  intervalDays: z.number().int().min(1).max(366).nullable().default(null),
  weekendRule: z.enum(['previous', 'exact', 'next']).default('exact'),
  endsOn: isoDate.nullable().default(null),
});

const incomeInput = incomeBase
  .refine((i) => i.frequency !== 'custom' || i.intervalDays !== null, {
    message: 'custom frequency needs intervalDays',
  })
  .transform((i) => ({ ...i, intervalDays: i.frequency === 'custom' ? i.intervalDays : null }));

const billBase = z.object({
  name: z.string().trim().min(1).max(100),
  amount,
  categoryId: z.string().nullable().default(null),
  description: z.string().trim().max(200).default(''),
  frequency: z.enum(['once', 'weekly', 'biweekly', 'four_weekly', 'monthly', 'quarterly', 'yearly', 'custom']),
  anchorDate: isoDate,
  intervalDays: z.number().int().min(1).max(366).nullable().default(null),
  weekendRule: z.enum(['previous', 'exact', 'next']).default('exact'),
  endsOn: isoDate.nullable().default(null),
  estimated: z.boolean().default(false),
});

const billInput = billBase
  .refine((b) => b.frequency !== 'custom' || b.intervalDays !== null, {
    message: 'custom frequency needs intervalDays',
  })
  .transform((b) => ({ ...b, intervalDays: b.frequency === 'custom' ? b.intervalDays : null }));

const billPaymentInput = z.object({
  amount: z.number().finite().min(0).max(1e9),
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
    // optional for backups made before these fields existed
    safetyBuffer: z.number().finite().min(0).default(100),
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
  // optional for backups made before recurring income existed
  incomes: z.array(incomeBase.extend({ id: z.string().min(1) })).default([]),
  // optional for backups made before bills existed
  bills: z.array(billBase.extend({ id: z.string().min(1) })).default([]),
  billPayments: z.array(z.object({
    billId: z.string().min(1),
    date: isoDate,
    amount: z.number().finite().min(0),
  })).default([]),
});

// --- app ----------------------------------------------------------------------

export function createApp(db: DB) {
  const app = new Hono();
  const api = new Hono();
  const throttle = createThrottle();

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  // Cross-site HTML forms can only submit urlencoded/multipart/text-plain
  // bodies. Requiring JSON on writes closes that CSRF/DNS-rebinding door even
  // when password protection is disabled (cookies alone are SameSite=Lax).
  api.use('*', async (c, next) => {
    const method = c.req.method;
    if (method === 'POST' || method === 'PUT') {
      // forms always declare a content-type; bodyless requests (logout) don't
      const ct = c.req.header('content-type');
      if (ct !== undefined && !ct.toLowerCase().includes('application/json')) {
        return c.json({ error: 'expected application/json' }, 415);
      }
    }
    return next();
  });

  // Optional password protection. Sessions are random 32-byte tokens delivered
  // as an httpOnly cookie; only their SHA-256 is stored server-side. No /api
  // route returns data without a valid session while protection is enabled.
  api.use('*', async (c, next) => {
    const stored = readAuthHash(db);
    if (!stored) return next();
    const path = c.req.path;
    if (path === '/api/login' || path === '/api/logout') return next();
    const token = getCookie(c, SESSION_COOKIE);
    if (token && sessionExists(db, sha256(token))) return next();
    return c.json({ error: 'unauthorized' }, 401);
  });

  const startSession = (c: Context) => {
    const token = randomBytes(32).toString('hex');
    insertSession(db, sha256(token));
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * SESSION_DAYS,
    });
  };

  api.post('/login', async (c) => {
    const key = clientKey(c);
    if (throttle.limited(key)) {
      return c.json({ error: 'too many attempts — try again in a few minutes' }, 429);
    }
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    const stored = readAuthHash(db);
    if (!stored) return c.json({ ok: true }); // protection disabled: nothing to unlock
    if (typeof body.password === 'string' && verifyPassword(body.password, stored)) {
      throttle.clear(key);
      startSession(c);
      return c.json({ ok: true });
    }
    throttle.recordFailure(key);
    return c.json({ error: 'wrong password' }, 401);
  });

  // lock / sign out: revoke this session and drop the cookie
  api.post('/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) deleteSession(db, sha256(token));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // enable / change / disable the password (requires a valid session when enabled)
  api.post('/auth', async (c) => {
    const key = clientKey(c);
    if (throttle.limited(key)) {
      return c.json({ error: 'too many attempts — try again in a few minutes' }, 429);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      current?: string;
      next?: string;
      enabled?: boolean;
    };
    const stored = readAuthHash(db);
    if (stored && (typeof body.current !== 'string' || !verifyPassword(body.current, stored))) {
      throttle.recordFailure(key);
      return c.json({ error: 'current password is incorrect' }, 400);
    }
    throttle.clear(key);
    if (body.enabled === false) {
      writeAuthHash(db, null);
      clearSessions(db); // every device is signed out
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
      return c.json({ enabled: false });
    }
    if (typeof body.next !== 'string' || body.next.length < 4 || body.next.length > 100) {
      return c.json({ error: 'password must be at least 4 characters' }, 400);
    }
    writeAuthHash(db, hashPassword(body.next));
    clearSessions(db); // changing the password revokes all existing sessions…
    startSession(c); // …except a fresh one for the device that changed it
    return c.json({ enabled: true });
  });

  const categoryExists = (id: string) =>
    !!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);
  const planExists = (id: string) =>
    !!db.prepare('SELECT 1 FROM plans WHERE id = ?').get(id);
  const billExists = (id: string) =>
    !!db.prepare('SELECT 1 FROM bills WHERE id = ?').get(id);

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
      (db.prepare('SELECT COUNT(*) n FROM templates WHERE category_id = ?').get(id) as { n: number }).n +
      (db.prepare('SELECT COUNT(*) n FROM bills WHERE category_id = ?').get(id) as { n: number }).n;
    if (inUse > 0) {
      if (!reassignTo || reassignTo === id || !categoryExists(reassignTo)) {
        return c.json({ error: 'category in use: provide a valid reassignTo category' }, 400);
      }
      db.prepare('UPDATE transactions SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
      db.prepare('UPDATE subscriptions SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
      db.prepare('UPDATE templates SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
      db.prepare('UPDATE bills SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
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

  // recurring incomes ---------------------------------------------------------------
  api.post('/incomes', async (c) => {
    const parsed = incomeInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const i = parsed.data;
    const id = randomUUID();
    db.prepare('INSERT INTO incomes (id, name, amount, frequency, anchor_date, interval_days, weekend_rule, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, i.name, i.amount, i.frequency, i.anchorDate, i.intervalDays, i.weekendRule, i.endsOn);
    return c.json({ ...i, id }, 201);
  });

  api.put('/incomes/:id', async (c) => {
    const id = c.req.param('id');
    if (!db.prepare('SELECT 1 FROM incomes WHERE id = ?').get(id)) return c.json({ error: 'not found' }, 404);
    const parsed = incomeInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const i = parsed.data;
    db.prepare('UPDATE incomes SET name = ?, amount = ?, frequency = ?, anchor_date = ?, interval_days = ?, weekend_rule = ?, ends_on = ? WHERE id = ?')
      .run(i.name, i.amount, i.frequency, i.anchorDate, i.intervalDays, i.weekendRule, i.endsOn, id);
    return c.json({ ...i, id });
  });

  api.delete('/incomes/:id', (c) => {
    const res = db.prepare('DELETE FROM incomes WHERE id = ?').run(c.req.param('id'));
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

  // bills -------------------------------------------------------------------------
  api.post('/bills', async (c) => {
    const parsed = billInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const b = parsed.data;
    if (b.categoryId && !categoryExists(b.categoryId)) return c.json({ error: 'unknown category' }, 400);
    const id = randomUUID();
    db.prepare('INSERT INTO bills (id, name, amount, category_id, description, frequency, anchor_date, interval_days, weekend_rule, ends_on, estimated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, b.name, b.amount, b.categoryId, b.description, b.frequency, b.anchorDate, b.intervalDays, b.weekendRule, b.endsOn, b.estimated ? 1 : 0);
    return c.json({ ...b, id }, 201);
  });

  api.put('/bills/:id', async (c) => {
    const id = c.req.param('id');
    if (!billExists(id)) return c.json({ error: 'not found' }, 404);
    const parsed = billInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    const b = parsed.data;
    if (b.categoryId && !categoryExists(b.categoryId)) return c.json({ error: 'unknown category' }, 400);
    db.prepare('UPDATE bills SET name = ?, amount = ?, category_id = ?, description = ?, frequency = ?, anchor_date = ?, interval_days = ?, weekend_rule = ?, ends_on = ?, estimated = ? WHERE id = ?')
      .run(b.name, b.amount, b.categoryId, b.description, b.frequency, b.anchorDate, b.intervalDays, b.weekendRule, b.endsOn, b.estimated ? 1 : 0, id);
    return c.json({ ...b, id });
  });

  api.delete('/bills/:id', (c) => {
    const res = db.prepare('DELETE FROM bills WHERE id = ?').run(c.req.param('id'));
    if (res.changes === 0) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  api.put('/bills/:id/payments/:date', async (c) => {
    const id = c.req.param('id');
    const date = c.req.param('date');
    if (!billExists(id)) return c.json({ error: 'not found' }, 404);
    if (!isoDate.safeParse(date).success) return c.json({ error: 'invalid date' }, 400);
    const parsed = billPaymentInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
    db.prepare(
      'INSERT INTO bill_payments (bill_id, date, amount) VALUES (?, ?, ?) ON CONFLICT(bill_id, date) DO UPDATE SET amount = excluded.amount',
    ).run(id, date, parsed.data.amount);
    return c.json({ billId: id, date, amount: parsed.data.amount });
  });

  api.delete('/bills/:id/payments/:date', (c) => {
    db.prepare('DELETE FROM bill_payments WHERE bill_id = ? AND date = ?')
      .run(c.req.param('id'), c.req.param('date'));
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
      data.templates.some((t) => t.categoryId && !catIds.has(t.categoryId)) ||
      data.bills.some((b) => b.categoryId && !catIds.has(b.categoryId))
    ) {
      return c.json({ error: 'subscription/template/bill references unknown category' }, 400);
    }
    const billIds = new Set(data.bills.map((b) => b.id));
    if (data.billPayments.some((p) => !billIds.has(p.billId))) {
      return c.json({ error: 'bill payment references unknown bill' }, 400);
    }
    replaceAll(db, data);
    return c.json({ ok: true });
  });

  app.route('/api', api);
  return app;
}
