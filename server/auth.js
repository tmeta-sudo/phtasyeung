import crypto from 'node:crypto';
import { db, save, uid } from './db.js';

const COOKIE = 'py_session';
const SESSION_DAYS = 30;
const attempts = new Map(); // ip -> { count, until }

const hash = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;

function verify(password, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(hash(password, salt).split(':')[1], 'hex');
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }).filter(([k]) => k));
}

export const setupRequired = () => !process.env.ADMIN_PASSWORD && !db().auth.passwordHash;

export function isAdmin(req) {
  const sid = cookies(req)[COOKIE];
  const s = sid && db().auth.sessions[sid];
  if (!s) return false;
  if (new Date(s.expires) < new Date()) { delete db().auth.sessions[sid]; save(); return false; }
  return true;
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'សូមចូលគណនីជាមុនសិន' });
}

function startSession(req, res) {
  const sid = uid(24);
  const sessions = db().auth.sessions;
  for (const [k, v] of Object.entries(sessions)) if (new Date(v.expires) < new Date()) delete sessions[k];
  sessions[sid] = { created: new Date().toISOString(), expires: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString() };
  save();
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}

export function authRoutes(app) {
  app.get('/api/auth/state', (req, res) => res.json({ setupRequired: setupRequired(), authed: isAdmin(req) }));

  app.post('/api/auth/setup', (req, res) => {
    if (!setupRequired()) return res.status(400).json({ error: 'បានកំណត់ពាក្យសម្ងាត់រួចហើយ' });
    const pw = String(req.body?.password || '');
    if (pw.length < 8) return res.status(400).json({ error: 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួ' });
    db().auth.passwordHash = hash(pw);
    startSession(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip;
    const a = attempts.get(ip) || { count: 0, until: 0 };
    if (a.until > Date.now()) return res.status(429).json({ error: 'ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំ ១០ នាទី។' });
    const pw = String(req.body?.password || '');
    const ok = process.env.ADMIN_PASSWORD
      ? pw.length === process.env.ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(process.env.ADMIN_PASSWORD))
      : verify(pw, db().auth.passwordHash);
    if (!ok) {
      a.count += 1;
      if (a.count >= 8) { a.until = Date.now() + 10 * 60000; a.count = 0; }
      attempts.set(ip, a);
      return res.status(401).json({ error: 'ពាក្យសម្ងាត់មិនត្រឹមត្រូវ' });
    }
    attempts.delete(ip);
    startSession(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    const sid = cookies(req)[COOKIE];
    if (sid) { delete db().auth.sessions[sid]; save(); }
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  app.post('/api/auth/password', requireAdmin, (req, res) => {
    if (process.env.ADMIN_PASSWORD) return res.status(400).json({ error: 'ពាក្យសម្ងាត់ត្រូវបានកំណត់ដោយ ADMIN_PASSWORD' });
    const { current, next } = req.body || {};
    if (!verify(String(current || ''), db().auth.passwordHash)) return res.status(400).json({ error: 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ' });
    if (String(next || '').length < 8) return res.status(400).json({ error: 'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងហោចណាស់ ៨ តួ' });
    db().auth.passwordHash = hash(next);
    db().auth.sessions = {};
    startSession(req, res);
    res.json({ ok: true });
  });
}
