import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

const orgOf = async (tenantId) => {
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db } = await import('../server/db.js');
  for (const id of await listOrgIds()) if (await withOrg(id, () => db().tenants.some((t) => t.id === tenantId))) return id;
  return null;
};
const inOrg = async (orgId, fn) => {
  const { withOrg } = await import('../server/store.js');
  const mod = await import('../server/db.js');
  return withOrg(orgId, () => { const r = fn(mod.db()); mod.save(); return r; });
};

test('late fee is added once, after the grace days, and the KHQR follows the new total', async () => {
  const { c, state } = await landlord(env.url);
  const orgId = await orgOf(state.tenants[0].id);
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  const { applyLateFees } = await import('../server/invoices.js');
  // Off by default
  assert.equal((await inOrg(orgId, () => applyLateFees('2099-01-01'))).length, 0);
  await c.put('/api/settings', { lateFee: { enabled: true, amount: 3, afterDays: 5 } });
  const due = inv.dueDate;
  const day = (n) => { const d = new Date(`${due}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  assert.equal((await inOrg(orgId, () => applyLateFees(day(4)))).length, 0, 'still in the grace period');
  assert.equal((await inOrg(orgId, () => applyLateFees(day(6)))).length, 1);
  assert.equal((await inOrg(orgId, () => applyLateFees(day(30)))).length, 0, 'only once');
  const after = (await c.get('/api/state')).invoices.find((i) => i.id === inv.id);
  assert.equal(after.total, inv.total + 3);
  assert.ok(after.items.some((it) => it.key === 'late'));
  assert.notEqual(after.khqr, inv.khqr, 'QR re-generated for the new amount');
});

test('announcements reach linked tenants of the chosen building only, and show in the portal', async () => {
  const { c } = await landlord(env.url, { rooms: 3 });
  await c.put('/api/rooms/A1', { building: 'North' });
  await c.put('/api/rooms/A2', { building: 'North' });
  const st = await c.put('/api/rooms/A3', { building: 'South' });
  const orgId = await orgOf(st.tenants[0].id);
  await inOrg(orgId, (d) => { d.tenants.find((t) => t.roomId === 'A1').telegram = { chatId: 5001 }; d.tenants.find((t) => t.roomId === 'A3').telegram = { chatId: 5003 }; });
  const before = env.tg.of('sendMessage').length;
  const r = await c.post('/api/notices', { text: 'កាត់ទឹកថ្ងៃស្អែក ៨-១២', target: { type: 'building', value: 'North' } });
  assert.deepEqual(r.result, { sent: 1, unlinked: 1, total: 2 });
  const sent = env.tg.of('sendMessage').slice(before);
  assert.equal(sent.length, 1);
  assert.equal(String(sent[0].payload.chat_id), '5001');
  assert.match(sent[0].payload.text, /កាត់ទឹក/);
  const tA2 = r.tenants.find((t) => t.roomId === 'A2'); const tA3 = r.tenants.find((t) => t.roomId === 'A3');
  const p2 = await client(env.url).get(`/api/portal/${tA2.portalToken}`);
  const p3 = await client(env.url).get(`/api/portal/${tA3.portalToken}`);
  assert.equal(p2.notices.length, 1);
  assert.equal(p3.notices.length, 0);
  await assert.rejects(c.post('/api/notices', { text: '' }), /400/);
});

test('staff cannot send announcements', async () => {
  const { c } = await landlord(env.url);
  const inv = await c.post('/api/team/invites', { role: 'staff' });
  const s = client(env.url);
  await s.post(`/api/join/${inv.token}`, { email: `st${Date.now()}@example.com`, password: 'lotus-river-2026' });
  await assert.rejects(s.post('/api/notices', { text: 'hi' }), /403/);
});
