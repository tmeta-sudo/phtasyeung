// Automatic payment confirmation with the NBC Bakong Open API.
// Each invoice keeps one KHQR and its MD5; Bakong tells us when that exact QR was paid.
// Token: BAKONG_TOKEN (platform) or the landlord's own developer token (Settings → KHQR).
import { db, save, now, logEvent, cur, fm as usd } from './db.js';
import { unseal } from './blob.js';
import { khqrOf } from './invoices.js';
import { confirmPayment, notifyAdmins } from './telegram.js';

const BASE = (process.env.BAKONG_API_BASE || 'https://api-bakong.nbc.gov.kh').replace(/\/+$/, '');

export function bakongToken(doc = db()) {
  const own = doc.settings.khqr?.bakongToken;
  if (own) { try { return unseal(own); } catch { /* re-enter */ } }
  return process.env.BAKONG_TOKEN || '';
}
export const bakongEnabled = (doc = db()) => !!bakongToken(doc);

async function lookup(token, md5) {
  const res = await fetch(`${BASE}/v1/check_transaction_by_md5`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ md5 }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Bakong token មិនត្រឹមត្រូវ ឬផុតកំណត់'), { code: 'TOKEN' });
  const j = await res.json().catch(() => ({}));
  return j.responseCode === 0 && j.data ? j.data : null;
}

/**
 * Ask Bakong whether this invoice's KHQR was paid. Marks it paid (and sends receipts) only
 * when the money reached the landlord's account and the amount matches.
 * Returns 'paid' | 'pending' | 'skip'.
 */
export async function checkInvoice(inv, { minIntervalMs = 15000 } = {}) {
  if (!inv || inv.status === 'paid') return inv?.status === 'paid' ? 'paid' : 'skip';
  const token = bakongToken();
  if (!token) return 'skip';
  khqrOf(inv); // makes sure the md5 exists
  if (!inv.khqrMd5) return 'skip';
  if (inv.bakongCheckedAt && Date.now() - new Date(inv.bakongCheckedAt).getTime() < minIntervalMs) return 'pending';
  inv.bakongCheckedAt = now();
  save();
  let tx;
  try { tx = await lookup(token, inv.khqrMd5); } catch (e) {
    db().settings.khqr.bakongError = e.message;
    save();
    return 'skip';
  }
  if (db().settings.khqr.bakongError) { db().settings.khqr.bakongError = ''; save(); }
  if (!tx) return 'pending';
  const k = db().settings.khqr || {};
  const toOk = !tx.toAccountId || String(tx.toAccountId).toLowerCase() === String(k.accountId).toLowerCase();
  const amountOk = Math.abs(Number(tx.amount) - Number(inv.khqrAmount ?? inv.total)) < (cur() === 'KHR' ? 1 : 0.011) && (!tx.currency || String(tx.currency).toUpperCase() === (inv.khqrCurrency || cur()));
  if (!toOk || !amountOk) {
    logEvent('alert', `Bakong: ការបង់ប្រាក់សម្រាប់ ${inv.number} មិនត្រូវគ្នា (${tx.amount} ${tx.currency} → ${tx.toAccountId})`, { invoiceId: inv.id });
    return 'pending';
  }
  inv.bakong = { hash: tx.hash || '', from: tx.fromAccountId || '', at: tx.acknowledgedDateMs ? new Date(+tx.acknowledgedDateMs).toISOString() : now() };
  if ((inv.payments || []).some((p) => p.ref === inv.bakong.hash && inv.bakong.hash)) return 'pending';
  await confirmPayment(inv, 'bakong');
  await notifyAdmins(`🤖 <b>បានទទួលប្រាក់ស្វ័យប្រវត្តិ (Bakong)</b>\n🚪 ${inv.roomId} · ${inv.name}\n🧾 ${inv.number} · <b>${usd(inv.total)}</b>${inv.bakong.from ? `\nពី: ${inv.bakong.from}` : ''}`).catch(() => {});
  return 'paid';
}

/** Check every unpaid invoice that has a KHQR (bounded per call). */
export async function checkAllUnpaid({ limit = 40, minIntervalMs = 60000 } = {}) {
  if (!bakongEnabled()) return { checked: 0, paid: 0 };
  const list = db().invoices.filter((i) => i.status !== 'paid' && i.khqrMd5)
    .sort((a, b) => String(a.bakongCheckedAt || '').localeCompare(String(b.bakongCheckedAt || ''))).slice(0, limit);
  let paid = 0;
  for (const inv of list) if (await checkInvoice(inv, { minIntervalMs }) === 'paid') paid += 1;
  return { checked: list.length, paid };
}
