import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('tieredCost follows EDC-style bands', async () => {
  const { tieredCost } = await import('../server/invoices.js');
  const bands = [{ upTo: 10, rate: 0.1 }, { upTo: 50, rate: 0.2 }, { upTo: null, rate: 0.3 }];
  assert.equal(tieredCost(5, bands).amount, 0.5);
  assert.equal(tieredCost(30, bands).amount, 1 + 4);
  assert.equal(tieredCost(80, bands).amount, 1 + 8 + 9);
  assert.equal(tieredCost(80, [], 0.25).amount, 20, 'no bands = flat rate');
});

test('invoice uses tiered electricity prices', async () => {
  const { c, state } = await landlord(env.url);
  await c.put('/api/settings', { electricRate: 0.25, waterRate: 0.5, tiers: { electric: [{ upTo: 50, rate: 0.15 }, { upTo: '', rate: 0.25 }], water: [] } });
  await c.post('/api/meters', { roomId: 'A1', month: state.today.ym, water: 10, electric: 80 });
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  const el = inv.items.find((it) => it.key === 'electric');
  assert.equal(el.amount, 50 * 0.15 + 30 * 0.25);
  assert.match(el.note, /50x\$0.15 \+ 30x\$0.25/);
  assert.equal(inv.items.find((it) => it.key === 'water').amount, 5);
});

test('shared meter usage is split equally between rented rooms', async () => {
  const { c, state } = await landlord(env.url, { rooms: 3 }); // A1..A3 rented
  await c.post('/api/rooms', { id: 'A4', rent: 50 }); // vacant
  let st = await c.put('/api/settings', { electricRate: 0.2, sharedMeters: [{ name: 'ជាន់ ១', kind: 'electric', rooms: ['A1', 'A2', 'A3', 'A4'], reading: 1000 }] });
  const g = st.settings.sharedMeters[0];
  assert.equal(g.rooms.length, 4);
  await assert.rejects(c.post('/api/meters/shared', { groupId: g.id, month: state.today.ym, value: 900 }), /400/);
  st = await c.post('/api/meters/shared', { groupId: g.id, month: state.today.ym, value: 1300 });
  assert.equal(st.settings.sharedMeters[0].reading, 1300);
  // Rooms in the group only need their water reading now.
  await c.post('/api/meters', { roomId: 'A1', month: state.today.ym, water: 3 });
  st = await c.post('/api/invoices/generate', {});
  for (const id of ['A1', 'A2', 'A3']) {
    const el = st.invoices.find((i) => i.roomId === id).items.find((it) => it.key === 'electric');
    assert.equal(el.amount, 20, `${id}: 300 kWh × $0.2 ÷ 3 rented rooms`);
    assert.equal(el.qty, 100);
  }
});
