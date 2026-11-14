import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('expenses: add, edit, delete, validation, hidden from staff', async () => {
  const { c } = await landlord(env.url);
  let st = await c.post('/api/expenses', { date: '2026-03-05', category: 'electric', amount: 120.5, note: 'EDC' });
  assert.equal(st.expenses.length, 1);
  const id = st.expenses[0].id;
  st = await c.put(`/api/expenses/${id}`, { amount: 130 });
  assert.equal(st.expenses[0].amount, 130);
  assert.equal(st.expenses[0].category, 'electric');
  await assert.rejects(c.post('/api/expenses', { amount: 0 }), /400/);
  const inv = await c.post('/api/team/invites', { role: 'staff' });
  const s = client(env.url);
  await s.post(`/api/join/${inv.token}`, { email: `ex${Date.now()}@example.com`, password: 'password123' });
  assert.equal((await s.get('/api/state')).expenses.length, 0);
  await assert.rejects(s.post('/api/expenses', { amount: 5 }), /403/);
  st = await c.del(`/api/expenses/${id}`);
  assert.equal(st.expenses.length, 0);
});

test('monthly expenses repeat automatically once per month', async () => {
  const { c, state } = await landlord(env.url);
  await c.post('/api/expenses', { date: '2026-01-31', category: 'internet', amount: 25, repeat: true });
  await c.post('/api/expenses', { date: '2026-01-10', category: 'repair', amount: 40 });
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db } = await import('../server/db.js');
  const { repeatMonthlyExpenses } = await import('../server/invoices.js');
  let orgId;
  for (const id of await listOrgIds()) if (await withOrg(id, () => db().tenants.some((t) => t.id === state.tenants[0].id))) orgId = id;
  assert.equal(await withOrg(orgId, () => repeatMonthlyExpenses('2026-02')), 1);
  assert.equal(await withOrg(orgId, () => repeatMonthlyExpenses('2026-02')), 0, 'not twice');
  assert.equal(await withOrg(orgId, () => repeatMonthlyExpenses('2026-03')), 1);
  const list = (await c.get('/api/state')).expenses.filter((e) => e.category === 'internet').map((e) => e.date).sort();
  assert.deepEqual(list, ['2026-01-31', '2026-02-28', '2026-03-31'], 'day clamps to month length');
});
