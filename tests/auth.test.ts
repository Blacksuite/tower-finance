import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { createDb, readAuthHash, type DB } from '../src/server/db';

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createApp(db);
});

const json = (method: string, path: string, body?: unknown, token?: string) =>
  app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-tower-key': token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('password protection', () => {
  it('is open by default and reports auth disabled', async () => {
    const res = await json('GET', '/api/bootstrap');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { auth: { enabled: boolean } }).auth.enabled).toBe(false);
  });

  it('enable → lockout → login → access with token', async () => {
    const enable = await json('POST', '/api/auth', { enabled: true, next: 'hunter2' });
    expect(enable.status).toBe(200);
    const { token } = (await enable.json()) as { token: string };
    expect(token).toMatch(/^s1:/);
    expect(readAuthHash(db)).toBe(token);

    expect((await json('GET', '/api/bootstrap')).status).toBe(401);
    expect((await json('POST', '/api/login', { password: 'wrong' })).status).toBe(401);

    const login = await json('POST', '/api/login', { password: 'hunter2' });
    expect(login.status).toBe(200);
    expect(((await login.json()) as { token: string }).token).toBe(token);
    expect((await json('GET', '/api/bootstrap', undefined, token)).status).toBe(200);
  });

  it('change requires the current password and rotates the token', async () => {
    const { token } = (await (await json('POST', '/api/auth', { enabled: true, next: 'first' })).json()) as { token: string };
    expect((await json('POST', '/api/auth', { current: 'nope', next: 'second' }, token)).status).toBe(400);
    const changed = await json('POST', '/api/auth', { current: 'first', next: 'second' }, token);
    expect(changed.status).toBe(200);
    const { token: token2 } = (await changed.json()) as { token: string };
    expect(token2).not.toBe(token);
    expect((await json('GET', '/api/bootstrap', undefined, token)).status).toBe(401);
    expect((await json('GET', '/api/bootstrap', undefined, token2)).status).toBe(200);
  });

  it('disable requires the current password and reopens the app', async () => {
    const { token } = (await (await json('POST', '/api/auth', { enabled: true, next: 'first' })).json()) as { token: string };
    expect((await json('POST', '/api/auth', { enabled: false }, token)).status).toBe(400);
    expect((await json('POST', '/api/auth', { enabled: false, current: 'first' }, token)).status).toBe(200);
    expect((await json('GET', '/api/bootstrap')).status).toBe(200);
  });

  it('rejects short passwords and never leaks the hash via export', async () => {
    expect((await json('POST', '/api/auth', { enabled: true, next: 'abc' })).status).toBe(400);
    const { token } = (await (await json('POST', '/api/auth', { enabled: true, next: 'longenough' })).json()) as { token: string };
    const dump = await (await json('GET', '/api/export', undefined, token)).json();
    expect(JSON.stringify(dump)).not.toContain('s1:');
  });

  it('import preserves the configured password', async () => {
    const { token } = (await (await json('POST', '/api/auth', { enabled: true, next: 'keepme' })).json()) as { token: string };
    const dump = (await (await json('GET', '/api/export', undefined, token)).json()) as Record<string, unknown>;
    expect((await json('POST', '/api/import', dump, token)).status).toBe(200);
    expect(readAuthHash(db)).toBe(token);
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
