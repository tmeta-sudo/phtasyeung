// Auto invoices + reminders for every landlord. Triggered daily by Vercel Cron
// (/api/cron/daily) in production, or hourly by a timer when running locally.
// Each step is idempotent (lastRunMonth / lastReminderDay), so extra runs are harmless.
import { db, save, logEvent } from './db.js';
import { withOrg, listOrgIds } from './store.js';
import { googleUpload } from './blob.js';
import { sendBackupToTelegram } from './backup.js';
import { checkAllUnpaid } from './bakong.js';
import { orgId } from './db.js';
import { generateInvoices, isOverdue, applyLateFees, repeatMonthlyExpenses, paidSoFar } from './invoices.js';
import { isHoliday, holidayOn, addDays } from './due.js';
import { sendInvoices, notifyAdmins, notifyTenant, botStatus } from './telegram.js';
import { nowInCambodia, monthKm, kmDigits, dateKm } from '../shared/khmer.js';
import { fm as usd } from './db.js';

/** Generate this month's invoices for the current org and send them. */
export async function runAutoInvoices({ force = false } = {}) {
  const s = db();
  const auto = s.settings.auto;
  const t = nowInCambodia();
  const created = generateInvoices(t.ym, 'auto');
  auto.lastRunMonth = t.ym;
  save();
  let sent = { ok: 0, failed: 0, errors: [] };
  if (auto.send && (await botStatus()).configured) {
    const pending = s.invoices.filter((i) => i.month === t.ym && !i.sentAt && i.status !== 'paid');
    sent = await sendInvoices(pending);
  }
  if (created.length || force) {
    const total = created.reduce((a, i) => a + i.total, 0);
    logEvent('auto', `ស្វ័យប្រវត្តិ: បង្កើត ${kmDigits(created.length)} · ផ្ញើតាម Telegram ${kmDigits(sent.ok)}`);
    await notifyAdmins(`🤖 <b>វិក្កយបត្រស្វ័យប្រវត្តិ ${monthKm(t.ym)}</b>\n🏠 ${s.settings.propertyName}\nបានបង្កើត: ${kmDigits(created.length)} (${usd(total)})\nបានផ្ញើ: ${kmDigits(sent.ok)}${sent.failed ? `\nមិនបានផ្ញើ: ${kmDigits(sent.failed)}` : ''}`);
  }
  return { created: created.length, ...sent };
}

export async function runReminders() {
  const s = db();
  const auto = s.settings.auto;
  const t = nowInCambodia();
  const every = Math.max(1, +auto.reminderDays || 3);
  // No reminders on Khmer public holidays (Pchum Ben, Khmer New Year…): try again the next day.
  if (s.settings.holidays?.pauseReminders !== false && isHoliday(t.ymd)) return { ok: 0, failed: 0, paused: true };
  const due = s.invoices.filter((i) => {
    if (i.status !== 'unpaid' || !i.sentAt) return false;
    // A tenant with a payday is reminded from payday on, not before (second half: from its own date).
    if (i.payday) {
      const next = i.dueDate2 && paidSoFar(i) >= i.total / 2 - 0.005 ? i.dueDate2 : i.dueDate;
      if (t.ymd < next) return false;
      if (!i.reminders.some((r) => r.slice(0, 10) >= next)) return true;
    }
    const last = i.reminders.at(-1) || i.sentAt;
    const days = (Date.now() - new Date(last).getTime()) / 86400000;
    return days >= every - 0.1 || (isOverdue(i, t.ymd) && i.reminders.length === 0);
  });
  auto.lastReminderDay = t.ymd;
  save();
  if (!due.length) return { ok: 0, failed: 0 };
  const r = await sendInvoices(due, { reminder: true });
  logEvent('auto', `បានផ្ញើការរំលឹក ${kmDigits(r.ok)} ទៅអតិថិជន`);
  return r;
}

/** Write a JSON backup of the landlord's data into their own Google Drive folder (overwrites one file). */
export async function backupToDrive() {
  const s = db();
  const g = s.settings.storage?.gdrive;
  if (!g?.refreshToken || !g.folderId) return null;
  const { settings, ...rest } = s;
  const { token, ...telegram } = settings.telegram;
  const { storage, ...safeSettings } = settings;
  const data = Buffer.from(JSON.stringify({ backupAt: new Date().toISOString(), ...rest, settings: { ...safeSettings, telegram } }, null, 1));
  const id = await googleUpload(orgId(), s.settings.storage.gdrive, { name: 'phteah-yeung-backup.json', mime: 'application/json', data, fileId: g.backupFileId || '' });
  s.settings.storage.gdrive = { ...g, backupFileId: id, lastBackupAt: new Date().toISOString() };
  save();
  return { ok: true, bytes: data.length, at: s.settings.storage.gdrive.lastBackupAt };
}

/** One landlord's daily duties. `respectHour` is used by the local hourly timer. */
async function dailyForOrg({ respectHour }) {
  const { auto, storage } = db().settings;
  const today = nowInCambodia().ymd;
  if (storage?.gdrive?.refreshToken && String(storage.gdrive.lastBackupAt || '').slice(0, 10) !== today) {
    await backupToDrive().catch((e) => console.error('[backup]', e.message));
  }
  // Weekly backup to the owner's own Telegram (on by default; nothing to set up).
  const bk = db().settings.backup || {};
  if (bk.telegramWeekly && db().settings.telegram.adminChats?.length && (db().tenants.length || db().rooms.length)
    && (!bk.lastTelegramAt || Date.now() - new Date(bk.lastTelegramAt).getTime() > 6.5 * 86400000)) {
    await sendBackupToTelegram({ includeFiles: !!bk.includeFiles }).catch((e) => console.error('[backup]', e.message));
  }
  await checkAllUnpaid({ limit: 60 }).catch((e) => console.error('[bakong]', e.message));
  applyLateFees();
  repeatMonthlyExpenses();
  await holidayGreeting().catch((e) => console.error('[greeting]', e.message));
  if (db().settings.auto.ownerNews !== false) {
    await contractAlerts().catch((e) => console.error('[contracts]', e.message));
    await monthlyDigest().catch((e) => console.error('[digest]', e.message));
  }
  if (!auto.enabled) return null;
  const t = nowInCambodia();
  if (respectHour && t.hour < +auto.hour) return null;
  const out = {};
  if (auto.lastRunMonth !== t.ym && t.day >= +auto.day) out.invoices = await runAutoInvoices();
  if (auto.send && +auto.reminderDays > 0 && auto.lastReminderDay !== t.ymd && (await botStatus()).configured) out.reminders = await runReminders();
  return out;
}

export async function runDailyAll({ respectHour = false, concurrency = 4 } = {}) {
  const ids = await listOrgIds();
  const results = { orgs: ids.length, ran: 0, errors: 0 };
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const r = await withOrg(id, () => dailyForOrg({ respectHour }));
        if (r) results.ran += 1;
      } catch (e) {
        results.errors += 1;
        console.error('[scheduler]', id, e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return results;
}

const GREETINGS = {
  'Khmer New Year': '🎉 <b>សួស្តីឆ្នាំថ្មី ប្រពៃណីខ្មែរ!</b>\nសូមជូនពរឲ្យលោកអ្នក និងក្រុមគ្រួសារ ជួបតែសេចក្តីសុខ សុភមង្គល និងសុខភាពល្អ។ 🙏',
  'Pchum Ben': '🙏 <b>រីករាយពិធីបុណ្យភ្ជុំបិណ្ឌ</b>\nសូមជូនពរឲ្យលោកអ្នក និងក្រុមគ្រួសារ ធ្វើដំណើរប្រកបដោយសុវត្ថិភាព និងជួបជុំគ្រួសារដោយក្តីសុខ។',
  'Water Festival': '🚣 <b>រីករាយព្រះរាជពិធីបុណ្យអុំទូក</b>\nសូមជូនពរឲ្យលោកអ្នកសប្បាយរីករាយ និងមានសុវត្ថិភាព។',
};
const greetingKey = (h) => (/ចូលឆ្នាំខ្មែរ/.test(h.nameKm) ? 'Khmer New Year' : /ភ្ជុំបិណ្ឌ/.test(h.nameKm) ? 'Pchum Ben' : /អុំទូក/.test(h.nameKm) ? 'Water Festival' : '');

/** On the first day of Khmer New Year, Pchum Ben and the Water Festival, greet tenants once (if turned on). */
export async function holidayGreeting(today = nowInCambodia().ymd) {
  const s = db();
  const h = s.settings.holidays || {};
  if (!h.greet) return 0;
  const hol = holidayOn(today);
  const key = hol && greetingKey(hol);
  if (!key) return 0;
  const prev = holidayOn(addDays(today, -1));
  if (prev && greetingKey(prev) === key) return 0; // only the first day
  if (h.lastGreet === `${key}:${today.slice(0, 4)}`) return 0;
  s.settings.holidays = { ...h, lastGreet: `${key}:${today.slice(0, 4)}` };
  save();
  let n = 0;
  for (const t of s.tenants.filter((x) => x.status === 'active' && x.telegram?.chatId)) {
    await notifyTenant(t, `${GREETINGS[key]}\n\n— ${s.settings.propertyName}`);
    n += 1;
  }
  if (n) logEvent('auto', `បានផ្ញើពរជ័យបុណ្យទៅអតិថិជន ${kmDigits(n)} នាក់`);
  return n;
}

const daysUntil = (from, to) => Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000);

/** Tell the landlord when a contract ends in 30 days and again at 7 days (once each). */
export async function contractAlerts(today = nowInCambodia().ymd) {
  const s = db();
  const due = [];
  for (const t of s.tenants.filter((x) => x.status === 'active' && x.contract?.end)) {
    const days = daysUntil(today, t.contract.end);
    if (days < 0 || days > 30) continue;
    const step = days <= 7 ? 7 : 30;
    const key = `${step}:${t.contract.end}`;
    if ((t.contractAlerts || []).includes(key)) continue;
    t.contractAlerts = [...(t.contractAlerts || []).filter((k) => k.endsWith(t.contract.end)), key, ...(step === 7 ? [`30:${t.contract.end}`] : [])];
    due.push({ t, days });
  }
  // ID cards that expire within 30 days (once per card): the landlord asks for the new one.
  const ids = [];
  for (const t of s.tenants.filter((x) => x.status === 'active' && x.idExpiry)) {
    const days = daysUntil(today, t.idExpiry);
    if (days < -1 || days > 30 || t.idAlert === t.idExpiry) continue;
    t.idAlert = t.idExpiry;
    ids.push({ t, days });
  }
  if (!due.length && !ids.length) return 0;
  save();
  const left = (days) => (days > 0 ? `នៅសល់ ${kmDigits(days)} ថ្ងៃ` : days === 0 ? 'ថ្ងៃនេះ' : 'ផុតហើយ');
  const parts = [];
  if (due.length) parts.push(`📄 <b>កិច្ចសន្យាជិតផុតកំណត់</b>\n${due.sort((a, b) => a.days - b.days).map(({ t, days }) => `• ${t.roomId || '—'} ${t.nameKm || t.nameEn} — ${left(days)} (${dateKm(t.contract.end)})`).join('\n')}\nសូមនិយាយជាមួយអតិថិជន ថាតើបន្តជួល ឬចាកចេញ។`);
  if (ids.length) parts.push(`🪪 <b>អត្តសញ្ញាណប័ណ្ណជិតផុតកំណត់</b>\n${ids.map(({ t, days }) => `• ${t.roomId || '—'} ${t.nameKm || t.nameEn} — ${left(days)} (${dateKm(t.idExpiry)})`).join('\n')}\nសូមស្នើរូបថតប័ណ្ណថ្មី ហើយស្កេនបញ្ចូលវិញ។`);
  await notifyAdmins(`🏠 ${s.settings.propertyName}\n\n${parts.join('\n\n')}`, {}, { url: '/customers', tag: 'contracts' });
  logEvent('auto', `រំលឹកកិច្ចសន្យា ${kmDigits(due.length)} · អត្តសញ្ញាណប័ណ្ណ ${kmDigits(ids.length)}`);
  return due.length + ids.length;
}

/** On the first days of a month: last month in one message (billed, collected, still owed, costs, empty rooms). */
export async function monthlyDigest(t = nowInCambodia()) {
  const s = db();
  const auto = s.settings.auto;
  if (auto.lastDigest === t.ym) return null;
  auto.lastDigest = t.ym;
  save();
  const [y, m] = t.ym.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const invs = s.invoices.filter((i) => i.month === prev);
  if (!invs.length || t.day > 7) return null; // nothing to report yet, or the moment has passed
  const billed = invs.reduce((a, i) => a + i.total, 0);
  const collected = invs.reduce((a, i) => a + paidSoFar(i), 0);
  const owing = invs.filter((i) => i.status !== 'paid');
  const costs = (s.expenses || []).filter((e) => String(e.date).startsWith(prev)).reduce((a, e) => a + (+e.amount || 0), 0);
  const living = new Set(s.tenants.filter((x) => x.status === 'active' && x.roomId).map((x) => x.roomId));
  const empty = s.rooms.filter((r) => !living.has(r.id));
  const pct = billed ? Math.round((collected / billed) * 100) : 0;
  const msg = [
    `📊 <b>សង្ខេបខែ ${monthKm(prev)}</b>`,
    `🏠 ${s.settings.propertyName}`,
    `🧾 វិក្កយបត្រ: ${kmDigits(invs.length)} · ${usd(billed)}`,
    `💰 ទទួលបាន: <b>${usd(collected)}</b> (${kmDigits(pct)}%)`,
    owing.length ? `⏳ នៅជំពាក់: ${kmDigits(owing.length)} បន្ទប់ · ${usd(billed - collected)}` : '✅ បង់គ្រប់គ្នា!',
    costs ? `🧰 ចំណាយ: ${usd(costs)} · ចំណេញ: <b>${usd(collected - costs)}</b>` : '',
    `🚪 បន្ទប់ទំនេរ: ${kmDigits(empty.length)}/${kmDigits(s.rooms.length)}${empty.length && empty.length <= 8 ? ` (${empty.map((r) => r.id).join(', ')})` : ''}`,
  ].filter(Boolean).join('\n');
  await notifyAdmins(msg, {}, { url: '/reports', tag: 'digest' });
  return { billed, collected, owing: owing.length, costs, empty: empty.length };
}
