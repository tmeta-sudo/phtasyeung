// Test harness: embedded PGlite in a temp dir, fake Telegram + Bakong servers, the real Express app.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

/** Fake Telegram Bot API: records every call. */
export async function fakeTelegram() {
  const calls = [];
  const s = await listen(async (req, res) => {
    const raw = await body(req);
    const method = req.url.split('/').pop().split('?')[0];
    let payload;
    if (String(req.headers['content-type']).includes('json')) payload = JSON.parse(raw.toString() || '{}');
    else {
      const t = raw.toString('latin1');
      payload = { multipart: true, bytes: raw.length, chat_id: (t.match(/name="chat_id"\r\n\r\n([^\r]+)/) || [])[1], filename: (t.match(/filename="([^"]+)"/) || [])[1], raw };
    }
    calls.push({ method, payload });
    res.setHeader('content-type', 'application/json');
    if (method === 'getUpdates') return setTimeout(() => res.end(JSON.stringify({ ok: true, result: [] })), 200);
    if (method === 'getMe') return res.end(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: 'TestBot' } }));
    if (method === 'getWebhookInfo') return res.end(JSON.stringify({ ok: true, result: { url: '' } }));
    res.end(JSON.stringify({ ok: true, result: { message_id: calls.length } }));
  });
  return { ...s, calls, of: (m) => calls.filter((c) => c.method === m) };
}

/** Fake Bakong Open API: `paid` maps md5 → transaction data. */
export async function fakeBakong() {
  const paid = new Map();
  const seen = [];
  let status = 200;
  const s = await listen(async (req, res) => {
    const j = JSON.parse((await body(req)).toString() || '{}');
    seen.push({ md5: j.md5, auth: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (status !== 200) { res.statusCode = status; return res.end('{}'); }
    const tx = paid.get(j.md5);
    res.end(JSON.stringify(tx ? { responseCode: 0, responseMessage: 'Success', data: tx } : { responseCode: 1, responseMessage: 'Transaction could not be found', data: null }));
  });
  return { ...s, paid, seen, setStatus: (n) => { status = n; } };
}

/** Boot the app once per test file. Env must be set before the server modules load. */
export async function boot(extraEnv = {}) {
  const tg = await fakeTelegram();
  const bakong = await fakeBakong();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-test-'));
  Object.assign(process.env, {
    SUPER_REQUIRE_2FA: '0', // tests of the console itself; test/security.test.js turns it on
    DATA_DIR: dir, APP_SECRET: 'test-secret', TELEGRAM_API_BASE: tg.url, TELEGRAM_BOT_TOKEN: '1:test',
    BAKONG_API_BASE: bakong.url, BAKONG_TOKEN: 'platform-token', LOCAL_URL: 'http://localhost', NODE_ENV: 'test',
    ...extraEnv,
  });
  delete process.env.DATABASE_URL;
  const { default: app } = await import('../server/app.js');
  const { init } = await import('../server/store.js');
  await init();
  const web = await listen(app);
  const close = async () => { for (const x of [web, tg, bakong]) x.srv.closeAllConnections?.(); await Promise.all([web, tg, bakong].map((x) => new Promise((r) => x.srv.close(r)))); fs.rmSync(dir, { recursive: true, force: true }); };
  return { url: web.url, tg, bakong, dir, close };
}

/** A tiny cookie-keeping client. */
export function client(base) {
  let cookie = '';
  async function call(method, url, data) {
    const res = await fetch(base + url, {
      method,
      headers: { ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), origin: base },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) { const kv = c.split(';')[0]; if (kv.startsWith('py_session=')) cookie = kv; }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) throw Object.assign(new Error(`${method} ${url} → ${res.status}: ${json?.error || text}`), { status: res.status, body: json });
    return json;
  }
  return {
    get: (u) => call('GET', u), post: (u, d = {}) => call('POST', u, d), put: (u, d = {}) => call('PUT', u, d), del: (u) => call('DELETE', u),
    raw: (u, init = {}) => fetch(base + u, { ...init, headers: { ...(init.headers || {}), cookie, origin: base } }),
  };
}

let n = 0;
/** Sign up a fresh landlord with one room, one tenant and a Bakong KHQR account. */
export async function landlord(base, { rooms = 1 } = {}) {
  const c = client(base);
  n += 1;
  const { q } = await import('../server/store.js');
  await q("DELETE FROM rate_limits WHERE key LIKE 'signup:%'");
  await c.post('/api/auth/signup', { email: `owner${n}-${Date.now()}@example.com`, password: 'lotus-river-2026', propertyName: `Test House ${n}` });
  await c.put('/api/settings', { khqr: { accountId: 'owner@aclb', merchantName: 'Owner', city: 'Phnom Penh' } });
  for (let i = 1; i <= rooms; i += 1) await c.post('/api/rooms', { id: `A${i}`, rent: 100 + i });
  let st;
  for (let i = 1; i <= rooms; i += 1) st = await c.post('/api/tenants', { nameKm: `អតិថិជន ${i}`, nameEn: `Tenant ${i}`, roomId: `A${i}`, status: 'active' });
  return { c, state: st };
}

/** Fake browser push service: decrypts what web-push sends using the subscription's own keys. */
export async function fakePushService() {
  const crypto = await import('node:crypto');
  const { default: ece } = await import('http_ece');
  const received = [];
  let status = 201;
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  // Real push services are HTTPS-only, and so is web-push: use a throwaway self-signed cert.
  const https = await import('node:https');
  const { execFileSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-push-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // test process only: trust the throwaway cert
  const s = await new Promise((resolve) => {
    const srv = https.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `https://127.0.0.1:${srv.address().port}` }));
  });
  async function handler(req, res) {
    const raw = await body(req);
    let msg = null;
    try { msg = JSON.parse(ece.decrypt(raw, { version: 'aes128gcm', privateKey: ecdh, authSecret: auth.toString('base64url') }).toString()); } catch (e) { msg = { error: e.message }; }
    received.push({ path: req.url, vapid: String(req.headers.authorization || ''), msg });
    res.statusCode = status; res.end();
  }
  const sub = (name = 'dev1') => ({ endpoint: `${s.url}/push/${name}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } });
  return { ...s, received, sub, setStatus: (n) => { status = n; } };
}
