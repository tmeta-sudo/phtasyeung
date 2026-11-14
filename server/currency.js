// Switch a landlord between USD and riel. Everything they have entered (rents, prices, deposits,
// invoices, payments, expenses) is converted once at their exchange rate, so the account always
// has exactly one currency and no screen ever mixes the two.
import { db, save, logEvent } from './db.js';
import { roundMoney } from '../shared/khmer.js';

export function convertCurrency(to) {
  const s = db();
  const st = s.settings;
  const from = st.currency === 'KHR' ? 'KHR' : 'USD';
  if (from === to) return false;
  const rate = Number(st.exchangeRate) || 4100;
  const k = to === 'KHR' ? rate : 1 / rate;
  const m = (v) => roundMoney((Number(v) || 0) * k, to);
  // Per-unit prices keep more precision (riel to the nearest 10 ៛, dollars to 4 decimals).
  const unit = (v) => (to === 'KHR' ? Math.round(((Number(v) || 0) * k) / 10) * 10 : Math.round((Number(v) || 0) * k * 10000) / 10000);

  for (const r of s.rooms) {
    r.rent = m(r.rent);
    for (const e of r.extras || []) e.amount = m(e.amount);
  }
  st.waterRate = unit(st.waterRate);
  st.electricRate = unit(st.electricRate);
  for (const kind of ['water', 'electric']) for (const b of st.tiers?.[kind] || []) b.rate = unit(b.rate);
  for (const a of st.addons || []) a.price = m(a.price);
  if (st.lateFee) st.lateFee.amount = m(st.lateFee.amount);
  for (const t of s.tenants) {
    if (t.deposit?.held) t.deposit.held = m(t.deposit.held);
    if (t.contract?.deposit) t.contract.deposit = m(t.contract.deposit);
    if (t.moveOut) {
      for (const key of ['deposit', 'deductionsTotal', 'unpaid', 'applied', 'refund', 'owes']) t.moveOut[key] = m(t.moveOut[key]);
      for (const d of t.moveOut.deductions || []) d.amount = m(d.amount);
    }
    if (t.share?.amount) t.share.amount = m(t.share.amount);
  }
  for (const e of s.expenses || []) e.amount = m(e.amount);
  for (const inv of s.invoices) {
    for (const it of inv.items || []) {
      it.amount = m(it.amount);
      if (it.rate !== undefined) it.rate = ['water', 'electric'].includes(it.key) ? unit(it.rate) : m(it.rate);
    }
    inv.total = roundMoney(inv.items.reduce((a, it) => a + it.amount, 0), to);
    for (const p of inv.payments || []) p.amount = m(p.amount);
    // Rounding must never turn a settled invoice into one that looks short by a few riel.
    if (inv.status === 'paid' && inv.payments?.length && inv.paidVia !== 'carried') {
      const sum = inv.payments.reduce((a, p) => a + p.amount, 0);
      inv.payments.at(-1).amount = roundMoney(inv.payments.at(-1).amount + (inv.total - sum), to);
    }
    inv.currency = to;
    inv.rate = rate;
    inv.totalKhr = to === 'KHR' ? inv.total : roundMoney(inv.total * rate, 'KHR');
    inv.totalAlt = to === 'KHR' ? Math.round((inv.total / rate) * 100) / 100 : inv.totalKhr;
    // The old QR asked for the old currency.
    delete inv.khqrStr; delete inv.khqrSig; delete inv.khqrExp; delete inv.khqrMd5; delete inv.khqrAmount; delete inv.khqrCurrency;
  }
  st.currency = to;
  logEvent('admin', to === 'KHR' ? `បានប្តូររូបិយប័ណ្ណទៅរៀល (អត្រា ${rate} ៛/$)` : `បានប្តូររូបិយប័ណ្ណទៅដុល្លារ (អត្រា ${rate} ៛/$)`);
  save();
  return true;
}
