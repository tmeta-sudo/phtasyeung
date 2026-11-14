// Read a bank transfer screenshot (ABA, ACLEDA, Wing, Bakong, …): find the amount, the currency and
// the transaction number in the OCR text, then compare with what the invoice still needs.
// Pure functions — unit-tested in Node.
import { asciiDigits } from '../../shared/khmer.js';

const num = (s) => parseFloat(String(s).replace(/,/g, ''));
const BANKS = [['ABA', /\bABA\b|advanced bank of asia/i], ['ACLEDA', /acleda|អេស៊ីលីដា/i], ['Wing', /\bwing\b|វីង/i], ['Bakong', /bakong|បាគង/i], ['Canadia', /canadia/i], ['Sathapana', /sathapana/i], ['Prince', /prince bank/i], ['TrueMoney', /true ?money/i], ['Chip Mong', /chip ?mong/i], ['Vattanac', /vattanac/i]];

/**
 * @param lines OCR lines [{ text }] or strings
 * @returns { amounts: [{ value, currency }], ref, bank, date }
 */
export function parseSlip(lines) {
  const texts = lines.map((l) => asciiDigits(String(typeof l === 'string' ? l : l?.text ?? ''))).filter(Boolean);
  const all = texts.join('\n');
  const amounts = [];
  const add = (value, currency) => {
    if (!Number.isFinite(value) || value <= 0 || value > 1e9) return;
    if (!amounts.some((a) => a.value === value && a.currency === currency)) amounts.push({ value, currency });
  };
  const N = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  for (const t of texts) {
    for (const m of t.matchAll(new RegExp(`(?:USD|US\\$|\\$)\\s*-?\\s*${N}`, 'gi'))) add(num(m[1]), 'USD');
    for (const m of t.matchAll(new RegExp(`${N}\\s*(?:USD|US\\$|\\$|ដុល្លារ)`, 'gi'))) add(num(m[1]), 'USD');
    for (const m of t.matchAll(new RegExp(`(?:KHR|៛|រៀល)\\s*-?\\s*${N}`, 'gi'))) add(num(m[1]), 'KHR');
    for (const m of t.matchAll(new RegExp(`${N}\\s*(?:KHR|៛|រៀល)`, 'gi'))) add(num(m[1]), 'KHR');
  }
  // Transaction / reference number: a labelled code, else the longest digit run that is not an amount.
  let ref = '';
  const labelled = all.match(/(?:trx\.?\s*id|transaction\s*(?:id|no\.?|number)|reference\s*(?:id|no\.?|number|#)?|ref\.?\s*(?:id|no\.?|#)?|hash|លេខប្រតិបត្តិការ|លេខយោង)\s*[:#]?\s*([A-Za-z0-9]{6,24})/i);
  if (labelled) ref = labelled[1];
  if (!ref) {
    const runs = [...all.matchAll(/\b\d{8,20}\b/g)].map((m) => m[0]).filter((r) => !amounts.some((a) => String(Math.round(a.value)) === r));
    ref = runs.sort((a, b) => b.length - a.length)[0] || '';
  }
  const bank = (BANKS.find(([, re]) => re.test(all)) || [''])[0];
  const d = all.match(/\b(\d{1,2})[\/.\- ](\d{1,2}|[A-Za-z]{3,9})[\/.\- ,]+(20\d{2})\b/) || all.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return { amounts, ref, bank, date: d ? d[0] : '' };
}

/**
 * Compare a parsed slip with an invoice.
 * @returns { status: 'match' | 'partial' | 'mismatch' | 'unreadable', amount?, currency? }
 */
export function matchSlip(slip, { balance, currency = 'USD', rate = 4100 }) {
  if (!slip.amounts.length) return { status: 'unreadable' };
  const tol = currency === 'KHR' ? 100 : 0.01;
  // Same currency first; a tenant may also pay a dollar bill in riel (or the reverse) at the landlord's rate.
  const inCur = (a) => (a.currency === currency ? a.value : a.currency === 'USD' ? Math.round((a.value * rate) / 100) * 100 : Math.round((a.value / rate) * 100) / 100);
  const cands = slip.amounts.map((a) => ({ ...a, worth: inCur(a), same: a.currency === currency }));
  const exact = cands.find((a) => a.same && Math.abs(a.worth - balance) <= tol) || cands.find((a) => !a.same && Math.abs(a.worth - balance) <= (currency === 'KHR' ? 500 : 0.5));
  if (exact) return { status: 'match', amount: balance, paid: exact.value, currency: exact.currency };
  const part = cands.filter((a) => a.worth > 0 && a.worth < balance).sort((a, b) => b.worth - a.worth)[0];
  if (part) return { status: 'partial', amount: part.worth, paid: part.value, currency: part.currency };
  const over = cands.sort((a, b) => a.worth - b.worth)[0];
  return { status: 'mismatch', amount: over.worth, paid: over.value, currency: over.currency };
}
