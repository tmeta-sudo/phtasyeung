// Express app shared by Vercel (api/index.js) and local runs (server/local.js).
import express from 'express';
import crypto from 'node:crypto';
import { db, save, uid, now, logEvent } from './db.js';
import { withOrg, findOrgs, q, init, storeKind } from './store.js';
import { authRoutes, requireOwner, verifyPassword } from './auth.js';
import { upload, storeFile, sendStored, removeFile, SLOTS } from './files.js';
import { generateInvoices, khqrOf, recalc, isOverdue, tenantOfRoom } from './invoices.js';
import { isBakongId } from './khqr.js';
import {
  botStatus, botUsername, sendInvoice, sendInvoices, claimPayment, confirmPayment, notifyAdmins, configureOwnBot,
  webhookRoute, registerAllWebhooks, sendResetCode, appUrl, ensurePlatformWebhook,
} from './telegram.js';
import { runAutoInvoices, runReminders, runDailyAll } from './scheduler.js';
import { superRoutes, isSuper } from './super.js';
import { tgLoginRoutes, configureTgLogin, isTelegramEmail } from './tglogin.js';
import { api as tgApi, platformBotName } from './telegram.js';
import { normalizePhone, nowInCambodia, kmDigits } from '../shared/khmer.js';

const app = express();
app.set('trust proxy', process.env.VERCEL ? true : 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
});
// Cross-site write guard (alongside SameSite cookies). Telegram webhooks carry no Origin.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* invalid */ }
    if (host !== req.headers.host) return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
});
app.use('/api', (req, res, next) => init().then(() => next(), next));
// Serverless: register the platform bot's webhook on the first request of each instance.
if (process.env.VERCEL) app.use('/api', (req, res, next) => { ensurePlatformWebhook().catch(() => {}); next(); });

authRoutes(app, { sendResetCode, botName: () => platformBotName() });
configureTgLogin({ api: tgApi, botName: platformBotName, appUrl, ensureWebhook: () => ensurePlatformWebhook() });
tgLoginRoutes(app);
webhookRoute(app);

// ---------- helpers ----------

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const month = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : '');
const money = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
const fail = (error, status = 400) => { throw Object.assign(new Error(error), { status }); };
const findTenant = (id) => db().tenants.find((t) => t.id === id);
const findInvoice = (id) => db().invoices.find((i) => i.id === id);

/** Owner route: authenticate, lock this landlord's document, run, commit, reply. */
const owner = (fn, ...mw) => [requireOwner, ...mw, async (req, res) => {
  const out = await withOrg(req.session.orgId, () => fn(req, res));
  if (!res.headersSent) res.json(out);
}];

/** Portal route: the secret token in the URL identifies both the landlord and the customer. */
const portal = (fn, ...mw) => [...mw, async (req, res) => {
  const token = str(req.params.token, 64);
  const [org] = token.length >= 16 ? await findOrgs('portal', token) : [];
  if (!org) fail('តំណនេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ', 404);
  const out = await withOrg(org, () => {
    const t = db().tenants.find((x) => x.portalToken === token);
    if (!t || t.status === 'former') fail('តំណនេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ', 404);
    return fn(req, res, t, org);
  });
  if (!res.headersSent) res.json(out);
}];

async function publicSettings() {
  const { telegram, ...rest } = db().settings;
  return {
    ...rest,
    telegram: {
      own: !!telegram.token,
      tokenHint: telegram.token ? '••••' + telegram.token.slice(-4) : '',
      adminChats: telegram.adminChats,
      adminLinkCode: telegram.adminLinkCode,
    },
    khqrReady: isBakongId(rest.khqr.accountId),
  };
}

const withQr = (inv) => ({ ...inv, khqr: khqrOf(inv), overdue: isOverdue(inv) });

async function accountInfo(req) {
  if (!req?.session) return {};
  const { rows } = await q('SELECT email, pass_hash, telegram_id, telegram_name FROM users WHERE id = $1', [req.session.userId]);
  const u = rows[0] || {};
  return {
    email: isTelegramEmail(u.email) ? '' : u.email,
    super: isSuper(u.email, u.telegram_id),
    hasPassword: !!u.pass_hash,
    canReset: !!req.session.canReset,
    telegram: u.telegram_id ? { name: u.telegram_name || '' } : null,
    platformLogin: !!process.env.TELEGRAM_BOT_TOKEN,
  };
}

async function adminState(req) {
  const s = db();
  return {
    rooms: s.rooms,
    tenants: s.tenants,
    meters: s.meters,
    invoices: s.invoices.map(withQr),
    activities: s.activities,
    events: s.events.slice(0, 200),
    settings: await publicSettings(),
    bot: await botStatus(),
    today: nowInCambodia(),
    account: await accountInfo(req),
    runtime: { serverless: !!process.env.VERCEL, appUrl: appUrl() },
  };
}

function cleanProfile(input, existing = {}, { admin }) {
  const p = input || {};
  const out = {
    nameKm: str(p.nameKm, 80), nameEn: str(p.nameEn, 80), gender: ['female', 'male', 'other'].includes(p.gender) ? p.gender : '',
    dob: date(p.dob), phone: normalizePhone(p.phone) || str(p.phone, 30), phone2: normalizePhone(p.phone2) || str(p.phone2, 30),
    email: str(p.email, 120), occupation: str(p.occupation, 120), workplace: str(p.workplace, 160),
    idType: str(p.idType, 30) || 'national_id', idNumber: str(p.idNumber, 40), idIssued: date(p.idIssued), idExpiry: date(p.idExpiry),
    address: {
      provinceId: str(p.address?.provinceId, 12), districtId: str(p.address?.districtId, 12),
      communeId: str(p.address?.communeId, 12), villageId: str(p.address?.villageId, 12), detail: str(p.address?.detail, 300),
    },
    emergency: { name: str(p.emergency?.name, 80), relation: str(p.emergency?.relation, 40), phone: normalizePhone(p.emergency?.phone) || str(p.emergency?.phone, 30) },
  };
  if (admin) {
    Object.assign(out, {
      notes: str(p.notes, 2000),
      status: ['active', 'former', 'prospect'].includes(p.status) ? p.status : 'active',
      roomId: str(p.roomId, 30),
      contract: { start: date(p.contract?.start), end: date(p.contract?.end), deposit: money(p.contract?.deposit) },
    });
  }
  return { ...existing, ...out };
}

function validateTenant(t) {
  if (!t.nameKm && !t.nameEn) return 'សូមបញ្ចូលឈ្មោះអតិថិជន';
  if (t.phone && !normalizePhone(t.phone)) return 'លេខទូរស័ព្ទមិនត្រឹមត្រូវ (ឧ. 012 345 678)';
  if (t.contract?.start && t.contract?.end && t.contract.end < t.contract.start) return 'ថ្ងៃផុតកំណត់ត្រូវនៅក្រោយថ្ងៃចាប់ផ្តើម';
  if (t.roomId) {
    if (!db().rooms.some((r) => r.id === t.roomId)) return 'រកមិនឃើញបន្ទប់';
    const other = db().tenants.find((x) => x.id !== t.id && x.status === 'active' && x.roomId === t.roomId);
    if (t.status === 'active' && other) return `បន្ទប់ ${t.roomId} មានអ្នកជួលរួចហើយ (${other.nameKm || other.nameEn})`;
  }
  return '';
}

const newTenantBase = () => ({ id: 'c-' + uid(8), files: {}, telegram: null, portalToken: uid(18), linkCode: uid(6), createdAt: now() });

// ---------- state ----------

app.get('/api/state', ...owner((req) => adminState(req)));

// ---------- rooms ----------

function cleanRoom(p) {
  return {
    id: str(p.id, 30), building: str(p.building, 60), floor: str(p.floor, 10), rent: money(p.rent),
    water: Math.max(0, +p.water || 0), electric: Math.max(0, +p.electric || 0), note: str(p.note, 300),
    extras: (Array.isArray(p.extras) ? p.extras : []).slice(0, 6).map((e) => ({ label: str(e.label, 60), amount: money(e.amount) })).filter((e) => e.label),
  };
}

app.post('/api/rooms', ...owner((req) => {
  const room = cleanRoom(req.body || {});
  if (!room.id) fail('សូមបញ្ចូលលេខបន្ទប់');
  if (db().rooms.length >= 500) fail('ចំនួនបន្ទប់អតិបរមា ៥០០');
  if (db().rooms.some((r) => r.id === room.id)) fail('លេខបន្ទប់នេះមានរួចហើយ');
  db().rooms.push(room);
  save();
  return adminState(req);
}));

app.put('/api/rooms/:id', ...owner((req) => {
  const i = db().rooms.findIndex((r) => r.id === req.params.id);
  if (i < 0) fail('រកមិនឃើញបន្ទប់', 404);
  db().rooms[i] = { ...cleanRoom({ ...db().rooms[i], ...req.body }), id: req.params.id };
  save();
  return adminState(req);
}));

app.delete('/api/rooms/:id', ...owner((req) => {
  const s = db();
  s.rooms = s.rooms.filter((r) => r.id !== req.params.id);
  for (const t of s.tenants) if (t.roomId === req.params.id) t.roomId = '';
  save();
  return adminState(req);
}));

// ---------- customers ----------

app.post('/api/tenants', ...owner((req) => {
  if (db().tenants.length >= 2000) fail('ចំនួនអតិថិជនអតិបរមា ២០០០');
  const t = cleanProfile(req.body, newTenantBase(), { admin: true });
  t.updatedAt = now();
  const err = validateTenant(t);
  if (err) fail(err);
  db().tenants.push(t);
  logEvent('admin', `បានបន្ថែមអតិថិជន ${t.nameKm || t.nameEn}`, { tenantId: t.id });
  return adminState(req);
}));

app.put('/api/tenants/:id', ...owner((req) => {
  const cur = findTenant(req.params.id);
  if (!cur) fail('រកមិនឃើញអតិថិជន', 404);
  const next = cleanProfile(req.body, cur, { admin: true });
  const err = validateTenant(next);
  if (err) fail(err);
  Object.assign(cur, next, { updatedAt: now() });
  save();
  return adminState(req);
}));

app.delete('/api/tenants/:id', ...owner(async (req) => {
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  for (const meta of Object.values(t.files || {})) await removeFile(meta);
  db().tenants = db().tenants.filter((x) => x.id !== t.id);
  logEvent('admin', `បានលុបអតិថិជន ${t.nameKm || t.nameEn}`);
  return adminState(req);
}));

app.post('/api/tenants/:id/rotate', ...owner((req) => {
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  if (req.body?.what === 'portal') t.portalToken = uid(18);
  else t.linkCode = uid(6);
  save();
  return adminState(req);
}));

app.post('/api/tenants/:id/unlink-telegram', ...owner((req) => {
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  t.telegram = null;
  t.linkCode = uid(6);
  save();
  return adminState(req);
}));

app.post('/api/tenants/:id/files/:slot', ...owner(async (req) => {
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  const err = await storeFile(t, req.params.slot, req.file);
  if (err) fail(err);
  return adminState(req);
}, upload));

app.delete('/api/tenants/:id/files/:slot', ...owner(async (req) => {
  const t = findTenant(req.params.id);
  if (!t || !SLOTS[req.params.slot]) fail('រកមិនឃើញ', 404);
  await removeFile(t.files?.[req.params.slot]);
  delete t.files[req.params.slot];
  save();
  return adminState(req);
}));

app.get('/api/tenants/:id/files/:slot', ...owner((req, res) => sendStored(res, req.session.orgId, findTenant(req.params.id)?.files?.[req.params.slot])));

// ---------- meters ----------

app.post('/api/meters', ...owner((req) => {
  const s = db();
  const room = s.rooms.find((r) => r.id === req.body?.roomId);
  const m = month(req.body?.month);
  const water = Number(req.body?.water);
  const electric = Number(req.body?.electric);
  if (!room || !m) fail('សូមជ្រើសរើសបន្ទប់ និងខែ');
  if (!Number.isFinite(water) || !Number.isFinite(electric) || water < room.water || electric < room.electric) {
    fail(`លេខថ្មីត្រូវធំជាង ឬស្មើលេខចាស់ (ទឹក ${room.water}, ភ្លើង ${room.electric})`);
  }
  if (s.meters.some((x) => x.roomId === room.id && x.month === m)) fail('បន្ទប់នេះបានកត់កុងទ័រសម្រាប់ខែនេះរួចហើយ');
  if (s.invoices.some((i) => i.roomId === room.id && i.month === m)) fail('ខែនេះមានវិក្កយបត្ររួចហើយ។ សូមលុបវិក្កយបត្រមុនពេលកត់កុងទ័រ');
  s.meters.push({ id: uid(), roomId: room.id, month: m, oldWater: room.water, water, oldElectric: room.electric, electric, at: now() });
  room.water = water;
  room.electric = electric;
  save();
  return adminState(req);
}));

app.delete('/api/meters/:id', ...owner((req) => {
  const s = db();
  const m = s.meters.find((x) => x.id === req.params.id);
  if (!m) fail('រកមិនឃើញ', 404);
  const latest = s.meters.filter((x) => x.roomId === m.roomId).sort((a, b) => b.month.localeCompare(a.month))[0];
  if (latest.id !== m.id) fail('អាចលុបបានតែកំណត់ត្រាចុងក្រោយបង្អស់របស់បន្ទប់');
  if (s.invoices.some((i) => i.roomId === m.roomId && i.month === m.month)) fail('សូមលុបវិក្កយបត្រខែនេះជាមុនសិន');
  const room = s.rooms.find((r) => r.id === m.roomId);
  if (room) { room.water = m.oldWater; room.electric = m.oldElectric; }
  s.meters = s.meters.filter((x) => x.id !== m.id);
  save();
  return adminState(req);
}));

// ---------- invoices ----------

app.post('/api/invoices/generate', ...owner(async (req) => {
  const m = month(req.body?.month) || nowInCambodia().ym;
  const created = generateInvoices(m, 'admin');
  const sent = req.body?.send ? await sendInvoices(created) : null;
  return { ...(await adminState(req)), result: { created: created.length, sent } };
}));

app.put('/api/invoices/:id', ...owner(async (req) => {
  const inv = findInvoice(req.params.id);
  if (!inv) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  const b = req.body || {};
  if (Array.isArray(b.items) && inv.status !== 'paid') {
    inv.items = b.items.slice(0, 12).map((it) => ({
      ...it, label: str(it.label, 80), amount: it.key === 'discount' ? -money(Math.abs(it.amount)) : money(it.amount),
    })).filter((it) => it.label);
    recalc(inv);
  }
  if (date(b.dueDate)) inv.dueDate = b.dueDate;
  if (b.status === 'paid' && inv.status !== 'paid') await confirmPayment(inv, 'admin');
  else if (b.status === 'unpaid') { inv.status = 'unpaid'; inv.paidAt = null; }
  save();
  return adminState(req);
}));

app.delete('/api/invoices/:id', ...owner((req) => {
  db().invoices = db().invoices.filter((i) => i.id !== req.params.id);
  save();
  return adminState(req);
}));

app.post('/api/invoices/:id/send', ...owner(async (req) => {
  const inv = findInvoice(req.params.id);
  if (!inv) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  const r = await sendInvoice(inv, { reminder: !!req.body?.reminder });
  if (!r.ok) fail(r.error);
  return adminState(req);
}));

app.post('/api/invoices/send-month', ...owner(async (req) => {
  const m = month(req.body?.month) || nowInCambodia().ym;
  const list = db().invoices.filter((i) => i.month === m && i.status !== 'paid' && (req.body?.all || !i.sentAt));
  const r = await sendInvoices(list, { reminder: !!req.body?.reminder });
  return { ...(await adminState(req)), result: r };
}));

// ---------- automation / telegram ----------

app.post('/api/auto/run', ...owner(async (req) => {
  const r = req.body?.what === 'reminders' ? await runReminders() : await runAutoInvoices({ force: true });
  return { ...(await adminState(req)), result: r };
}));

app.post('/api/telegram/test', ...owner(async (req) => {
  if (!db().settings.telegram.adminChats.length) fail('សូមភ្ជាប់ Telegram ម្ចាស់ផ្ទះជាមុនសិន');
  const n = await notifyAdmins('✅ <b>សាកល្បង</b> — Bot ដំណើរការធម្មតា។');
  if (!n) fail('មិនអាចផ្ញើសារបាន។ សូមពិនិត្យ bot។');
  return adminState(req);
}));

app.post('/api/telegram/recheck', ...owner(async (req) => {
  await configureOwnBot();
  return adminState(req);
}));

app.delete('/api/telegram/admins/:chatId', ...owner((req) => {
  const t = db().settings.telegram;
  t.adminChats = t.adminChats.filter((c) => String(c.chatId) !== req.params.chatId);
  save();
  return adminState(req);
}));

// ---------- settings ----------

app.put('/api/settings', ...owner(async (req) => {
  const s = db().settings;
  const b = req.body || {};
  Object.assign(s, {
    propertyName: str(b.propertyName ?? s.propertyName, 80) || s.propertyName,
    propertyNameEn: str(b.propertyNameEn ?? s.propertyNameEn, 80),
    address: str(b.address ?? s.address, 200),
    phone: str(b.phone ?? s.phone, 40),
    coverUrl: /^https:\/\//.test(b.coverUrl || '') ? str(b.coverUrl, 500) : (b.coverUrl === '' ? '' : s.coverUrl),
    waterRate: money(b.waterRate ?? s.waterRate),
    electricRate: money(b.electricRate ?? s.electricRate),
    exchangeRate: Math.max(1, Math.round(+(b.exchangeRate ?? s.exchangeRate)) || 4100),
    dueDays: Math.min(60, Math.max(0, Math.round(+(b.dueDays ?? s.dueDays)) || 0)),
    khmerNumerals: typeof b.khmerNumerals === 'boolean' ? b.khmerNumerals : s.khmerNumerals,
    publicUrl: /^https?:\/\/[^\s]+$/.test(b.publicUrl || '') ? str(b.publicUrl, 200).replace(/\/+$/, '') : (b.publicUrl === '' ? '' : s.publicUrl),
  });
  if (b.khqr) {
    const id = str(b.khqr.accountId, 60);
    if (id && !isBakongId(id)) fail('Bakong ID មិនត្រឹមត្រូវ (ឧ. name@aclb)');
    s.khqr = { accountId: id, merchantName: str(b.khqr.merchantName, 25), city: str(b.khqr.city, 15) || 'Phnom Penh' };
  }
  if (b.auto) {
    s.auto = {
      ...s.auto,
      enabled: !!b.auto.enabled,
      day: Math.min(28, Math.max(1, Math.round(+b.auto.day) || 1)),
      hour: Math.min(23, Math.max(0, Math.round(+b.auto.hour) || 0)),
      send: !!b.auto.send,
      reminderDays: Math.min(30, Math.max(0, Math.round(+b.auto.reminderDays) || 0)),
    };
  }
  if (typeof b.telegramToken === 'string') {
    const tok = b.telegramToken.trim();
    if (tok && !/^\d{5,}:[\w-]{30,}$/.test(tok)) fail('Bot token មិនត្រឹមត្រូវ (យកពី @BotFather)');
    if (tok !== s.telegram.token) {
      s.telegram.token = tok;
      s.telegram.adminChats = []; // chats belong to a specific bot
      s.telegram.adminLinkCode = uid(6);
      for (const t of db().tenants) { t.telegram = null; t.linkCode = uid(6); }
      await configureOwnBot();
    }
  }
  if (b.rotateAdminLink) s.telegram.adminLinkCode = uid(6);
  save();
  return adminState(req);
}));

// ---------- tasks (maintenance & leads) ----------

app.post('/api/activities', ...owner((req) => {
  const b = req.body || {};
  db().activities.push({ id: uid(), kind: b.kind === 'lead' ? 'lead' : 'maintenance', title: str(b.title, 120), detail: str(b.detail, 500), roomId: str(b.roomId, 30), done: false, at: now() });
  save();
  return adminState(req);
}));
app.put('/api/activities/:id', ...owner((req) => {
  const a = db().activities.find((x) => x.id === req.params.id);
  if (a) { a.done = !!req.body?.done; save(); }
  return adminState(req);
}));
app.delete('/api/activities/:id', ...owner((req) => {
  db().activities = db().activities.filter((x) => x.id !== req.params.id);
  save();
  return adminState(req);
}));

// ---------- account: export & delete (the landlord owns their data) ----------

app.get('/api/account/export', ...owner((req, res) => {
  const { settings, ...rest } = db();
  const { token, ...telegram } = settings.telegram;
  res.setHeader('Content-Disposition', `attachment; filename="phteah-yeung-${nowInCambodia().ymd}.json"`);
  res.json({ exportedAt: now(), ...rest, settings: { ...settings, telegram } });
}));

app.post('/api/account/delete', requireOwner, async (req, res) => {
  const { rows } = await q(`SELECT u.pass_hash, o.doc->'settings'->>'propertyName' AS name FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.id = $1`, [req.session.userId]);
  if (!rows[0]) fail('រកមិនឃើញគណនី', 404);
  if (rows[0].pass_hash) {
    if (!verifyPassword(req.body?.password, rows[0].pass_hash)) fail('ពាក្យសម្ងាត់មិនត្រឹមត្រូវ');
  } else if (String(req.body?.confirm || '').trim() !== rows[0].name) fail('ឈ្មោះមិនត្រូវគ្នា');
  await q('DELETE FROM orgs WHERE id = $1', [req.session.orgId]); // cascades to users, sessions' users, files, lookups
  res.setHeader('Set-Cookie', 'py_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

// ---------- import from the old browser-only version ----------

app.post('/api/import-legacy', ...owner((req) => {
  const s = db();
  const old = req.body || {};
  let rooms = 0; let tenants = 0; let invoices = 0;
  for (const r of (old.rooms || []).slice(0, 500)) {
    const id = str(r.id, 30);
    if (!id || s.rooms.some((x) => x.id === id)) continue;
    s.rooms.push(cleanRoom({ ...r, id }));
    rooms += 1;
    if (str(r.name)) {
      s.tenants.push(cleanProfile({ nameKm: r.name, phone: r.phone, roomId: id, status: 'active', contract: { start: r.start, end: r.end } }, { ...newTenantBase(), updatedAt: now() }, { admin: true }));
      tenants += 1;
    }
  }
  for (const m of (old.meters || []).slice(0, 5000)) if (!s.meters.some((x) => x.roomId === m.roomId && x.month === m.month)) s.meters.push({ ...m, id: uid() });
  for (const i of (old.invoices || []).slice(0, 5000)) {
    if (s.invoices.some((x) => x.roomId === i.roomId && x.month === i.month)) continue;
    s.counters.invoice += 1;
    const items = [{ key: 'rent', label: 'ថ្លៃជួលបន្ទប់', qty: 1, unit: 'ខែ', rate: +i.rent || 0, amount: +i.rent || 0 }];
    if (+i.water) items.push({ key: 'water', label: 'ថ្លៃទឹក', qty: 0, unit: 'm³', amount: +i.water });
    if (+i.electric) items.push({ key: 'electric', label: 'ថ្លៃភ្លើង', qty: 0, unit: 'kWh', amount: +i.electric });
    s.invoices.push(recalc({
      id: uid(), number: `INV-${String(i.month).replace('-', '')}-${String(s.counters.invoice).padStart(4, '0')}`, month: i.month, roomId: i.roomId,
      tenantId: tenantOfRoom(i.roomId)?.id || '', name: i.name, items, rate: s.settings.exchangeRate, issuedAt: `${i.month}-01`, dueDate: `${i.month}-08`,
      status: i.paid ? 'paid' : 'unpaid', paidAt: i.paid ? now() : null, hasMeter: !!i.hasMeter, claims: [], reminders: [], createdAt: now(), createdBy: 'import',
    }));
    invoices += 1;
  }
  if (old.settings) {
    if (+old.settings.waterRate) s.settings.waterRate = +old.settings.waterRate;
    if (+old.settings.electricRate) s.settings.electricRate = +old.settings.electricRate;
  }
  for (const a of (old.activities || []).slice(0, 1000)) s.activities.push({ id: uid(), kind: a.kind === 'អ្នកចាប់អារម្មណ៍' ? 'lead' : 'maintenance', title: str(a.title, 120), detail: str(a.detail, 500), roomId: str(a.roomId, 30), done: !!a.done, at: now() });
  logEvent('admin', `បាននាំចូលទិន្នន័យចាស់: បន្ទប់ ${kmDigits(rooms)} · អតិថិជន ${kmDigits(tenants)} · វិក្កយបត្រ ${kmDigits(invoices)}`);
  return adminState(req).then((st) => ({ ...st, result: { rooms, tenants, invoices } }));
}));

// ---------- customer self-service portal ----------

async function portalState(t) {
  const s = db();
  const room = s.rooms.find((r) => r.id === t.roomId);
  const { notes, linkCode, portalToken, ...profile } = t;
  const st = s.settings;
  const bot = await botUsername();
  return {
    profile,
    room: room ? { id: room.id, building: room.building, floor: room.floor, rent: room.rent, water: room.water, electric: room.electric } : null,
    invoices: s.invoices.filter((i) => i.tenantId === t.id).sort((a, b) => b.month.localeCompare(a.month)).map(withQr),
    meters: s.meters.filter((m) => m.roomId === t.roomId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12),
    property: { name: st.propertyName, nameEn: st.propertyNameEn, address: st.address, phone: st.phone, coverUrl: st.coverUrl, khmerNumerals: st.khmerNumerals, waterRate: st.waterRate, electricRate: st.electricRate },
    telegram: { bot, linked: !!t.telegram?.chatId, link: bot ? `https://t.me/${bot}?start=${linkCode}` : '' },
  };
}

app.get('/api/portal/:token', ...portal((req, res, t) => portalState(t)));

// Each customer's portal installs as its own app, opening straight to their page.
app.get('/api/portal/:token/manifest.webmanifest', ...portal((req, res, t) => {
  const name = db().settings.propertyName;
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.end(JSON.stringify({
    id: `/p/${t.portalToken}`, name: `${name} · ${t.roomId || t.nameKm}`, short_name: name.slice(0, 12),
    description: 'វិក្កយបត្រ បង់ប្រាក់ KHQR និងព័ត៌មានរបស់ខ្ញុំ', lang: 'km', dir: 'ltr',
    start_url: `/p/${t.portalToken}`, scope: '/p/', display: 'standalone', orientation: 'portrait',
    background_color: '#eceef1', theme_color: '#eef0f6',
    icons: [
      { src: '/icons/portal-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/portal-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/portal-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }));
}));

app.put('/api/portal/:token/profile', ...portal(async (req, res, t) => {
  const next = cleanProfile(req.body, t, { admin: false });
  const err = validateTenant(next);
  if (err) fail(err);
  Object.assign(t, next, { updatedAt: now() });
  save();
  logEvent('tenant', `${t.nameKm || t.nameEn} បានកែប្រែព័ត៌មានផ្ទាល់ខ្លួន`, { tenantId: t.id });
  await notifyAdmins(`✏️ <b>${t.nameKm || t.nameEn}</b> (${t.roomId || '—'}) បានកែប្រែព័ត៌មានផ្ទាល់ខ្លួន។`).catch(() => {});
  return portalState(t);
}));

app.post('/api/portal/:token/files/:slot', ...portal(async (req, res, t) => {
  if (!['idFront', 'idBack', 'photo'].includes(req.params.slot)) fail('មិនអនុញ្ញាត', 403);
  const err = await storeFile(t, req.params.slot, req.file);
  if (err) fail(err);
  logEvent('tenant', `${t.nameKm} បានផ្ញើ${SLOTS[req.params.slot]}`, { tenantId: t.id });
  await notifyAdmins(`🪪 <b>${t.nameKm}</b> (${t.roomId || '—'}) បានផ្ញើ${SLOTS[req.params.slot]}។ សូមពិនិត្យ។`).catch(() => {});
  return portalState(t);
}, upload));

app.get('/api/portal/:token/files/:slot', ...portal((req, res, t, org) => {
  if (!['idFront', 'idBack', 'photo', 'contract'].includes(req.params.slot)) fail('រកមិនឃើញ', 404);
  return sendStored(res, org, t.files?.[req.params.slot]);
}));

app.post('/api/portal/:token/invoices/:id/claim', ...portal(async (req, res, t) => {
  const inv = findInvoice(req.params.id);
  if (!inv || inv.tenantId !== t.id) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  if (inv.status === 'unpaid') await claimPayment(inv, 'portal');
  return portalState(t);
}));

// ---------- cron (Vercel Cron sends "Authorization: Bearer $CRON_SECRET") ----------

function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const given = String(req.headers.authorization || '');
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/api/cron/daily', cronAuth, async (req, res) => {
  const webhooks = await registerAllWebhooks().catch((e) => [e.message]);
  const result = await runDailyAll();
  res.json({ ok: true, webhooks, ...result });
});

superRoutes(app);

app.get('/api/health', async (req, res) => res.json({ ok: true, store: storeKind(), time: now() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'ឯកសារធំពេក (អតិបរមា ៤MB)' });
  const status = err?.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'មានបញ្ហាខាងម៉ាស៊ីនមេ' : err.message });
});

export default app;
