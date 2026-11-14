import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('one login, several properties: create, switch, data stays separate', async () => {
  const { c, state } = await landlord(env.url); // home: room A1 + tenant
  await c.put('/api/settings', { currency: 'KHR' });
  const made = await c.post('/api/properties', { name: 'ផ្ទះទី ២ សៀមរាប' });
  let st = await c.get('/api/state');
  assert.equal(st.settings.propertyName, 'ផ្ទះទី ២ សៀមរាប');
  assert.equal(st.rooms.length, 0, 'the new property starts empty');
  assert.equal(st.settings.currency, 'KHR', 'same currency as the first place');
  assert.equal(st.settings.khqr.accountId, 'owner@aclb', 'same KHQR');
  assert.equal(st.account.role, 'owner');
  assert.equal(st.account.home, false);
  await c.post('/api/rooms', { id: 'S1', rent: 300000 });
  let list = (await c.get('/api/properties')).properties;
  assert.equal(list.length, 2);
  assert.equal(list.find((p) => p.current).id, made.id);
  const home = list.find((p) => p.home);
  await c.post('/api/properties/switch', { id: home.id });
  st = await c.get('/api/state');
  assert.deepEqual(st.rooms.map((r) => r.id), ['A1']);
  assert.equal(st.tenants[0].id, state.tenants[0].id);

  // Nobody else can switch into it.
  const other = await landlord(env.url);
  await assert.rejects(other.c.post('/api/properties/switch', { id: made.id }), /404/);
  assert.equal((await other.c.get('/api/properties')).properties.length, 1);

  // Staff of the first property do not get the second one.
  const inv = await c.post('/api/team/invites', { role: 'staff' });
  const staff = client(env.url);
  await staff.post(`/api/join/${inv.token}`, { email: `ps${Date.now()}@example.com`, password: 'lotus-river-2026' });
  await assert.rejects(staff.post('/api/properties/switch', { id: made.id }), /404/);
  await assert.rejects(staff.post('/api/properties', { name: 'x' }), /403/);

  // The account cannot be deleted while an extra property exists; deleting the extra one returns home.
  await assert.rejects(c.post('/api/account/delete', { password: 'lotus-river-2026' }), /400/);
  await c.post('/api/properties/switch', { id: made.id });
  const del = await c.post('/api/account/delete', { password: 'lotus-river-2026' });
  assert.equal(del.switched, true);
  st = await c.get('/api/state');
  assert.deepEqual(st.rooms.map((r) => r.id), ['A1']);
  assert.equal((await c.get('/api/properties')).properties.length, 1);
});
