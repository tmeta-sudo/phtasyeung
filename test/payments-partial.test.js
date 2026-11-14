import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

test('partial payments reduce the balance; the KHQR asks only for what is left', async () => {
  const { c } = await landlord(env.url);
  let st = await c.post('/api/invoices/generate', {});
  const inv = st.invoices[0];
  assert.equal(inv.balance, inv.total);
  st = await c.post(`/api/invoices/${inv.id}/payments`, { amount: 40, via: 'cash' });
  let x = st.invoices.find((i) => i.id === inv.id);
  assert.equal(x.status, 'unpaid');
  assert.equal(x.paid, 40);
  assert.equal(x.balance, inv.total - 40);
  assert.notEqual(x.khqr, inv.khqr, 'new QR for the balance');
  assert.equal(x.khqrAmount, inv.total - 40);
  await assert.rejects(c.post(`/api/invoices/${inv.id}/payments`, { amount: inv.total }), /400/, 'cannot pay more than owed');
  st = await c.post(`/api/invoices/${inv.id}/payments`, { amount: inv.total - 40, via: 'aba' });
  x = st.invoices.find((i) => i.id === inv.id);
  assert.equal(x.status, 'paid');
  assert.equal(x.paid, inv.total);
  assert.equal(x.payments.length, 2);
  // Undo the last payment: back to partially paid.
  st = await c.del(`/api/invoices/${inv.id}/payments/${x.payments[1].id}`);
  x = st.invoices.find((i) => i.id === inv.id);
  assert.equal(x.status, 'unpaid');
  assert.equal(x.balance, inv.total - 40);
});

test('"paid in full" records the remaining balance only', async () => {
  const { c } = await landlord(env.url);
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  await c.post(`/api/invoices/${inv.id}/payments`, { amount: 10 });
  const x = (await c.put(`/api/invoices/${inv.id}`, { status: 'paid' })).invoices.find((i) => i.id === inv.id);
  assert.equal(x.paid, inv.total);
  assert.deepEqual(x.payments.map((p) => p.amount), [10, inv.total - 10]);
});

test('unpaid balance carries onto next month, and comes back if that invoice is deleted', async () => {
  const { c } = await landlord(env.url);
  const st0 = await c.get('/api/state');
  const m1 = st0.today.ym; const m2 = nextMonth(m1);
  const a = (await c.post('/api/invoices/generate', { month: m1 })).invoices[0];
  await c.post(`/api/invoices/${a.id}/payments`, { amount: 30 });
  const st = await c.post('/api/invoices/generate', { month: m2 });
  const b = st.invoices.find((i) => i.month === m2);
  const old = st.invoices.find((i) => i.id === a.id);
  const arrears = b.items.find((it) => it.key === 'arrears');
  assert.equal(arrears.amount, a.total - 30);
  assert.equal(b.total, a.total + arrears.amount, 'rent again + old balance');
  assert.equal(old.status, 'paid');
  assert.equal(old.paidVia, 'carried');
  assert.equal(old.paid, 30, 'only real money counts as collected');
  const back = (await c.del(`/api/invoices/${b.id}`)).invoices.find((i) => i.id === a.id);
  assert.equal(back.status, 'unpaid');
  assert.equal(back.balance, a.total - 30);
});

test('carry-over can be switched off', async () => {
  const { c } = await landlord(env.url);
  await c.put('/api/settings', { carryOver: false });
  const st0 = await c.get('/api/state');
  await c.post('/api/invoices/generate', { month: st0.today.ym });
  const st = await c.post('/api/invoices/generate', { month: nextMonth(st0.today.ym) });
  assert.ok(st.invoices.every((i) => !i.items.some((it) => it.key === 'arrears')));
});
