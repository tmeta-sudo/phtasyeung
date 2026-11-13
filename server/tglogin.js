// Sign in, sign up, link and recover accounts by chatting with the platform Telegram bot.
//
//  Web: POST /api/auth/telegram/start → link t.me/<bot>?start=login-<token>
//  Bot: shows the device + time and asks the user to approve or deny
//  Web: polls /api/auth/telegram/poll until approved, then receives a session cookie
//
//  Recovery: /recover in the bot sends one-time sign-in links (15 min) for every
//  account linked to that Telegram user; after using one, the password can be reset.
import crypto from 'node:crypto';
import { q, uid, createOrg, createUser, createSession, getSession, rateLimit, withOrg } from './store.js';
import { newOrgDoc, db, save, now } from './db.js';
import { cookies } from './auth.js';

const PLATFORM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TTL_MIN = 10;
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fail = (error, status = 400) => { throw Object.assign(new Error(error), { status }); };
const SESSION_DAYS = 30;

// Injected by app.js to avoid an import cycle with telegram.js.
let tg = { api: null, botName: async () => '', appUrl: () => '', ensureWebhook: async () => ({}) };
export const configureTgLogin = (deps) => { tg = { ...tg, ...deps }; };

function device(ua = '') {
  const os = /iphone|ipad/i.test(ua) ? 'iPhone/iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'ឧបករណ៍';
  const br = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${br} · ${os}`;
}

const placeholderEmail = (tgId) => `tg${tgId}.${crypto.randomBytes(3).toString('hex')}@telegram.local`;
export const isTelegramEmail = (email) => /@telegram\.local$/.test(String(email || ''));

async function setCookie(req, res, user, opts) {
  const token = await createSession(user.id, user.org_id, SESSION_DAYS, opts);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `py_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}

const usersForTelegram = async (tgId) => (await q(
  `SELECT u.id, u.org_id, u.email, o.doc->'settings'->>'propertyName' AS name FROM users u JOIN orgs o ON o.id = u.org_id
    WHERE u.telegram_id = $1 AND NOT o.suspended ORDER BY u.created_at`, [String(tgId)])).rows;

// ---------- web routes ----------

export function tgLoginRoutes(app) {
  app.post('/api/auth/telegram/start', async (req, res) => {
    if (!PLATFORM_TOKEN) fail('Telegram login មិនទាន់បើក (TELEGRAM_BOT_TOKEN)', 503);
    if (!(await rateLimit(`tglogin:${req.ip}`, 20, 600))) fail('ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំបន្តិច។', 429);
    const mode = ['login', 'signup', 'link'].includes(req.body?.mode) ? req.body.mode : 'login';
    const payload = {};
    if (mode === 'signup') {
      payload.propertyName = String(req.body?.propertyName || '').trim().slice(0, 80);
      if (!payload.propertyName) fail('សូមបញ្ចូលឈ្មោះផ្ទះជួល ឬអគាររបស់អ្នក');
      payload.phone = String(req.body?.phone || '').slice(0, 40);
    }
    if (mode === 'link') {
      const s = await getSession(cookies(req).py_session);
      if (!s) fail('សូមចូលគណនីជាមុនសិន', 401);
      payload.userId = s.user_id;
    }
    await tg.ensureWebhook(); // the bot must be reachable before we send the user to it
    const token = crypto.randomBytes(18).toString('base64url');
    await q("DELETE FROM tg_logins WHERE expires < now() - interval '1 day'");
    await q('INSERT INTO tg_logins (id, mode, payload, ip, ua, expires) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
      [token, mode, JSON.stringify(payload), String(req.ip || '').slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 300), new Date(Date.now() + TTL_MIN * 60000).toISOString()]);
    const bot = await tg.botName();
    res.json({ token, bot, code: `login-${token}`, link: `https://t.me/${bot}?start=login-${token}`, expiresIn: TTL_MIN * 60 });
  });

  app.get('/api/auth/telegram/poll', async (req, res) => {
    const token = String(req.query.token || '');
    const { rows } = await q('SELECT * FROM tg_logins WHERE id = $1', [token]);
    const r = rows[0];
    if (!r || new Date(r.expires) < new Date()) return res.json({ status: 'expired' });
    if (r.status !== 'approved') return res.json({ status: r.status });
    await q('DELETE FROM tg_logins WHERE id = $1', [token]); // single use
    if (r.mode === 'link') return res.json({ status: 'ok' });
    const { rows: u } = await q('SELECT id, org_id FROM users WHERE id = $1', [r.user_id]);
    if (!u[0]) return res.json({ status: 'expired' });
    await setCookie(req, res, u[0], { canReset: true });
    res.json({ status: 'ok' });
  });

  // One-time recovery link sent by the bot (opened as /auth/magic?t=…, then POSTed here
  // so Telegram's link previews can't consume it).
  app.post('/api/auth/magic', async (req, res) => {
    const token = String(req.body?.token || '');
    if (!(await rateLimit(`magic:${req.ip}`, 20, 600))) fail('ព្យាយាមច្រើនដងពេក', 429);
    const { rows } = await q("DELETE FROM tg_logins WHERE id = $1 AND mode = 'magic' AND status = 'approved' AND expires > now() RETURNING user_id", [token]);
    if (!rows[0]) fail('តំណនេះផុតកំណត់ ឬបានប្រើរួចហើយ។ សូមផ្ញើ /recover ទៅ bot ម្តងទៀត។');
    const { rows: u } = await q('SELECT u.id, u.org_id FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.id = $1 AND NOT o.suspended', [rows[0].user_id]);
    if (!u[0]) fail('រកមិនឃើញគណនី', 404);
    await setCookie(req, res, u[0], { canReset: true });
    res.json({ ok: true });
  });

  app.post('/api/auth/telegram/unlink', async (req, res) => {
    const s = await getSession(cookies(req).py_session);
    if (!s) fail('សូមចូលគណនីជាមុនសិន', 401);
    const { rows } = await q('SELECT email, pass_hash FROM users WHERE id = $1', [s.user_id]);
    if (!rows[0].pass_hash) fail('សូមកំណត់ពាក្យសម្ងាត់ជាមុនសិន ទើបអាចផ្តាច់ Telegram បាន');
    await q('UPDATE users SET telegram_id = NULL, telegram_name = NULL WHERE id = $1', [s.user_id]);
    res.json({ ok: true });
  });
}

// ---------- bot side (platform bot only) ----------

const send = (chatId, text, extra = {}) => tg.api(PLATFORM_TOKEN, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
const edit = (msg, text, extra = {}) => tg.api(PLATFORM_TOKEN, 'editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }).catch(() => {});

/** "/start login-<token>": ask the Telegram user to approve the browser. */
export async function botLoginStart(m, token) {
  const { rows } = await q("SELECT * FROM tg_logins WHERE id = $1 AND status = 'pending' AND expires > now() AND mode <> 'magic'", [token]);
  const r = rows[0];
  if (!r) return send(m.chat.id, '⌛ សំណើនេះផុតកំណត់ហើយ។ សូមចុច «ចូលតាម Telegram» ម្តងទៀតនៅលើគេហទំព័រ។');
  const when = new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'medium', timeStyle: 'short' });
  const what = { login: 'ចូលគណនី', signup: `បង្កើតគណនីថ្មី «${esc(r.payload?.propertyName)}»`, link: 'ភ្ជាប់ Telegram នេះជាមួយគណនីរបស់អ្នក' }[r.mode];
  return send(m.chat.id,
    `🔐 <b>${what} — ផ្ទះយើង</b>\n\n🖥 ${esc(device(r.ua))}\n🌐 IP ${esc(r.ip)}\n🕒 ${when}\n\n⚠️ អនុញ្ញាតតែប្រសិនបើ <b>អ្នកផ្ទាល់</b> ទើបតែចុចប៊ូតុងនេះលើឧបករណ៍ខាងលើ។ កុំអនុញ្ញាតតំណដែលអ្នកដទៃផ្ញើមក។`,
    { reply_markup: { inline_keyboard: [[{ text: '✅ អនុញ្ញាត', callback_data: `L:${token}:ok` }, { text: '❌ បដិសេធ', callback_data: `L:${token}:no` }]] } });
}

async function approve(r, userId, tgUser) {
  await q("UPDATE tg_logins SET status = 'approved', user_id = $2, telegram_id = $3 WHERE id = $1", [r.id, userId, String(tgUser.id)]);
}

async function linkOwnerChat(orgId, tgUser) {
  // Owner alerts for landlords on the shared bot arrive in this chat too.
  await withOrg(orgId, () => {
    const t = db().settings.telegram;
    if (!t.token && !t.adminChats.some((c) => String(c.chatId) === String(tgUser.id))) {
      t.adminChats.push({ chatId: tgUser.id, name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '), username: tgUser.username || '', linkedAt: now() });
      save();
    }
  });
}

/** Inline-button presses that start with "L:". */
export async function botLoginCallback(query) {
  const [, token, action] = String(query.data).split(':');
  const msg = query.message;
  const from = query.from;
  const answer = (text) => tg.api(PLATFORM_TOKEN, 'answerCallbackQuery', { callback_query_id: query.id, text }).catch(() => {});
  const { rows } = await q("SELECT * FROM tg_logins WHERE id = $1 AND status = 'pending' AND expires > now() AND mode <> 'magic'", [token]);
  const r = rows[0];
  if (!r) { await edit(msg, '⌛ សំណើនេះផុតកំណត់ ឬបានដំណើរការរួចហើយ។'); return answer(''); }

  if (action === 'no') {
    await q("UPDATE tg_logins SET status = 'denied' WHERE id = $1", [token]);
    await edit(msg, '❌ បានបដិសេធ។ បើមិនមែនអ្នកទេ គណនីរបស់អ្នកនៅតែមានសុវត្ថិភាព។');
    return answer('បានបដិសេធ');
  }

  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || '';
  if (r.mode === 'link') {
    await q('UPDATE users SET telegram_id = $2, telegram_name = $3 WHERE id = $1', [r.payload.userId, String(from.id), name]);
    const { rows: u } = await q('SELECT org_id FROM users WHERE id = $1', [r.payload.userId]);
    if (u[0]) await linkOwnerChat(u[0].org_id, from);
    await approve(r, r.payload.userId, from);
    await edit(msg, '✅ បានភ្ជាប់ Telegram ជាមួយគណនីរបស់អ្នក។ ពេលក្រោយអ្នកអាចចូល ឬស្តារគណនីតាម bot នេះ។');
    return answer('បានភ្ជាប់ ✅');
  }

  if (r.mode === 'signup') {
    const orgId = await createOrg(newOrgDoc({ name: r.payload.propertyName, phone: r.payload.phone }));
    const userId = await createUser({ email: placeholderEmail(from.id), passHash: '', orgId });
    await q('UPDATE users SET telegram_id = $2, telegram_name = $3 WHERE id = $1', [userId, String(from.id), name]);
    await linkOwnerChat(orgId, from);
    await approve(r, userId, from);
    await edit(msg, `🎉 <b>បានបង្កើតគណនី «${esc(r.payload.propertyName)}»</b>\nត្រឡប់ទៅគេហទំព័រវិញ — អ្នកបានចូលរួចហើយ។\n\n🔑 ពេលក្រោយ ចុច «ចូលតាម Telegram» ឬផ្ញើ /recover មកទីនេះ។`);
    return answer('បានបង្កើត ✅');
  }

  // login
  const accounts = await usersForTelegram(from.id);
  let chosen = null;
  if (action.startsWith('u')) chosen = accounts.find((a) => a.id === action.slice(1));
  else if (accounts.length === 1) chosen = accounts[0];
  if (!chosen && accounts.length > 1) {
    await edit(msg, '🏠 <b>ជ្រើសរើសគណនីដែលចង់ចូល</b>', {
      reply_markup: { inline_keyboard: [...accounts.slice(0, 8).map((a) => [{ text: a.name || a.email, callback_data: `L:${token}:u${a.id}` }]), [{ text: '❌ បដិសេធ', callback_data: `L:${token}:no` }]] },
    });
    return answer('');
  }
  if (!chosen) {
    await q("UPDATE tg_logins SET status = 'no-account' WHERE id = $1", [token]);
    await edit(msg, 'ℹ️ Telegram នេះមិនទាន់ភ្ជាប់ជាមួយគណនីណាមួយទេ។\n\n• បើអ្នកថ្មី៖ នៅលើគេហទំព័រ ជ្រើស «បង្កើតគណនី» → «បង្កើតតាម Telegram»\n• បើមានគណនីដោយអ៊ីមែល៖ ចូលដោយអ៊ីមែល ហើយភ្ជាប់ Telegram ក្នុង «ការកំណត់»');
    return answer('');
  }
  await approve(r, chosen.id, from);
  await edit(msg, `✅ <b>បានចូល «${esc(chosen.name)}»</b>\nត្រឡប់ទៅគេហទំព័រវិញ។`);
  return answer('បានចូល ✅');
}

/** /recover (or "🔑 ចូលគណនី"): one-time sign-in links for every account linked to this Telegram user. */
export async function botRecover(m) {
  if (!(await rateLimit(`recover:${m.from.id}`, 5, 900))) return send(m.chat.id, 'ស្នើច្រើនដងពេក។ សូមរង់ចាំ ១៥ នាទី។');
  const accounts = await usersForTelegram(m.from.id);
  if (!accounts.length) {
    return send(m.chat.id, 'ℹ️ Telegram នេះមិនទាន់ភ្ជាប់ជាមួយគណនីម្ចាស់ផ្ទះណាមួយទេ។\nចូលគណនីលើគេហទំព័រ ហើយចុច «ភ្ជាប់ Telegram» ក្នុងការកំណត់ ដើម្បីអាចស្តារគណនីតាម bot នេះពេលក្រោយ។');
  }
  const base = tg.appUrl() || process.env.LOCAL_URL || '';
  const rows = [];
  for (const a of accounts.slice(0, 8)) {
    const token = crypto.randomBytes(24).toString('base64url');
    await q("INSERT INTO tg_logins (id, mode, status, user_id, telegram_id, expires) VALUES ($1, 'magic', 'approved', $2, $3, $4)",
      [token, a.id, String(m.from.id), new Date(Date.now() + 15 * 60000).toISOString()]);
    rows.push({ name: a.name || a.email, url: `${base}/auth/magic?t=${token}` });
  }
  if (base.startsWith('https://')) {
    return send(m.chat.id, '🔑 <b>ស្តារគណនី</b>\nចុចប៊ូតុងខាងក្រោម ដើម្បីចូល ហើយកំណត់ពាក្យសម្ងាត់ថ្មី។ តំណប្រើបានតែម្តង ក្នុងរយៈពេល ១៥ នាទី។\n\n⚠️ កុំចែករំលែកតំណទាំងនេះជាមួយអ្នកណាម្នាក់។',
      { reply_markup: { inline_keyboard: rows.map((r) => [{ text: `🏠 ${r.name}`, url: r.url }]) } });
  }
  return send(m.chat.id, '🔑 <b>ស្តារគណនី</b> (១៥ នាទី · ប្រើបានម្តង)\n\n' + rows.map((r) => `🏠 ${esc(r.name)}\n${esc(r.url)}`).join('\n\n'));
}

/** Link the Telegram user to the owner account(s) of an org (called when the owner scans their owner QR). */
export async function linkTelegramToOrgOwners(orgId, tgUser) {
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || '';
  await q("UPDATE users SET telegram_id = $2, telegram_name = $3 WHERE org_id = $1 AND role = 'owner' AND telegram_id IS NULL", [orgId, String(tgUser.id), name]);
}

export { uid };
