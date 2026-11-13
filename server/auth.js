import crypto from 'node:crypto';
import {
  createOrg, createUser, getUserByEmail, getUser, setPassword, setReset, createSession, getSession, deleteSession, deleteUserSessions,
  rateLimit, clearRateLimit, sha256, q,
} from './store.js';
import { newOrgDoc } from './db.js';

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

async function startSession(req, res, user) {
  const token = await createSession(user.id, user.org_id, SESSION_DAYS);
  setCookie(req, res, token, SESSION_DAYS * 86400);
}

/** Attach req.session = { userId, orgId, email } or reply 401. */
export async function requireOwner(req, res, next) {
  const s = await getSession(cookies(req)[COOKIE]).catch(() => null);
  if (!s) return res.status(401).json({ error: 'សូមចូលគណនីជាមុនសិន' });
  req.session = { userId: s.user_id, orgId: s.org_id, email: s.email, canReset: !!s.can_reset_until && new Date(s.can_reset_until) > new Date() };
  // "Active" for platform statistics — at most one write per 10 minutes per landlord.
  q("UPDATE orgs SET last_active = now() WHERE id = $1 AND (last_active IS NULL OR last_active < now() - interval '10 minutes')", [s.org_id]).catch(() => {});
  next();
}

/**
 * @param sendResetCode async (orgId, code) => boolean — delivers a reset code to the
 *        owner's linked Telegram; provided by the Telegram module to avoid a cycle.
 */
export function authRoutes(app, { sendResetCode, botName }) {
  app.get('/api/auth/state', async (req, res) => {
    const s = await getSession(cookies(req)[COOKIE]).catch(() => null);
    res.json({ authed: !!s, bot: process.env.TELEGRAM_BOT_TOKEN ? await botName().catch(() => '') : '' });
  });

  app.post('/api/auth/signup', async (req, res) => {
    const { email, password, propertyName, phone } = req.body || {};
    if (!(await rateLimit(`signup:${req.ip}`, 5, 3600))) throw httpErr(429, 'បង្កើតគណនីច្រើនដងពេក។ សូមព្យាយាមម្តងទៀតក្រោយ ១ ម៉ោង។');
    if (!isEmail(email)) throw httpErr(400, 'អ៊ីមែលមិនត្រឹមត្រូវ');
    if (String(password || '').length < 8) throw httpErr(400, 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួ');
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
    await startSession(req, res, user);
    res.json({ ok: true });
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
    if (String(req.body?.next || '').length < 8) throw httpErr(400, 'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងហោចណាស់ ៨ តួ');
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
    if (String(req.body?.password || '').length < 8) throw httpErr(400, 'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងហោចណាស់ ៨ តួ');
    await setPassword(user.id, hashPassword(req.body.password));
    await deleteUserSessions(user.id);
    await startSession(req, res, user);
    res.json({ ok: true });
  });
}
