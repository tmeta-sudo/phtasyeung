import crypto from 'node:crypto';
import { db, save, uid, now, logEvent } from './db.js';
import { khqrFor } from './khqr.js';
import { nowInCambodia, toRiel, monthKm, usd, khr, dateKm, usdInWords, kmDigits } from '../shared/khmer.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const tenantOfRoom = (roomId) => db().tenants.find((t) => t.roomId === roomId && t.status === 'active');
export const roomOf = (tenant) => db().rooms.find((r) => r.id === tenant?.roomId);

function addDays(ymd, days) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Cost of `qty` units with EDC-style price bands: [{ upTo: 50, rate: 0.15 }, { upTo: null, rate: 0.2 }].
 * No bands -> flat `rate`. Returns { amount, parts } where parts explain the bill.
 */
export function tieredCost(qty, tiers, rate) {
  const q = Math.max(0, +qty || 0);
  const bands = (tiers || []).filter((t) => +t.rate >= 0).sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  if (!bands.length) return { amount: round2(q * (+rate || 0)), parts: [] };
  let left = q; let from = 0; let amount = 0; const parts = [];
  for (const b of bands) {
    if (left <= 0) break;
    const cap = b.upTo == null || b.upTo === '' ? Infinity : +b.upTo;
    const take = Math.min(left, cap - from);
    if (take > 0) { amount += take * +b.rate; parts.push({ qty: round2(take), rate: +b.rate }); left -= take; }
    from = cap;
  }
  if (left > 0) { const last = bands.at(-1); amount += left * +last.rate; parts.push({ qty: round2(left), rate: +last.rate }); }
  return { amount: round2(amount), parts };
}

const tierNote = (parts) => (parts.length > 1 ? parts.map((p) => `${p.qty}x$${p.rate}`).join(' + ') : '');

/** Money received so far on an invoice (all recorded payments). */
export const paidSoFar = (inv) => {
  // Invoices paid before payments were recorded one by one count as fully paid.
  if (inv.status === 'paid' && !(inv.payments || []).length && inv.paidVia !== 'carried') return round2(inv.total);
  return round2((inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0));
};
/** What the tenant still owes on it. */
export const balanceOf = (inv) => (inv.status === 'paid' ? 0 : Math.max(0, round2(inv.total - paidSoFar(inv))));

/**
 * Record money received. Returns { full } — true when this payment settles the invoice
 * (the caller then sends the receipt via confirmPayment).
 */
export function addPayment(inv, { amount, via = 'cash', note = '', at = now() }) {
  const a = round2(amount);
  if (!(a > 0)) throw Object.assign(new Error('ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ'), { status: 400 });
  const due = balanceOf(inv);
  if (a - due > 0.005) throw Object.assign(new Error(`លើសចំនួនដែលនៅជំពាក់ (${usd(due)})`), { status: 400 });
  inv.payments = [...(inv.payments || []), { id: uid(), amount: a, via, note: String(note || '').slice(0, 200), at }];
  if (inv.status === 'claimed') inv.status = 'unpaid';
  save();
  return { full: balanceOf(inv) <= 0.005 };
}

export function recalc(inv) {
  inv.items = inv.items.map((it) => ({ ...it, amount: round2(it.amount) }));
  inv.total = round2(inv.items.reduce((s, it) => s + it.amount, 0));
  inv.totalKhr = toRiel(inv.total, inv.rate);
  return inv;
}

/** Create the invoices for `month` for every occupied room that doesn't have one yet. */
export function generateInvoices(month, actor = 'admin') {
  const s = db();
  const { settings } = s;
  const today = nowInCambodia().ymd;
  const created = [];
  for (const room of s.rooms) {
    const tenant = tenantOfRoom(room.id);
    if (!tenant) continue;
    if (s.invoices.some((i) => i.roomId === room.id && i.month === month)) continue;
    const meter = s.meters.find((m) => m.roomId === room.id && m.month === month);
    const items = [{ key: 'rent', label: 'ថ្លៃជួលបន្ទប់', qty: 1, unit: 'ខែ', rate: +room.rent || 0, amount: +room.rent || 0 }];
    const tiers = settings.tiers || {};
    const sharedOf = (kind) => (settings.sharedMeters || []).find((g) => g.kind === kind && (g.rooms || []).includes(room.id));
    for (const [kind, label, unit, rateKey, oldKey] of [['water', 'ថ្លៃទឹក', 'm³', 'waterRate', 'oldWater'], ['electric', 'ថ្លៃភ្លើង', 'kWh', 'electricRate', 'oldElectric']]) {
      const g = sharedOf(kind);
      if (g) {
        // One meter for several rooms: price the whole usage, then split it equally between the rented rooms.
        const read = (s.sharedReadings || []).find((x) => x.groupId === g.id && x.month === month);
        if (!read) continue;
        const rented = g.rooms.filter((id) => tenantOfRoom(id));
        const parts = Math.max(1, rented.length);
        const used = Math.max(0, read.value - read.old);
        const c = tieredCost(used, tiers[kind], settings[rateKey]);
        const note = tierNote(c.parts);
        items.push({ key: kind, label: `${label} (កុងទ័ររួម ${g.name} ÷ ${kmDigits(parts)})`, qty: round2(used / parts), unit, rate: note ? undefined : +settings[rateKey], amount: round2(c.amount / parts), from: read.old, to: read.value, shared: g.id, note });
        continue;
      }
      if (!meter) continue;
      const used = Math.max(0, meter[kind] - meter[oldKey]);
      const c = tieredCost(used, tiers[kind], settings[rateKey]);
      const note = tierNote(c.parts);
      items.push({ key: kind, label, qty: used, unit, rate: note ? undefined : +settings[rateKey], amount: c.amount, from: meter[oldKey], to: meter[kind], note });
    }
    for (const extra of room.extras || []) {
      if (extra.label && +extra.amount) items.push({ key: 'extra', label: extra.label, qty: 1, unit: 'ខែ', rate: +extra.amount, amount: +extra.amount });
    }
    // Unpaid balance of earlier months moves onto this invoice (one bill, one QR).
    const carried = settings.carryOver ? s.invoices.filter((i) => i.tenantId === tenant.id && i.month < month && i.status !== 'paid' && balanceOf(i) > 0) : [];
    for (const prev of carried) {
      const b = balanceOf(prev);
      items.push({ key: 'arrears', label: `នៅជំពាក់ ${monthKm(prev.month)}`, qty: 1, unit: '', rate: b, amount: b, ref: prev.id });
    }
    s.counters.invoice += 1;
    const inv = recalc({
      id: uid(),
      number: `INV-${month.replace('-', '')}-${String(s.counters.invoice).padStart(4, '0')}`,
      month,
      roomId: room.id,
      tenantId: tenant.id,
      name: tenant.nameKm || tenant.nameEn,
      items,
      rate: +settings.exchangeRate || 4100,
      issuedAt: today,
      dueDate: addDays(today, +settings.dueDays || 7),
      status: 'unpaid',
      hasMeter: !!meter,
      claims: [],
      reminders: [],
      createdAt: now(),
      createdBy: actor,
    });
    s.invoices.push(inv);
    for (const prev of carried) Object.assign(prev, { status: 'paid', paidVia: 'carried', paidAt: now(), carriedTo: inv.id });
    created.push(inv);
  }
  if (created.length) {
    logEvent(actor === 'auto' ? 'auto' : 'admin', `បានបង្កើតវិក្កយបត្រ ${kmDigits(created.length)} សម្រាប់${monthKm(month)}`);
  }
  save();
  return created;
}

/**
 * The invoice's KHQR. Generated once and kept (with its MD5) so a Bakong payment can be
 * matched back to this invoice; regenerated only if the amount or receiving account changes.
 */
export function khqrOf(inv) {
  if (!inv || inv.status === 'paid') return '';
  const k = db().settings.khqr || {};
  const amount = balanceOf(inv);
  if (amount <= 0) return '';
  const sig = `${k.accountId}|${k.type}|${k.merchantId}|${amount}`;
  if (inv.khqrStr && inv.khqrSig === sig && (!inv.khqrExp || inv.khqrExp > Date.now() + 86400000)) return inv.khqrStr;
  const exp = Math.max(new Date(inv.dueDate + 'T23:59:59+07:00').getTime() + 30 * 86400000, Date.now() + 30 * 86400000);
  const qr = khqrFor(db().settings, { amount, bill: inv.number, expiresAt: exp });
  if (!qr) return '';
  Object.assign(inv, { khqrStr: qr, khqrSig: sig, khqrExp: exp, khqrAmount: amount, khqrMd5: crypto.createHash('md5').update(qr).digest('hex') });
  save();
  return qr;
}

export function isOverdue(inv, today = nowInCambodia().ymd) {
  return inv.status !== 'paid' && inv.dueDate < today;
}

export function markPaid(inv, via = 'admin') {
  // Record whatever is still owed as the final payment, so totals collected stay exact.
  const rest = round2(inv.total - paidSoFar(inv));
  if (rest > 0.005 && via !== 'carried') inv.payments = [...(inv.payments || []), { id: uid(), amount: rest, via, note: '', at: now() }];
  inv.status = 'paid';
  inv.paidAt = now();
  inv.paidVia = via;
  // A paid move-in invoice means the deposit is now held for this tenant.
  if (inv.kind === 'movein') {
    const dep = round2(inv.items.filter((it) => it.key === 'deposit').reduce((s, it) => s + it.amount, 0));
    const t = db().tenants.find((x) => x.id === inv.tenantId);
    if (t && dep > 0) {
      t.deposit = { held: dep, receivedAt: now().slice(0, 10), note: inv.number, source: 'movein' };
      t.contract = { ...(t.contract || {}), deposit: t.contract?.deposit || dep };
    }
  }
  save();
}

/**
 * Move-out settlement: deposit − deductions − unpaid balances (paid from the deposit, oldest first).
 * Returns the settlement; a negative refund means the tenant still owes that much.
 */
export function moveOut(t, { date, deductions = [], useDeposit = true }) {
  const s = db();
  const deposit = round2(t.deposit?.held || 0);
  const ded = deductions.map((d) => ({ label: String(d.label || '').trim().slice(0, 80), amount: round2(Math.abs(+d.amount || 0)) })).filter((d) => d.label && d.amount > 0).slice(0, 20);
  const dedTotal = round2(ded.reduce((a, d) => a + d.amount, 0));
  const open = s.invoices.filter((i) => i.tenantId === t.id && i.status !== 'paid' && balanceOf(i) > 0).sort((a, b) => a.month.localeCompare(b.month));
  const unpaid = round2(open.reduce((a, i) => a + balanceOf(i), 0));
  let available = useDeposit ? Math.max(0, round2(deposit - dedTotal)) : 0;
  let applied = 0;
  const settled = [];
  for (const inv of open) {
    if (available <= 0) break;
    const take = Math.min(available, balanceOf(inv));
    addPayment(inv, { amount: take, via: 'deposit', note: 'កាត់ពីប្រាក់កក់ពេលចាកចេញ', at: `${date}T12:00:00+07:00` });
    if (balanceOf(inv) <= 0.005) markPaid(inv, 'deposit');
    available = round2(available - take); applied = round2(applied + take); settled.push(inv.number);
  }
  const left = useDeposit ? round2(deposit - dedTotal - applied) : deposit;
  const stillUnpaid = round2(unpaid - applied);
  // Refund what is left of the deposit; anything not covered (extra deductions + unpaid bills) is still owed.
  const refund = Math.max(0, left);
  const owes = round2(Math.max(0, -left) + stillUnpaid);
  const result = { date, deposit, deductions: ded, deductionsTotal: dedTotal, unpaid, applied, settled, refund, owes, useDeposit, at: now() };
  t.moveOut = result;
  t.status = 'former';
  t.contract = { ...(t.contract || {}), end: date };
  t.deposit = { ...(t.deposit || {}), held: 0, settledAt: date };
  t.updatedAt = now();
  logEvent('admin', `${t.nameKm || t.nameEn} បានចាកចេញពីបន្ទប់ ${t.roomId} · សងប្រាក់កក់ ${usd(Math.max(0, refund))}`, { tenantId: t.id });
  save();
  return result;
}

/** Plain-text (Telegram HTML) invoice summary in Khmer. Kept under the 1024-char caption limit. */
export function invoiceTelegramHtml(inv, { reminder = false, hasQr = false } = {}) {
  const { settings } = db();
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [];
  lines.push(reminder ? '⏰ <b>រំលឹកការបង់ប្រាក់</b>' : '🧾 <b>វិក្កយបត្រប្រចាំខែ</b>');
  lines.push(`<b>${esc(settings.propertyName)}</b> · ${esc(monthKm(inv.month))}`);
  lines.push('');
  lines.push(`🏠 បន្ទប់: <b>${esc(inv.roomId)}</b>`);
  lines.push(`👤 អតិថិជន: ${esc(inv.name)}`);
  lines.push(`🔖 លេខ: <code>${esc(inv.number)}</code>`);
  lines.push('');
  for (const it of inv.items) {
    const detail = it.key === 'water' || it.key === 'electric'
      ? ` (${kmDigits(it.from)}→${kmDigits(it.to)} = ${kmDigits(it.qty)} ${it.unit}${it.note ? `; ${it.note}` : ''})`
      : '';
    lines.push(`• ${esc(it.label)}${detail}: <b>${usd(it.amount)}</b>`);
  }
  lines.push('');
  lines.push(`💰 <b>សរុប: ${usd(inv.total)}</b>  (${khr(inv.totalKhr)})`);
  lines.push(`<i>${esc(usdInWords(inv.total))}</i>`);
  if (paidSoFar(inv) > 0 && inv.status !== 'paid') lines.push(`✅ បានបង់: ${usd(paidSoFar(inv))} · <b>នៅសល់: ${usd(balanceOf(inv))}</b>`);
  lines.push(`📅 ថ្ងៃផុតកំណត់: ${esc(dateKm(inv.dueDate))}`);
  if (inv.status === 'claimed') lines.push('⏳ កំពុងរង់ចាំការបញ្ជាក់ពីម្ចាស់ផ្ទះ');
  if (inv.status === 'paid') lines.push('✅ <b>បានបង់រួចរាល់</b> — សូមអរគុណ!');
  else {
    lines.push('');
    if (hasQr) lines.push('ស្កេន KHQR ខាងលើដើម្បីបង់តាមកម្មវិធីធនាគារណាមួយ (ABA, ACLEDA, Wing, Bakong…)។');
    lines.push('បង់រួច សូមចុច «ខ្ញុំបានបង់ប្រាក់» ឬផ្ញើរូបបង្កាន់ដៃមកទីនេះ។');
  }
  return lines.join('\n');
}

/**
 * Add the landlord's late fee (once) to unpaid invoices overdue by `afterDays` or more.
 * The KHQR follows automatically because it is keyed on the total. Returns the changed invoices.
 */
export function applyLateFees(today = nowInCambodia().ymd) {
  const s = db();
  const lf = s.settings.lateFee || {};
  const amount = Math.round((+lf.amount || 0) * 100) / 100;
  if (!lf.enabled || amount <= 0) return [];
  const after = Math.max(0, Math.round(+lf.afterDays || 0));
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - after);
  const cutoff = limit.toISOString().slice(0, 10);
  const changed = [];
  for (const inv of s.invoices) {
    if (inv.status !== 'unpaid' || !inv.dueDate || inv.dueDate >= cutoff || inv.items.some((it) => it.key === 'late')) continue;
    inv.items.push({ key: 'late', label: 'ថ្លៃបង់យឺត', qty: 1, unit: 'ដង', rate: amount, amount });
    recalc(inv);
    inv.lateFeeAt = now();
    changed.push(inv);
  }
  if (changed.length) { save(); logEvent('auto', `បានបន្ថែមថ្លៃបង់យឺតលើ ${kmDigits(changed.length)} វិក្កយបត្រ`); }
  return changed;
}

/** Undo carry-over when the invoice that took the old balances is deleted. */
export function reopenCarried(inv) {
  for (const it of inv.items || []) {
    if (it.key !== 'arrears' || !it.ref) continue;
    const prev = db().invoices.find((i) => i.id === it.ref);
    if (prev && prev.paidVia === 'carried') Object.assign(prev, { status: 'unpaid', paidVia: null, paidAt: null, carriedTo: null });
  }
}

/** Copy expenses marked "every month" into the current month (once). Returns how many were added. */
export function repeatMonthlyExpenses(ym = nowInCambodia().ym) {
  const s = db();
  const list = s.expenses || [];
  const templates = new Map();
  for (const e of list) if (e.repeat && e.date.slice(0, 7) < ym) {
    const key = e.seriesId || e.id;
    const prev = templates.get(key);
    if (!prev || prev.date < e.date) templates.set(key, e);
  }
  let added = 0;
  for (const [key, e] of templates) {
    if (list.some((x) => (x.seriesId || x.id) === key && x.date.slice(0, 7) === ym)) continue;
    const day = e.repeatDay || e.date.slice(8, 10); // keep the original day (31st stays 31st after February)
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    list.push({ ...e, id: uid(), seriesId: key, repeatDay: day, date: `${ym}-${String(Math.min(+day, last)).padStart(2, '0')}`, createdAt: now(), auto: true });
    added += 1;
  }
  if (added) { s.expenses = list; save(); logEvent('auto', `បានបន្ថែមចំណាយប្រចាំខែ ${kmDigits(added)}`); }
  return added;
}
