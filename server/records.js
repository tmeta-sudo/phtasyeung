// Rental record: a summary a landlord issues for a tenant (how long they rented, how many
// bills were paid on time, the deposit at move-out) that the tenant can show a future
// landlord. It is a fixed snapshot behind an unguessable link, served by this platform so
// it cannot be edited by whoever holds it; the landlord can withdraw it at any time.
// It never contains ID numbers, phone numbers or addresses.
import { nowInCambodia } from '../shared/khmer.js';
import { db, save, uid, now, logEvent } from './db.js';
import { invoiceIsFor, balanceOf } from './invoices.js';

const cambodiaDay = (iso) => nowInCambodia(new Date(iso)).ymd;

/** The numbers for one tenant, from their invoices and move-out. Pure apart from reading db(). */
export function recordSnapshot(t, { note = '' } = {}) {
  const s = db();
  const st = s.settings;
  const invoices = s.invoices.filter((i) => invoiceIsFor(i, t) && i.status !== 'void').sort((a, b) => a.month.localeCompare(b.month));
  let onTime = 0; let late = 0; let unpaid = 0; let owed = 0;
  for (const i of invoices) {
    if (i.status === 'paid' && i.paidVia !== 'carried' && i.paidVia !== 'deposit' && i.paidAt) {
      const due = i.dueDate2 || i.dueDate;
      if (!due || cambodiaDay(i.paidAt) <= due) onTime += 1; else late += 1;
    } else if (i.status === 'paid') late += 1; // carried into a later bill, or taken from the deposit
    else { unpaid += 1; owed += balanceOf(i); }
  }
  const mo = t.moveOut || null;
  const L = st.location || {};
  return {
    tenant: t.nameEn || t.nameKm || '',
    tenantKm: t.nameKm || '',
    property: st.propertyName || '',
    propertyEn: st.propertyNameEn || '',
    area: String(L.addressText || '').split(',').slice(-2).join(',').trim(), // district / province only
    landlord: st.ownerName || '',
    from: t.contract?.start || (invoices[0] ? `${invoices[0].month}-01` : ''),
    to: mo?.date || null,
    current: t.status === 'active',
    bills: invoices.length,
    onTime,
    late,
    unpaid,
    owed: Math.round(owed * 100) / 100,
    currency: st.currency === 'KHR' ? 'KHR' : 'USD',
    deposit: mo ? {
      held: mo.deposit || 0,
      deductions: mo.deductionsTotal || 0,
      returned: Math.max(0, mo.refund || 0),
      full: (mo.deductionsTotal || 0) <= 0.005 && (mo.applied || 0) <= 0.005,
    } : null,
    note: String(note || '').trim().slice(0, 300),
  };
}

/** Issue (or re-issue) the tenant's record. The previous link stops working. */
export function issueRecord(t, opts = {}) {
  const s = db();
  s.records ||= [];
  for (const r of s.records) if (r.tenantId === t.id && !r.revokedAt) r.revokedAt = now();
  const rec = { token: uid(18), tenantId: t.id, issuedAt: now(), snapshot: recordSnapshot(t, opts) };
  s.records.push(rec);
  if (s.records.length > 1000) s.records.splice(0, s.records.length - 1000);
  t.record = { token: rec.token, issuedAt: rec.issuedAt };
  save();
  logEvent('admin', `🏅 បានចេញប្រវត្តិជួលសម្រាប់ ${t.nameKm || t.nameEn}`, { tenantId: t.id });
  return rec;
}

export function revokeRecord(t) {
  for (const r of db().records || []) if (r.tenantId === t.id && !r.revokedAt) r.revokedAt = now();
  t.record = null;
  save();
}

/** What the public link shows (null when withdrawn or unknown). */
export function publicRecord(token) {
  const r = (db().records || []).find((x) => x.token === token && !x.revokedAt);
  return r ? { issuedAt: r.issuedAt, ...r.snapshot } : null;
}
