import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

let n = 0;
async function join(owner, role) {
  const inv = await owner.post('/api/team/invites', { role, name: `${role} person` });
  const c = client(env.url);
  const info = await c.get(`/api/join/${inv.token}`);
  assert.equal(info.role, role);
  n += 1;
  await c.post(`/api/join/${inv.token}`, { email: `${role}${n}-${Date.now()}@example.com`, password: 'password123' });
  return { c, token: inv.token };
}

test('invite links work once and only for manager/staff', async () => {
  const { c: owner } = await landlord(env.url);
  await assert.rejects(owner.post('/api/team/invites', { role: 'owner' }), /400/);
  const { token } = await join(owner, 'staff');
  await assert.rejects(client(env.url).get(`/api/join/${token}`), /404/);
  await assert.rejects(client(env.url).post(`/api/join/${token}`, { email: 'again@example.com', password: 'password123' }), /404/);
  const t = await owner.get('/api/team');
  assert.equal(t.members.length, 2);
  assert.deepEqual(t.members.map((m) => m.role).sort(), ['owner', 'staff']);
});

test('staff see no money, no ID cards, and cannot reach owner routes', async () => {
  const { c: owner, state } = await landlord(env.url);
  await owner.post('/api/invoices/generate', {});
  const { c: staff } = await join(owner, 'staff');
  const st = await staff.get('/api/state');
  assert.equal(st.account.role, 'staff');
  assert.equal(st.invoices.length, 0);
  assert.equal(st.events.length, 0);
  assert.equal(st.rooms[0].rent, 0);
  assert.equal(st.tenants[0].files.idFront, undefined);
  assert.equal(st.tenants[0].portalToken, undefined);
  assert.equal(st.settings.khqr.accountId, undefined);
  const text = JSON.stringify(st);
  assert.ok(!text.includes('owner@aclb'), 'no KHQR account');
  assert.ok(!text.includes(state.tenants[0].portalToken), 'no portal link');

  for (const [m, u, b] of [
    ['get', '/api/account/export'], ['post', '/api/invoices/generate', {}], ['post', '/api/backup/telegram', {}],
    ['put', '/api/settings', { waterRate: 9 }], ['post', '/api/tenants', { nameKm: 'x' }], ['get', `/api/tenants/${state.tenants[0].id}/files/idFront`],
    ['post', '/api/team/invites', { role: 'staff' }], ['post', '/api/account/delete', {}], ['get', '/api/storage'],
  ]) await assert.rejects(staff[m](u, b), /403/, `${m} ${u} must be blocked for staff`);

  // What staff are for: meter readings.
  const [y, mo] = st.today.ym.split('-').map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  const meters = await staff.post('/api/meters', { roomId: 'A1', month: next, water: 12, electric: 340 });
  assert.ok(meters.meters.some((x) => x.roomId === 'A1'));
  assert.equal(meters.invoices.length, 0, 'responses are filtered too');
});

test('managers run the business but cannot touch owner settings', async () => {
  const { c: owner } = await landlord(env.url);
  const { c: mgr } = await join(owner, 'manager');
  const st = await mgr.get('/api/state');
  assert.equal(st.account.role, 'manager');
  assert.equal((await mgr.post('/api/invoices/generate', {})).result.created, 1);
  await mgr.put('/api/settings', { waterRate: 0.75 });
  await assert.rejects(mgr.put('/api/settings', { khqr: { accountId: 'thief@aclb' } }), /403/);
  await assert.rejects(mgr.put('/api/settings', { bakongToken: '' }), /403/);
  await assert.rejects(mgr.get('/api/account/export'), /403/);
  await assert.rejects(mgr.post('/api/backup/restore', { data: {} }), /403/);
  await assert.rejects(mgr.get('/api/team'), /403/);
  assert.equal((await owner.get('/api/state')).settings.khqr.accountId, 'owner@aclb');
});

test('owner changes a role or removes a member; their sessions end at once', async () => {
  const { c: owner } = await landlord(env.url);
  const { c: staff } = await join(owner, 'staff');
  const t = await owner.get('/api/team');
  const member = t.members.find((m) => m.role === 'staff');
  const me = t.members.find((m) => m.you);
  await assert.rejects(owner.put(`/api/team/${me.id}`, { role: 'staff' }), /400/);
  await owner.put(`/api/team/${member.id}`, { role: 'manager' });
  await assert.rejects(staff.get('/api/state'), /401/);
  await owner.del(`/api/team/${member.id}`);
  assert.equal((await owner.get('/api/team')).members.length, 1);
});

test('one landlord cannot manage another landlord\'s team', async () => {
  const a = await landlord(env.url);
  const b = await landlord(env.url);
  await join(a.c, 'staff');
  const member = (await a.c.get('/api/team')).members.find((m) => m.role === 'staff');
  await assert.rejects(b.c.put(`/api/team/${member.id}`, { role: 'owner' }), /404/);
  await assert.rejects(b.c.del(`/api/team/${member.id}`), /404/);
});
