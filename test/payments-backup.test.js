import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

const findOrgId = async (tenantId) => {
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db } = await import('../server/db.js');
  for (const id of await listOrgIds()) if (await withOrg(id, () => db().tenants.some((t) => t.id === tenantId))) return id;
  return null;
};
const asOrg = async (orgId, fn) => {
  const { withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  return withOrg(orgId, () => { const r = fn(db()); save(); return r; });
};

async function setup() {
  const { c, state } = await landlord(env.url);
  const gen = await c.post('/api/invoices/generate', {});
  assert.equal(gen.result.created, 1);
  const inv = gen.invoices[0];
  assert.ok(inv.khqr, 'invoice has a KHQR');
  assert.equal(inv.khqrStr, undefined, 'raw KHQR fields are not sent to the browser');
  const orgId = await findOrgId(state.tenants[0].id);
  const md5 = await asOrg(orgId, (d) => d.invoices[0].khqrMd5);
  assert.match(md5, /^[0-9a-f]{32}$/);
  return { c, inv, orgId, md5, tenant: gen.tenants[0] };
}

test('settings expose Bakong status without leaking the token', async () => {
  const { c } = await landlord(env.url);
  const st = await c.get('/api/state');
  assert.equal(st.settings.bakong.enabled, true);
  assert.equal(st.settings.bakong.platform, true);
  await c.put('/api/settings', { bakongToken: 'eyJhbGciOiJIUzI1NiJ9.my-own-landlord-token' });
  const st2 = await c.get('/api/state');
  assert.equal(st2.settings.khqr.ownBakongToken, true);
  assert.equal(st2.settings.khqr.bakongToken, undefined);
  assert.ok(!JSON.stringify(st2).includes('eyJhbGciOiJIUzI1NiJ9.my-own-landlord-token'));
});

test('KHQR stays stable for the same invoice', async () => {
  const { c, inv } = await setup();
  const again = await c.get('/api/state');
  assert.equal(again.invoices.find((i) => i.id === inv.id).khqr, inv.khqr);
});

test('the landlord\'s own token is used instead of the platform token', async () => {
  const { c, md5 } = await setup();
  await c.put('/api/settings', { bakongToken: 'eyJhbGciOiJIUzI1NiJ9.landlord-own-token' });
  await c.post('/api/invoices/check-payments', { force: true });
  const last = env.bakong.seen.filter((x) => x.md5 === md5).at(-1);
  assert.equal(last.auth, 'Bearer eyJhbGciOiJIUzI1NiJ9.landlord-own-token');
});

test('Bakong auto-confirms a matching payment from the portal poll', async () => {
  const { inv, md5, tenant } = await setup();
  const portal = client(env.url);
  let r = await portal.get(`/api/portal/${tenant.portalToken}/invoices/${inv.id}/status`);
  assert.equal(r.status, 'unpaid');
  assert.equal(r.bakong, true);
  env.bakong.paid.set(md5, { hash: 'h1', fromAccountId: 'tenant@wing', toAccountId: 'owner@aclb', currency: 'USD', amount: inv.total, acknowledgedDateMs: Date.now() });
  await new Promise((res) => setTimeout(res, 4100)); // the per-invoice poll interval
  r = await portal.get(`/api/portal/${tenant.portalToken}/invoices/${inv.id}/status`);
  assert.equal(r.status, 'paid');
  assert.ok(env.bakong.seen.filter((x) => x.md5 === md5).every((x) => x.auth === 'Bearer platform-token'));
});

test('Bakong ignores a payment with the wrong amount or account', async () => {
  const { c, inv, md5 } = await setup();
  env.bakong.paid.set(md5, { hash: 'h2', toAccountId: 'owner@aclb', currency: 'USD', amount: inv.total - 1 });
  let r = await c.post('/api/invoices/check-payments', { force: true });
  assert.equal(r.result.paid, 0);
  assert.equal(r.invoices.find((i) => i.id === inv.id).status, 'unpaid');
  assert.ok(r.events.some((e) => e.kind === 'alert' && /មិនត្រូវគ្នា/.test(e.text)), 'mismatch is logged');
  env.bakong.paid.set(md5, { hash: 'h3', toAccountId: 'someone@else', currency: 'USD', amount: inv.total });
  r = await c.post('/api/invoices/check-payments', { force: true });
  assert.equal(r.result.paid, 0);
  env.bakong.paid.set(md5, { hash: 'h4', toAccountId: 'owner@aclb', currency: 'USD', amount: inv.total });
  r = await c.post('/api/invoices/check-payments', { force: true });
  assert.equal(r.result.paid, 1);
  const paid = r.invoices.find((i) => i.id === inv.id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.bakong.hash, 'h4');
});

test('an expired Bakong token shows a clear error', async () => {
  const { c } = await setup();
  env.bakong.setStatus(401);
  try {
    const r = await c.post('/api/invoices/check-payments', { force: true });
    assert.equal(r.result.paid, 0);
    assert.match(r.settings.bakong.error, /token/i);
  } finally { env.bakong.setStatus(200); }
  const r2 = await c.post('/api/invoices/check-payments', { force: true });
  assert.equal(r2.settings.bakong.error, '');
});

test('backup export → restore round-trip, without secrets', async () => {
  const { c, inv, orgId } = await setup();
  await asOrg(orgId, (d) => { d.settings.telegram.token = '123:secret-bot-token'; });
  const data = await c.get('/api/account/export');
  assert.equal(data.app, 'phteah-yeung');
  assert.equal(data.backupVersion, 1);
  assert.ok(!JSON.stringify(data).includes('secret-bot-token'), 'bot token is not in the backup');
  assert.equal(data.invoices.length, 1);

  await c.del(`/api/invoices/${inv.id}`);
  await c.post('/api/rooms', { id: 'B9', rent: 50 });
  const r = await c.post('/api/backup/restore', { data });
  assert.equal(r.invoices.length, 1);
  assert.ok(!r.rooms.some((x) => x.id === 'B9'), 'restore replaces current data');
  assert.ok(Array.isArray(r.result.uploads));
  const done = await c.post('/api/backup/restore/finish', {});
  assert.ok(done.result);
  assert.equal(await asOrg(orgId, (d) => d.settings.telegram.token), '123:secret-bot-token', 'restore keeps the current bot');

  await assert.rejects(c.post('/api/backup/restore', { data: { hello: 1 } }), /400/);
});

test('restoring another landlord\'s backup does not steal their portal links', async () => {
  const a = await setup();
  const b = await landlord(env.url);
  const data = await a.c.get('/api/account/export');
  const r = await b.c.post('/api/backup/restore', { data });
  assert.notEqual(r.tenants[0].portalToken, a.tenant.portalToken);
  const portal = client(env.url);
  const p = await portal.get(`/api/portal/${a.tenant.portalToken}`);
  assert.equal(p.profile.id, a.tenant.id, 'the original landlord\'s portal still works');
});

test('one-click Telegram backup sends a zip to the owner chat', async () => {
  const { c, orgId } = await setup();
  await assert.rejects(c.post('/api/backup/telegram', {}), /400/); // no Telegram linked yet
  await asOrg(orgId, (d) => { d.settings.telegram.adminChats = [{ chatId: 777, name: 'Owner' }]; });
  const before = env.tg.of('sendDocument').length;
  const r = await c.post('/api/backup/telegram', {});
  assert.equal(r.result.ok, true);
  const sent = env.tg.of('sendDocument').slice(before);
  assert.equal(sent.length, 1);
  assert.equal(String(sent[0].payload.chat_id), '777');
  assert.match(sent[0].payload.filename, /\.zip$/);
  // The multipart body carries a valid zip with data.json.
  const raw = sent[0].payload.raw;
  const start = raw.indexOf(Buffer.from('PK\x03\x04', 'latin1'));
  const end = raw.lastIndexOf(Buffer.from('PK\x05\x06', 'latin1')) + 22;
  const zip = unzipSync(new Uint8Array(raw.subarray(start, end + raw.readUInt16LE(end - 2))));
  const data = JSON.parse(strFromU8(zip['data.json']));
  assert.equal(data.app, 'phteah-yeung');
  assert.ok(r.settings.backup.lastTelegramAt);
});

test('restore cleanup keeps meter photos and other non-tenant files', async () => {
  const { c, state } = await landlord(env.url);
  await c.post('/api/meters', { roomId: 'A1', month: state.today.ym, water: 5, electric: 50 });
  const st = await c.get('/api/state');
  const m = st.meters[0];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData(); form.set('file', new Blob([png], { type: 'image/png' }), 'm.png');
  const up = await c.raw(`/api/meters/${m.id}/photo/water`, { method: 'POST', body: form });
  assert.equal(up.status, 200);
  const data = await c.get('/api/account/export');
  await c.post('/api/backup/restore', { data });
  const done = await c.post('/api/backup/restore/finish', {});
  assert.equal(done.result.removed, 0);
  assert.equal((await c.raw(`/api/meters/${m.id}/photo/water`)).status, 200, 'meter photo still there');
});
