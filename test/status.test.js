// Public /status: no login, no landlord data; the platform admin can post a notice.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot({ SUPER_ADMIN_EMAILS: 'boss-status@example.com' }); });
after(async () => { await env?.close(); });

test('status shows app, database, Telegram and the daily run; admin notice appears', async () => {
  await landlord(env.url);
  const pub = client(env.url);
  let s = await pub.get('/api/status');
  const by = Object.fromEntries(s.checks.map((c) => [c.id, c]));
  assert.equal(by.app.ok, true);
  assert.equal(by.database.ok, true);
  assert.equal(by.telegram.ok, true);
  assert.equal(by.daily.ok, null, 'not run yet');
  assert.equal(s.note, null);
  assert.ok(!JSON.stringify(s).includes('Test House'), 'no landlord data');

  const { runDailyAll } = await import('../server/scheduler.js');
  await runDailyAll();
  const { clearStatusCache } = await import('../server/status.js');
  clearStatusCache();
  s = await pub.get('/api/status');
  assert.equal(s.checks.find((c) => c.id === 'daily').ok, true);
  assert.equal(s.ok, true);

  const { c } = await landlord(env.url);
  await assert.rejects(c.put('/api/super/status-note', { text: 'hacked' }), /403/);
  const boss = client(env.url);
  await boss.post('/api/auth/signup', { email: 'boss-status@example.com', password: 'lotus-river-2026', propertyName: 'Platform' });
  await boss.put('/api/super/status-note', { text: 'Telegram is slow today', level: 'warn' });
  s = await pub.get('/api/status');
  assert.deepEqual([s.note.text, s.note.level], ['Telegram is slow today', 'warn']);
  await boss.put('/api/super/status-note', { text: '' });
  assert.equal((await pub.get('/api/status')).note, null);
});
