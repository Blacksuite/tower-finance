import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { createDb, readAll, SEED_CATEGORIES, type DB } from '../src/server/db';
import { DEFAULT_SETTINGS, type AppData } from '../src/shared/types';

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createApp(db);
});

const json = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('bootstrap & seeding', () => {
  it('seeds the 12 default categories', async () => {
    const res = await json('GET', '/api/bootstrap');
    expect(res.status).toBe(200);
    const data = (await res.json()) as AppData;
    expect(data.categories.map((c) => c.name)).toEqual(SEED_CATEGORIES);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('transactions', () => {
  it('creates, updates and deletes a transaction', async () => {
    const created = await json('POST', '/api/transactions', {
      date: '2026-06-11', type: 'income', description: 'Salary', amount: 3000,
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const updated = await json('PUT', `/api/transactions/${id}`, {
      date: '2026-06-11', type: 'income', description: 'Salary jun', amount: 3100,
    });
    expect(updated.status).toBe(200);

    const deleted = await json('DELETE', `/api/transactions/${id}`);
    expect(deleted.status).toBe(200);
    expect(readAll(db).transactions).toHaveLength(0);
  });

  it('rejects invalid payloads', async () => {
    expect((await json('POST', '/api/transactions', { date: '2026-13-40', type: 'income', amount: 5 })).status).toBe(400);
    expect((await json('POST', '/api/transactions', { date: '2026-06-11', type: 'magic', amount: 5 })).status).toBe(400);
    expect((await json('POST', '/api/transactions', { date: '2026-06-11', type: 'income', amount: -5 })).status).toBe(400);
    expect((await json('POST', '/api/transactions', { date: '2026-06-11', type: 'income', amount: 0 })).status).toBe(400);
    expect((await json('POST', '/api/transactions', {
      date: '2026-06-11', type: 'expense', amount: 5, categoryId: 'nope',
    })).status).toBe(400);
  });

  it('strips category from non-expenses and account from non-savings', async () => {
    const cat = readAll(db).categories[0];
    const res = await json('POST', '/api/transactions', {
      date: '2026-06-11', type: 'income', amount: 5, categoryId: cat.id, account: 'X',
    });
    const body = (await res.json()) as { categoryId: string | null; account: string | null };
    expect(body.categoryId).toBeNull();
    expect(body.account).toBeNull();
  });
});

describe('categories', () => {
  it('requires reassignment when deleting a category in use', async () => {
    const [a, b] = readAll(db).categories;
    await json('POST', '/api/transactions', {
      date: '2026-06-11', type: 'expense', amount: 10, categoryId: a.id,
    });
    expect((await json('DELETE', `/api/categories/${a.id}`, {})).status).toBe(400);

    const ok = await json('DELETE', `/api/categories/${a.id}`, { reassignTo: b.id });
    expect(ok.status).toBe(200);
    const data = readAll(db);
    expect(data.transactions[0].categoryId).toBe(b.id);
    expect(data.categories.find((c) => c.id === a.id)).toBeUndefined();
  });

  it('creates and renames categories with budgets', async () => {
    const created = await json('POST', '/api/categories', { name: 'Pets', budget: 50 });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await json('PUT', `/api/categories/${id}`, { name: 'Cats', budget: 75 })).status).toBe(200);
    const cat = readAll(db).categories.find((c) => c.id === id)!;
    expect(cat).toMatchObject({ name: 'Cats', budget: 75 });
  });
});

describe('plans & payments', () => {
  it('full plan lifecycle with payment overrides', async () => {
    const created = await json('POST', '/api/plans', {
      name: 'Sofa', totalAmount: 1000, installment: 300, startMonth: '2026-01',
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    expect((await json('PUT', `/api/plans/${id}/payments/2026-02`, { amountPaid: 100 })).status).toBe(200);
    // upsert: setting again overwrites
    expect((await json('PUT', `/api/plans/${id}/payments/2026-02`, { amountPaid: 150 })).status).toBe(200);
    expect(readAll(db).planPayments).toEqual([{ planId: id, month: '2026-02', amountPaid: 150 }]);

    expect((await json('DELETE', `/api/plans/${id}/payments/2026-02`)).status).toBe(200);
    expect(readAll(db).planPayments).toHaveLength(0);

    // deleting the plan cascades payments
    await json('PUT', `/api/plans/${id}/payments/2026-03`, { amountPaid: 0 });
    expect((await json('DELETE', `/api/plans/${id}`)).status).toBe(200);
    expect(readAll(db).planPayments).toHaveLength(0);
  });

  it('rejects invalid plans', async () => {
    expect((await json('POST', '/api/plans', { name: '', totalAmount: 100, installment: 10, startMonth: '2026-01' })).status).toBe(400);
    expect((await json('POST', '/api/plans', { name: 'X', totalAmount: 100, installment: 0, startMonth: '2026-01' })).status).toBe(400);
    expect((await json('POST', '/api/plans', { name: 'X', totalAmount: 100, installment: 10, startMonth: '2026-13' })).status).toBe(400);
  });
});

describe('bills & overrides', () => {
  it('full bill lifecycle with per-occurrence overrides', async () => {
    const cat = readAll(db).categories[0];
    const created = await json('POST', '/api/bills', {
      name: 'Utilities', amount: 80, categoryId: cat.id, frequency: 'monthly',
      anchorDate: '2026-01-10', estimated: true,
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    expect((await json('PUT', `/api/bills/${id}`, {
      name: 'Utilities', amount: 90, frequency: 'monthly', anchorDate: '2026-01-10', estimated: true,
    })).status).toBe(200);

    // pin an actual amount for one occurrence, then upsert it
    expect((await json('PUT', `/api/bills/${id}/payments/2026-06-10`, { amount: 105 })).status).toBe(200);
    expect((await json('PUT', `/api/bills/${id}/payments/2026-06-10`, { amount: 110 })).status).toBe(200);
    expect(readAll(db).billPayments).toEqual([{ billId: id, date: '2026-06-10', amount: 110 }]);

    expect((await json('DELETE', `/api/bills/${id}/payments/2026-06-10`)).status).toBe(200);
    expect(readAll(db).billPayments).toHaveLength(0);

    // deleting the bill cascades its payments
    await json('PUT', `/api/bills/${id}/payments/2026-07-10`, { amount: 70 });
    expect((await json('DELETE', `/api/bills/${id}`)).status).toBe(200);
    expect(readAll(db).billPayments).toHaveLength(0);
  });

  it('rejects invalid bills', async () => {
    expect((await json('POST', '/api/bills', { name: '', amount: 50, frequency: 'monthly', anchorDate: '2026-01-01' })).status).toBe(400);
    expect((await json('POST', '/api/bills', { name: 'X', amount: 50, frequency: 'custom', anchorDate: '2026-01-01' })).status).toBe(400); // custom needs intervalDays
    expect((await json('POST', '/api/bills', { name: 'X', amount: 50, frequency: 'weekly', anchorDate: '2026-13-40' })).status).toBe(400);
    expect((await json('POST', '/api/bills', { name: 'X', amount: 50, frequency: 'monthly', anchorDate: '2026-01-01', categoryId: 'ghost' })).status).toBe(400);
  });
});

describe('settings, export & import', () => {
  it('persists settings partially', async () => {
    await json('PUT', '/api/settings', { savingsTarget: 500 });
    const res = await json('PUT', '/api/settings', { safetyBuffer: 250, salaryDay: 25 });
    expect(await res.json()).toEqual({ ...DEFAULT_SETTINGS, savingsTarget: 500, safetyBuffer: 250, salaryDay: 25 });
  });

  it('round-trips export → import', async () => {
    const cat = readAll(db).categories[0];
    await json('POST', '/api/transactions', { date: '2026-06-11', type: 'expense', amount: 42, categoryId: cat.id });
    await json('POST', '/api/plans', { name: 'TV', totalAmount: 500, installment: 100, startMonth: '2026-05' });
    await json('PUT', '/api/settings', { safetyBuffer: 999 });

    const dump = (await (await json('GET', '/api/export')).json()) as AppData;

    const db2 = createDb(':memory:');
    const app2 = createApp(db2);
    const res = await app2.request('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dump),
    });
    expect(res.status).toBe(200);
    expect(readAll(db2)).toEqual(dump);
  });

  it('rejects an import with dangling references', async () => {
    const dump = (await (await json('GET', '/api/export')).json()) as AppData;
    dump.transactions = [{
      id: 'x', date: '2026-06-11', type: 'expense', description: '', categoryId: 'ghost', account: null, amount: 5,
    }];
    expect((await json('POST', '/api/import', dump)).status).toBe(400);
  });
});
