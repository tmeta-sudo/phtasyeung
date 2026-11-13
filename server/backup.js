// One-click backups for landlords.
//  • Download: built in the browser (see src/settings/BackupCard.jsx) from /api/account/export + files,
//    so it isn't limited by serverless response sizes; optional password encryption (WebCrypto).
//  • Telegram: a ZIP built here and sent to the owner's own Telegram chat — no setup needed.
//  • Restore: the browser posts the data, then re-uploads documents one by one.
import { zipSync, strToU8 } from 'fflate';
import { db, save, uid, now, logEvent, orgId } from './db.js';
import { q } from './store.js';
import { getBlob, deleteBlob } from './blob.js';
import { api as tgApi } from './telegram.js';
import { nowInCambodia, kmDigits } from '../shared/khmer.js';

const PLATFORM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const BACKUP_VERSION = 1;

/** The landlord's data without secrets (bot token, Drive token) — safe to keep anywhere. */
export function exportData(doc = db()) {
  const { settings, ...rest } = doc;
  const { token, ...telegram } = settings.telegram || {};
  const { storage, ...safe } = settings;
  return {
    app: 'phteah-yeung',
    backupVersion: BACKUP_VERSION,
    exportedAt: now(),
    ...rest,
    settings: { ...safe, telegram: { ...telegram, adminLinkCode: undefined } },
  };
}

export function backupSummary(data) {
  return {
    property: data.settings?.propertyName || '',
    exportedAt: data.exportedAt,
    rooms: data.rooms?.length || 0,
    tenants: data.tenants?.length || 0,
    invoices: data.invoices?.length || 0,
    files: (data.tenants || []).reduce((n, t) => n + Object.keys(t.files || {}).length, 0),
  };
}

/** ZIP with data.json (+ documents). Used for the Telegram backup. */
export async function buildZip({ includeFiles }) {
  const data = exportData();
  const entries = { 'data.json': strToU8(JSON.stringify(data, null, 1)) };
  let skipped = 0;
  if (includeFiles) {
    for (const t of data.tenants || []) {
      for (const [slot, meta] of Object.entries(t.files || {})) {
        const f = await getBlob(orgId(), db().settings, meta.id).catch(() => null);
        if (f) entries[`files/${t.id}/${slot}.${meta.ext}`] = new Uint8Array(f.data);
        else skipped += 1;
      }
    }
  }
  entries['README.txt'] = strToU8(`ផ្ទះយើង — ការបម្រុងទុក\n${data.settings.propertyName}\n${data.exportedAt}\n\nដើម្បីស្តារ៖ ការកំណត់ → ការបម្រុងទុក → ស្តារពីឯកសារ\n`);
  return { zip: Buffer.from(zipSync(entries, { level: 6 })), summary: backupSummary(data), skipped };
}

/** Send a backup ZIP to every linked owner chat. */
export async function sendBackupToTelegram({ includeFiles = false } = {}) {
  const s = db();
  const chats = s.settings.telegram.adminChats || [];
  const token = s.settings.telegram.token || PLATFORM_TOKEN;
  if (!chats.length || !token) return { ok: false, error: 'សូមភ្ជាប់ Telegram ម្ចាស់ផ្ទះជាមុនសិន (ទំព័រ Telegram)' };
  const { zip, summary } = await buildZip({ includeFiles });
  if (zip.length > 45 * 1024 * 1024) return { ok: false, error: 'ការបម្រុងទុកធំពេកសម្រាប់ Telegram (៤៥MB) — សូមទាញយកទៅឧបករណ៍វិញ' };
  const date = nowInCambodia().ymd;
  const caption = `🗄 <b>ការបម្រុងទុក ${s.settings.propertyName}</b>\n${date} · បន្ទប់ ${kmDigits(summary.rooms)} · អតិថិជន ${kmDigits(summary.tenants)} · វិក្កយបត្រ ${kmDigits(summary.invoices)}${includeFiles ? ` · ឯកសារ ${kmDigits(summary.files)}` : ''}\n\nរក្សាទុកសារនេះ។ ស្តារ៖ ការកំណត់ → ការបម្រុងទុក → ស្តារពីឯកសារ។`;
  let sent = 0;
  for (const c of chats) {
    const form = new FormData();
    form.set('chat_id', String(c.chatId));
    form.set('caption', caption);
    form.set('parse_mode', 'HTML');
    form.set('document', new Blob([zip], { type: 'application/zip' }), `phteah-yeung-backup-${date}.zip`);
    await tgApi(token, 'sendDocument', form).then(() => { sent += 1; }).catch((e) => console.error('[backup] telegram', e.message));
  }
  s.settings.backup = { ...(s.settings.backup || {}), lastTelegramAt: now(), lastAt: now() };
  save();
  if (sent) logEvent('auto', `បានផ្ញើការបម្រុងទុកទៅ Telegram (${(zip.length / 1024).toFixed(0)} KB)`);
  return sent ? { ok: true, bytes: zip.length, sent, summary } : { ok: false, error: 'មិនអាចផ្ញើទៅ Telegram បានទេ' };
}

// ---------- restore ----------

const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/**
 * Replace this landlord's data with a backup. Telegram/Drive connections of the current
 * account are kept. Documents are re-uploaded afterwards by the browser.
 */
export async function restoreData(data) {
  if (!data || data.app !== 'phteah-yeung' || !Array.isArray(data.rooms) || !Array.isArray(data.tenants)) {
    throw Object.assign(new Error('ឯកសារនេះមិនមែនជាការបម្រុងទុករបស់ផ្ទះយើងទេ'), { status: 400 });
  }
  const s = db();
  const keep = { telegram: s.settings.telegram, storage: s.settings.storage, backup: s.settings.backup };
  // Portal/Telegram link codes must stay unique across all landlords.
  const tenants = arr(data.tenants, 5000).map((t) => ({ ...t, files: {}, restoredFiles: t.files || {} }));
  for (const t of tenants) {
    const { rows } = await q("SELECT 1 FROM lookups WHERE kind IN ('portal','link') AND key IN ($1, $2) AND org_id <> $3 LIMIT 1", [t.portalToken || '', t.linkCode || '', orgId()]);
    if (rows.length || !t.portalToken) { t.portalToken = uid(18); t.linkCode = uid(6); }
  }
  Object.assign(s, {
    rooms: arr(data.rooms, 5000), tenants, meters: arr(data.meters, 50000), invoices: arr(data.invoices, 50000),
    activities: arr(data.activities, 5000), tickets: arr(data.tickets, 2000), events: arr(data.events, 300),
    counters: { invoice: 0, ticket: 0, ...(data.counters || {}) },
    settings: { ...s.settings, ...(data.settings || {}), ...keep },
  });
  logEvent('admin', `បានស្តារទិន្នន័យពីការបម្រុងទុក (${data.exportedAt?.slice(0, 10) || ''})`);
  save();
  // Which documents the browser should upload next.
  return tenants.flatMap((t) => Object.entries(t.restoredFiles).map(([slot, meta]) => ({ tenantId: t.id, slot, ext: meta.ext })));
}

/** After documents are re-uploaded: drop files that no customer references any more. */
export async function cleanupOrphanFiles() {
  const s = db();
  const used = new Set(s.tenants.flatMap((t) => Object.values(t.files || {}).map((m) => m.id)));
  for (const t of s.tenants) delete t.restoredFiles;
  save();
  const { rows } = await q('SELECT id FROM files WHERE org_id = $1', [orgId()]);
  let removed = 0;
  for (const r of rows) if (!used.has(r.id)) { await deleteBlob(orgId(), s.settings, r.id); removed += 1; }
  return { removed };
}
