import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { createDb, readAuthHash, type DB } from '../src/server/db';

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

  it('rate-limits repeated failed logins per client', async () => {
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

describe('subscriptions & templates API', () => {
  it('full subscription lifecycle', async () => {
    const created = await json('POST', '/api/subscriptions', {
      name: 'Netflix', amount: 15.99, firstBillDate: '2026-01-07', frequency: 'monthly',
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const upd = await json('PUT', `/api/subscriptions/${id}`, {
      name: 'Netflix 4K', amount: 19.99, firstBillDate: '2026-01-07', frequency: 'monthly', endsOn: '2026-08-01',
    });
    expect(upd.status).toBe(200);
    expect((await json('DELETE', `/api/subscriptions/${id}`)).status).toBe(200);
    expect((await json('POST', '/api/subscriptions', { name: 'X', amount: 5, firstBillDate: '2026-01-01', frequency: 'weekly' })).status).toBe(400);
  });

  it('full template lifecycle and export round-trip', async () => {
    const created = await json('POST', '/api/templates', { name: 'Fuel', amount: 60, defaultDay: 15 });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await json('POST', '/api/subscriptions', { name: 'Gym', amount: 30, firstBillDate: '2026-02-01', frequency: 'monthly' });

    const dump = (await (await json('GET', '/api/export')).json()) as Record<string, unknown>;
    const db2 = createDb(':memory:');
    const app2 = createApp(db2);
    const res = await app2.request('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dump),
    });
    expect(res.status).toBe(200);
    const boot = (await (await app2.request('/api/bootstrap')).json()) as {
      templates: { id: string }[]; subscriptions: { name: string }[];
    };
    expect(boot.templates[0].id).toBe(id);
    expect(boot.subscriptions[0].name).toBe('Gym');
  });
});
