import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('paying the move-in invoice records the deposit as held', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  const r = await c.post(`/api/tenants/${t.id}/movein-invoice`, {});
  const inv = r.invoices.find((i) => i.id === r.result.invoiceId);
  const dep = inv.items.find((it) => it.key === 'deposit').amount;
  const st = await c.put(`/api/invoices/${inv.id}`, { status: 'paid' });
  assert.equal(st.tenants[0].deposit.held, dep);
});

test('move-out: deposit pays deductions and unpaid bills first, then the rest is refunded', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await c.put(`/api/tenants/${t.id}/deposit`, { held: 200 });
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0]; // rent 101
  await c.post(`/api/invoices/${inv.id}/payments`, { amount: 21 }); // 80 left
  const r = await c.post(`/api/tenants/${t.id}/moveout`, { deductions: [{ label: 'សម្អាត', amount: 15 }, { label: '', amount: 9 }] });
  assert.deepEqual({ deposit: r.result.deposit, ded: r.result.deductionsTotal, applied: r.result.applied, refund: r.result.refund, owes: r.result.owes }, { deposit: 200, ded: 15, applied: 80, refund: 105, owes: 0 });
  const after = r.invoices.find((i) => i.id === inv.id);
  assert.equal(after.status, 'paid');
  assert.equal(after.payments.at(-1).via, 'deposit');
  const tt = r.tenants.find((x) => x.id === t.id);
  assert.equal(tt.status, 'former');
  assert.equal(tt.deposit.held, 0);
  // The room is free for the next tenant.
  await c.post('/api/tenants', { nameKm: 'ថ្មី', roomId: 'A1', status: 'active' });
  await assert.rejects(c.post(`/api/tenants/${t.id}/moveout`, {}), /400/, 'cannot move out twice');
});

test('move-out: when deductions exceed the deposit, the tenant still owes the difference', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await c.put(`/api/tenants/${t.id}/deposit`, { held: 50 });
  await c.post('/api/invoices/generate', {}); // 101 unpaid
  const r = await c.post(`/api/tenants/${t.id}/moveout`, { deductions: [{ label: 'ខូចទ្វារ', amount: 70 }] });
  assert.equal(r.result.refund, 0);
  assert.equal(r.result.owes, 20 + 101);
  const msg = env.tg.calls.at(-1);
  assert.ok(!msg || !String(msg.payload?.text || '').includes('undefined'));
});
