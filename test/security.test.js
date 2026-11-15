import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot({ SUPER_REQUIRE_2FA: '1', SUPER_ADMIN_EMAILS: 'root@example.com' }); });
after(async () => { await env?.close(); });

const sec = () => import('../server/security.js');
const signupLimit = async () => { const { q } = await import('../server/store.js'); await q("DELETE FROM rate_limits WHERE key LIKE 'signup:%'"); };

test('TOTP matches the RFC 6238 test vector and refuses reuse', async () => {
  const { totpAt, base32, verifyTotp, stepNow } = await sec();
  const secret = base32(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totpAt(secret, 1), '287082'); // T = 59 s → 94287082 (last 6 digits)
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), '081804');
  const now = Date.now(); const step = stepNow(now);
  assert.equal(verifyTotp(secret, totpAt(secret, step), 0, now), step);
  assert.equal(verifyTotp(secret, totpAt(secret, step - 1), 0, now), step - 1, 'one step of clock drift is fine');
  assert.equal(verifyTotp(secret, totpAt(secret, step), step, now), 0, 'same code twice → refused');
  assert.equal(verifyTotp(secret, totpAt(secret, step - 3), 0, now), 0, 'old codes expire');
});

test('weak passwords are refused at sign-up and on change', async () => {
  await signupLimit();
  const c = client(env.url);
  await assert.rejects(c.post('/api/auth/signup', { email: 'weak@example.com', password: '12345678', propertyName: 'X' }), /400/);
  await assert.rejects(c.post('/api/auth/signup', { email: 'sokha.weak@example.com', password: 'sokha.weak-2026', propertyName: 'X' }), /អ៊ីមែល/);
  const { passwordProblem } = await sec();
  assert.equal(passwordProblem('ផ្ទះ-សុខា-២០២៦-tree'), '');
});

test('two-factor: setup, sign-in with code, no replay, recovery code once, alerts, devices', async () => {
  await signupLimit();
  const email = `twofa${Date.now()}@example.com`;
  const phone = client(env.url);
  await phone.post('/api/auth/signup', { email, password: 'river-lotus-428', propertyName: 'ផ្ទះ 2FA' });
  const laptop = client(env.url);
  await laptop.post('/api/auth/login', { email, password: 'river-lotus-428' });

  const { totpAt, stepNow } = await sec();
  const setup = await phone.post('/api/account/2fa/setup', {});
  assert.match(setup.url, /^otpauth:\/\/totp\//);
  await assert.rejects(phone.post('/api/account/2fa/enable', { code: '000000' }), /400/);
  const on = await phone.post('/api/account/2fa/enable', { code: totpAt(setup.secret, stepNow()) });
  assert.equal(on.recoveryCodes.length, 10);
  await assert.rejects(laptop.get('/api/account/security'), /401/, 'other devices are signed out when 2FA turns on');

  // The secret is stored encrypted.
  const { q } = await import('../server/store.js');
  const row = (await q('SELECT totp_secret, totp_recovery FROM users WHERE email = $1', [email])).rows[0];
  assert.ok(!String(row.totp_secret).includes(setup.secret));
  assert.ok(!JSON.stringify(row.totp_recovery).includes(on.recoveryCodes[0]));

  // Password alone is not enough any more.
  const thief = client(env.url);
  const step1 = await thief.post('/api/auth/login', { email, password: 'river-lotus-428' });
  assert.equal(step1.twoFactor, true);
  await assert.rejects(thief.get('/api/state'), /401/);
  await assert.rejects(thief.post('/api/auth/2fa', { ticket: step1.ticket, code: '123456' }), /400/);
  await assert.rejects(thief.post('/api/auth/2fa', { ticket: 'forged.ticket.value', code: '123456' }), /400/);

  const nextStep = stepNow() + 1; // a code the setup step has not used yet
  const ok = client(env.url);
  const t2 = await ok.post('/api/auth/login', { email, password: 'river-lotus-428' });
  await ok.post('/api/auth/2fa', { ticket: t2.ticket, code: totpAt(setup.secret, nextStep) });
  assert.ok((await ok.get('/api/state')).rooms);
  const again = client(env.url);
  const t3 = await again.post('/api/auth/login', { email, password: 'river-lotus-428' });
  await assert.rejects(again.post('/api/auth/2fa', { ticket: t3.ticket, code: totpAt(setup.secret, nextStep) }), /400/, 'a code works once');
  const r = await again.post('/api/auth/2fa', { ticket: t3.ticket, code: on.recoveryCodes[0].toUpperCase() });
  assert.equal(r.recoveryLeft, 9);
  const t4 = await client(env.url).post('/api/auth/login', { email, password: 'river-lotus-428' });
  await assert.rejects(client(env.url).post('/api/auth/2fa', { ticket: t4.ticket, code: on.recoveryCodes[0] }), /400/, 'recovery codes are single use');

  // Devices: list, sign out one, sign out others.
  const sec1 = await phone.get('/api/account/security');
  assert.equal(sec1.twoFactor, true);
  assert.equal(sec1.recoveryLeft, 9);
  assert.ok(sec1.sessions.length >= 3);
  assert.equal(sec1.sessions.filter((s) => s.current).length, 1);
  const other = sec1.sessions.find((s) => !s.current);
  await phone.del(`/api/account/sessions/${other.id}`);
  assert.equal((await phone.get('/api/account/security')).sessions.length, sec1.sessions.length - 1);
  await phone.post('/api/account/sessions/others', {});
  assert.equal((await phone.get('/api/account/security')).sessions.length, 1);
  await assert.rejects(ok.get('/api/state'), /401/);

  // Turning it off needs a code.
  await assert.rejects(phone.post('/api/account/2fa/disable', { code: '' }), /400/);
  await phone.post('/api/account/2fa/disable', { code: on.recoveryCodes[1] });
  assert.equal((await phone.get('/api/account/security')).twoFactor, false);
});

test('new-device sign-in sends an alert to the landlord', async () => {
  const { c, state } = await landlord(env.url);
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  const acct = await c.get('/api/state');
  let org;
  for (const id of await listOrgIds()) if (await withOrg(id, () => db().settings.propertyName === acct.settings.propertyName)) org = id;
  await withOrg(org, () => { db().settings.telegram.adminChats = [{ chatId: 6061 }]; save(); });
  const before = env.tg.calls.length;
  const email = acct.account.email;
  const res = await fetch(env.url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: env.url, 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130' }, body: JSON.stringify({ email, password: 'lotus-river-2026' }) });
  assert.equal(res.status, 200);
  const msg = env.tg.calls.slice(before).find((x) => String(x.payload?.chat_id) === '6061');
  assert.match(String(msg?.payload?.text), /ឧបករណ៍ថ្មី/);
  assert.match(String(msg?.payload?.text), /Chrome · Android/);
  assert.ok(state.tenants.length);
});

test('security headers, cross-site writes and the platform console', async () => {
  const res = await fetch(env.url + '/api/auth/state');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');

  const { c } = await landlord(env.url);
  const ok = await c.raw('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'S1', rent: 1 }) });
  assert.equal(ok.status, 200);
  const evil = await fetch(env.url + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'py_session=whatever', origin: 'https://evil.example' }, body: JSON.stringify({ id: 'S2', rent: 1 }) });
  assert.equal(evil.status, 403);
  const noOrigin = await fetch(env.url + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'py_session=whatever', 'sec-fetch-site': 'cross-site' }, body: '{}' });
  assert.equal(noOrigin.status, 403);
  const bare = await fetch(env.url + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'py_session=whatever' }, body: '{}' });
  assert.equal(bare.status, 403, 'cookie but no Origin / Sec-Fetch-Site → refused');

  // The console needs a two-factor session.
  await signupLimit();
  const root = client(env.url);
  await root.post('/api/auth/signup', { email: 'root@example.com', password: 'platform-owner-77', propertyName: 'Platform' });
  await assert.rejects(root.get('/api/super/stats'), /need|2FA|403/);
  const { totpAt, stepNow } = await sec();
  const s = await root.post('/api/account/2fa/setup', {});
  await root.post('/api/account/2fa/enable', { code: totpAt(s.secret, stepNow()) });
  const stats = await root.get('/api/super/stats');
  assert.equal(stats.security.superTwoFactor, true);
  assert.equal(stats.security.appSecret, false, 'test secret is short → flagged');
});

test('vercel.json serves the same security headers as the server', async () => {
  const { PAGE_HEADERS } = await sec();
  const v = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url)));
  const all = v.headers.find((h) => h.source === '/(.*)');
  assert.deepEqual(Object.fromEntries(all.headers.map((h) => [h.key, h.value])), PAGE_HEADERS);
});
