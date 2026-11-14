import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('a shared room: several tenants, one bill, everyone can see and pay it', async () => {
  const { c, state } = await landlord(env.url); // A1 with Tenant 1
  const t1 = state.tenants[0];
  await assert.rejects(c.post('/api/tenants', { nameKm: 'មិត្ត ២', roomId: 'A1', status: 'active' }), /400/, 'single room is full');
  await c.put('/api/rooms/A1', { capacity: 3 });
  let st = await c.post('/api/tenants', { nameKm: 'មិត្ត ២', roomId: 'A1', status: 'active', addons: [{ id: 'moto', qty: 1 }] });
  const t2 = st.tenants.find((t) => t.nameKm === 'មិត្ត ២');
  st = await c.post('/api/tenants', { nameKm: 'មិត្ត ៣', roomId: 'A1', status: 'active' });
  await assert.rejects(c.post('/api/tenants', { nameKm: 'មិត្ត ៤', roomId: 'A1', status: 'active' }), /400/, 'full at 3');
  await assert.rejects(c.put('/api/rooms/A1', { capacity: 2 }), /400/, 'cannot shrink below who lives there');

  st = await c.post('/api/invoices/generate', {});
  assert.equal(st.invoices.length, 1, 'one invoice for the room');
  const inv = st.invoices[0];
  assert.equal(inv.tenantIds.length, 3);
  assert.match(inv.name, /មិត្ត ២/);
  assert.equal(inv.total, 101 + 5, "rent once + the roommate's motorbike");
  assert.match(inv.items.find((i) => i.key === 'addon').label, /មិត្ត ២/);

  // The second roommate sees the bill in their own portal and can report payment.
  const portal = client(env.url);
  const p2 = await portal.get(`/api/portal/${t2.portalToken}`);
  assert.equal(p2.invoices.length, 1);
  assert.equal(p2.roommates.length, 2);
  await portal.post(`/api/portal/${t2.portalToken}/invoices/${inv.id}/claim`, {});
  assert.equal((await c.get('/api/state')).invoices[0].status, 'claimed');

  // A stranger from another room cannot.
  await c.post('/api/rooms', { id: 'Z9', rent: 50 });
  const other = (await c.post('/api/tenants', { nameKm: 'ផ្សេង', roomId: 'Z9', status: 'active' })).tenants.find((t) => t.nameKm === 'ផ្សេង');
  await assert.rejects(portal.get(`/api/portal/${other.portalToken}/invoices/${inv.id}/status`), /404/);

  // The first tenant moves out: the bill stays with the roommates and the room stays occupied.
  await c.put(`/api/invoices/${inv.id}`, { status: 'unpaid' });
  const out = await c.post(`/api/tenants/${t1.id}/moveout`, {});
  assert.equal(out.result.unpaid, 0, 'the leaver is not charged the whole room bill');
  const after = out.invoices.find((i) => i.id === inv.id);
  assert.equal(after.tenantId, t2.id);
  assert.equal(after.tenantIds.length, 2);
  assert.ok(!after.name.includes('Tenant 1') && !after.name.includes('អតិថិជន ១'));
});

test('editing a room keeps its photos', async () => {
  const { c } = await landlord(env.url);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData(); form.set('file', new Blob([png], { type: 'image/png' }), 'r.png');
  assert.equal((await c.raw('/api/rooms/A1/photos', { method: 'POST', body: form })).status, 200);
  const st = await c.put('/api/rooms/A1', { rent: 130, photos: [] });
  assert.equal(st.rooms[0].rent, 130);
  assert.equal(st.rooms[0].photos.length, 1);
});
