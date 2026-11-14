import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

const S = { dueDays: 7, holidays: { shiftDue: true } };

test('due dates: default, payday, two halves, short months, holidays', async () => {
  const { dueDatesFor, afterHolidays, isHoliday } = await import('../server/due.js');
  assert.deepEqual(dueDatesFor({}, '2026-06', '2026-06-01', S), { dueDate: '2026-06-08', payday: false });
  assert.deepEqual(dueDatesFor({ pay: { day: 10 } }, '2026-06', '2026-06-01', S), { dueDate: '2026-06-10', payday: true });
  assert.equal(dueDatesFor({ pay: { day: 5 } }, '2026-06', '2026-06-20', S).dueDate, '2026-07-05', 'payday already passed → next one');
  assert.deepEqual(dueDatesFor({ pay: { day: 10, day2: 25 } }, '2026-06', '2026-06-01', S), { dueDate: '2026-06-10', dueDate2: '2026-06-25', payday: true });
  assert.equal(dueDatesFor({ pay: { day: 25, day2: 10 } }, '2026-06', '2026-06-01', S).dueDate2, '2026-07-10');
  assert.equal(dueDatesFor({ pay: { day: 31 } }, '2027-02', '2027-02-01', S).dueDate, '2027-02-28');
  // Khmer New Year 14–16 April 2026 → the 17th; no shift when the landlord turns it off.
  assert.ok(isHoliday('2026-04-14'));
  assert.equal(afterHolidays('2026-04-14'), '2026-04-17');
  assert.equal(dueDatesFor({ pay: { day: 15 } }, '2026-04', '2026-04-01', S).dueDate, '2026-04-17');
  assert.equal(dueDatesFor({ pay: { day: 15 } }, '2026-04', '2026-04-01', { holidays: { shiftDue: false } }).dueDate, '2026-04-15');
});

async function inOrg(tenantId, fn) {
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const mod = await import('../server/db.js');
  for (const id of await listOrgIds()) {
    const hit = await withOrg(id, () => mod.db().tenants.some((t) => t.id === tenantId));
    if (hit) return withOrg(id, async () => { const r = await fn(mod.db()); mod.save(); return r; });
  }
  return null;
}

test('paying in two halves: overdue only when the right half is missing', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await c.put(`/api/tenants/${t.id}`, { ...t, pay: { day: 10, day2: 25 } });
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  assert.ok(inv.dueDate2 > inv.dueDate);
  const { isOverdue } = await import('../server/invoices.js');
  const d = (base, n) => { const x = new Date(base + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const check = (day) => inOrg(t.id, (db) => isOverdue(db.invoices[0], day));
  assert.equal(await check(inv.dueDate), false);
  assert.equal(await check(d(inv.dueDate, 1)), true, 'first half missing');
  await c.post(`/api/invoices/${inv.id}/payments`, { amount: 51 });
  assert.equal(await check(d(inv.dueDate, 1)), false, 'first half paid');
  assert.equal(await check(d(inv.dueDate2, 1)), true, 'second half missing');
});

test('holidays: reminders pause, greeting is sent once and only when turned on', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await inOrg(t.id, (db) => { db.tenants[0].telegram = { chatId: 91001 }; });
  const { holidayGreeting } = await import('../server/scheduler.js');
  const count = () => env.tg.calls.filter((x) => String(x.payload?.chat_id) === '91001').length;
  let n = count();
  assert.equal(await inOrg(t.id, () => holidayGreeting('2026-04-14')), 0, 'off by default');
  await c.put('/api/settings', { holidays: { greet: true } });
  assert.equal(await inOrg(t.id, () => holidayGreeting('2026-04-14')), 1);
  assert.equal(count(), n + 1);
  assert.equal(await inOrg(t.id, () => holidayGreeting('2026-04-14')), 0, 'once');
  assert.equal(await inOrg(t.id, () => holidayGreeting('2026-04-15')), 0, 'not on day two');
  assert.equal(await inOrg(t.id, () => holidayGreeting('2026-06-03')), 0, 'ordinary day');
});
