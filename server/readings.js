// Meter readings from every source (owner/staff, tenant via Telegram bot, tenant via portal),
// with one set of rules. Tenant readings wait for the owner's OK unless they look normal and
// the landlord turned on automatic approval.
import { db, save, uid, now, logEvent } from './db.js';
import { nowInCambodia, kmDigits } from '../shared/khmer.js';

const fail = (error, status = 400) => { throw Object.assign(new Error(error), { status }); };
const sharedKind = (roomId, kind) => (db().settings.sharedMeters || []).some((g) => g.kind === kind && g.rooms.includes(roomId));

/** Create a monthly reading for a room. Kinds measured by a shared meter keep their old number. */
export function recordMeter({ roomId, month, water, electric, by = 'admin', photos, ocr }) {
  const s = db();
  const room = s.rooms.find((r) => r.id === roomId);
  if (!room || !/^\d{4}-\d{2}$/.test(month || '')) fail('សូមជ្រើសរើសបន្ទប់ និងខែ');
  const w = sharedKind(room.id, 'water') && (water === '' || water == null) ? room.water : Number(water);
  const e = sharedKind(room.id, 'electric') && (electric === '' || electric == null) ? room.electric : Number(electric);
  if (!Number.isFinite(w) || !Number.isFinite(e) || w < room.water || e < room.electric) {
    fail(`លេខថ្មីត្រូវធំជាង ឬស្មើលេខចាស់ (ទឹក ${room.water}, ភ្លើង ${room.electric})`);
  }
  if (s.meters.some((x) => x.roomId === room.id && x.month === month)) fail('បន្ទប់នេះបានកត់កុងទ័រសម្រាប់ខែនេះរួចហើយ');
  if (s.invoices.some((i) => i.roomId === room.id && i.month === month)) fail('ខែនេះមានវិក្កយបត្ររួចហើយ។ សូមលុបវិក្កយបត្រមុនពេលកត់កុងទ័រ');
  const m = { id: uid(), roomId: room.id, month, oldWater: room.water, water: w, oldElectric: room.electric, electric: e, at: now(), by, ...(photos ? { photos } : {}), ...ocrNote(ocr, { water: w, electric: e }) };
  s.meters.push(m);
  room.water = w;
  room.electric = e;
  save();
  return m;
}

/** Usage looks like this room's recent months (used for optional automatic approval). */
function looksNormal(roomId, water, electric) {
  const room = db().rooms.find((r) => r.id === roomId);
  const hist = db().meters.filter((m) => m.roomId === roomId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3);
  if (hist.length < 2) return false;
  const avg = (k, o) => hist.reduce((a, m) => a + (m[k] - m[o]), 0) / hist.length;
  const ok = (used, mean) => used >= 0 && used <= Math.max(mean * 2, mean + 20);
  return ok(water - room.water, avg('water', 'oldWater')) && ok(electric - room.electric, avg('electric', 'oldElectric'));
}

/**
 * A tenant sent their readings. Returns { sub, approved }.
 * photos: { water?: {tg: fileId} | meta, electric?: … }
 */
export function submitReading(tenant, { water, electric, photos = {}, source }) {
  const s = db();
  const room = s.rooms.find((r) => r.id === tenant.roomId);
  if (!room) fail('អ្នកមិនទាន់មានបន្ទប់');
  const month = nowInCambodia().ym;
  const w = sharedKind(room.id, 'water') ? room.water : Number(water);
  const e = sharedKind(room.id, 'electric') ? room.electric : Number(electric);
  if (!Number.isFinite(w) || w < room.water) fail(`លេខកុងទ័រទឹកត្រូវធំជាង ឬស្មើ ${room.water}`);
  if (!Number.isFinite(e) || e < room.electric) fail(`លេខកុងទ័រភ្លើងត្រូវធំជាង ឬស្មើ ${room.electric}`);
  if (s.meters.some((x) => x.roomId === room.id && x.month === month)) fail('ខែនេះម្ចាស់ផ្ទះបានកត់កុងទ័ររួចហើយ');
  s.meterSubmissions = (s.meterSubmissions || []).filter((x) => !(x.roomId === room.id && x.month === month && x.status === 'pending'));
  const sub = { id: uid(), tenantId: tenant.id, roomId: room.id, name: tenant.nameKm || tenant.nameEn, month, water: w, electric: e, oldWater: room.water, oldElectric: room.electric, photos, source, at: now(), status: 'pending' };
  s.meterSubmissions.push(sub);
  if (s.meterSubmissions.length > 300) s.meterSubmissions.splice(0, s.meterSubmissions.length - 300);
  logEvent('tenant', `${sub.name} (${room.id}) បានផ្ញើលេខកុងទ័រ ទឹក ${kmDigits(w)} · ភ្លើង ${kmDigits(e)}`);
  let approved = false;
  if (s.settings.autoApproveReadings && looksNormal(room.id, w, e)) { approveSubmission(sub, 'auto'); approved = true; }
  save();
  return { sub, approved };
}

/** Turn a tenant's submission into the month's reading. Photos from Telegram are copied in later by the caller. */
export function approveSubmission(sub, by = 'admin', fix) {
  if (sub.status !== 'pending') fail('បានដំណើរការរួចហើយ');
  // The owner corrected what the tenant typed (or what was misread from the photo): keep both.
  if (fix && (fix.water != null || fix.electric != null)) {
    const w = fix.water === '' || fix.water == null ? sub.water : Number(fix.water);
    const e = fix.electric === '' || fix.electric == null ? sub.electric : Number(fix.electric);
    if (!Number.isFinite(w) || !Number.isFinite(e) || w < sub.oldWater || e < sub.oldElectric) fail(`លេខត្រូវធំជាង ឬស្មើលេខចាស់ (ទឹក ${sub.oldWater}, ភ្លើង ${sub.oldElectric})`);
    if (w !== sub.water || e !== sub.electric) { sub.sent = { water: sub.water, electric: sub.electric }; sub.water = w; sub.electric = e; }
  }
  const photos = Object.fromEntries(Object.entries(sub.photos || {}).filter(([, v]) => v?.id));
  const m = recordMeter({ roomId: sub.roomId, month: sub.month, water: sub.water, electric: sub.electric, by: `tenant/${by}`, photos: Object.keys(photos).length ? photos : undefined });
  if (sub.sent) m.corrected = { from: sub.sent, by };
  sub.status = 'approved'; sub.meterId = m.id; sub.decidedAt = now(); sub.by = by;
  save();
  return m;
}

export function rejectSubmission(sub) {
  if (sub.status !== 'pending') fail('បានដំណើរការរួចហើយ');
  sub.status = 'rejected'; sub.decidedAt = now();
  save();
}

/**
 * What the photo reader suggested vs what was saved, so wrong readings are visible later
 * ({ ocr: { electric: { read: 1123, saved: 1128, corrected: true } } }).
 */
export function ocrNote(ocr, saved) {
  const out = {};
  for (const k of ['water', 'electric']) {
    const read = Number(ocr?.[k]);
    if (Number.isFinite(read) && ocr?.[k] !== '' && ocr?.[k] != null) out[k] = { read, saved: saved[k], corrected: read !== saved[k] };
  }
  return Object.keys(out).length ? { ocr: out } : {};
}

/** The room's most recent reading, which is the only one that can be changed (later months build on it). */
const latestOf = (roomId) => db().meters.filter((x) => x.roomId === roomId).sort((a, b) => b.month.localeCompare(a.month))[0];

/** Fix a saved reading (typo, wrong photo reading). Only the latest one, and not after its invoice. */
export function editMeter(id, { water, electric, ocr, by = 'admin' }) {
  const s = db();
  const m = s.meters.find((x) => x.id === id);
  if (!m) fail('រកមិនឃើញ', 404);
  if (latestOf(m.roomId)?.id !== m.id) fail('អាចកែបានតែលេខចុងក្រោយបង្អស់របស់បន្ទប់');
  if (s.invoices.some((i) => i.roomId === m.roomId && i.month === m.month)) fail('ខែនេះមានវិក្កយបត្ររួចហើយ។ សូមលុបវិក្កយបត្រជាមុនសិន');
  const w = water === '' || water == null ? m.water : Number(water);
  const e = electric === '' || electric == null ? m.electric : Number(electric);
  if (!Number.isFinite(w) || !Number.isFinite(e) || w < m.oldWater || e < m.oldElectric) fail(`លេខថ្មីត្រូវធំជាង ឬស្មើលេខចាស់ (ទឹក ${m.oldWater}, ភ្លើង ${m.oldElectric})`);
  const before = { water: m.water, electric: m.electric };
  Object.assign(m, { water: w, electric: e, editedAt: now(), editedBy: by, edits: [...(m.edits || []), { at: now(), by, from: before, to: { water: w, electric: e } }].slice(-10) });
  Object.assign(m, ocrNote(ocr, { water: w, electric: e }).ocr ? ocrNote(ocr, { water: w, electric: e }) : {});
  const room = s.rooms.find((r) => r.id === m.roomId);
  if (room) { room.water = w; room.electric = e; }
  save();
  return m;
}

/**
 * Change a room's "previous" reading (ចាស់): the starting number before any reading, or the
 * last saved reading if there is one (same rules as editMeter).
 */
export function setPrevious(roomId, { water, electric, by = 'admin' }) {
  const s = db();
  const room = s.rooms.find((r) => r.id === roomId);
  if (!room) fail('រកមិនឃើញបន្ទប់', 404);
  const latest = latestOf(room.id);
  if (latest) return editMeter(latest.id, { water, electric, by });
  const num = (v, d) => (v === '' || v == null ? d : Number(v));
  const w = num(water, room.water); const e = num(electric, room.electric);
  if (!Number.isFinite(w) || !Number.isFinite(e) || w < 0 || e < 0) fail('លេខមិនត្រឹមត្រូវ');
  room.water = w; room.electric = e;
  save();
  return null;
}
