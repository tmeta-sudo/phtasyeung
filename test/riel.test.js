import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

const md5Of = async (invId) => {
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db } = await import('../server/db.js');
  let out;
  for (const id of await listOrgIds()) await withOrg(id, () => { const i = db().invoices.find((x) => x.id === invId); if (i) out = { md5: i.khqrMd5, str: i.khqrStr }; });
  return out;
};

test('switching to riel converts rents, prices, invoices and payments once', async () => {
  const { c, state } = await landlord(env.url); // rent $101
  await c.put('/api/settings', { exchangeRate: 4000, waterRate: 0.5, electricRate: 0.25 });
  const usdInv = (await c.post('/api/invoices/generate', {})).invoices[0];
  await c.post(`/api/invoices/${usdInv.id}/payments`, { amount: 21 });
  const st = await c.put('/api/settings', { currency: 'KHR' });
  assert.equal(st.settings.currency, 'KHR');
  assert.equal(st.rooms[0].rent, 404000);
  assert.equal(st.settings.electricRate, 1000);
  assert.equal(st.settings.addons.find((a) => a.id === 'moto').price, 20000);
  const inv = st.invoices[0];
  assert.equal(inv.currency, 'KHR');
  assert.equal(inv.total, 404000);
  assert.equal(inv.paid, 84000);
  assert.equal(inv.balance, 320000);
  assert.equal(state.tenants.length, 1);
  // Managers cannot change the currency.
  const invite = await c.post('/api/team/invites', { role: 'manager' });
  const m = client(env.url);
  await m.post(`/api/join/${invite.token}`, { email: `m${Date.now()}@example.com`, password: 'lotus-river-2026' });
  await assert.rejects(m.put('/api/settings', { currency: 'USD' }), /403/);
  // And back again.
  const back = await c.put('/api/settings', { currency: 'USD' });
  assert.equal(back.rooms[0].rent, 101);
  assert.equal(back.invoices[0].balance, 80);
});

test('riel invoices: rounded to 100 ៛, KHQR in KHR, Bakong matches riel payments only', async () => {
  const { c, state } = await landlord(env.url);
  await c.put('/api/settings', { currency: 'KHR', exchangeRate: 4100 });
  await c.put('/api/rooms/A1', { rent: 350000 });
  await c.put('/api/settings', { electricRate: 1030, waterRate: 2550 });
  await c.post('/api/meters', { roomId: 'A1', month: state.today.ym, water: 7, electric: 33 });
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  assert.equal(inv.items.find((i) => i.key === 'electric').amount, 34000, '33 × 1030 = 33,990 → 34,000');
  assert.equal(inv.items.find((i) => i.key === 'water').amount, 17900, '7 × 2550 = 17,850 → 17,900');
  assert.equal(inv.total, 401900);
  assert.equal(inv.totalAlt, 98.02);
  const { md5, str } = await md5Of(inv.id);
  const { decodeKhqr } = await import('../server/khqr.js');
  const d = decodeKhqr(str);
  assert.equal(String(d.transactionCurrency), '116', 'KHR currency code');
  assert.equal(Number(d.transactionAmount), 401900);
  env.bakong.paid.set(md5, { hash: 'u1', toAccountId: 'owner@aclb', currency: 'USD', amount: 401900 });
  let r = await c.post('/api/invoices/check-payments', { force: true });
  assert.equal(r.result.paid, 0, 'a dollar payment of the same number is not accepted');
  env.bakong.paid.set(md5, { hash: 'k1', toAccountId: 'owner@aclb', currency: 'KHR', amount: 401900 });
  r = await c.post('/api/invoices/check-payments', { force: true });
  assert.equal(r.result.paid, 1);
  const sent = env.tg.calls.map((x) => x.payload?.text || '').join('\n');
  assert.ok(!/\$401/.test(sent));
});
