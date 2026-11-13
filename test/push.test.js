import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client, fakePushService } from './helpers.js';

let env; let push;
before(async () => { env = await boot(); push = await fakePushService(); });
after(async () => { push?.srv.close(); await env?.close(); });

const wait = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('VAPID key is generated once and stays the same', async () => {
  const { c } = await landlord(env.url);
  const a = await c.get('/api/push/key');
  const b = await c.get('/api/push/key');
  assert.match(a.key, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal(a.key, b.key);
  await assert.rejects(client(env.url).get('/api/push/key'), /401/);
});

test('subscribe, receive a test push, and invalid subscriptions are refused', async () => {
  const { c } = await landlord(env.url);
  await assert.rejects(c.post('/api/push/subscribe', { subscription: { endpoint: 'nope' } }), /400/);
  await assert.rejects(c.post('/api/push/subscribe', { subscription: { ...push.sub('x'), endpoint: 'https://169.254.169.254/latest' } }), /400/);
  await assert.rejects(c.post('/api/push/subscribe', { subscription: { ...push.sub('x'), endpoint: 'https://evil.example/fcm.googleapis.com' } }), /400/);
  const r = await c.post('/api/push/subscribe', { subscription: push.sub('a') });
  assert.equal(r.devices.length, 1);
  const before = push.received.length;
  const t = await c.post('/api/push/test', {});
  assert.equal(t.sent, 1);
  const got = push.received.at(-1);
  assert.equal(push.received.length, before + 1);
  assert.match(got.vapid, /^vapid t=/);
  assert.equal(got.msg.title, '🔔 ផ្ទះយើង');
});

test('a Bakong payment pushes to the landlord\'s phone, only for that landlord', async () => {
  const other = await landlord(env.url);
  await other.c.post('/api/push/subscribe', { subscription: push.sub('other') });
  const { c } = await landlord(env.url);
  await c.post('/api/push/subscribe', { subscription: push.sub('mine') });
  const gen = await c.post('/api/invoices/generate', {});
  const inv = gen.invoices[0];
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db } = await import('../server/db.js');
  let md5;
  for (const id of await listOrgIds()) await withOrg(id, () => { const i = db().invoices.find((x) => x.id === inv.id); if (i) md5 = i.khqrMd5; });
  env.bakong.paid.set(md5, { hash: 'p1', toAccountId: 'owner@aclb', currency: 'USD', amount: inv.total });
  const n = push.received.length;
  await c.post('/api/invoices/check-payments', { force: true });
  assert.ok(await wait(() => push.received.length > n));
  const mine = push.received.slice(n);
  assert.ok(mine.every((x) => x.path === '/push/mine'), 'no push leaks to another landlord');
  assert.match(mine[0].msg.title, /Bakong/);
  assert.match(mine[0].msg.body, new RegExp(inv.number));
});

test('a subscription the browser revoked (410) is removed', async () => {
  const { c } = await landlord(env.url);
  await c.post('/api/push/subscribe', { subscription: push.sub('gone') });
  push.setStatus(410);
  try { assert.equal((await c.post('/api/push/test', {})).sent, 0); } finally { push.setStatus(201); }
  assert.equal((await c.get('/api/push/devices')).devices.length, 0);
});

test('password reset codes go to Telegram only, never to push', async () => {
  const email = `reset${Date.now()}@example.com`;
  const c = client(env.url);
  const { q } = await import('../server/store.js');
  await q("DELETE FROM rate_limits WHERE key LIKE 'signup:%' OR key LIKE 'forgot:%'");
  await c.post('/api/auth/signup', { email, password: 'password123', propertyName: 'Reset House' });
  await c.post('/api/push/subscribe', { subscription: push.sub('reset') });
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  for (const id of await listOrgIds()) await withOrg(id, () => { if (db().settings.propertyName === 'Reset House') { db().settings.telegram.adminChats = [{ chatId: 4242 }]; save(); } });
  const nPush = push.received.length; const nTg = env.tg.of('sendMessage').length;
  await client(env.url).post('/api/auth/forgot', { email });
  assert.ok(await wait(() => env.tg.of('sendMessage').length > nTg), 'code sent to Telegram');
  assert.match(env.tg.of('sendMessage').at(-1).payload.text, /<code>\d{6}<\/code>/);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(push.received.length, nPush, 'no push for the reset code');
});
