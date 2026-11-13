import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load, db, save, uid, now, logEvent, DATA_DIR } from './db.js';
import { authRoutes, requireAdmin, isAdmin } from './auth.js';
import { upload, storeFile, sendStored, removeFile, SLOTS } from './files.js';
import { generateInvoices, khqrOf, recalc, isOverdue, tenantOfRoom } from './invoices.js';
import { isBakongId } from './khqr.js';
import {
  restartBot, botStatus, botUsername, sendInvoice, sendInvoices, claimPayment, confirmPayment, notifyAdmins, portalUrl,
} from './telegram.js';
import { startScheduler, runAutoInvoices, runReminders } from './scheduler.js';
import { normalizePhone, nowInCambodia, usd, kmDigits } from '../shared/khmer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const PORT = +process.env.PORT || 5173;

load();
const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
// Mutating API calls must come from our own page (basic CSRF guard alongside SameSite cookies).
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin not allowed' });
  next();
});

authRoutes(app);

// ---------- helpers ----------

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const month = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : '');
const money = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
const bad = (res, error, code = 400) => res.status(code).json({ error });
const findTenant = (id) => db().tenants.find((t) => t.id === id);
const findInvoice = (id) => db().invoices.find((i) => i.id === id);

function publicSettings() {
  const { settings } = db();
  const { telegram, ...rest } = settings;
  return {
    ...rest,
    telegram: {
      tokenSet: !!(process.env.TELEGRAM_BOT_TOKEN || telegram.token),
      tokenFromEnv: !!process.env.TELEGRAM_BOT_TOKEN,
      tokenHint: telegram.token ? '••••' + telegram.token.slice(-4) : '',
      adminChats: telegram.adminChats,
      adminLinkCode: telegram.adminLinkCode,
    },
    khqrReady: isBakongId(settings.khqr.accountId),
    passwordFromEnv: !!process.env.ADMIN_PASSWORD,
  };
}

const withQr = (inv) => ({ ...inv, khqr: khqrOf(inv), overdue: isOverdue(inv) });

function adminState() {
  const s = db();
  return {
    rooms: s.rooms,
    tenants: s.tenants,
    meters: s.meters,
    invoices: s.invoices.map(withQr),
    activities: s.activities,
    events: s.events.slice(0, 200),
    settings: publicSettings(),
    bot: botStatus(),
    today: nowInCambodia(),
  };
}

const ok = (res) => res.json(adminState());

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

// ---------- admin: state ----------

app.get('/api/state', requireAdmin, (req, res) => ok(res));

// ---------- rooms ----------

function cleanRoom(p) {
  return {
    id: str(p.id, 30), building: str(p.building, 60), floor: str(p.floor, 10), rent: money(p.rent),
    water: Math.max(0, +p.water || 0), electric: Math.max(0, +p.electric || 0), note: str(p.note, 300),
    extras: (Array.isArray(p.extras) ? p.extras : []).slice(0, 6).map((e) => ({ label: str(e.label, 60), amount: money(e.amount) })).filter((e) => e.label),
  };
}

app.post('/api/rooms', requireAdmin, (req, res) => {
  const room = cleanRoom(req.body);
  if (!room.id) return bad(res, 'សូមបញ្ចូលលេខបន្ទប់');
  if (db().rooms.some((r) => r.id === room.id)) return bad(res, 'លេខបន្ទប់នេះមានរួចហើយ');
  db().rooms.push(room);
  save();
  ok(res);
});

app.put('/api/rooms/:id', requireAdmin, (req, res) => {
  const i = db().rooms.findIndex((r) => r.id === req.params.id);
  if (i < 0) return bad(res, 'រកមិនឃើញបន្ទប់', 404);
  db().rooms[i] = { ...cleanRoom({ ...db().rooms[i], ...req.body }), id: req.params.id };
  save();
  ok(res);
});

app.delete('/api/rooms/:id', requireAdmin, (req, res) => {
  const s = db();
  s.rooms = s.rooms.filter((r) => r.id !== req.params.id);
  for (const t of s.tenants) if (t.roomId === req.params.id) t.roomId = '';
  save();
  ok(res);
});

// ---------- customers ----------

app.post('/api/tenants', requireAdmin, (req, res) => {
  const t = cleanProfile(req.body, {
    id: 'c-' + uid(8), files: {}, telegram: null, portalToken: uid(18), linkCode: uid(6), createdAt: now(),
  }, { admin: true });
  t.updatedAt = now();
  const err = validateTenant(t);
  if (err) return bad(res, err);
  db().tenants.push(t);
  logEvent('admin', `បានបន្ថែមអតិថិជន ${t.nameKm || t.nameEn}`, { tenantId: t.id });
  ok(res);
});

app.put('/api/tenants/:id', requireAdmin, (req, res) => {
  const cur = findTenant(req.params.id);
  if (!cur) return bad(res, 'រកមិនឃើញអតិថិជន', 404);
  const next = cleanProfile(req.body, cur, { admin: true });
  const err = validateTenant(next);
  if (err) return bad(res, err);
  Object.assign(cur, next, { updatedAt: now() });
  save();
  ok(res);
});

app.delete('/api/tenants/:id', requireAdmin, (req, res) => {
  const t = findTenant(req.params.id);
  if (!t) return bad(res, 'រកមិនឃើញអតិថិជន', 404);
  for (const meta of Object.values(t.files || {})) removeFile(meta);
  db().tenants = db().tenants.filter((x) => x.id !== t.id);
  logEvent('admin', `បានលុបអតិថិជន ${t.nameKm || t.nameEn}`);
  ok(res);
});

app.post('/api/tenants/:id/rotate', requireAdmin, (req, res) => {
  const t = findTenant(req.params.id);
  if (!t) return bad(res, 'រកមិនឃើញអតិថិជន', 404);
  if (req.body?.what === 'portal') t.portalToken = uid(18);
  else t.linkCode = uid(6);
  save();
  ok(res);
});

app.post('/api/tenants/:id/unlink-telegram', requireAdmin, (req, res) => {
  const t = findTenant(req.params.id);
  if (!t) return bad(res, 'រកមិនឃើញអតិថិជន', 404);
  t.telegram = null;
  t.linkCode = uid(6);
  save();
  ok(res);
});

app.post('/api/tenants/:id/files/:slot', requireAdmin, upload, (req, res) => {
  const t = findTenant(req.params.id);
  if (!t) return bad(res, 'រកមិនឃើញអតិថិជន', 404);
  const err = storeFile(t, req.params.slot, req.file);
  if (err) return bad(res, err);
  ok(res);
});

app.delete('/api/tenants/:id/files/:slot', requireAdmin, (req, res) => {
  const t = findTenant(req.params.id);
  if (!t || !SLOTS[req.params.slot]) return bad(res, 'រកមិនឃើញ', 404);
  removeFile(t.files?.[req.params.slot]);
  delete t.files[req.params.slot];
  save();
  ok(res);
});

app.get('/api/tenants/:id/files/:slot', requireAdmin, (req, res) => sendStored(res, findTenant(req.params.id)?.files?.[req.params.slot]));

// ---------- meters ----------

app.post('/api/meters', requireAdmin, (req, res) => {
  const s = db();
  const room = s.rooms.find((r) => r.id === req.body?.roomId);
  const m = month(req.body?.month);
  const water = Number(req.body?.water);
  const electric = Number(req.body?.electric);
  if (!room || !m) return bad(res, 'សូមជ្រើសរើសបន្ទប់ និងខែ');
  if (!Number.isFinite(water) || !Number.isFinite(electric) || water < room.water || electric < room.electric) {
    return bad(res, `លេខថ្មីត្រូវធំជាង ឬស្មើលេខចាស់ (ទឹក ${room.water}, ភ្លើង ${room.electric})`);
  }
  if (s.meters.some((x) => x.roomId === room.id && x.month === m)) return bad(res, 'បន្ទប់នេះបានកត់កុងទ័រសម្រាប់ខែនេះរួចហើយ');
  if (s.invoices.some((i) => i.roomId === room.id && i.month === m)) return bad(res, 'ខែនេះមានវិក្កយបត្ររួចហើយ។ សូមលុបវិក្កយបត្រមុនពេលកត់កុងទ័រ');
  s.meters.push({ id: uid(), roomId: room.id, month: m, oldWater: room.water, water, oldElectric: room.electric, electric, at: now() });
  room.water = water;
  room.electric = electric;
  save();
  ok(res);
});

app.delete('/api/meters/:id', requireAdmin, (req, res) => {
  const s = db();
  const m = s.meters.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'រកមិនឃើញ', 404);
  const latest = s.meters.filter((x) => x.roomId === m.roomId).sort((a, b) => b.month.localeCompare(a.month))[0];
  if (latest.id !== m.id) return bad(res, 'អាចលុបបានតែកំណត់ត្រាចុងក្រោយបង្អស់របស់បន្ទប់');
  if (s.invoices.some((i) => i.roomId === m.roomId && i.month === m.month)) return bad(res, 'សូមលុបវិក្កយបត្រខែនេះជាមុនសិន');
  const room = s.rooms.find((r) => r.id === m.roomId);
  if (room) { room.water = m.oldWater; room.electric = m.oldElectric; }
  s.meters = s.meters.filter((x) => x.id !== m.id);
  save();
  ok(res);
});

// ---------- invoices ----------

app.post('/api/invoices/generate', requireAdmin, async (req, res) => {
  const m = month(req.body?.month) || nowInCambodia().ym;
  const created = generateInvoices(m, 'admin');
  let sent = null;
  if (req.body?.send) sent = await sendInvoices(created);
  res.json({ ...adminState(), result: { created: created.length, sent } });
});

app.put('/api/invoices/:id', requireAdmin, async (req, res) => {
  const inv = findInvoice(req.params.id);
  if (!inv) return bad(res, 'រកមិនឃើញវិក្កយបត្រ', 404);
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
  ok(res);
});

app.delete('/api/invoices/:id', requireAdmin, (req, res) => {
  db().invoices = db().invoices.filter((i) => i.id !== req.params.id);
  save();
  ok(res);
});

app.post('/api/invoices/:id/send', requireAdmin, async (req, res) => {
  const inv = findInvoice(req.params.id);
  if (!inv) return bad(res, 'រកមិនឃើញវិក្កយបត្រ', 404);
  const r = await sendInvoice(inv, { reminder: !!req.body?.reminder });
  if (!r.ok) return bad(res, r.error);
  ok(res);
});

app.post('/api/invoices/send-month', requireAdmin, async (req, res) => {
  const m = month(req.body?.month) || nowInCambodia().ym;
  const list = db().invoices.filter((i) => i.month === m && i.status !== 'paid' && (req.body?.all || !i.sentAt));
  const r = await sendInvoices(list, { reminder: !!req.body?.reminder });
  res.json({ ...adminState(), result: r });
});

// ---------- automation / telegram ----------

app.post('/api/auto/run', requireAdmin, async (req, res) => {
  const r = req.body?.what === 'reminders' ? await runReminders() : await runAutoInvoices({ force: true });
  res.json({ ...adminState(), result: r });
});

app.post('/api/telegram/restart', requireAdmin, async (req, res) => {
  await restartBot();
  ok(res);
});

app.post('/api/telegram/test', requireAdmin, async (req, res) => {
  if (!db().settings.telegram.adminChats.length) return bad(res, 'សូមភ្ជាប់ Telegram ម្ចាស់ផ្ទះជាមុនសិន');
  await notifyAdmins('✅ <b>សាកល្បង</b> — Bot ដំណើរការធម្មតា។');
  ok(res);
});

app.delete('/api/telegram/admins/:chatId', requireAdmin, (req, res) => {
  const t = db().settings.telegram;
  t.adminChats = t.adminChats.filter((c) => String(c.chatId) !== req.params.chatId);
  save();
  ok(res);
});

// ---------- settings ----------

app.put('/api/settings', requireAdmin, async (req, res) => {
  const s = db().settings;
  const b = req.body || {};
  const prevToken = s.telegram.token;
  Object.assign(s, {
    propertyName: str(b.propertyName ?? s.propertyName, 80),
    propertyNameEn: str(b.propertyNameEn ?? s.propertyNameEn, 80),
    address: str(b.address ?? s.address, 200),
    phone: str(b.phone ?? s.phone, 40),
    coverUrl: /^https?:\/\//.test(b.coverUrl || '') ? str(b.coverUrl, 500) : (b.coverUrl === '' ? '' : s.coverUrl),
    waterRate: money(b.waterRate ?? s.waterRate),
    electricRate: money(b.electricRate ?? s.electricRate),
    exchangeRate: Math.max(1, Math.round(+(b.exchangeRate ?? s.exchangeRate)) || 4100),
    dueDays: Math.min(60, Math.max(0, Math.round(+(b.dueDays ?? s.dueDays)) || 0)),
    khmerNumerals: b.khmerNumerals ?? s.khmerNumerals,
    publicUrl: /^https?:\/\/[^\s]+$/.test(b.publicUrl || '') ? str(b.publicUrl, 200).replace(/\/+$/, '') : (b.publicUrl === '' ? '' : s.publicUrl),
  });
  if (b.khqr) {
    const id = str(b.khqr.accountId, 60);
    if (id && !isBakongId(id)) return bad(res, 'Bakong ID មិនត្រឹមត្រូវ (ឧ. name@aclb)');
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
    if (tok && !/^\d{5,}:[\w-]{30,}$/.test(tok)) return bad(res, 'Bot token មិនត្រឹមត្រូវ (យកពី @BotFather)');
    s.telegram.token = tok;
  }
  if (b.rotateAdminLink) s.telegram.adminLinkCode = uid(6);
  save();
  if (s.telegram.token !== prevToken) await restartBot();
  ok(res);
});

// ---------- tasks (maintenance & leads) ----------

app.post('/api/activities', requireAdmin, (req, res) => {
  const b = req.body || {};
  db().activities.push({ id: uid(), kind: b.kind === 'lead' ? 'lead' : 'maintenance', title: str(b.title, 120), detail: str(b.detail, 500), roomId: str(b.roomId, 30), done: false, at: now() });
  save();
  ok(res);
});
app.put('/api/activities/:id', requireAdmin, (req, res) => {
  const a = db().activities.find((x) => x.id === req.params.id);
  if (a) { a.done = !!req.body?.done; save(); }
  ok(res);
});
app.delete('/api/activities/:id', requireAdmin, (req, res) => {
  db().activities = db().activities.filter((x) => x.id !== req.params.id);
  save();
  ok(res);
});

// ---------- import from the previous browser-only version ----------

app.post('/api/import-legacy', requireAdmin, (req, res) => {
  const s = db();
  const old = req.body || {};
  let rooms = 0; let tenants = 0; let invoices = 0;
  for (const r of old.rooms || []) {
    const id = str(r.id, 30);
    if (!id || s.rooms.some((x) => x.id === id)) continue;
    s.rooms.push(cleanRoom({ ...r, id }));
    rooms += 1;
    if (str(r.name)) {
      s.tenants.push(cleanProfile({ nameKm: r.name, phone: r.phone, roomId: id, status: 'active', contract: { start: r.start, end: r.end } }, {
        id: 'c-' + uid(8), files: {}, telegram: null, portalToken: uid(18), linkCode: uid(6), createdAt: now(), updatedAt: now(),
      }, { admin: true }));
      tenants += 1;
    }
  }
  for (const m of old.meters || []) if (!s.meters.some((x) => x.roomId === m.roomId && x.month === m.month)) s.meters.push({ ...m, id: uid() });
  for (const i of old.invoices || []) {
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
  for (const a of old.activities || []) s.activities.push({ id: uid(), kind: a.kind === 'អ្នកចាប់អារម្មណ៍' ? 'lead' : 'maintenance', title: str(a.title, 120), detail: str(a.detail, 500), roomId: str(a.roomId, 30), done: !!a.done, at: now() });
  logEvent('admin', `បាននាំចូលទិន្នន័យចាស់: បន្ទប់ ${kmDigits(rooms)} · អតិថិជន ${kmDigits(tenants)} · វិក្កយបត្រ ${kmDigits(invoices)}`);
  res.json({ ...adminState(), result: { rooms, tenants, invoices } });
});

// ---------- customer self-service portal (secret link / QR) ----------

function portalTenant(req, res, next) {
  const t = db().tenants.find((x) => x.portalToken && x.portalToken === req.params.token);
  if (!t || t.status === 'former') return bad(res, 'តំណនេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ', 404);
  req.tenant = t;
  next();
}

function portalState(t) {
  const s = db();
  const room = s.rooms.find((r) => r.id === t.roomId);
  const { notes, linkCode, portalToken, ...profile } = t;
  const st = s.settings;
  return {
    profile,
    room: room ? { id: room.id, building: room.building, floor: room.floor, rent: room.rent, water: room.water, electric: room.electric } : null,
    invoices: s.invoices.filter((i) => i.tenantId === t.id).sort((a, b) => b.month.localeCompare(a.month)).map(withQr),
    meters: s.meters.filter((m) => m.roomId === t.roomId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12),
    property: { name: st.propertyName, nameEn: st.propertyNameEn, address: st.address, phone: st.phone, coverUrl: st.coverUrl, khmerNumerals: st.khmerNumerals, waterRate: st.waterRate, electricRate: st.electricRate },
    telegram: { bot: botUsername(), linked: !!t.telegram?.chatId, link: botUsername() ? `https://t.me/${botUsername()}?start=${t.linkCode}` : '' },
  };
}

app.get('/api/portal/:token', portalTenant, (req, res) => res.json(portalState(req.tenant)));

app.put('/api/portal/:token/profile', portalTenant, async (req, res) => {
  const t = req.tenant;
  const next = cleanProfile(req.body, t, { admin: false });
  const err = validateTenant(next);
  if (err) return bad(res, err);
  Object.assign(t, next, { updatedAt: now() });
  save();
  logEvent('tenant', `${t.nameKm || t.nameEn} បានកែប្រែព័ត៌មានផ្ទាល់ខ្លួន`, { tenantId: t.id });
  notifyAdmins(`✏️ <b>${t.nameKm || t.nameEn}</b> (${t.roomId || '—'}) បានកែប្រែព័ត៌មានផ្ទាល់ខ្លួន។`).catch(() => {});
  res.json(portalState(t));
});

app.post('/api/portal/:token/files/:slot', portalTenant, upload, (req, res) => {
  if (!['idFront', 'idBack', 'photo'].includes(req.params.slot)) return bad(res, 'មិនអនុញ្ញាត', 403);
  const err = storeFile(req.tenant, req.params.slot, req.file);
  if (err) return bad(res, err);
  logEvent('tenant', `${req.tenant.nameKm} បានផ្ញើ${SLOTS[req.params.slot]}`, { tenantId: req.tenant.id });
  notifyAdmins(`🪪 <b>${req.tenant.nameKm}</b> (${req.tenant.roomId || '—'}) បានផ្ញើ${SLOTS[req.params.slot]}។ សូមពិនិត្យ។`).catch(() => {});
  res.json(portalState(req.tenant));
});

app.get('/api/portal/:token/files/:slot', portalTenant, (req, res) => {
  if (!['idFront', 'idBack', 'photo', 'contract'].includes(req.params.slot)) return res.status(404).end();
  sendStored(res, req.tenant.files?.[req.params.slot]);
});

app.post('/api/portal/:token/invoices/:id/claim', portalTenant, async (req, res) => {
  const inv = findInvoice(req.params.id);
  if (!inv || inv.tenantId !== req.tenant.id) return bad(res, 'រកមិនឃើញវិក្កយបត្រ', 404);
  if (inv.status === 'unpaid') await claimPayment(inv, 'portal');
  res.json(portalState(req.tenant));
});

app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use('/api', (err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return bad(res, 'ឯកសារធំពេក (អតិបរមា ៨MB)');
  console.error(err);
  bad(res, 'មានបញ្ហាខាងម៉ាស៊ីនមេ', 500);
});

// ---------- web app ----------

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) {
    console.error('dist/ not found — run "npm run build" first, or use "npm run dev".');
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ផ្ទះយើង running → http://localhost:${PORT}/`);
  console.log(`  data: ${DATA_DIR}${process.env.ADMIN_PASSWORD ? '' : '  (first visit asks you to create the admin password)'}\n`);
  restartBot().then((st) => {
    if (st.running) console.log(`  Telegram bot @${st.username} is polling`);
    else if (st.configured) console.log(`  Telegram bot error: ${st.error}`);
  });
  startScheduler();
});


