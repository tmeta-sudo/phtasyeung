import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, client } from './helpers.js';

let env;
before(async () => { env = await boot({ SUPER_REQUIRE_2FA: '1', SUPER_ADMIN_EMAILS: 'pk-root@example.com' }); });
after(async () => { await env?.close(); });

// ---- a tiny software authenticator (what a phone's secure chip does) ----
const b64u = (b) => Buffer.from(b).toString('base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
function cbor(v) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const s = Buffer.from(v); return Buffer.concat([head(3, s.length), s]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  return Buffer.concat([head(5, Object.keys(v).length), ...Object.entries(v).flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}
function authenticator(origin) {
  const rpID = new URL(origin).hostname;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = crypto.randomBytes(32);
  let counter = 0; let userHandle = '';
  const authData = (flags, extra = Buffer.alloc(0)) => {
    const c = Buffer.alloc(4); c.writeUInt32BE(++counter);
    return Buffer.concat([sha256(rpID), Buffer.from([flags]), c, extra]);
  };
  return {
    id: b64u(credId),
    create(options) {
      userHandle = options.user.id;
      const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
      const len = Buffer.alloc(2); len.writeUInt16BE(credId.length);
      const ad = authData(0x45, Buffer.concat([Buffer.alloc(16), len, credId, cose])); // UP + UV + attested data
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }));
      return { id: b64u(credId), rawId: b64u(credId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(cbor({ fmt: 'none', attStmt: {}, authData: ad })), transports: ['internal'] } };
    },
    get(options, { uv = true, handle = userHandle } = {}) {
      const ad = authData(uv ? 0x05 : 0x01);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }));
      const signature = crypto.sign('sha256', Buffer.concat([ad, sha256(clientDataJSON)]), privateKey);
      return { id: b64u(credId), rawId: b64u(credId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(ad), signature: b64u(signature), userHandle: handle } };
    },
  };
}

test('passkey: add while signed in, then sign in with no password; it counts as two factors', async () => {
  const { q } = await import('../server/store.js');
  await q("DELETE FROM rate_limits WHERE key LIKE 'signup:%'");
  const owner = client(env.url);
  await owner.post('/api/auth/signup', { email: 'pk-root@example.com', password: 'mekong-sunrise-31', propertyName: 'ផ្ទះ Passkey' });
  const device = authenticator(env.url);

  const reg = await owner.post('/api/account/passkeys/options', {});
  assert.equal(reg.options.authenticatorSelection.userVerification, 'required');
  await assert.rejects(owner.post('/api/account/passkeys', { ticket: 'forged', response: device.create(reg.options) }), /400/);
  const added = await owner.post('/api/account/passkeys', { ticket: reg.ticket, response: device.create(reg.options), name: 'iPhone របស់ខ្ញុំ' });
  assert.equal(added.passkeys.length, 1);
  assert.equal(added.passkeys[0].name, 'iPhone របស់ខ្ញុំ');
  const again = await owner.post('/api/account/passkeys/options', {});
  assert.deepEqual(again.options.excludeCredentials.map((c) => c.id), [device.id], 'the same device is not added twice');

  // Sign in on a fresh browser: no e-mail, no password.
  const phone = client(env.url);
  const auth = await phone.post('/api/auth/passkey/options', {});
  await phone.post('/api/auth/passkey', { ticket: auth.ticket, response: device.get(auth.options) });
  const st = await phone.get('/api/state');
  assert.equal(st.account.email, 'pk-root@example.com');
  const stats = await phone.get('/api/super/stats');
  assert.equal(stats.security.superTwoFactor, true, 'passkey session passes the console 2FA gate');

  // Replayed or tampered assertions are refused.
  const a2 = await client(env.url).post('/api/auth/passkey/options', {});
  const c2 = client(env.url);
  await assert.rejects(c2.post('/api/auth/passkey', { ticket: auth.ticket, response: device.get(a2.options) }), /400/, 'challenge from another ticket');
  await assert.rejects(c2.post('/api/auth/passkey', { ticket: a2.ticket, response: device.get(a2.options, { uv: false }) }), /400/, 'no fingerprint / PIN → refused');
  const a3 = await c2.post('/api/auth/passkey/options', {});
  await assert.rejects(c2.post('/api/auth/passkey', { ticket: a3.ticket, response: device.get(a3.options, { handle: b64u(Buffer.from('someone-else')) }) }), /400/, 'wrong account');
  const bad = device.get(a3.options); bad.response.signature = b64u(crypto.randomBytes(70));
  await assert.rejects(c2.post('/api/auth/passkey', { ticket: a3.ticket, response: bad }), /400/, 'bad signature');

  // Removed passkeys stop working.
  const list = (await owner.get('/api/account/security')).passkeys;
  await owner.del(`/api/account/passkeys/${encodeURIComponent(list[0].id)}`);
  const a4 = await c2.post('/api/auth/passkey/options', {});
  await assert.rejects(c2.post('/api/auth/passkey', { ticket: a4.ticket, response: device.get(a4.options) }), /មិនស្គាល់|400/);
});
