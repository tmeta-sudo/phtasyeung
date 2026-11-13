// Auto invoices + reminders for every landlord. Triggered daily by Vercel Cron
// (/api/cron/daily) in production, or hourly by a timer when running locally.
// Each step is idempotent (lastRunMonth / lastReminderDay), so extra runs are harmless.
import { db, save, logEvent } from './db.js';
import { withOrg, listOrgIds } from './store.js';
import { googleUpload } from './blob.js';
import { sendBackupToTelegram } from './backup.js';
import { checkAllUnpaid } from './bakong.js';
import { orgId } from './db.js';
import { generateInvoices, isOverdue, applyLateFees, repeatMonthlyExpenses } from './invoices.js';
import { sendInvoices, notifyAdmins, botStatus } from './telegram.js';
import { nowInCambodia, monthKm, kmDigits, usd } from '../shared/khmer.js';

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
  const due = s.invoices.filter((i) => {
    if (i.status !== 'unpaid' || !i.sentAt) return false;
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
