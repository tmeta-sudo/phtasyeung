// Express app shared by Vercel (api/index.js) and local runs (server/local.js).
import { recordError, installProcessHandlers } from './errors.js';
installProcessHandlers();
import { staffView, MANAGER_SETTINGS } from './roles.js';
import { teamRoutes } from './team.js';
import { publicKey, subscribe, unsubscribe, devices, pushToOrg } from './push.js';
import express from 'express';
import crypto from 'node:crypto';
import { db, save, uid, now, logEvent, migrateDoc } from './db.js';

setDocMigrator(migrateDoc);
import { withOrg, findOrgs, q, init, storeKind, setDocMigrator, rateLimit, getSession } from './store.js';
import { authRoutes, requireOwner, verifyPassword, cookies } from './auth.js';
import { upload, storeFile, sendStored, removeFile, SLOTS } from './files.js';
import { generateInvoices, khqrOf, recalc, isOverdue, tenantOfRoom, addPayment, balanceOf, paidSoFar, reopenCarried, moveOut } from './invoices.js';
import { isBakongId, parseKhqrUpload } from './khqr.js';
import {
  botStatus, botUsername, sendInvoice, sendInvoices, claimPayment, confirmPayment, notifyAdmins, notifyTenant, configureOwnBot,
  webhookRoute, registerAllWebhooks, sendResetCode, appUrl, ensurePlatformWebhook, replyToTicket, setTicketStatus, fetchTelegramFile,
} from './telegram.js';
import { runAutoInvoices, runReminders, runDailyAll, backupToDrive } from './scheduler.js';
import { superRoutes, isSuper } from './super.js';
import { exportData, sendBackupToTelegram, restoreData, cleanupOrphanFiles } from './backup.js';
import { checkInvoice, checkAllUnpaid, bakongEnabled } from './bakong.js';
import {
  r2Enabled, googleEnabled, googleExchange, googleEmail, googleCreateFolder, googleUpload, migrateBlobs, storageSummary, seal, unseal, deleteBlob,
} from './blob.js';
import { tgLoginRoutes, configureTgLogin, isTelegramEmail } from './tglogin.js';
import { api as tgApi, platformBotName } from './telegram.js';
import { normalizePhone, nowInCambodia, kmDigits, usd as usdFmt } from '../shared/khmer.js';

const app = express();
app.set('trust proxy', process.env.VERCEL ? true : 'loopback');
app.disable('x-powered-by');
// Restores carry a whole landlord's data; everything else stays small.
const jsonSmall = express.json({ limit: '2mb' });
const jsonLarge = express.json({ limit: '12mb' });
app.use((req, res, next) => (req.path === '/api/backup/restore' ? jsonLarge : jsonSmall)(req, res, next));
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
teamRoutes(app);
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
  const { telegram, storage, ...rest } = db().settings;
  return {
    ...rest,
    storage: { mode: storage?.mode || 'database', gdrive: storage?.gdrive ? { email: storage.gdrive.email, connectedAt: storage.gdrive.connectedAt, lastBackupAt: storage.gdrive.lastBackupAt || '' } : null },
    telegram: {
      own: !!telegram.token,
      tokenHint: telegram.token ? '••••' + telegram.token.slice(-4) : '',
      adminChats: telegram.adminChats,
      adminLinkCode: telegram.adminLinkCode,
    },
    khqr: { ...rest.khqr, bakongToken: undefined, ownBakongToken: !!rest.khqr.bakongToken },
    khqrReady: isBakongId(rest.khqr.accountId),
    bakong: { enabled: bakongEnabled(), platform: !!process.env.BAKONG_TOKEN, error: rest.khqr.bakongError || '' },
  };
}

const withQr = (inv) => { const khqr = khqrOf(inv); const { khqrStr, khqrSig, khqrExp, ...rest } = inv; return { ...rest, khqr, overdue: isOverdue(inv), paid: paidSoFar(inv), balance: balanceOf(inv) }; };

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
    role: req.session.role || 'owner',
  };
}

async function adminState(req) {
  const st = await fullState(req);
  return req?.session?.role === 'staff' ? staffView(st) : st;
}

async function fullState(req) {
  const s = db();
  return {
    rooms: s.rooms,
    tenants: s.tenants,
    meters: s.meters,
    invoices: s.invoices.map(withQr),
    activities: s.activities,
    tickets: (s.tickets || []).slice(-300),
    notices: (s.notices || []).slice(0, 30),
    expenses: (s.expenses || []).slice(-2000),
    sharedReadings: (s.sharedReadings || []).slice(-600),
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

app.post('/api/meters/shared', ...owner((req) => {
  const s = db();
  const g = (s.settings.sharedMeters || []).find((x) => x.id === req.body?.groupId);
  const m = month(req.body?.month);
  const value = Number(req.body?.value);
  if (!g || !m) fail('សូមជ្រើសរើសកុងទ័ររួម និងខែ');
  if (!Number.isFinite(value) || value < g.reading) fail(`លេខថ្មីត្រូវធំជាង ឬស្មើលេខចាស់ (${g.reading})`);
  s.sharedReadings = s.sharedReadings || [];
  if (s.sharedReadings.some((x) => x.groupId === g.id && x.month === m)) fail('កុងទ័រនេះបានកត់សម្រាប់ខែនេះរួចហើយ');
  if (s.invoices.some((i) => i.month === m && g.rooms.includes(i.roomId))) fail('ខែនេះមានវិក្កយបត្ររួចហើយសម្រាប់បន្ទប់ក្នុងក្រុមនេះ');
  s.sharedReadings.push({ id: uid(), groupId: g.id, month: m, old: g.reading, value, at: now(), photo: null });
  g.reading = value;
  save();
  return adminState(req);
}));

app.delete('/api/meters/shared/:id', ...owner((req) => {
  const s = db();
  const r = (s.sharedReadings || []).find((x) => x.id === req.params.id);
  if (!r) fail('រកមិនឃើញ', 404);
  const g = (s.settings.sharedMeters || []).find((x) => x.id === r.groupId);
  const latest = s.sharedReadings.filter((x) => x.groupId === r.groupId).sort((a, b) => b.month.localeCompare(a.month))[0];
  if (latest.id !== r.id) fail('អាចលុបបានតែកំណត់ត្រាចុងក្រោយបង្អស់');
  if (g) g.reading = r.old;
  s.sharedReadings = s.sharedReadings.filter((x) => x.id !== r.id);
  save();
  return adminState(req);
}));

app.post('/api/meters', ...owner((req) => {
  const s = db();
  const room = s.rooms.find((r) => r.id === req.body?.roomId);
  const m = month(req.body?.month);
  // A kind measured by a shared meter is not read per room: keep the old number.
  const inShared = (kind) => (s.settings.sharedMeters || []).some((g) => g.kind === kind && g.rooms.includes(room?.id));
  const water = inShared('water') && (req.body?.water === '' || req.body?.water == null) ? room?.water : Number(req.body?.water);
  const electric = inShared('electric') && (req.body?.electric === '' || req.body?.electric == null) ? room?.electric : Number(req.body?.electric);
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
  else if (b.status === 'unpaid') { inv.status = 'unpaid'; inv.paidAt = null; inv.payments = []; }
  save();
  return adminState(req);
}));

const PAY_METHODS = ['cash', 'bank', 'khqr', 'aba', 'acleda', 'wing', 'other'];

app.post('/api/invoices/:id/payments', ...owner(async (req) => {
  const inv = findInvoice(req.params.id);
  if (!inv) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  if (inv.status === 'paid') fail('វិក្កយបត្រនេះបានបង់រួចហើយ');
  const via = PAY_METHODS.includes(req.body?.via) ? req.body.via : 'cash';
  const at = date(req.body?.date) ? `${req.body.date}T12:00:00+07:00` : now();
  const { full } = addPayment(inv, { amount: req.body?.amount, via, note: str(req.body?.note, 200), at });
  if (full) await confirmPayment(inv, via);
  else {
    logEvent('admin', `បានទទួលប្រាក់ខ្លះ ${usdFmt(+req.body.amount)} ពី ${inv.roomId} · នៅសល់ ${usdFmt(balanceOf(inv))}`, { invoiceId: inv.id });
    const t = db().tenants.find((x) => x.id === inv.tenantId);
    await notifyTenant(t, `✅ <b>បានទទួលប្រាក់ ${usdFmt(+req.body.amount)}</b>\n🧾 ${inv.number}\nនៅសល់: <b>${usdFmt(balanceOf(inv))}</b>`);
  }
  return adminState(req);
}));

app.delete('/api/invoices/:id/payments/:pid', ...owner((req) => {
  const inv = findInvoice(req.params.id);
  if (!inv) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  if (inv.paidVia === 'carried') fail('សមតុល្យនេះបានផ្ទេរទៅវិក្កយបត្របន្ទាប់');
  inv.payments = (inv.payments || []).filter((p) => p.id !== req.params.pid);
  if (inv.status === 'paid' && balanceOf({ ...inv, status: 'unpaid' }) > 0) { inv.status = 'unpaid'; inv.paidAt = null; }
  save();
  return adminState(req);
}));

app.delete('/api/invoices/:id', ...owner((req) => {
  const gone = findInvoice(req.params.id);
  if (gone) reopenCarried(gone);
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

/** Ask Bakong about unpaid invoices (dashboard load, button). */
app.post('/api/invoices/check-payments', ...owner(async (req) => {
  const r = await checkAllUnpaid({ limit: 30, minIntervalMs: req.body?.force ? 0 : 60000 });
  return { ...(await adminState(req)), result: r };
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
  const n = await notifyAdmins('✅ <b>សាកល្បង</b> — Bot ដំណើរការធម្មតា។', {}, { push: false });
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
  if (req.session.role !== 'owner') {
    const blocked = Object.keys(b).filter((k) => !MANAGER_SETTINGS.has(k));
    if (blocked.length) fail('មានតែម្ចាស់ផ្ទះទេដែលអាចកែការកំណត់នេះ', 403);
  }
  Object.assign(s, {
    propertyName: str(b.propertyName ?? s.propertyName, 80) || s.propertyName,
    propertyNameEn: str(b.propertyNameEn ?? s.propertyNameEn, 80),
    address: str(b.address ?? s.address, 200),
    phone: str(b.phone ?? s.phone, 40),
    ownerName: str(b.ownerName ?? s.ownerName, 80),
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
    if (b.khqr.raw) {
      // Uploaded picture of the landlord's own KHQR, decoded in the browser.
      const parsed = parseKhqrUpload(b.khqr.raw);
      if (!parsed) fail('មិនមែនជា KHQR ត្រឹមត្រូវ។ សូមថតរូប QR ពីកម្មវិធីធនាគាររបស់អ្នក (ABA, ACLEDA, Wing…)');
      s.khqr = { ...parsed, bakongToken: s.khqr.bakongToken };
    } else {
      s.khqr = { type: 'individual', accountId: id, merchantName: str(b.khqr.merchantName, 25), city: str(b.khqr.city, 15) || 'Phnom Penh', source: 'manual', bakongToken: s.khqr.bakongToken };
    }
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
  if (b.location) {
    const L = b.location;
    const coord = (v, lim) => (v === null || v === '' || !Number.isFinite(+v) || Math.abs(+v) > lim ? null : Math.round(+v * 1e6) / 1e6);
    s.location = {
      lat: coord(L.lat, 90), lng: coord(L.lng, 180), houseNo: str(L.houseNo, 30), street: str(L.street, 80),
      provinceId: str(L.provinceId, 12), districtId: str(L.districtId, 12), communeId: str(L.communeId, 12), villageId: str(L.villageId, 12),
      detail: str(L.detail, 200), addressText: str(L.addressText, 300),
    };
  }
  if (b.invoiceDesign) {
    const d = b.invoiceDesign;
    const known = ['header', 'meta', 'items', 'totals', 'payment', 'address', 'note', 'footer'];
    const blocks = (Array.isArray(d.blocks) ? d.blocks : []).filter((x) => known.includes(x));
    s.invoiceDesign = {
      blocks: [...new Set([...blocks, ...known])],
      hidden: (Array.isArray(d.hidden) ? d.hidden : []).filter((x) => known.includes(x)),
      accent: /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : '#1f5bff',
      titleFont: ['Moul', 'Kantumruy Pro', 'Battambang', 'Koulen', 'Bokor', 'Siemreap'].includes(d.titleFont) ? d.titleFont : 'Moul',
      size: ['a5', 'square', 'story', 'receipt'].includes(d.size) ? d.size : 'a5',
      radius: Math.min(32, Math.max(0, Math.round(+d.radius || 0))),
      headerStyle: ['line', 'band', 'card', 'minimal'].includes(d.headerStyle) ? d.headerStyle : 'line',
      note: str(d.note, 300),
      showLunar: d.showLunar !== false, showWords: d.showWords !== false, showRiel: d.showRiel !== false,
    };
  }
  if (b.contract) {
    s.contract = {
      depositMonths: Math.min(12, Math.max(0, Math.round(+b.contract.depositMonths || 0))),
      prepaidMonths: Math.min(12, Math.max(0, Math.round(+b.contract.prepaidMonths || 0))),
      template: str(b.contract.template, 12000) || s.contract.template,
    };
  }
  if (typeof b.bakongToken === 'string') {
    const tok = b.bakongToken.trim();
    if (tok && !/^[\w.-]{20,}$/.test(tok)) fail('Bakong token មិនត្រឹមត្រូវ');
    s.khqr = { ...s.khqr, bakongToken: tok ? seal(tok) : '', bakongError: '' };
  }
  if (typeof b.carryOver === 'boolean') s.carryOver = b.carryOver;
  if (b.tiers) {
    const clean = (list) => (Array.isArray(list) ? list : []).slice(0, 8)
      .map((t) => ({ upTo: t.upTo === '' || t.upTo == null ? null : Math.max(0, +t.upTo || 0), rate: Math.max(0, Math.round((+t.rate || 0) * 10000) / 10000) }))
      .filter((t) => t.rate > 0);
    s.tiers = { electric: clean(b.tiers.electric), water: clean(b.tiers.water) };
  }
  if (Array.isArray(b.sharedMeters)) {
    const roomIds = new Set(db().rooms.map((r) => r.id));
    const old = new Map((s.sharedMeters || []).map((g) => [g.id, g]));
    s.sharedMeters = b.sharedMeters.slice(0, 50).map((g) => ({
      id: /^[\w-]{1,20}$/.test(g.id || '') ? g.id : 'S' + uid(4),
      name: str(g.name, 40) || 'កុងទ័ររួម',
      kind: g.kind === 'water' ? 'water' : 'electric',
      rooms: [...new Set((g.rooms || []).map(String).filter((id) => roomIds.has(id)))],
      reading: Math.max(0, +(g.reading ?? old.get(g.id)?.reading ?? 0) || 0),
    })).filter((g) => g.rooms.length >= 2);
  }
  if (b.lateFee) {
    s.lateFee = {
      enabled: !!b.lateFee.enabled,
      amount: Math.min(1000, money(b.lateFee.amount)),
      afterDays: Math.min(60, Math.max(0, Math.round(+b.lateFee.afterDays || 0))),
    };
  }
  if (b.backup) {
    s.backup = { ...(s.backup || {}), telegramWeekly: !!b.backup.telegramWeekly, includeFiles: !!b.backup.includeFiles };
  }
  if (b.rotateAdminLink) s.telegram.adminLinkCode = uid(6);
  save();
  return adminState(req);
}));

// ---------- building designer: create many rooms at once ----------

app.post('/api/rooms/bulk', ...owner((req) => {
  const b = req.body || {};
  const s = db();
  const building = {
    id: str(b.building?.id, 20) || 'b' + uid(5),
    name: str(b.building?.name, 60) || 'អគារ',
    type: ['apartment', 'flat', 'row', 'house'].includes(b.building?.type) ? b.building.type : 'apartment',
    floors: Math.min(40, Math.max(1, Math.round(+b.building?.floors || 1))),
    perFloor: Math.min(60, Math.max(1, Math.round(+b.building?.perFloor || 1))),
    scheme: str(b.building?.scheme, 20),
    color: /^#[0-9a-f]{6}$/i.test(b.building?.color || '') ? b.building.color : '#1f5bff',
  };
  const rooms = (Array.isArray(b.rooms) ? b.rooms : []).slice(0, 1000).map((r) => ({ ...cleanRoom({ ...r, building: building.name }), buildingId: building.id }));
  if (!rooms.length) fail('សូមបញ្ចូលបន្ទប់យ៉ាងហោចណាស់មួយ');
  if (s.rooms.length + rooms.length > 2000) fail('ចំនួនបន្ទប់អតិបរមា ២០០០');
  let added = 0;
  for (const r of rooms) {
    if (!r.id || s.rooms.some((x) => x.id === r.id)) continue;
    s.rooms.push({ ...r, floor: str(r.floor, 10) });
    added += 1;
  }
  s.settings.buildings = [...(s.settings.buildings || []).filter((x) => x.id !== building.id), building].slice(-30);
  logEvent('admin', `បានបង្កើតបន្ទប់ ${kmDigits(added)} ក្នុង ${building.name}`);
  return adminState(req).then((st) => ({ ...st, result: { added, skipped: rooms.length - added } }));
}));

// ---------- contracts ----------

app.put('/api/tenants/:id/contract', ...owner((req) => {
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  const b = req.body || {};
  t.lease = {
    required: b.required !== false,
    depositMonths: Math.min(12, Math.max(0, Math.round(+(b.depositMonths ?? 1)))),
    prepaidMonths: Math.min(12, Math.max(0, Math.round(+(b.prepaidMonths ?? 1)))),
    text: str(b.text, 15000),
    updatedAt: now(),
  };
  save();
  return adminState(req);
}));

/** Move-in invoice: booking deposit + prepaid rent, as agreed in the contract. */
app.put('/api/tenants/:id/deposit', ...owner((req) => {
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  t.deposit = { ...(t.deposit || {}), held: money(req.body?.held), receivedAt: date(req.body?.date) || t.deposit?.receivedAt || nowInCambodia().ymd, note: str(req.body?.note, 120), source: 'manual' };
  save();
  return adminState(req);
}));

app.post('/api/tenants/:id/moveout', ...owner(async (req) => {
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  if (t.status !== 'active') fail('អតិថិជននេះមិនកំពុងជួលទេ');
  const result = moveOut(t, { date: date(req.body?.date) || nowInCambodia().ymd, deductions: Array.isArray(req.body?.deductions) ? req.body.deductions : [], useDeposit: req.body?.useDeposit !== false });
  const lines = [`🏠 <b>ការទូទាត់ពេលចាកចេញ</b> — បន្ទប់ ${t.roomId}`, `ប្រាក់កក់: ${usdFmt(result.deposit)}`];
  for (const d of result.deductions) lines.push(`− ${d.label}: ${usdFmt(d.amount)}`);
  if (result.applied) lines.push(`− ទូទាត់វិក្កយបត្រមិនទាន់បង់: ${usdFmt(result.applied)}`);
  if (result.refund > 0) lines.push(`💵 <b>ប្រាក់សងវិញ: ${usdFmt(result.refund)}</b>`);
  if (result.owes > 0) lines.push(`⚠️ <b>នៅជំពាក់: ${usdFmt(result.owes)}</b>`);
  await notifyTenant(t, lines.join('\n'));
  return { ...(await adminState(req)), result };
}));

app.post('/api/tenants/:id/movein-invoice', ...owner((req) => {
  const s = db();
  const t = findTenant(req.params.id);
  if (!t) fail('រកមិនឃើញអតិថិជន', 404);
  const room = s.rooms.find((r) => r.id === t.roomId);
  if (!room) fail('អតិថិជននេះមិនទាន់មានបន្ទប់');
  const L = t.lease || { depositMonths: s.settings.contract.depositMonths, prepaidMonths: s.settings.contract.prepaidMonths };
  const items = [];
  if (L.depositMonths) items.push({ key: 'deposit', label: `ប្រាក់កក់ ${kmDigits(L.depositMonths)} ខែ`, qty: L.depositMonths, unit: 'ខែ', rate: room.rent, amount: room.rent * L.depositMonths });
  if (L.prepaidMonths) items.push({ key: 'prepaid', label: `ថ្លៃជួលបង់មុន ${kmDigits(L.prepaidMonths)} ខែ`, qty: L.prepaidMonths, unit: 'ខែ', rate: room.rent, amount: room.rent * L.prepaidMonths });
  if (!items.length) fail('មិនមានប្រាក់កក់ ឬបង់មុនទេ');
  const today = nowInCambodia().ymd;
  s.counters.invoice += 1;
  const inv = recalc({
    id: uid(), number: `MOV-${today.replace(/-/g, '').slice(2)}-${String(s.counters.invoice).padStart(4, '0')}`, month: today.slice(0, 7), kind: 'movein',
    roomId: room.id, tenantId: t.id, name: t.nameKm || t.nameEn, items, rate: s.settings.exchangeRate, issuedAt: today, dueDate: today,
    status: 'unpaid', hasMeter: false, claims: [], reminders: [], createdAt: now(), createdBy: 'admin',
  });
  s.invoices.push(inv);
  logEvent('admin', `បានបង្កើតវិក្កយបត្រចូលស្នាក់នៅ ${room.id} ${usdFmt(inv.total)}`, { invoiceId: inv.id });
  return adminState(req).then((st) => ({ ...st, result: { invoiceId: inv.id } }));
}));

// ---------- tenant messages & maintenance tickets (from the Telegram bot) ----------

app.post('/api/tickets/:id/reply', ...owner(async (req) => {
  const t = db().tickets.find((x) => x.id === req.params.id);
  if (!t) fail('រកមិនឃើញ', 404);
  const text = str(req.body?.text, 3000);
  if (!text) fail('សូមសរសេរសារ');
  const r = await replyToTicket(t, text, 'web');
  if (!r.ok) fail(r.error);
  return adminState(req);
}));

app.get('/api/tickets/:id/photo/:i', ...owner(async (req, res) => {
  const t = db().tickets.find((x) => x.id === req.params.id);
  const fileId = t?.messages[+req.params.i]?.photo;
  if (!fileId) return res.status(404).end();
  const f = await fetchTelegramFile(fileId);
  res.setHeader('Content-Type', f.type);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(f.data);
}));

app.put('/api/tickets/:id', ...owner(async (req) => {
  const t = db().tickets.find((x) => x.id === req.params.id);
  if (!t) fail('រកមិនឃើញ', 404);
  if (['open', 'progress', 'done'].includes(req.body?.status)) await setTicketStatus(t, req.body.status);
  if (req.body?.read) { t.unread = 0; save(); }
  return adminState(req);
}));

// ---------- send a designed invoice picture (PNG made in the browser) to Telegram ----------

app.post('/api/invoices/:id/send-image', ...owner(async (req) => {
  const inv = findInvoice(req.params.id);
  if (!inv) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  const buf = req.file?.buffer;
  if (!buf || !buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('រូបភាពមិនត្រឹមត្រូវ');
  const r = await sendInvoice(inv, { image: buf, reminder: !!inv.sentAt && req.body?.reminder === '1' });
  if (!r.ok) fail(r.error);
  return adminState(req);
}, upload));

// ---------- storage: platform (database / R2) or the landlord's own Google Drive ----------

const googleRedirect = () => `${appUrl() || process.env.LOCAL_URL || ''}/api/storage/google/callback`;

app.get('/api/storage', ...owner(async (req) => ({
  mode: db().settings.storage?.mode || 'database',
  gdrive: db().settings.storage?.gdrive ? { email: db().settings.storage.gdrive.email, connectedAt: db().settings.storage.gdrive.connectedAt, lastBackupAt: db().settings.storage.gdrive.lastBackupAt || '' } : null,
  platform: r2Enabled() ? 'r2' : 'database',
  googleAvailable: googleEnabled(),
  summary: await storageSummary(req.session.orgId),
})));

app.get('/api/storage/google/start', ...owner((req) => {
  if (!googleEnabled()) fail('Google Drive មិនទាន់បើកលើប្រព័ន្ធនេះ (GOOGLE_CLIENT_ID)', 503);
  const state = seal(JSON.stringify({ org: req.session.orgId, user: req.session.userId, exp: Date.now() + 10 * 60000 }));
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirect(), response_type: 'code', access_type: 'offline', prompt: 'consent',
    scope: 'openid email https://www.googleapis.com/auth/drive.file', state, include_granted_scopes: 'true',
  });
  return { url };
}));

app.get('/api/storage/google/callback', requireOwner, async (req, res) => {
  let st;
  try { st = JSON.parse(unseal(req.query.state)); } catch { st = null; }
  if (!st || st.org !== req.session.orgId || st.exp < Date.now() || !req.query.code) return res.redirect('/settings?storage=error');
  try {
    const tok = await googleExchange(String(req.query.code), googleRedirect());
    if (!tok.refresh_token) throw new Error('no refresh token');
    const email = await googleEmail(tok.access_token);
    await withOrg(req.session.orgId, async () => {
      const s = db().settings;
      const folderId = await googleCreateFolder(tok.access_token, `ផ្ទះយើង — ${s.propertyName}`);
      s.storage = { mode: 'gdrive', gdrive: { refreshToken: seal(tok.refresh_token), email, folderId, connectedAt: now() } };
      save();
      logEvent('admin', `បានភ្ជាប់ Google Drive (${email})`);
    });
    res.redirect('/settings?storage=connected');
  } catch (e) {
    console.error('[gdrive]', e.message);
    res.redirect('/settings?storage=error');
  }
});

/** Move this landlord's files to the current storage target, a batch per call. */
app.post('/api/storage/migrate', ...owner(async (req) => migrateBlobs(req.session.orgId, db().settings, 15)));

/** Stop using Google Drive: new files go to the platform; existing ones are copied back first. */
app.post('/api/storage/disconnect', ...owner(async (req) => {
  const s = db().settings;
  if (s.storage?.mode === 'gdrive') { s.storage = { ...s.storage, mode: 'database' }; save(); }
  const r = await migrateBlobs(req.session.orgId, s, 15);
  if (!r.remaining) { s.storage = { mode: 'database' }; save(); logEvent('admin', 'បានផ្តាច់ Google Drive'); }
  return r;
}));

app.post('/api/storage/backup', ...owner(async (req) => {
  const r = await backupToDrive();
  if (!r) fail('សូមភ្ជាប់ Google Drive ជាមុនសិន');
  return r;
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
  res.setHeader('Content-Disposition', `attachment; filename="phteah-yeung-${nowInCambodia().ymd}.json"`);
  res.json(exportData());
}));

// ---------- expenses (for profit in Reports) ----------

export const EXPENSE_CATS = ['electric', 'water', 'repair', 'cleaning', 'salary', 'internet', 'tax', 'loan', 'other'];
function cleanExpense(b, cur = {}) {
  const e = {
    ...cur,
    date: date(b.date) || cur.date || nowInCambodia().ymd,
    category: EXPENSE_CATS.includes(b.category) ? b.category : (cur.category || 'other'),
    amount: money(b.amount ?? cur.amount),
    note: str(b.note ?? cur.note, 200),
    building: str(b.building ?? cur.building, 60),
    repeat: typeof b.repeat === 'boolean' ? b.repeat : !!cur.repeat,
  };
  if (!(e.amount > 0)) fail('សូមបញ្ចូលចំនួនទឹកប្រាក់');
  return e;
}
app.post('/api/expenses', ...owner((req) => {
  const s = db();
  s.expenses = s.expenses || [];
  if (s.expenses.length >= 5000) fail('ចំណាយច្រើនពេក');
  s.expenses.push({ id: uid(), ...cleanExpense(req.body || {}), createdAt: now() });
  save();
  return adminState(req);
}));
app.put('/api/expenses/:id', ...owner((req) => {
  const s = db();
  const i = (s.expenses || []).findIndex((e) => e.id === req.params.id);
  if (i < 0) fail('រកមិនឃើញ', 404);
  s.expenses[i] = cleanExpense(req.body || {}, s.expenses[i]);
  save();
  return adminState(req);
}));
app.delete('/api/expenses/:id', ...owner((req) => {
  db().expenses = (db().expenses || []).filter((e) => e.id !== req.params.id);
  save();
  return adminState(req);
}));

// ---------- announcements to tenants (Telegram + portal) ----------

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function noticeTargets(target) {
  const s = db();
  const active = s.tenants.filter((t) => t.status === 'active' && t.roomId);
  if (target?.type === 'building') return active.filter((t) => (s.rooms.find((r) => r.id === t.roomId)?.building || '') === String(target.value || ''));
  if (target?.type === 'rooms') { const set = new Set((target.value || []).map(String)); return active.filter((t) => set.has(t.roomId)); }
  return active;
}

app.post('/api/notices', ...owner(async (req) => {
  const text = str(req.body?.text, 1000);
  if (!text) fail('សូមសរសេរសេចក្តីជូនដំណឹង');
  const target = ['all', 'building', 'rooms'].includes(req.body?.target?.type) ? req.body.target : { type: 'all' };
  const people = noticeTargets(target);
  if (!people.length) fail('មិនមានអតិថិជនក្នុងក្រុមនេះទេ');
  const s = db();
  const notice = { id: uid(), at: now(), text, target: { type: target.type, value: target.type === 'rooms' ? (target.value || []).slice(0, 500).map(String) : str(target.value, 60) }, rooms: people.map((t) => t.roomId), sent: 0, unlinked: 0 };
  const html = `📢 <b>សេចក្តីជូនដំណឹង</b> — ${esc(s.settings.propertyName)}\n\n${esc(text)}`;
  for (const t of people) {
    if (!t.telegram?.chatId) { notice.unlinked += 1; continue; }
    await notifyTenant(t, html);
    notice.sent += 1;
  }
  s.notices = [notice, ...(s.notices || [])].slice(0, 50);
  logEvent('admin', `បានផ្ញើសេចក្តីជូនដំណឹងទៅ ${people.length} នាក់`);
  return { ...(await adminState(req)), result: { sent: notice.sent, unlinked: notice.unlinked, total: people.length } };
}));

app.delete('/api/notices/:id', ...owner(async (req) => {
  db().notices = (db().notices || []).filter((n) => n.id !== req.params.id);
  save();
  return adminState(req);
}));

// ---------- browser error reports (no login needed: the portal reports too) ----------

app.post('/api/errors', async (req, res) => {
  if (!(await rateLimit(`err:${req.ip}`, 20, 600))) return res.json({ ok: true });
  const b = req.body || {};
  if (typeof b.message !== 'string' || !b.message.trim()) return res.json({ ok: true });
  const s = await getSession(cookies(req).py_session).catch(() => null);
  await recordError({ source: 'browser', message: b.message, stack: b.stack, path: b.path, orgId: s?.org_id || null, ua: req.headers['user-agent'] });
  res.json({ ok: true });
});

// ---------- Web Push (landlord devices) ----------

app.get('/api/push/key', requireOwner, async (req, res) => res.json({ key: await publicKey() }));
app.post('/api/push/subscribe', requireOwner, async (req, res) => {
  await subscribe(req.session.orgId, req.session.userId, req.body?.subscription, req.headers['user-agent']);
  res.json({ ok: true, devices: await devices(req.session.orgId) });
});
app.post('/api/push/unsubscribe', requireOwner, async (req, res) => {
  await unsubscribe(req.session.orgId, req.body?.endpoint);
  res.json({ ok: true, devices: await devices(req.session.orgId) });
});
app.get('/api/push/devices', requireOwner, async (req, res) => res.json({ devices: await devices(req.session.orgId) }));
app.post('/api/push/test', requireOwner, async (req, res) => {
  const sent = await pushToOrg(req.session.orgId, { title: '🔔 ផ្ទះយើង', body: 'ការជូនដំណឹងដំណើរការល្អ ✅', url: '/', tag: 'test', roles: [req.session.role] });
  res.json({ ok: true, sent });
});

// ---------- one-click backup & restore ----------

app.post('/api/backup/telegram', ...owner(async (req) => {
  const r = await sendBackupToTelegram({ includeFiles: !!req.body?.includeFiles });
  if (!r.ok) fail(r.error);
  return { ...(await adminState(req)), result: r };
}));

/** The browser finished downloading a backup file. */
app.post('/api/backup/downloaded', ...owner((req) => {
  db().settings.backup = { ...(db().settings.backup || {}), lastAt: now(), lastDownloadAt: now() };
  save();
  return adminState(req);
}));

app.post('/api/backup/restore', ...owner(async (req) => {
  const uploads = await restoreData(req.body?.data);
  return { ...(await adminState(req)), result: { uploads } };
}));

app.post('/api/backup/restore/finish', ...owner(async (req) => ({ ...(await adminState(req)), result: await cleanupOrphanFiles() })));

app.post('/api/account/delete', requireOwner, async (req, res) => {
  const { rows } = await q(`SELECT u.pass_hash, o.doc->'settings'->>'propertyName' AS name FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.id = $1`, [req.session.userId]);
  if (!rows[0]) fail('រកមិនឃើញគណនី', 404);
  if (rows[0].pass_hash) {
    if (!verifyPassword(req.body?.password, rows[0].pass_hash)) fail('ពាក្យសម្ងាត់មិនត្រឹមត្រូវ');
  } else if (String(req.body?.confirm || '').trim() !== rows[0].name) fail('ឈ្មោះមិនត្រូវគ្នា');
  const { rows: blobs } = await q("SELECT id FROM files WHERE org_id = $1 AND backend = 'r2'", [req.session.orgId]);
  for (const b of blobs) await deleteBlob(req.session.orgId, {}, b.id);
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
    lease: t.lease?.required !== false && t.lease?.text ? { text: t.lease.text, depositMonths: t.lease.depositMonths, prepaidMonths: t.lease.prepaidMonths } : null,
    location: (() => { const L = st.location || {}; return { lat: L.lat, lng: L.lng, addressText: [L.houseNo && `ផ្ទះលេខ ${L.houseNo}`, L.street && `ផ្លូវ ${L.street}`, L.addressText || st.address].filter(Boolean).join(', ') }; })(),
    invoiceDesign: st.invoiceDesign,
    autoConfirm: bakongEnabled(),
    notices: (s.notices || []).filter((n) => n.rooms?.includes(t.roomId) && Date.now() - new Date(n.at).getTime() < 60 * 86400000).slice(0, 5).map(({ id, at, text }) => ({ id, at, text })),
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

/** Polled by the portal while the KHQR is on screen: confirms automatically once Bakong sees the payment. */
app.get('/api/portal/:token/invoices/:id/status', ...portal(async (req, res, t) => {
  const inv = findInvoice(req.params.id);
  if (!inv || inv.tenantId !== t.id) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  const r = await checkInvoice(inv, { minIntervalMs: 4000 });
  return { status: inv.status, bakong: r !== 'skip' };
}));

app.post('/api/portal/:token/invoices/:id/claim', ...portal(async (req, res, t) => {
  const inv = findInvoice(req.params.id);
  if (!inv || inv.tenantId !== t.id) fail('រកមិនឃើញវិក្កយបត្រ', 404);
  if (inv.status === 'unpaid' && await checkInvoice(inv, { minIntervalMs: 0 }) !== 'paid') await claimPayment(inv, 'portal');
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
  if (status >= 500) {
    console.error(err);
    recordError({ source: 'server', message: err?.message, stack: err?.stack, path: `${req.method} ${req.route?.path || req.path}`, orgId: req.session?.orgId, ua: req.headers['user-agent'] });
  }
  res.status(status).json({ error: status >= 500 ? 'មានបញ្ហាខាងម៉ាស៊ីនមេ' : err.message });
});

export default app;
