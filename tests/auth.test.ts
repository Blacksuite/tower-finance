import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { createDb, readAuthHash, type DB } from '../src/server/db';
import { DEFAULT_SETTINGS, type AppData } from '../src/shared/types';

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createApp(db);
});

const json = (method: string, path: string, body?: unknown, opts: { cookie?: string; ip?: string } = {}) =>
  app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.cookie ? { Cookie: `tower_session=${opts.cookie}` } : {}),
      ...(opts.ip ? { 'x-forwarded-for': opts.ip } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Session token from a Set-Cookie header, null when absent/cleared. */
const sessionOf = (res: Response): string | null => {
  const m = res.headers.get('set-cookie')?.match(/tower_session=([^;]*)/);
  return m && m[1] ? m[1] : null;
};

const enable = async (password: string) => {
  const res = await json('POST', '/api/auth', { enabled: true, next: password });
  expect(res.status).toBe(200);
  return sessionOf(res)!;
};

describe('session-based password protection', () => {
  it('is open by default and reports auth disabled', async () => {
    const res = await json('GET', '/api/bootstrap');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { auth: { enabled: boolean } }).auth.enabled).toBe(false);
  });

  it('enable → lockout → login sets an httpOnly cookie session', async () => {
    const enabler = await enable('hunter2');
    expect(enabler).toMatch(/^[0-9a-f]{64}$/);
    // hash never equals the cookie token, and no /api route leaks data
    expect(readAuthHash(db)).not.toBe(enabler);
    expect((await json('GET', '/api/bootstrap')).status).toBe(401);
    expect((await json('GET', '/api/export')).status).toBe(401);
    expect((await json('POST', '/api/transactions', { date: '2026-06-12', type: 'income', amount: 1 })).status).toBe(401);

    expect((await json('POST', '/api/login', { password: 'wrong' })).status).toBe(401);
    const login = await json('POST', '/api/login', { password: 'hunter2' });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const token = sessionOf(login)!;
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: token })).status).toBe(200);
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: 'forged'.repeat(10) })).status).toBe(401);
  });

  it('logout revokes the session server-side', async () => {
    const token = await enable('hunter2');
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: token })).status).toBe(200);
    const out = await json('POST', '/api/logout', undefined, { cookie: token });
    expect(out.status).toBe(200);
    // same token is now rejected even if the client kept the cookie
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: token })).status).toBe(401);
  });

  it('changing the password revokes all other sessions', async () => {
    const t1 = await enable('first');
    const t2 = sessionOf(await json('POST', '/api/login', { password: 'first' }))!;
    expect((await json('POST', '/api/auth', { current: 'nope', next: 'second' }, { cookie: t1 })).status).toBe(400);
    const changed = await json('POST', '/api/auth', { current: 'first', next: 'second' }, { cookie: t1 });
    expect(changed.status).toBe(200);
    const t3 = sessionOf(changed)!;
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: t1 })).status).toBe(401);
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: t2 })).status).toBe(401);
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: t3 })).status).toBe(200);
  });

  it('disable requires the current password and reopens the app', async () => {
    const token = await enable('first');
    expect((await json('POST', '/api/auth', { enabled: false }, { cookie: token })).status).toBe(400);
    expect((await json('POST', '/api/auth', { enabled: false, current: 'first' }, { cookie: token })).status).toBe(200);
    expect((await json('GET', '/api/bootstrap')).status).toBe(200);
  });

  it('rate-limits repeated failed logins per client (proxy mode)', async () => {
    process.env.TRUST_PROXY = '1'; // x-forwarded-for is only honored behind a trusted proxy
    try {
      await enable('correct');
      const ip = '203.0.113.7';
      for (let i = 0; i < 10; i++) {
        expect((await json('POST', '/api/login', { password: 'bad' }, { ip })).status).toBe(401);
      }
      // 11th attempt is throttled — even with the right password
      expect((await json('POST', '/api/login', { password: 'bad' }, { ip })).status).toBe(429);
      expect((await json('POST', '/api/login', { password: 'correct' }, { ip })).status).toBe(429);
      // other clients are unaffected
      expect((await json('POST', '/api/login', { password: 'correct' }, { ip: '203.0.113.8' })).status).toBe(200);
    } finally {
      delete process.env.TRUST_PROXY;
    }
  });

  it('ignores spoofed x-forwarded-for when TRUST_PROXY is not set', async () => {
    await enable('correct');
    // rotating the header must NOT reset the throttle: all requests come from
    // the same (socket) client, so the 11th attempt is rejected regardless
    for (let i = 0; i < 10; i++) {
      const res = await json('POST', '/api/login', { password: 'bad' }, { ip: `203.0.113.${i}` });
      expect(res.status).toBe(401);
    }
    expect((await json('POST', '/api/login', { password: 'correct' }, { ip: '203.0.113.99' })).status).toBe(429);
  });

  it('rejects sessions older than the cookie lifetime', async () => {
    const token = await enable('hunter2');
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: token })).status).toBe(200);
    db.prepare("UPDATE sessions SET created_at = datetime('now', '-181 day')").run();
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: token })).status).toBe(401);
  });

  it('rejects non-JSON write requests (HTML-form CSRF guard)', async () => {
    const form = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'date=2026-06-12&type=income&amount=1',
    });
    expect(form.status).toBe(415);
    const plain = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"date":"2026-06-12","type":"income","amount":1}',
    });
    expect(plain.status).toBe(415);
    // bodyless POSTs (logout) and JSON writes still work
    expect((await app.request('/api/logout', { method: 'POST' })).status).toBe(200);
    expect(
      (await json('POST', '/api/transactions', { date: '2026-06-12', type: 'income', amount: 1 })).status,
    ).toBe(201);
  });

  it('rejects short passwords and never leaks hash or sessions via export', async () => {
    expect((await json('POST', '/api/auth', { enabled: true, next: 'abc' })).status).toBe(400);
    const token = await enable('longenough');
    const dump = JSON.stringify(await (await json('GET', '/api/export', undefined, { cookie: token })).json());
    expect(dump).not.toContain('s1:');
    expect(dump).not.toContain('session');
  });

  it('import preserves the password and existing sessions keep working', async () => {
    const token = await enable('keepme');
    const dump = (await (await json('GET', '/api/export', undefined, { cookie: token })).json()) as Record<string, unknown>;
    expect((await json('POST', '/api/import', dump, { cookie: token })).status).toBe(200);
    expect((await json('GET', '/api/bootstrap', undefined, { cookie: token })).status).toBe(200);
    expect((await json('GET', '/api/bootstrap')).status).toBe(401);
  });
});

describe('income API & legacy import', () => {
  it('full income lifecycle with validation', async () => {
    const created = await json('POST', '/api/incomes', {
      name: 'Salary', amount: 3000, frequency: 'monthly', anchorDate: '2026-01-26', weekendRule: 'previous',
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const upd = await json('PUT', `/api/incomes/${id}`, {
      name: 'Salary', amount: 3100, frequency: 'four_weekly', anchorDate: '2026-01-30',
    });
    expect(upd.status).toBe(200);
    // custom frequency requires intervalDays
    expect((await json('POST', '/api/incomes', { name: 'X', amount: 5, frequency: 'custom', anchorDate: '2026-01-01' })).status).toBe(400);
    expect((await json('DELETE', `/api/incomes/${id}`)).status).toBe(200);
    expect((await json('DELETE', `/api/incomes/${id}`)).status).toBe(404);
  });

  it('incomes survive export → import; old backups without incomes still import', async () => {
    await json('POST', '/api/incomes', { name: 'Salary', amount: 3000, frequency: 'monthly', anchorDate: '2026-01-26' });
    const dump = (await (await json('GET', '/api/export')).json()) as Record<string, unknown>;
    expect((dump.incomes as unknown[]).length).toBe(1);
    expect((await json('POST', '/api/import', dump)).status).toBe(200);
    const boot = (await (await json('GET', '/api/bootstrap')).json()) as { incomes: { name: string }[] };
    expect(boot.incomes[0].name).toBe('Salary');
    // a pre-income backup (no incomes key) must import cleanly and clear them
    delete dump.incomes;
    expect((await json('POST', '/api/import', dump)).status).toBe(200);
    const boot2 = (await (await json('GET', '/api/bootstrap')).json()) as { incomes: unknown[] };
    expect(boot2.incomes).toEqual([]);
  });

  it('legacy backup: subscriptions migrate into bills, templates are dropped', async () => {
    // a pre-v1.7 backup shape (still has subscriptions + templates arrays)
    const legacy = {
      transactions: [],
      categories: [{ id: 'c1', name: 'Subs', budget: 0, sortOrder: 0 }],
      settings: DEFAULT_SETTINGS,
      plans: [],
      planPayments: [],
      subscriptions: [
        { id: 'sub1', name: 'Netflix', amount: 15.99, categoryId: 'c1', description: '', firstBillDate: '2026-01-07', frequency: 'monthly', endsOn: null },
      ],
      templates: [
        { id: 'tpl1', name: 'Fuel', amount: 60, categoryId: 'c1', description: '', frequency: 'monthly', defaultDay: 15 },
      ],
      incomes: [],
      bills: [],
      billPayments: [],
    };
    expect((await json('POST', '/api/import', legacy)).status).toBe(200);
    const boot = (await (await json('GET', '/api/bootstrap')).json()) as AppData & Record<string, unknown>;
    // the subscription became a fixed-amount monthly bill…
    expect(boot.bills).toHaveLength(1);
    expect(boot.bills[0]).toMatchObject({
      name: 'Netflix', amount: 15.99, frequency: 'monthly', anchorDate: '2026-01-07', estimated: false,
    });
    // …and both defunct entities are gone from the model
    expect('subscriptions' in boot).toBe(false);
    expect('templates' in boot).toBe(false);
  });
});
