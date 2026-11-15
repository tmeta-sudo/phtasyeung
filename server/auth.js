import crypto from 'node:crypto';
import {
  createOrg, createUser, getUserByEmail, getUser, setPassword, setReset, createSession, getSession, deleteSession, deleteUserSessions,
  rateLimit, clearRateLimit, sha256, q, touchSession,
} from './store.js';
import { passwordProblem, verifyTotp, hashRecovery, newTotpSecret, newRecoveryCodes, otpauthUrl, deviceLabel, maskIp } from './security.js';
import { seal, unseal } from './blob.js';
import { newOrgDoc } from './db.js';
import { requiredRole, atLeast } from './roles.js';

const COOKIE = 'py_session';
const SESSION_DAYS = 30;

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;

export function verifyPassword(password, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(hashPassword(password, salt).split(':')[1], 'hex');
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }).filter(([k]) => k));
}

const isEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(e || '').trim());
const httpErr = (status, error) => Object.assign(new Error(error), { status });

function setCookie(req, res, token, maxAge) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

export const sessionMeta = (req) => ({ device: deviceLabel(String(req.headers['user-agent'] || '')), ip: maskIp(req.ip) });

export async function startSession(req, res, user, { mfa = false } = {}) {
  const token = await createSession(user.id, user.org_id, SESSION_DAYS, { ...sessionMeta(req), mfa });
  setCookie(req, res, token, SESSION_DAYS * 86400);
}

let alertHook = null; // set by authRoutes: (orgId, html) => sends to the landlord's Telegram/phone
const escHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const maskEmail = (e) => String(e || '').replace(/^(.{2}).*(@.*)$/, '$1•••$2');

/** Tell the landlord when their account is opened from a device/network it has not used before. */
export async function alertIfNewDevice(req, user, how) {
  if (!alertHook) return;
  const { device, ip } = sessionMeta(req);
  const { rows } = await q("SELECT 1 FROM sessions WHERE user_id = $1 AND device = $2 AND ip = $3 AND created_at > now() - interval '120 days' LIMIT 2", [user.id, device, ip]);
  if (rows.length > 1) return; // the session just created is one of them
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'short', timeStyle: 'short' });
  await alertHook(user.org_id, `🔐 <b>មានការចូលគណនីពីឧបករណ៍ថ្មី</b>\n👤 ${escHtml(maskEmail(user.email))}\n📱 ${escHtml(device)} · ${escHtml(ip)}\n🕒 ${when} · ${how}\n\nមិនមែនអ្នកទេ? បើកកម្មវិធី → ការកំណត់ → សុវត្ថិភាព → «ចេញពីឧបករណ៍ផ្សេង» ហើយប្តូរពាក្យសម្ងាត់។`).catch(() => {});
}

/** Attach req.session = { userId, orgId, email } or reply 401. */
export async function requireOwner(req, res, next) { // = require a signed-in team member with enough role for this route
  const s = await getSession(cookies(req)[COOKIE]).catch(() => null);
  if (!s) return res.status(401).json({ error: 'សូមចូលគណនីជាមុនសិន' });
  const role = s.role || 'owner';
  const need = requiredRole(req.method, req.route?.path);
  if (!atLeast(role, need)) return res.status(403).json({ error: 'អ្នកមិនមានសិទ្ធិធ្វើការនេះទេ — សូមសួរម្ចាស់ផ្ទះ' });
  req.session = { id: s.id, userId: s.user_id, orgId: s.org_id, homeOrg: s.home_org, email: s.email, role, mfa: !!s.mfa, canReset: !!s.can_reset_until && new Date(s.can_reset_until) > new Date() };
  touchSession(s.id).catch(() => {});
  // "Active" for platform statistics — at most one write per 10 minutes per landlord.
  q("UPDATE orgs SET last_active = now() WHERE id = $1 AND (last_active IS NULL OR last_active < now() - interval '10 minutes')", [s.org_id]).catch(() => {});
  next();
}

/**
 * @param sendResetCode async (orgId, code) => boolean — delivers a reset code to the
 *        owner's linked Telegram; provided by the Telegram module to avoid a cycle.
 */
export function authRoutes(app, { sendResetCode, sendSecurityAlert, botName }) {
  alertHook = sendSecurityAlert || null;
  app.get('/api/auth/state', async (req, res) => {
    const s = await getSession(cookies(req)[COOKIE]).catch(() => null);
    res.json({ authed: !!s, bot: process.env.TELEGRAM_BOT_TOKEN ? await botName().catch(() => '') : '' });
  });

  app.post('/api/auth/signup', async (req, res) => {
    const { email, password, propertyName, phone } = req.body || {};
    if (!(await rateLimit(`signup:${req.ip}`, 5, 3600))) throw httpErr(429, 'បង្កើតគណនីច្រើនដងពេក។ សូមព្យាយាមម្តងទៀតក្រោយ ១ ម៉ោង។');
    if (!isEmail(email)) throw httpErr(400, 'អ៊ីមែលមិនត្រឹមត្រូវ');
    const weak = passwordProblem(password, { email });
    if (weak) throw httpErr(400, weak);
    const name = String(propertyName || '').trim().slice(0, 80);
    if (!name) throw httpErr(400, 'សូមបញ្ចូលឈ្មោះផ្ទះជួល ឬអគាររបស់អ្នក');
    if (await getUserByEmail(email)) throw httpErr(409, 'អ៊ីមែលនេះមានគណនីរួចហើយ។ សូមចូលគណនី។');
    const orgId = await createOrg(newOrgDoc({ name, phone: String(phone || '').slice(0, 40) }));
    const userId = await createUser({ email, passHash: hashPassword(password), orgId });
    await startSession(req, res, { id: userId, org_id: orgId });
    res.json({ ok: true });
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const okIp = await rateLimit(`login-ip:${req.ip}`, 30, 600);
    const okEmail = await rateLimit(`login:${email}`, 8, 600);
    if (!okIp || !okEmail) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំ ១០ នាទី។');
    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(req.body?.password, user.pass_hash)) throw httpErr(401, 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ');
    const { rows } = await q('SELECT suspended FROM orgs WHERE id = $1', [user.org_id]);
    if (rows[0]?.suspended) throw httpErr(403, 'គណនីនេះត្រូវបានផ្អាក។ សូមទាក់ទងក្រុមការងារផ្ទះយើង។');
    await clearRateLimit(`login:${email}`);
    if (user.totp_secret) {
      // Password is right; now the 6-digit code from the authenticator app (5 minutes to enter it).
      const ticket = seal(JSON.stringify({ u: user.id, exp: Date.now() + 5 * 60000 }));
      return res.json({ ok: true, twoFactor: true, ticket });
    }
    await startSession(req, res, user);
    await alertIfNewDevice(req, user, 'អ៊ីមែល');
    res.json({ ok: true });
  });

  app.post('/api/auth/2fa', async (req, res) => {
    let t = null;
    try { t = JSON.parse(unseal(req.body?.ticket)); } catch { /* invalid */ }
    if (!t?.u || !(t.exp > Date.now())) throw httpErr(400, 'ពេលវេលាផុតកំណត់ — សូមចូលម្តងទៀត');
    if (!(await rateLimit(`2fa:${t.u}`, 6, 600))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំ ១០ នាទី។');
    const user = await getUser(t.u);
    if (!user?.totp_secret) throw httpErr(400, 'សូមចូលម្តងទៀត');
    const via = await checkSecondFactor(user, req.body?.code);
    if (!via) throw httpErr(400, 'លេខកូដមិនត្រឹមត្រូវ');
    await clearRateLimit(`2fa:${t.u}`);
    await startSession(req, res, user, { mfa: true });
    await alertIfNewDevice(req, user, via === 'recovery' ? 'អ៊ីមែល + លេខកូដបម្រុង' : 'អ៊ីមែល + 2FA');
    res.json({ ok: true, recoveryLeft: via === 'recovery' ? (user.totp_recovery || []).length - 1 : undefined });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = cookies(req)[COOKIE];
    if (token) await deleteSession(token);
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.post('/api/auth/password', requireOwner, async (req, res) => {
    const user = await getUser(req.session.userId);
    // No current password needed for Telegram-only accounts, or right after a Telegram sign-in / recovery link.
    const exempt = !user.pass_hash || req.session.canReset;
    if (!exempt && !verifyPassword(req.body?.current, user.pass_hash)) throw httpErr(400, 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ');
    const weak = passwordProblem(req.body?.next, { email: user.email });
    if (weak) throw httpErr(400, weak);
    await setPassword(user.id, hashPassword(req.body.next));
    await deleteUserSessions(user.id);
    await startSession(req, res, user);
    res.json({ ok: true });
  });

  // Password reset: a 6-digit code is sent to the owner's linked Telegram.
  app.post('/api/auth/forgot', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!(await rateLimit(`forgot:${req.ip}`, 5, 900))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំបន្តិច។');
    const user = isEmail(email) && await getUserByEmail(email);
    if (user) {
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      if (await sendResetCode(user.org_id, code)) await setReset(user.id, sha256(user.id + code), new Date(Date.now() + 15 * 60000).toISOString());
    }
    res.json({ ok: true, message: 'ប្រសិនបើគណនីនេះបានភ្ជាប់ Telegram ម្ចាស់ផ្ទះ យើងបានផ្ញើលេខកូដ ៦ ខ្ទង់ទៅ Telegram នោះ។' });
  });

  app.post('/api/auth/reset', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!(await rateLimit(`reset:${email}`, 6, 900))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក។ សូមស្នើលេខកូដថ្មី។');
    const user = await getUserByEmail(email);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const valid = user?.reset_hash && new Date(user.reset_expires) > new Date() && user.reset_hash === sha256(user.id + code);
    if (!valid) throw httpErr(400, 'លេខកូដមិនត្រឹមត្រូវ ឬផុតកំណត់');
    const weak = passwordProblem(req.body?.password, { email: user.email });
    if (weak) throw httpErr(400, weak);
    await setPassword(user.id, hashPassword(req.body.password));
    await deleteUserSessions(user.id);
    await startSession(req, res, user);
    res.json({ ok: true });
  });
}

/** Accept a 6-digit authenticator code (never twice) or a one-time recovery code. Returns 'totp' | 'recovery' | ''. */
async function checkSecondFactor(user, code) {
  let secret = '';
  try { secret = unseal(user.totp_secret); } catch { return ''; }
  const step = verifyTotp(secret, code, Number(user.totp_last_step) || 0);
  if (step) {
    // Conditional update: two requests racing with the same code cannot both win.
    const { rows } = await q('UPDATE users SET totp_last_step = $2 WHERE id = $1 AND totp_last_step < $2 RETURNING id', [user.id, step]);
    return rows.length ? 'totp' : '';
  }
  const h = hashRecovery(code);
  const list = Array.isArray(user.totp_recovery) ? user.totp_recovery : JSON.parse(user.totp_recovery || '[]');
  if (String(code || '').replace(/[^a-z0-9]/gi, '').length >= 8 && list.includes(h)) {
    await q('UPDATE users SET totp_recovery = $2 WHERE id = $1', [user.id, JSON.stringify(list.filter((x) => x !== h))]);
    return 'recovery';
  }
  return '';
}

/** Account security for whoever is signed in (owner, manager or staff): two-factor sign-in and devices. */
export function securityRoutes(app) {
  const recoveryCount = (u) => (Array.isArray(u.totp_recovery) ? u.totp_recovery : JSON.parse(u.totp_recovery || '[]')).length;

  app.get('/api/account/security', requireOwner, async (req, res) => {
    const user = await getUser(req.session.userId);
    const { rows } = await q('SELECT id, device, ip, created_at, last_seen, mfa FROM sessions WHERE user_id = $1 AND expires > now() ORDER BY COALESCE(last_seen, created_at) DESC LIMIT 30', [req.session.userId]);
    res.json({
      twoFactor: !!user.totp_secret,
      recoveryLeft: user.totp_secret ? recoveryCount(user) : 0,
      hasPassword: !!user.pass_hash,
      sessions: rows.map((r) => ({ id: r.id.slice(0, 16), device: r.device || 'ឧបករណ៍', ip: r.ip, createdAt: r.created_at, lastSeen: r.last_seen, mfa: r.mfa, current: r.id === req.session.id })),
    });
  });

  // Step 1: a new secret (shown as a QR code). Nothing changes until it is confirmed with a code.
  app.post('/api/account/2fa/setup', requireOwner, async (req, res) => {
    const user = await getUser(req.session.userId);
    if (user.totp_secret) throw httpErr(400, 'បានបើករួចហើយ');
    const secret = newTotpSecret();
    await q('UPDATE users SET totp_pending = $2 WHERE id = $1', [user.id, seal(secret)]);
    const account = /@telegram\.local$/.test(user.email) ? (user.telegram_name || 'Telegram') : user.email;
    res.json({ secret, url: otpauthUrl(secret, account) });
  });

  // Step 2: the first code from the app turns it on and returns the recovery codes (shown once).
  app.post('/api/account/2fa/enable', requireOwner, async (req, res) => {
    if (!(await rateLimit(`2fa-setup:${req.session.userId}`, 10, 600))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក');
    const user = await getUser(req.session.userId);
    if (user.totp_secret) throw httpErr(400, 'បានបើករួចហើយ');
    let secret = '';
    try { secret = unseal(user.totp_pending); } catch { throw httpErr(400, 'សូមចាប់ផ្តើមម្តងទៀត'); }
    const step = verifyTotp(secret, req.body?.code);
    if (!step) throw httpErr(400, 'លេខកូដមិនត្រឹមត្រូវ — ពិនិត្យម៉ោងលើទូរស័ព្ទ ហើយសាកម្តងទៀត');
    const codes = newRecoveryCodes();
    await q('UPDATE users SET totp_secret = $2, totp_pending = NULL, totp_last_step = $3, totp_recovery = $4 WHERE id = $1', [user.id, seal(secret), step, JSON.stringify(codes.map(hashRecovery))]);
    // Other devices signed in without the second step must sign in again.
    await q('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [user.id, req.session.id]);
    await q('UPDATE sessions SET mfa = true WHERE id = $1', [req.session.id]);
    await alertHook?.(req.session.homeOrg || req.session.orgId, `🛡️ <b>បានបើកការចូលគណនី ២ ជំហាន (2FA)</b>\n👤 ${escHtml(maskEmail(user.email))}`).catch(() => {});
    res.json({ ok: true, recoveryCodes: codes });
  });

  // Turning it off needs a current code (or a recovery code), so a stolen session alone cannot do it.
  app.post('/api/account/2fa/disable', requireOwner, async (req, res) => {
    if (!(await rateLimit(`2fa:${req.session.userId}`, 6, 600))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក');
    const user = await getUser(req.session.userId);
    if (!user.totp_secret) return res.json({ ok: true });
    if (!(await checkSecondFactor(user, req.body?.code))) throw httpErr(400, 'លេខកូដមិនត្រឹមត្រូវ');
    await q("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_recovery = '[]'::jsonb WHERE id = $1", [user.id]);
    await alertHook?.(req.session.homeOrg || req.session.orgId, `⚠️ <b>បានបិទការចូលគណនី ២ ជំហាន (2FA)</b>\n👤 ${escHtml(maskEmail(user.email))}\nមិនមែនអ្នកទេ? សូមប្តូរពាក្យសម្ងាត់ភ្លាម។`).catch(() => {});
    res.json({ ok: true });
  });

  app.post('/api/account/2fa/recovery', requireOwner, async (req, res) => {
    if (!(await rateLimit(`2fa:${req.session.userId}`, 6, 600))) throw httpErr(429, 'ព្យាយាមច្រើនដងពេក');
    const user = await getUser(req.session.userId);
    if (!user.totp_secret) throw httpErr(400, 'សូមបើក 2FA ជាមុនសិន');
    if ((await checkSecondFactor(user, req.body?.code)) !== 'totp') throw httpErr(400, 'លេខកូដមិនត្រឹមត្រូវ');
    const codes = newRecoveryCodes();
    await q('UPDATE users SET totp_recovery = $2 WHERE id = $1', [user.id, JSON.stringify(codes.map(hashRecovery))]);
    res.json({ ok: true, recoveryCodes: codes });
  });

  // Sign out one device, or every device except this one.
  app.delete('/api/account/sessions/:id', requireOwner, async (req, res) => {
    const prefix = String(req.params.id || '').replace(/[^a-f0-9]/g, '').slice(0, 16);
    if (prefix.length !== 16) throw httpErr(400, 'invalid');
    await q("DELETE FROM sessions WHERE user_id = $1 AND left(id, 16) = $2 AND id <> $3", [req.session.userId, prefix, req.session.id]);
    res.json({ ok: true });
  });
  app.post('/api/account/sessions/others', requireOwner, async (req, res) => {
    const { rowCount } = await q('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.session.userId, req.session.id]);
    res.json({ ok: true, removed: rowCount || 0 });
  });
}
