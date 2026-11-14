import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('tenant attaches a slip; owner saves the reading, confirms, and a reused slip is flagged', async () => {
  const { c, state } = await landlord(env.url, { rooms: 2 });
  const st = await c.post('/api/invoices/generate', {});
  const [a, b] = st.invoices;
  const tA = state.tenants.find((t) => t.roomId === a.roomId); const tB = state.tenants.find((t) => t.roomId === b.roomId);
  const portal = client(env.url);
  const send = async (t, inv) => { const f = new FormData(); f.set('file', new Blob([png], { type: 'image/png' }), 's.png'); return portal.raw(`/api/portal/${t.portalToken}/invoices/${inv.id}/claim`, { method: 'POST', body: f }); };
  assert.equal((await send(tA, a)).status, 200);
  let cur = (await c.get('/api/state')).invoices.find((i) => i.id === a.id);
  assert.equal(cur.status, 'claimed');
  const claim = cur.claims.at(-1);
  assert.ok(claim.file);
  assert.equal((await c.raw(`/api/invoices/${a.id}/claims/${claim.id}/photo`)).status, 200);
  assert.equal((await client(env.url).raw(`/api/invoices/${a.id}/claims/${claim.id}/photo`)).status, 401, 'slips are private');
  let r = await c.post(`/api/invoices/${a.id}/claims/${claim.id}/slip`, { status: 'match', amount: a.total, paid: a.total, currency: 'USD', ref: 'TRX-123 456', bank: 'ABA' });
  const saved = r.invoices.find((i) => i.id === a.id).claims.at(-1).slip;
  assert.equal(saved.ref, 'TRX123456');
  assert.equal(saved.duplicateOf, '');
  r = await c.post(`/api/invoices/${a.id}/payments`, { amount: a.total, via: 'bank', ref: saved.ref });
  assert.equal(r.invoices.find((i) => i.id === a.id).status, 'paid');
  // The same screenshot sent for another room's bill.
  await send(tB, b);
  cur = (await c.get('/api/state')).invoices.find((i) => i.id === b.id);
  r = await c.post(`/api/invoices/${b.id}/claims/${cur.claims.at(-1).id}/slip`, { status: 'match', amount: b.total, paid: b.total, ref: 'TRX123456' });
  assert.equal(r.invoices.find((i) => i.id === b.id).claims.at(-1).slip.duplicateOf, a.number);
});
