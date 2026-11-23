// Rental record: the landlord issues it, anyone with the link can read it (no ID or phone),
// re-issuing or withdrawing makes old links stop working, staff cannot issue one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

const tokenOf = (url) => url.split('/r/')[1];

test('record counts on-time and late bills and the deposit at move-out', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await c.put(`/api/tenants/${t.id}`, { ...t, idNumber: '010234567', phone: '012345678' });
  await c.put(`/api/tenants/${t.id}/deposit`, { held: 200 });
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  await c.post(`/api/invoices/${inv.id}/payments`, { amount: inv.total }); // paid today: before the due date

  // an older bill that was paid after its due date
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  for (const id of await listOrgIds()) {
    await withOrg(id, () => {
      if (!db().tenants.some((x) => x.id === t.id)) return;
      db().invoices.push({ id: 'old1', number: 'X-1', month: '2026-01', tenantId: t.id, roomId: t.roomId, status: 'paid', total: 101, items: [], dueDate: '2026-01-07', paidAt: '2026-01-20T05:00:00Z', payments: [] });
      save();
    });
  }

  let r = await c.post(`/api/tenants/${t.id}/record`, { note: 'Quiet, kept the room clean' });
  const first = tokenOf(r.result.url);
  const pub = client(env.url);
  let rec = await pub.get(`/api/r/${first}`);
  assert.equal(rec.bills, 2);
  assert.equal(rec.onTime, 1);
  assert.equal(rec.late, 1);
  assert.equal(rec.owed, 0);
  assert.equal(rec.current, true);
  assert.equal(rec.deposit, null);
  assert.equal(rec.note, 'Quiet, kept the room clean');
  const text = JSON.stringify(rec);
  assert.ok(!text.includes('010234567') && !text.includes('012345678'), 'no ID or phone number');

  // move out with no deductions, then re-issue: the deposit shows as returned in full; the old link stops working
  await c.post(`/api/tenants/${t.id}/moveout`, {});
  r = await c.post(`/api/tenants/${t.id}/record`, {});
  const second = tokenOf(r.result.url);
  await assert.rejects(pub.get(`/api/r/${first}`), /404/);
  rec = await pub.get(`/api/r/${second}`);
  assert.equal(rec.current, false);
  assert.ok(rec.to);
  assert.deepEqual({ full: rec.deposit.full, returned: rec.deposit.returned }, { full: true, returned: 200 });

  // withdrawn
  await c.del(`/api/tenants/${t.id}/record`);
  await assert.rejects(pub.get(`/api/r/${second}`), /404/);
  await assert.rejects(pub.get('/api/r/not-a-real-token-at-all'), /404/);
});

test('staff cannot issue a rental record; a manager can', async () => {
  const { c: owner, state } = await landlord(env.url);
  const join = async (role) => {
    const inv = await owner.post('/api/team/invites', { role, name: role });
    const c = client(env.url);
    await c.post(`/api/join/${inv.token}`, { email: `${role}-rec-${Date.now()}@example.com`, password: 'lotus-river-2026' });
    return c;
  };
  const staff = await join('staff');
  await assert.rejects(staff.post(`/api/tenants/${state.tenants[0].id}/record`, {}), /403/);
  const manager = await join('manager');
  const r = await manager.post(`/api/tenants/${state.tenants[0].id}/record`, {});
  assert.match(r.result.url, /\/r\/[\w-]{18,}$/);
});
