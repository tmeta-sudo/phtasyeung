import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot({ SUPER_ADMIN_EMAILS: 'boss@example.com' }); });
after(async () => { await env?.close(); });

async function superClient() {
  const c = client(env.url);
  const { q } = await import('../server/store.js');
  await q("DELETE FROM rate_limits WHERE key LIKE 'signup:%'");
  await c.post('/api/auth/signup', { email: 'boss@example.com', password: 'password123', propertyName: 'Platform' }).catch(async () => c.post('/api/auth/login', { email: 'boss@example.com', password: 'password123' }));
  return c;
}

test('browser errors are grouped and scrubbed of personal data', async () => {
  const anon = client(env.url);
  for (let i = 0; i < 3; i++) {
    await anon.post('/api/errors', { message: `Cannot read x of undefined (row ${i})`, stack: 'TypeError\n    at render (https://app/assets/index-abc.js:10:5)', path: '/p/AbCdEfGhIjKlMnOp/pay' });
  }
  await anon.post('/api/errors', { message: 'Failed for sok@example.com 012345678' });
  const boss = await superClient();
  const { items } = await boss.get('/api/super/errors');
  const grouped = items.find((e) => e.message.startsWith('Cannot read x'));
  assert.equal(grouped.count, 3, 'same error at different rows groups together');
  assert.equal(grouped.path, '/p/<token>/pay', 'portal tokens are removed');
  const pii = items.find((e) => e.message.startsWith('Failed for'));
  assert.equal(pii.message, 'Failed for <email> <number>');
});

test('only the super admin can read errors', async () => {
  const { c } = await landlord(env.url);
  await assert.rejects(c.get('/api/super/errors'), /403/);
  await assert.rejects(client(env.url).get('/api/super/errors'), /401/);
});

test('server errors are recorded with personal data scrubbed', async () => {
  const { recordError, listErrors } = await import('../server/errors.js');
  await recordError({ source: 'server', message: 'boom 123456789', stack: 'Error: boom\n    at x (server/app.js:1:1)', path: 'GET /api/state' });
  const items = await listErrors();
  assert.ok(items.some((e) => e.source === 'server' && e.message === 'boom <number>'));
});

test('resolving hides an error until it happens again', async () => {
  const boss = await superClient();
  const anon = client(env.url);
  await anon.post('/api/errors', { message: 'Resolve me' });
  let { items } = await boss.get('/api/super/errors');
  const fp = items.find((e) => e.message === 'Resolve me').fingerprint;
  ({ items } = await boss.post('/api/super/errors/resolve', { fingerprint: fp }));
  assert.ok(!items.some((e) => e.fingerprint === fp));
  await anon.post('/api/errors', { message: 'Resolve me' });
  ({ items } = await boss.get('/api/super/errors'));
  assert.equal(items.find((e) => e.fingerprint === fp).count, 2);
});
