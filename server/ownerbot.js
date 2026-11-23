// Quick answers for the landlord in Telegram: income, what is about to expire, open repairs,
// one room at a glance. Plain commands (no AI): fast, free, and always exact.
import { db } from './db.js';
import { fm } from './db.js';
import { balanceOf, tenantsOfRoom, isOverdue } from './invoices.js';
import { monthKm, kmDigits, nowInCambodia, dateKm } from '../shared/khmer.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const OWNER_COMMANDS = [
  { command: 'summary', description: 'សង្ខេបខែនេះ' },
  { command: 'unpaid', description: 'អ្នកមិនទាន់បង់' },
  { command: 'income', description: 'ចំណូល ចំណាយ ចំណេញ' },
  { command: 'expiring', description: 'កិច្ចសន្យា / អត្តសញ្ញាណប័ណ្ណជិតផុត' },
  { command: 'repairs', description: 'ការជួសជុលកំពុងរង់ចាំ' },
  { command: 'room', description: 'ព័ត៌មានបន្ទប់ ឧ. /room A1' },
  { command: 'generate', description: 'បង្កើតវិក្កយបត្រខែនេះ' },
  { command: 'help', description: 'ជំនួយ' },
];

export const OWNER_HELP = [
  '📊 /summary — សង្ខេបខែនេះ',
  '⏳ /unpaid — អ្នកមិនទាន់បង់',
  '💰 /income — ចំណូល ចំណាយ ចំណេញ (ឬ /income 2026-10)',
  '📅 /expiring — កិច្ចសន្យា និងអត្តសញ្ញាណប័ណ្ណជិតផុតកំណត់',
  '🔧 /repairs — ការជួសជុលដែលកំពុងរង់ចាំ',
  '🚪 /room A1 — បន្ទប់មួយ៖ អ្នកជួល ជំពាក់ កុងទ័រ',
  '🧾 /generate — បង្កើត និងផ្ញើវិក្កយបត្រខែនេះ',
].join('\n');

/** Money in, money out and profit for one month, with last month for comparison. */
export function incomeHtml(ym = nowInCambodia().ym) {
  const s = db();
  const one = (m) => {
    const inv = s.invoices.filter((i) => i.month === m);
    const billed = inv.reduce((a, i) => a + i.total, 0);
    const collected = inv.reduce((a, i) => a + (i.total - balanceOf(i)), 0);
    const spent = (s.expenses || []).filter((e) => String(e.date).slice(0, 7) === m).reduce((a, e) => a + (+e.amount || 0), 0);
    return { billed, collected, spent, profit: collected - spent, count: inv.length };
  };
  const a = one(ym);
  const b = one(prevMonth(ym));
  const diff = (x, y) => (y ? ` (${x >= y ? '▲' : '▼'} ${fm(Math.abs(x - y))})` : '');
  return [
    `💰 <b>${esc(monthKm(ym))}</b>`,
    `ចេញវិក្កយបត្រ: ${fm(a.billed)} · ${kmDigits(a.count)} ច្បាប់`,
    `បានប្រមូល: <b>${fm(a.collected)}</b>${diff(a.collected, b.collected)}`,
    `ចំណាយ: ${fm(a.spent)}`,
    `ចំណេញ: <b>${fm(a.profit)}</b>${diff(a.profit, b.profit)}`,
    a.billed > a.collected ? `នៅខ្វះ: ${fm(a.billed - a.collected)}` : '✅ ប្រមូលបានគ្រប់',
  ].join('\n');
}

/** Contracts ending within 30 days and ID cards expiring within 60 days (or already expired). */
export function expiringHtml(today = nowInCambodia().ymd) {
  const active = db().tenants.filter((t) => t.status === 'active');
  const contracts = active.filter((t) => t.contract?.end && daysBetween(today, t.contract.end) <= 30).sort((x, y) => x.contract.end.localeCompare(y.contract.end));
  const ids = active.filter((t) => t.idExpiry && daysBetween(today, t.idExpiry) <= 60).sort((x, y) => x.idExpiry.localeCompare(y.idExpiry));
  if (!contracts.length && !ids.length) return '📅 ✅ គ្មានកិច្ចសន្យា ឬអត្តសញ្ញាណប័ណ្ណជិតផុតកំណត់ទេ។';
  const when = (ymd) => { const d = daysBetween(today, ymd); return d < 0 ? `ផុតហើយ ${kmDigits(-d)} ថ្ងៃ` : d === 0 ? 'ថ្ងៃនេះ' : `នៅ ${kmDigits(d)} ថ្ងៃ`; };
  const line = (t, ymd) => `${daysBetween(today, ymd) < 0 ? '🔴' : '🟡'} ${esc(t.roomId || '—')} · ${esc(t.nameKm || t.nameEn)} · ${esc(dateKm(ymd))} (${when(ymd)})`;
  return [
    contracts.length && `📄 <b>កិច្ចសន្យាជិតផុត</b>\n${contracts.map((t) => line(t, t.contract.end)).join('\n')}`,
    ids.length && `🪪 <b>អត្តសញ្ញាណប័ណ្ណជិតផុត</b>\n${ids.map((t) => line(t, t.idExpiry)).join('\n')}`,
  ].filter(Boolean).join('\n\n');
}

/** Repair requests that are not done yet, oldest first. */
export function repairsHtml(nowMs = Date.now()) {
  const open = (db().tickets || []).filter((t) => t.kind === 'maintenance' && t.status !== 'done').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!open.length) return '🔧 ✅ គ្មានការជួសជុលកំពុងរង់ចាំទេ។';
  const age = (iso) => { const h = (nowMs - Date.parse(iso)) / 3600000; return h < 48 ? `${kmDigits(Math.max(1, Math.round(h)))} ម៉ោង` : `${kmDigits(Math.round(h / 24))} ថ្ងៃ`; };
  return [`🔧 <b>ការជួសជុលកំពុងរង់ចាំ (${kmDigits(open.length)})</b>`, ...open.slice(0, 30).map((t) => {
    const first = t.messages.find((m) => m.from === 'tenant')?.text || '📷';
    return `${t.status === 'progress' ? '🔵' : '🟡'} #${kmDigits(t.no)} · ${esc(t.roomId || '—')} · ${esc(first.slice(0, 60))} · ${age(t.createdAt)}`;
  })].join('\n');
}

/** One room: who lives there, rent, what is owed, the last meter numbers. */
export function roomHtml(roomId) {
  const s = db();
  const want = String(roomId || '').trim().toUpperCase();
  if (!want) return '🚪 សរសេរលេខបន្ទប់ ឧ. <code>/room A1</code>';
  const room = s.rooms.find((r) => String(r.id).toUpperCase() === want);
  if (!room) return `🚪 រកមិនឃើញបន្ទប់ ${esc(roomId)}`;
  const people = tenantsOfRoom(room.id);
  const open = s.invoices.filter((i) => i.roomId === room.id && i.status !== 'paid');
  const owed = open.reduce((a, i) => a + balanceOf(i), 0);
  const meter = s.meters.filter((m) => m.roomId === room.id).sort((a, b) => b.month.localeCompare(a.month))[0];
  return [
    `🚪 <b>បន្ទប់ ${esc(room.id)}</b>${room.building ? ` · ${esc(room.building)}` : ''}`,
    `ថ្លៃជួល: ${fm(room.rent || 0)}/ខែ`,
    people.length ? `👤 ${people.map((t) => esc(t.nameKm || t.nameEn) + (t.phone ? ` · ${esc(t.phone)}` : '')).join('\n👤 ')}` : '⚪️ ទំនេរ',
    open.length ? `${open.some(isOverdue) ? '🔴' : '⏳'} ជំពាក់ ${fm(owed)} (${kmDigits(open.length)} វិក្កយបត្រ)` : '✅ គ្មានជំពាក់',
    meter ? `📟 ${esc(monthKm(meter.month))}: ទឹក ${kmDigits(meter.water)} · ភ្លើង ${kmDigits(meter.electric)}` : '',
  ].filter(Boolean).join('\n');
}

/** Text → answer, or null when the text is not one of these commands. */
export function ownerAnswer(text) {
  const t = String(text || '').trim();
  const [cmd, ...rest] = t.split(/\s+/);
  const arg = rest.join(' ');
  const c = cmd.replace(/@\w+$/, '').toLowerCase();
  if (c === '/income' || t === '💰 ចំណូល') return incomeHtml(/^\d{4}-\d{2}$/.test(arg) ? arg : undefined);
  if (c === '/expiring' || t === '📅 ជិតផុតកំណត់') return expiringHtml();
  if (c === '/repairs' || t === '🔧 ការជួសជុល') return repairsHtml();
  if (c === '/room') return roomHtml(arg);
  if (c === '/help' || t === '❓ ជំនួយ') return OWNER_HELP;
  return null;
}
