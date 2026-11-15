// Security building blocks: browser security headers, cross-site request checks,
// two-factor codes (TOTP, RFC 6238) with recovery codes, and password strength.
// No external dependencies: everything here is Node's crypto.
import crypto from 'node:crypto';

// ---------- headers ----------

// Hosts the web app talks to from the browser: address search, the OCR model (Hugging Face and its CDN).
const CONNECT = ["'self'", 'https://nominatim.openstreetmap.org', 'https://huggingface.co', 'https://*.huggingface.co', 'https://*.hf.co', 'data:', 'blob:'];
// Telegram Web opens the tenant page as a mini app inside an iframe.
const FRAME_ANCESTORS = ["'self'", 'https://web.telegram.org', 'https://webk.telegram.org', 'https://webz.telegram.org'];

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'", // no inline scripts; WebAssembly for on-device OCR
  "style-src 'self' 'unsafe-inline'", // React style attributes
  "img-src 'self' data: blob: https:", // map tiles, cover photos from a link
  "font-src 'self' data:",
  `connect-src ${CONNECT.join(' ')}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'", // the invoice image export resolves fonts through a <base> link
  "form-action 'self'",
  `frame-ancestors ${FRAME_ANCESTORS.join(' ')}`,
  'upgrade-insecure-requests',
].join('; ');

/** Headers for every page and API response. vercel.json repeats them for static files (a test keeps both equal). */
export const PAGE_HEADERS = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

export function securityHeaders(req, res, next) {
  for (const [k, v] of Object.entries(PAGE_HEADERS)) {
    if (k === 'Content-Security-Policy' && process.env.PY_DEV_SERVER === '1') continue; // Vite's live reload injects inline scripts
    if (k === 'Strict-Transport-Security' && !(req.secure || req.headers['x-forwarded-proto'] === 'https')) continue;
    res.setHeader(k, v);
  }
  if (req.path.startsWith('/api/')) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    // Signed-in data must never sit in a shared cache.
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'private, no-cache');
  }
  next();
}

// ---------- cross-site write protection ----------

// Server-to-server calls that legitimately carry no browser headers.
const MACHINE_PATHS = [/^\/api\/telegram\/webhook\//, /^\/api\/cron\//];

/**
 * Block state-changing requests that come from another website.
 * Browsers send Origin and/or Sec-Fetch-Site on every POST/PUT/DELETE; a request with a session cookie
 * but neither header is not from our app, so it is refused too (SameSite cookies are the second layer).
 */
export function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (MACHINE_PATHS.some((r) => r.test(req.path))) return next();
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* invalid */ }
    if (host !== req.headers.host) return res.status(403).json({ error: 'Origin not allowed' });
    return next();
  }
  if (site) return site === 'same-origin' || site === 'none' ? next() : res.status(403).json({ error: 'Cross-site request blocked' });
  if (/(?:^|;\s*)py_session=/.test(String(req.headers.cookie || ''))) return res.status(403).json({ error: 'Origin required' });
  next();
}

// ---------- TOTP two-factor ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function unbase32(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32(crypto.randomBytes(20));

/** The 6-digit code for a 30-second step. */
export function totpAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
export const stepNow = (ms = Date.now()) => Math.floor(ms / 30000);

/**
 * Check a code against the current step ±1 (phone clocks drift). Returns the matched step, or 0.
 * Pass the last accepted step so a code can never be used twice.
 */
export function verifyTotp(secret, code, lastStep = 0, now = Date.now()) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return 0;
  const cur = stepNow(now);
  for (const s of [cur, cur - 1, cur + 1]) {
    if (s <= lastStep) continue;
    const a = Buffer.from(totpAt(secret, s)); const b = Buffer.from(c);
    if (crypto.timingSafeEqual(a, b)) return s;
  }
  return 0;
}

export const otpauthUrl = (secret, account, issuer = 'Phteah Yeung') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** Ten one-time recovery codes like "k7q2-m9xd"; only their hashes are stored. */
export function newRecoveryCodes() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => {
    const b = crypto.randomBytes(8);
    const s = [...b].map((x) => alphabet[x % alphabet.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const hashRecovery = (code) => crypto.createHash('sha256').update('py-recovery:' + String(code).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');

// ---------- passwords ----------

// Passwords people actually use most (global lists + local patterns). Rejected at signup and on change.
const COMMON = new Set(`12345678 123456789 1234567890 0123456789 87654321 11111111 00000000 88888888 12341234 11223344 12121212
password password1 password123 passw0rd qwerty123 qwertyui qwertyuiop asdfghjk asdfghjkl zxcvbnm1 iloveyou iloveyou1 abc12345
abcd1234 1q2w3e4r 1qaz2wsx admin123 administrator welcome1 welcome123 letmein1 sunshine princess football baseball superman
cambodia cambodia1 cambodia123 phnompenh phnompenh1 angkor123 khmer123 khmer1234 sokha123 dara1234 bopha123 srey1234
phteahyeung phtasyeung rental123 landlord 1234qwer qwer1234 aa123456 a1234567 a12345678 123456aa 123qweasd 147258369 123123123`.split(/\s+/));

/** Khmer error message when a password is too weak, or '' when it is fine. */
export function passwordProblem(password, { email = '' } = {}) {
  const p = String(password || '');
  if (p.length < 8) return 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួ';
  if (p.length > 200) return 'ពាក្យសម្ងាត់វែងពេក';
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p)) return 'ពាក្យសម្ងាត់នេះងាយទាយពេក — សូមប្រើពាក្យផ្សេង (ឧ. ពាក្យ ៣ ដែលអ្នកចាំ + លេខ)';
  const user = String(email).split('@')[0].toLowerCase();
  if (user.length >= 4 && low.includes(user)) return 'កុំប្រើអ៊ីមែលរបស់អ្នកក្នុងពាក្យសម្ងាត់';
  return '';
}

// ---------- devices ----------

export function deviceLabel(ua = '') {
  const os = /iphone|ipad/i.test(ua) ? 'iPhone/iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'ឧបករណ៍';
  const br = /telegram/i.test(ua) ? 'Telegram' : /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${br} · ${os}`;
}
/** Keep only the network part of an IP (enough to recognise "same place", not to locate anyone). */
export function maskIp(ip = '') {
  const v4 = String(ip).replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split('.').slice(0, 2).join('.') + '.x.x';
  return String(ip).split(':').slice(0, 3).join(':') + ':…';
}
