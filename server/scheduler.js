// Auto invoice generator: on the configured day/hour (Phnom Penh time) create this
// month's invoices and push them to each customer's Telegram; then send reminders.
import { db, save, logEvent } from './db.js';
import { generateInvoices, isOverdue } from './invoices.js';
import { sendInvoices, notifyAdmins, botStatus } from './telegram.js';
import { nowInCambodia, monthKm, kmDigits, usd } from '../shared/khmer.js';

let running = false;

export async function runAutoInvoices({ force = false } = {}) {
  const s = db();
  const auto = s.settings.auto;
  const t = nowInCambodia();
  const created = generateInvoices(t.ym, 'auto');
  auto.lastRunMonth = t.ym;
  save();
  let sent = { ok: 0, failed: 0, errors: [] };
  if (auto.send && botStatus().running) {
    // Send newly created ones plus any of this month's that were never delivered.
    const pending = s.invoices.filter((i) => i.month === t.ym && !i.sentAt && i.status !== 'paid');
    sent = await sendInvoices(pending);
  }
  if (created.length || force) {
    const total = created.reduce((a, i) => a + i.total, 0);
    logEvent('auto', `ស្វ័យប្រវត្តិ: បង្កើត ${kmDigits(created.length)} · ផ្ញើតាម Telegram ${kmDigits(sent.ok)}`);
    await notifyAdmins(`🤖 <b>វិក្កយបត្រស្វ័យប្រវត្តិ ${monthKm(t.ym)}</b>\nបានបង្កើត: ${kmDigits(created.length)} (${usd(total)})\nបានផ្ញើ: ${kmDigits(sent.ok)}${sent.failed ? `\nមិនបានផ្ញើ: ${kmDigits(sent.failed)}` : ''}`);
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
    return days >= every || (isOverdue(i, t.ymd) && i.reminders.length === 0);
  });
  auto.lastReminderDay = t.ymd;
  save();
  if (!due.length) return { ok: 0, failed: 0 };
  const r = await sendInvoices(due, { reminder: true });
  logEvent('auto', `បានផ្ញើការរំលឹក ${kmDigits(r.ok)} ទៅអតិថិជន`);
  return r;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const { auto } = db().settings;
    if (!auto.enabled) return;
    const t = nowInCambodia();
    if (t.hour < +auto.hour) return;
    if (auto.lastRunMonth !== t.ym && t.day >= +auto.day) await runAutoInvoices();
    if (auto.send && +auto.reminderDays > 0 && auto.lastReminderDay !== t.ymd && botStatus().running) await runReminders();
  } catch (e) {
    console.error('[scheduler]', e);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  setTimeout(tick, 5000);
  setInterval(tick, 60 * 1000);
}
