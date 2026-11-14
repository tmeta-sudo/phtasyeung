import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('room features are saved and unknown ones dropped', async () => {
  const { c } = await landlord(env.url);
  const st = await c.put('/api/rooms/A1', { features: ['ac', 'hotwater', 'spaceship'] });
  assert.deepEqual(st.rooms.find((r) => r.id === 'A1').features, ['ac', 'hotwater']);
});

test('ticked add-ons with quantity are billed every month', async () => {
  const { c, state } = await landlord(env.url);
  assert.ok(state.settings.addons.some((a) => a.id === 'moto'), 'default price list');
  const t = state.tenants[0];
  let st = await c.put(`/api/tenants/${t.id}`, { ...t, addons: [{ id: 'moto', qty: 2 }, { id: 'car', qty: 1 }, { id: 'nope', qty: 3 }, { id: 'moto', qty: 9 }] });
  assert.deepEqual(st.tenants[0].addons, [{ id: 'moto', qty: 2 }, { id: 'car', qty: 1 }]);
  st = await c.put(`/api/tenants/${t.id}`, { ...st.tenants[0], addons: [{ id: 'moto', qty: 99 }] });
  assert.equal(st.tenants[0].addons[0].qty, 5, 'capped at the max for that add-on');
  await c.put('/api/settings', { addons: [...st.settings.addons.map((a) => (a.id === 'moto' ? { ...a, price: 6 } : a))] });
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  const line = inv.items.find((it) => it.key === 'addon');
  assert.equal(line.amount, 30);
  assert.match(line.label, /ចំណតម៉ូតូ × ៥/);
  assert.equal(inv.total, 101 + 30);
});

test('removing an add-on from the price list stops billing it', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await c.put(`/api/tenants/${t.id}`, { ...t, addons: [{ id: 'wifi', qty: 1 }] });
  await c.put('/api/settings', { addons: state.settings.addons.filter((a) => a.id !== 'wifi') });
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  assert.ok(!inv.items.some((it) => it.key === 'addon'));
});
