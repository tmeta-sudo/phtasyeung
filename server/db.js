// Tiny JSON-file database. One process owns the file; writes are atomic
// (write to a temp file then rename) and coalesced.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const uid = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');
export const now = () => new Date().toISOString();

const SEED_COVER = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80';

function seed() {
  const t = (id, nameKm, nameEn, gender, phone, roomId, start, end) => ({
    id, nameKm, nameEn, gender, dob: '', phone, phone2: '', email: '', occupation: '', workplace: '',
    idType: 'national_id', idNumber: '', idIssued: '', idExpiry: '', files: {},
    address: { provinceId: '', districtId: '', communeId: '', villageId: '', detail: '' },
    emergency: { name: '', relation: '', phone: '' },
    roomId, contract: { start, end, deposit: 150 }, status: 'active', notes: '',
    portalToken: uid(18), linkCode: uid(6), telegram: null, createdAt: now(), updatedAt: now(),
  });
  return {
    version: 3,
    rooms: [
      { id: 'A-101', building: 'អគារ A', floor: '1', rent: 150, water: 124, electric: 1260 },
      { id: 'A-102', building: 'អគារ A', floor: '1', rent: 150, water: 98, electric: 1082 },
      { id: 'A-103', building: 'អគារ A', floor: '1', rent: 150, water: 156, electric: 1420 },
      { id: 'A-201', building: 'អគារ A', floor: '2', rent: 170, water: 40, electric: 610 },
    ],
    tenants: [
      t('c-demo-1', 'សុខ ស្រីនាង', 'Sok Sreyneang', 'female', '012 345 678', 'A-101', '2026-01-01', '2026-12-31'),
      t('c-demo-2', 'ចាន់ ដារ៉ា', 'Chan Dara', 'male', '096 234 567', 'A-102', '2026-02-01', '2027-01-31'),
      t('c-demo-3', 'ពេជ្រ សុភា', 'Pich Sophea', 'female', '077 123 456', 'A-103', '2025-12-15', '2026-12-20'),
    ],
    meters: [],
    invoices: [],
    activities: [],
    events: [],
    counters: { invoice: 0 },
    settings: {
      propertyName: 'ផ្ទះយើង',
      propertyNameEn: 'Phteah Yeung',
      address: 'ភ្នំពេញ',
      phone: '',
      coverUrl: SEED_COVER,
      waterRate: 0.5,
      electricRate: 0.25,
      exchangeRate: 4100,
      dueDays: 7,
      khmerNumerals: true,
      publicUrl: '',
      khqr: { accountId: '', merchantName: '', city: 'Phnom Penh' },
      telegram: { token: '', adminChats: [], adminLinkCode: uid(6) },
      auto: { enabled: false, day: 1, hour: 8, send: true, reminderDays: 3, lastRunMonth: '', lastReminderDay: '' },
    },
    auth: { passwordHash: '', sessions: {} },
  };
}

let state;
let timer = null;

export function load() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    migrate(state);
  } else {
    state = seed();
    flush();
  }
  return state;
}

function migrate(s) {
  const base = seed();
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  s.settings = { ...base.settings, ...s.settings };
  for (const k of ['khqr', 'telegram', 'auto']) s.settings[k] = { ...base.settings[k], ...s.settings[k] };
  s.auth = { ...base.auth, ...s.auth };
}

export const db = () => state;

export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}

export function flush() {
  clearTimeout(timer);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

/** Append to the activity feed shown on the dashboard. kind: auto | admin | tenant | alert */
export function logEvent(kind, text, refs = {}) {
  state.events.unshift({ id: uid(), at: now(), kind, text, ...refs });
  state.events.length = Math.min(state.events.length, 400);
  save();
}

process.on('exit', () => { try { if (state) flush(); } catch { /* ignore */ } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
