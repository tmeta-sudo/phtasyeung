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
    // Where the property is: map pin + Cambodian address (pumi ids) for invoices, contracts and the bot.
    location: { lat: null, lng: null, houseNo: '', street: '', provinceId: '', districtId: '', communeId: '', villageId: '', detail: '' },
    invoiceDesign: DEFAULT_INVOICE_DESIGN,
    contract: { depositMonths: 1, prepaidMonths: 1, template: DEFAULT_CONTRACT },
    ownerName: '',
    buildings: [],
    storage: { mode: 'database' },
    backup: { telegramWeekly: true, includeFiles: false, lastAt: '', lastTelegramAt: '' },
    lateFee: { enabled: false, amount: 5, afterDays: 5 },
    carryOver: true,
  };
}

export const DEFAULT_INVOICE_DESIGN = {
  blocks: ['header', 'meta', 'items', 'totals', 'payment', 'address', 'note', 'footer'],
  hidden: [],
  accent: '#1f5bff',
  titleFont: 'Moul',
  size: 'a5',
  radius: 16,
  headerStyle: 'line',
  note: 'សូមបង់ប្រាក់មុនថ្ងៃផុតកំណត់។ សូមអរគុណ! 🙏',
  showLunar: true,
  showWords: true,
  showRiel: true,
};

// Short Khmer lease. {{placeholders}} are filled from the customer, room and settings.
export const DEFAULT_CONTRACT = `កិច្ចសន្យាជួលបន្ទប់

ធ្វើនៅ {{property}} ថ្ងៃទី {{today}}

ភាគី «ម្ចាស់ផ្ទះ»៖ {{owner}} ទូរស័ព្ទ {{ownerPhone}}
ភាគី «អ្នកជួល»៖ {{name}} ភេទ {{gender}} កើតថ្ងៃទី {{dob}}
អត្តសញ្ញាណប័ណ្ណលេខ {{idNumber}} ទូរស័ព្ទ {{phone}}
អាសយដ្ឋានអចិន្ត្រៃយ៍៖ {{tenantAddress}}

ប្រការ ១. ម្ចាស់ផ្ទះយល់ព្រមជួលបន្ទប់លេខ {{room}} ({{building}}) ដែលមានទីតាំងនៅ {{propertyAddress}} ឱ្យអ្នកជួល។
ប្រការ ២. រយៈពេលជួល ចាប់ពីថ្ងៃទី {{start}} ដល់ថ្ងៃទី {{end}}។
ប្រការ ៣. ថ្លៃជួលប្រចាំខែ {{rent}} ({{rentWords}}) មិនរួមបញ្ចូលថ្លៃទឹក ភ្លើង និងសេវាផ្សេងៗ ដែលគិតតាមកុងទ័រជាក់ស្តែង។
ប្រការ ៤. នៅពេលចុះកិច្ចសន្យា អ្នកជួលបង់ប្រាក់កក់ {{depositMonths}} ខែ ({{deposit}}) និងបង់ថ្លៃជួលមុន {{prepaidMonths}} ខែ ({{prepaid}}) សរុប {{moveInTotal}}។ ប្រាក់កក់នឹងប្រគល់ជូនវិញនៅពេលបញ្ចប់កិច្ចសន្យា ប្រសិនបើគ្មានការខូចខាត ឬបំណុល។
ប្រការ ៥. អ្នកជួលត្រូវបង់ថ្លៃជួលរៀងរាល់ខែ មុនថ្ងៃផុតកំណត់ក្នុងវិក្កយបត្រ។
ប្រការ ៦. អ្នកជួលត្រូវថែរក្សាបន្ទប់ឱ្យបានល្អ មិនធ្វើការកែប្រែដោយគ្មានការអនុញ្ញាត និងគោរពសណ្តាប់ធ្នាប់។
ប្រការ ៧. បើចង់បញ្ចប់កិច្ចសន្យាមុនកាលកំណត់ ត្រូវជូនដំណឹងមុន ៣០ ថ្ងៃ។ បើមិនជូនដំណឹង ប្រាក់កក់មិនត្រូវប្រគល់វិញទេ។

ហត្ថលេខាម្ចាស់ផ្ទះ                         ហត្ថលេខាអ្នកជួល



{{owner}}                                   {{name}}`;

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
    tickets: [],
    notices: [],
    expenses: [],
    counters: { invoice: 0, ticket: 0 },
    settings,
  };
}

/** Bring older documents (including the single-owner v3 file) up to the current shape. */
export function migrateDoc(doc) {
  const base = newOrgDoc({ name: doc.settings?.propertyName || 'ផ្ទះរបស់ខ្ញុំ' });
  for (const k of Object.keys(base)) if (doc[k] === undefined) doc[k] = base[k];
  doc.settings = { ...base.settings, ...doc.settings };
  for (const k of ['khqr', 'telegram', 'auto', 'location', 'invoiceDesign', 'contract', 'storage', 'backup', 'lateFee']) doc.settings[k] = { ...base.settings[k], ...(doc.settings[k] || {}) };
  doc.counters = { ...base.counters, ...doc.counters };
  delete doc.auth;
  doc.version = 5;
  return doc;
}
