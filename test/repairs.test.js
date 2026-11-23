// Tenants report repairs from their own page (no Telegram needed); the owner answers in the
// inbox; the tenant sees the reply and the status; the reports count how fast it went.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';
import { repairStats } from '../shared/repairs.js';
import { DICTIONARY } from '../src/portal/i18n.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('tenant reports a repair on their page, owner replies without Telegram, tenant sees it fixed', async () => {
  const { c, state } = await landlord(env.url);
  const tok = state.tenants[0].portalToken;
  const portal = client(env.url);

  await assert.rejects(portal.post(`/api/portal/${tok}/tickets`, { kind: 'maintenance', text: '  ' }), /400/);
  let p = await portal.post(`/api/portal/${tok}/tickets`, { kind: 'maintenance', text: 'Air-con is not cooling' });
  assert.equal(p.tickets.length, 1);
  const tk = p.tickets[0];
  assert.equal(tk.status, 'open');
  assert.equal(tk.kind, 'maintenance');
  assert.ok(!('adminMsgIds' in tk) && !('tenantMsgIds' in tk), 'no Telegram internals on the tenant page');

  // a photo, added to the same request
  const form = new FormData();
  form.set('ticketId', tk.id); form.set('text', '');
  form.set('file', new Blob([PNG], { type: 'image/png' }), 'ac.png');
  const res = await portal.raw(`/api/portal/${tok}/tickets`, { method: 'POST', body: form });
  assert.equal(res.status, 200);
  p = await res.json();
  const photoIdx = p.tickets[0].messages.findIndex((m) => m.photo != null);
  assert.ok(photoIdx > 0);
  const img = await portal.raw(`/api/portal/${tok}/tickets/${tk.id}/photo/${photoIdx}`);
  assert.equal(img.status, 200);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);

  // owner sees it in the inbox (with the photo), replies (tenant has no Telegram) and fixes it
  let st = await c.get('/api/state');
  const owned = st.tickets.find((x) => x.id === tk.id);
  assert.equal(owned.messages.length, 2);
  assert.equal((await c.raw(`/api/tickets/${tk.id}/photo/${photoIdx}`)).status, 200);
  st = await c.post(`/api/tickets/${tk.id}/reply`, { text: 'Technician comes at 3pm' });
  assert.equal(st.tickets.find((x) => x.id === tk.id).status, 'progress');
  await c.put(`/api/tickets/${tk.id}`, { status: 'done' });

  p = await portal.get(`/api/portal/${tok}`);
  const seen = p.tickets[0];
  assert.equal(seen.status, 'done');
  assert.ok(seen.doneAt);
  assert.equal(seen.messages.at(-1).from, 'owner');
  assert.equal(seen.messages.at(-1).text, 'Technician comes at 3pm');

  // another tenant cannot read this request's photo
  const other = await landlord(env.url);
  const img2 = await portal.raw(`/api/portal/${other.state.tenants[0].portalToken}/tickets/${tk.id}/photo/${photoIdx}`);
  assert.equal(img2.status, 404);

  const stats = repairStats((await c.get('/api/state')).tickets);
  assert.equal(stats.count, 1);
  assert.equal(stats.done, 1);
  assert.equal(stats.open, 0);
  assert.ok(stats.medianReplyH >= 0 && stats.medianFixH >= stats.medianReplyH);
});

test('repair stats: medians, open requests and old tickets without timestamps', () => {
  const H = 3600000; const now = Date.UTC(2026, 10, 20);
  const at = (h) => new Date(now - h * H).toISOString();
  const tickets = [
    { kind: 'maintenance', status: 'done', createdAt: at(50), firstReplyAt: at(48), doneAt: at(26), messages: [] }, // reply 2h, fix 24h
    { kind: 'maintenance', status: 'done', createdAt: at(10), updatedAt: at(4), messages: [{ from: 'tenant', at: at(10) }, { from: 'owner', at: at(6) }] }, // older shape: 4h, 6h
    { kind: 'maintenance', status: 'open', createdAt: at(30), messages: [] },
    { kind: 'message', status: 'open', createdAt: at(1), messages: [] },
    { kind: 'maintenance', status: 'done', createdAt: at(24 * 200), doneAt: at(24 * 199), messages: [] }, // outside 90 days
  ];
  const s = repairStats(tickets, { now });
  assert.deepEqual({ count: s.count, done: s.done, open: s.open }, { count: 3, done: 2, open: 1 });
  assert.equal(s.medianReplyH, 3);
  assert.equal(s.medianFixH, 15);
  assert.equal(s.oldestOpenH, 30);
  assert.equal(repairStats([], { now }).medianFixH, null);
});

test('tenant page: every phrase exists in Khmer, English and Chinese with the same {placeholders}', () => {
  for (const [key, e] of Object.entries(DICTIONARY)) {
    for (const l of ['km', 'en', 'zh']) assert.equal(typeof e[l], 'string', `${key}.${l}`);
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    if (key !== 'khmerContract') for (const l of ['en', 'zh']) assert.equal(vars(e[l]), vars(e.km), `${key}.${l} placeholders`);
  }
});
