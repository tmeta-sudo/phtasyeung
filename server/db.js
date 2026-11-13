// Per-request access to the current landlord's document (set up by store.withOrg).
import { als, uid, now } from './store.js';

export { uid, now };

export function db() {
  const ctx = als.getStore();
  if (!ctx?.doc) throw new Error('db() called outside withOrg');
  return ctx.doc;
}
export const orgId = () => als.getStore()?.orgId;

/** Mark the current document as changed; it is written when the request's transaction ends. */
export function save() {
  const ctx = als.getStore();
  if (ctx) ctx.dirty = true;
}

/** Append to the dashboard activity feed. kind: auto | admin | tenant | alert */
export function logEvent(kind, text, refs = {}) {
  const s = db();
  s.events.unshift({ id: uid(), at: now(), kind, text, ...refs });
  s.events.length = Math.min(s.events.length, 300);
  save();
}

const COVER = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80';

export function defaultSettings(name = 'ផ្ទះរបស់ខ្ញុំ') {
  return {
    propertyName: name,
    propertyNameEn: '',
    address: '',
    phone: '',
    coverUrl: COVER,
    waterRate: 0.5,
    electricRate: 0.25,
    exchangeRate: 4100,
    dueDays: 7,
    khmerNumerals: true,
    publicUrl: '',
    khqr: { accountId: '', merchantName: '', city: 'Phnom Penh' },
    telegram: { token: '', username: '', error: '', adminChats: [], adminLinkCode: uid(6) },
    auto: { enabled: false, day: 1, hour: 8, send: true, reminderDays: 3, lastRunMonth: '', lastReminderDay: '' },
  };
}

/** A brand-new landlord account. */
export function newOrgDoc({ name, nameEn = '', phone = '' }) {
  const settings = defaultSettings(name);
  settings.propertyNameEn = nameEn;
  settings.phone = phone;
  return {
    version: 4,
    rooms: [],
    tenants: [],
    meters: [],
    invoices: [],
    activities: [],
    events: [],
    counters: { invoice: 0 },
    settings,
  };
}

/** Bring older documents (including the single-owner v3 file) up to the current shape. */
export function migrateDoc(doc) {
  const base = newOrgDoc({ name: doc.settings?.propertyName || 'ផ្ទះរបស់ខ្ញុំ' });
  for (const k of Object.keys(base)) if (doc[k] === undefined) doc[k] = base[k];
  doc.settings = { ...base.settings, ...doc.settings };
  for (const k of ['khqr', 'telegram', 'auto']) doc.settings[k] = { ...base.settings[k], ...(doc.settings[k] || {}) };
  delete doc.auth;
  doc.version = 4;
  return doc;
}
