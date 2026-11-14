import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot({ MAP_CACHE_MS: '0', SUPER_ADMIN_EMAILS: 'mod@example.com' }); });
after(async () => { await env?.close(); });

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const form = () => { const f = new FormData(); f.set('file', new Blob([png], { type: 'image/png' }), 'cover.png'); return f; };

test('landlord uploads a cover photo from the phone; it is public and replaced on the next upload', async () => {
  const { c } = await landlord(env.url);
  const r1 = await c.raw('/api/settings/cover', { method: 'POST', body: form() });
  assert.equal(r1.status, 200);
  const url1 = (await r1.json()).settings.coverUrl;
  assert.match(url1, /^\/api\/cover\/[^/]+\/[^/]+$/);
  const anon = client(env.url);
  const got = await anon.raw(url1);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');

  const url2 = (await (await c.raw('/api/settings/cover', { method: 'POST', body: form() })).json()).settings.coverUrl;
  assert.notEqual(url2, url1);
  assert.equal((await anon.raw(url1)).status, 404, 'old cover is gone');
  assert.equal((await anon.raw(url2)).status, 200);
  // Saving other settings keeps the uploaded cover.
  const st = await c.put('/api/settings', { propertyName: 'ផ្ទះថ្មី' });
  assert.equal(st.settings.coverUrl, url2);
  const bad = new FormData(); bad.set('file', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'x.txt');
  assert.equal((await c.raw('/api/settings/cover', { method: 'POST', body: bad })).status, 400);
});

test('a reported listing can be hidden by the platform owner and comes back when shown again', async () => {
  const { c } = await landlord(env.url);
  await c.post('/api/rooms', { id: 'V1', rent: 90 });
  await c.put('/api/settings', { location: { lat: 11.56, lng: 104.92 }, listing: { enabled: true, slug: 'report-me' } });
  const anon = client(env.url);
  await anon.post('/api/listing/report-me/report', { reason: 'scam', note: 'asked for deposit first' });
  await anon.post('/api/listing/report-me/report', { reason: 'nonsense' }); // unknown → "other"

  const { q } = await import('../server/store.js');
  await q("DELETE FROM rate_limits WHERE key LIKE 'signup:%'");
  const boss = client(env.url);
  await boss.post('/api/auth/signup', { email: 'mod@example.com', password: 'password123', propertyName: 'Platform' });
  const { items } = await boss.get('/api/super/reports');
  const row = items.find((r) => r.slug === 'report-me');
  assert.equal(row.count, 2);
  assert.deepEqual(row.items.map((x) => x.reason).sort(), ['other', 'scam']);
  await assert.rejects(c.get('/api/super/reports'), /403/, 'landlords cannot see reports');

  await boss.post(`/api/super/reports/${row.id}/hide`, { hidden: true });
  await assert.rejects(anon.get('/api/listing/report-me'), /404/);
  assert.ok(!(await anon.get('/api/map')).places.some((p) => p.slug === 'report-me'), 'gone from the map');
  assert.ok(!(await boss.get('/api/super/reports')).items.some((r) => r.slug === 'report-me'), 'reports resolved');

  await boss.post(`/api/super/reports/${row.id}/hide`, { hidden: false });
  assert.equal((await anon.get('/api/listing/report-me')).rooms.length, 1);
});

test('ID cards about to expire are announced once, together with contracts', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  await c.put(`/api/tenants/${t.id}`, { ...t, idExpiry: '2026-12-01' });
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db } = await import('../server/db.js');
  const { contractAlerts } = await import('../server/scheduler.js');
  let org;
  for (const id of await listOrgIds()) if (await withOrg(id, () => db().tenants.some((x) => x.id === t.id))) org = id;
  assert.equal(await withOrg(org, () => contractAlerts('2026-10-01')), 0, 'too early');
  assert.equal(await withOrg(org, () => contractAlerts('2026-11-15')), 1);
  assert.equal(await withOrg(org, () => contractAlerts('2026-11-16')), 0, 'only once');
});
