// Passkeys (WebAuthn / FIDO2): sign in with Face ID, fingerprint or the phone's screen lock.
// The private key never leaves the user's device; the server keeps only the public key.
// Verification is done by @simplewebauthn/server; challenges travel in sealed (AES-GCM) tickets.
import {
  generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { q, rateLimit } from './store.js';
import { seal, unseal } from './blob.js';
import { requireOwner, startSession, alertIfNewDevice, sessionMeta } from './auth.js';

const httpErr = (status, error) => Object.assign(new Error(error), { status });
const TTL = 5 * 60000;

/** The site the browser is on: passkeys are bound to this domain. */
function site(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return { rpID: host.replace(/:\d+$/, ''), origin: `${proto}://${host}` };
}
const ticketFor = (data) => seal(JSON.stringify({ ...data, exp: Date.now() + TTL }));
function readTicket(t, kind) {
  let d = null;
  try { d = JSON.parse(unseal(t)); } catch { /* invalid */ }
  if (!d || d.k !== kind || !(d.exp > Date.now())) throw httpErr(400, 'ពេលវេលាផុតកំណត់ — សូមព្យាយាមម្តងទៀត');
  return d;
}
const toKey = (b64) => new Uint8Array(Buffer.from(b64, 'base64url'));

export async function passkeysOf(userId) {
  const { rows } = await q('SELECT id, name, created_at, last_used, backed_up FROM passkeys WHERE user_id = $1 ORDER BY created_at', [userId]);
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsed: r.last_used, synced: r.backed_up }));
}

export function passkeyRoutes(app) {
  // ---- add a passkey (signed in) ----
  app.post('/api/account/passkeys/options', requireOwner, async (req, res) => {
    if (!(await rateLimit(`pk-reg:${req.session.userId}`, 20, 600))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក');
    const { rows: u } = await q('SELECT id, email, telegram_name FROM users WHERE id = $1', [req.session.userId]);
    const { rows: existing } = await q('SELECT id, transports FROM passkeys WHERE user_id = $1', [req.session.userId]);
    if (existing.length >= 10) throw httpErr(400, 'Passkey អតិបរមា ១០');
    const { rpID } = site(req);
    const name = /@telegram\.local$/.test(u[0].email) ? (u[0].telegram_name || 'Telegram') : u[0].email;
    const options = await generateRegistrationOptions({
      rpName: 'ផ្ទះយើង', rpID, userName: name, userDisplayName: name,
      userID: new TextEncoder().encode(u[0].id),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports || undefined })),
      // Discoverable, so the user can sign in without typing an e-mail first.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    res.json({ options, ticket: ticketFor({ k: 'reg', c: options.challenge, u: req.session.userId }) });
  });

  app.post('/api/account/passkeys', requireOwner, async (req, res) => {
    const t = readTicket(req.body?.ticket, 'reg');
    if (t.u !== req.session.userId) throw httpErr(400, 'សូមព្យាយាមម្តងទៀត');
    const { rpID, origin } = site(req);
    let v;
    try {
      v = await verifyRegistrationResponse({ response: req.body?.response, expectedChallenge: t.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    } catch (e) { throw httpErr(400, `មិនអាចផ្ទៀងផ្ទាត់ Passkey បាន (${String(e.message).slice(0, 80)})`); }
    if (!v.verified) throw httpErr(400, 'មិនអាចផ្ទៀងផ្ទាត់ Passkey បាន');
    const { credential, credentialBackedUp, credentialDeviceType } = v.registrationInfo;
    const name = String(req.body?.name || sessionMeta(req).device).trim().slice(0, 60) || 'Passkey';
    await q(`INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, device_type, backed_up)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
    [credential.id, req.session.userId, Buffer.from(credential.publicKey).toString('base64url'), credential.counter, JSON.stringify(credential.transports || []), name, credentialDeviceType, credentialBackedUp]);
    // Adding a way to sign in is security-relevant: tell the landlord, like a 2FA change.
    const { sendSecurityAlert } = await import('./telegram.js');
    await sendSecurityAlert(req.session.homeOrg || req.session.orgId, `🔑 <b>បានបន្ថែម Passkey ថ្មី</b>\n📱 ${name.replace(/[<>&]/g, '')}\nមិនមែនអ្នកទេ? ការកំណត់ → សុវត្ថិភាពគណនី → លុប Passkey នោះ ហើយប្តូរពាក្យសម្ងាត់។`);
    res.json({ ok: true, passkeys: await passkeysOf(req.session.userId) });
  });

  app.delete('/api/account/passkeys/:id', requireOwner, async (req, res) => {
    await q('DELETE FROM passkeys WHERE id = $1 AND user_id = $2', [String(req.params.id).slice(0, 400), req.session.userId]);
    res.json({ ok: true, passkeys: await passkeysOf(req.session.userId) });
  });

  // ---- sign in with a passkey (no e-mail or password) ----
  app.post('/api/auth/passkey/options', async (req, res) => {
    if (!(await rateLimit(`pk-auth:${req.ip}`, 30, 600))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក');
    const { rpID } = site(req);
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: [] });
    res.json({ options, ticket: ticketFor({ k: 'auth', c: options.challenge }) });
  });

  app.post('/api/auth/passkey', async (req, res) => {
    if (!(await rateLimit(`pk-login:${req.ip}`, 20, 600))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក');
    const t = readTicket(req.body?.ticket, 'auth');
    const response = req.body?.response;
    const { rows } = await q(`SELECT p.*, u.org_id, u.email, o.suspended FROM passkeys p JOIN users u ON u.id = p.user_id JOIN orgs o ON o.id = u.org_id
      WHERE p.id = $1`, [String(response?.id || '').slice(0, 400)]);
    const pk = rows[0];
    if (!pk) throw httpErr(400, 'Passkey នេះមិនស្គាល់ — ប្រហែលត្រូវបានលុប។ សូមចូលដោយពាក្យសម្ងាត់ ឬ Telegram។');
    // The authenticator also says which account it belongs to; it must be the same one.
    if (response?.response?.userHandle && Buffer.from(response.response.userHandle, 'base64url').toString() !== pk.user_id) throw httpErr(400, 'Passkey មិនត្រឹមត្រូវ');
    if (pk.suspended) throw httpErr(403, 'គណនីនេះត្រូវបានផ្អាក។ សូមទាក់ទងក្រុមការងារផ្ទះយើង។');
    const { rpID, origin } = site(req);
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response, expectedChallenge: t.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: pk.id, publicKey: toKey(pk.public_key), counter: Number(pk.counter) || 0, transports: pk.transports || undefined },
      });
    } catch (e) { throw httpErr(400, `មិនអាចផ្ទៀងផ្ទាត់ Passkey បាន (${String(e.message).slice(0, 80)})`); }
    if (!v.verified) throw httpErr(400, 'មិនអាចផ្ទៀងផ្ទាត់ Passkey បាន');
    await q('UPDATE passkeys SET counter = $2, last_used = now() WHERE id = $1', [pk.id, v.authenticationInfo.newCounter]);
    const user = { id: pk.user_id, org_id: pk.org_id, email: pk.email };
    // A passkey is something you have (the device) + something you are/know (Face ID, PIN): it counts as two factors.
    await startSession(req, res, user, { mfa: true });
    await alertIfNewDevice(req, user, 'Passkey');
    res.json({ ok: true });
  });
}
