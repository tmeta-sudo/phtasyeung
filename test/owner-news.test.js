import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

async function inOrg(tenantId, fn) {
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const mod = await import('../server/db.js');
  for (const id of await listOrgIds()) {
    const hit = await withOrg(id, () => mod.db().tenants.some((t) => t.id === tenantId));
    if (hit) return withOrg(id, async () => { const r = await fn(mod.db()); mod.save(); return r; });
  }
  return null;
}
const toOwner = (chat) => env.tg.calls.filter((x) => String(x.payload?.chat_id) === String(chat)).map((x) => String(x.payload.text || ''));

test('several invoices are marked paid at once, each tenant gets a receipt', async () => {
  const { c, state } = await landlord(env.url, { rooms: 3 });
  const invs = (await c.post('/api/invoices/generate', {})).invoices;
  await c.post(`/api/invoices/${invs[0].id}/payments`, { amount: 20 }); // partly paid already
  const ids = invs.slice(0, 2).map((i) => i.id);
  const st = await c.post('/api/invoices/bulk-pay', { ids, via: 'aba' });
  assert.equal(st.bulkPaid, 2);
  for (const id of ids) {
    const inv = st.invoices.find((i) => i.id === id);
    assert.equal(inv.status, 'paid');
    assert.equal(inv.paid, inv.total, 'collected exactly the total');
    assert.equal(inv.payments.at(-1).via, 'aba');
  }
  assert.equal(st.invoices.find((i) => i.id === invs[2].id).status, 'unpaid', 'others untouched');
  await assert.rejects(c.post('/api/invoices/bulk-pay', { ids }), /400/, 'already paid');
  assert.ok(state.tenants.length === 3);
});

test('landlord gets contract-ending alerts once at 30 and 7 days, and a monthly summary', async () => {
  const { c, state } = await landlord(env.url, { rooms: 2 });
  const [t1, t2] = state.tenants;
  await c.put(`/api/tenants/${t1.id}`, { ...t1, contract: { start: '2026-01-01', end: '2026-12-10' } });
  await c.put(`/api/tenants/${t2.id}`, { ...t2, contract: { start: '2026-01-01', end: '2027-06-01' } });
  await c.post('/api/rooms', { id: 'Z9', rent: 80 });
  await inOrg(t1.id, (db) => { db.settings.telegram.adminChats = [{ chatId: 5150 }]; });
  const { contractAlerts, monthlyDigest } = await import('../server/scheduler.js');

  assert.equal(await inOrg(t1.id, () => contractAlerts('2026-11-01')), 0, '39 days away: nothing yet');
  assert.equal(await inOrg(t1.id, () => contractAlerts('2026-11-12')), 1, '28 days away');
  assert.equal(await inOrg(t1.id, () => contractAlerts('2026-11-13')), 0, 'only once');
  assert.equal(await inOrg(t1.id, () => contractAlerts('2026-12-04')), 1, '6 days away');
  assert.equal(await inOrg(t1.id, () => contractAlerts('2026-12-05')), 0);
  assert.match(toOwner(5150).find((x) => /កិច្ចសន្យា/.test(x)), /A1/);

  // Last month's invoices: one paid, one not; an expense; one empty room.
  const invs = (await c.post('/api/invoices/generate', { month: '2026-10' })).invoices.filter((i) => i.month === '2026-10');
  assert.equal(invs.length, 2);
  await c.post(`/api/invoices/${invs[0].id}/payments`, { amount: invs[0].total });
  await c.post('/api/expenses', { date: '2026-10-05', category: 'repair', amount: 30 });
  const r = await inOrg(t1.id, () => monthlyDigest({ ym: '2026-11', day: 1 }));
  assert.equal(r.owing, 1);
  assert.equal(r.costs, 30);
  assert.equal(r.empty, 1);
  assert.equal(Math.round(r.collected * 100), Math.round(invs[0].total * 100));
  assert.ok(toOwner(5150).some((x) => /សង្ខេបខែ/.test(x) && /Z9/.test(x)));
  assert.equal(await inOrg(t1.id, () => monthlyDigest({ ym: '2026-11', day: 2 })), null, 'once a month');
});

test('Khmer search still splits words without the extra library', async () => {
  const { tokenize, matchesQuery } = await import('../shared/khmer.js');
  assert.deepEqual(tokenize('សុខាផ្ទះ A12'), ['សុខា', 'ផ្ទះ', 'a12']);
  assert.ok(matchesQuery(['សុខា ចាន់', 'A12'], 'ចាន់'));
});
