import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('rent in dollars, electricity and parking in riel: one invoice in dollars, original prices shown', async () => {
  const { c, state } = await landlord(env.url); // room A1, rent 101 USD, Tenant 1
  const t = state.tenants[0];
  await c.put('/api/settings', {
    exchangeRate: 4000, waterRate: 0.5, electricRate: 720, electricCur: 'KHR',
    addons: [{ id: 'moto', icon: '🛵', label: 'ចំណតម៉ូតូ', price: 20000, max: 5, cur: 'KHR' }, { id: 'wifi', icon: '📶', label: 'Wi-Fi', price: 5, max: 1 }],
  });
  await c.put(`/api/tenants/${t.id}`, { ...t, addons: [{ id: 'moto', qty: 2 }, { id: 'wifi', qty: 1 }] });
  await c.post('/api/meters', { roomId: 'A1', month: state.today.ym, water: 10, electric: 100 });
  const inv = (await c.post('/api/invoices/generate', {})).invoices.find((i) => i.roomId === 'A1');
  const item = (k) => inv.items.find((i) => i.key === k || i.addon === k);

  assert.equal(item('rent').amount, 101);
  assert.equal(item('water').amount, 5, 'water follows the billing currency');
  assert.equal(item('electric').amount, 18, '100 kWh × 720 ៛ = 72,000 ៛ = $18');
  assert.match(item('electric').note, /100 × 720 ៛ = 72,000 ៛/);
  assert.equal(item('electric').rate, undefined, 'no misleading dollar unit price');
  assert.equal(item('moto').amount, 10, '2 × 20,000 ៛ = 40,000 ៛ = $10');
  assert.match(item('moto').note, /2 × 20,000 ៛ = 40,000 ៛/);
  assert.equal(item('wifi').amount, 5);
  assert.equal(inv.total, 139);
  assert.equal(inv.khqr.length > 20, true, 'one KHQR in the billing currency');

  // Switching the billing currency to riel: riel prices stay as they are, dollar ones are converted.
  const st = await c.put('/api/settings', { currency: 'KHR' });
  assert.equal(st.settings.electricRate, 720);
  assert.equal(st.settings.electricCur, '');
  assert.equal(st.settings.waterRate, 2000);
  const moto = st.settings.addons.find((a) => a.id === 'moto');
  assert.equal(moto.price, 20000);
  assert.equal(moto.cur, '');
  assert.equal(st.settings.addons.find((a) => a.id === 'wifi').price, 20000, '$5 → 20,000 ៛');
});

test('billing in riel with an add-on priced in dollars', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await c.put('/api/settings', { currency: 'KHR', exchangeRate: 4100 });
  await c.put('/api/settings', { addons: [{ id: 'car', icon: '🚗', label: 'ចំណតឡាន', price: 25, max: 2, cur: 'USD' }] });
  await c.put(`/api/tenants/${t.id}`, { ...t, addons: [{ id: 'car', qty: 1 }] });
  const inv = (await c.post('/api/invoices/generate', {})).invoices.find((i) => i.roomId === 'A1');
  const car = inv.items.find((i) => i.addon === 'car');
  assert.equal(car.amount, 102500, '$25 × 4100 = 102,500 ៛');
  assert.match(car.note, /^\$25(\.00)?$/, 'original price shown on the line');
});
