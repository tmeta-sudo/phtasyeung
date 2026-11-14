// Khmer language toolkit shared by the server, the Telegram bot and the web UI.
// Built on open-source work by Khmer developers:
//   khmernumber, khmerword, split-khmer, is-khmer, pumi  — Seanghay Yath (github.com/seanghay)
//   khmer-chhankitek-calendar                              — Choch Kimhour
//   bakong-khqr (used in server/khqr.js)                   — Devit Huotkeo / NBC Bakong
//   khmer-normalizer (Unicode L2/22-290 Khmer encoding)    — Keyman / SIL
import { toKhmer, toASCII } from 'khmernumber';
import { integer as khmerInteger } from 'khmerword/index.js';
import { split as splitKhmer } from 'split-khmer';
import { containsKhmer, isKhmerWithWhitespace } from 'is-khmer';
import { khnormal } from 'khmer-normalizer';
import {
  GREGORIAN_MONTHS_KM,
  DAYS_OF_WEEK_KM,
  toKhmerLunarDate,
  getKhmerHolidays,
} from 'khmer-chhankitek-calendar';

export const TIMEZONE = 'Asia/Phnom_Penh';
export const MONTHS_KM = GREGORIAN_MONTHS_KM;
export const DAYS_KM = DAYS_OF_WEEK_KM;

/** Convert ASCII digits in any string/number to Khmer digits (០-៩).
 *  Only digits are mapped — punctuation such as "." and "," is kept as-is. */
export const kmDigits = (value) => String(value ?? '').replace(/[0-9]+/g, (d) => toKhmer(d));
/** Convert Khmer digits back to ASCII digits. */
export const asciiDigits = (value) => toASCII(String(value ?? ''));

/** Display a number/string, honouring the "Khmer numerals" preference. */
export const num = (value, khmer = true) => (khmer ? kmDigits(value) : String(value ?? ''));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function usd(amount, khmer = false) {
  const s = '$' + round2(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num(s, khmer);
}

/** Riel amounts are rounded to the nearest 100 ៛ (the smallest note in common use). */
export function toRiel(amountUsd, rate) {
  return Math.round(((Number(amountUsd) || 0) * (Number(rate) || 0)) / 100) * 100;
}

export function khr(riel, khmer = true) {
  return num(Math.round(Number(riel) || 0).toLocaleString('en-US'), khmer) + ' ៛';
}

/** "ដប់បួនដុល្លារ និងហាសិបសេន" — amount in Khmer words, as printed on Cambodian invoices. */
export function usdInWords(amount) {
  const cents = Math.round((Number(amount) || 0) * 100);
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  let words = khmerInteger(dollars) + 'ដុល្លារ';
  if (rest) words += ' និង' + khmerInteger(rest) + 'សេន';
  return words + 'គត់';
}

export function rielInWords(riel) {
  return khmerInteger(Math.round(Number(riel) || 0)) + 'រៀលគត់';
}

// ---------- one billing currency per landlord: USD or KHR ----------

export const CURRENCIES = ['USD', 'KHR'];
export const curSymbol = (c) => (c === 'KHR' ? '៛' : '$');
/** Money is kept to cents in USD and to the nearest 100 ៛ in riel. */
export const roundMoney = (amount, c = 'USD') => (c === 'KHR' ? Math.round((Number(amount) || 0) / 100) * 100 : round2(amount));
export const fmtMoney = (amount, c = 'USD', khmer = false) => (c === 'KHR' ? khr(roundMoney(amount, 'KHR'), khmer) : usd(amount, khmer));
export const moneyInWords = (amount, c = 'USD') => (c === 'KHR' ? rielInWords(amount) : usdInWords(amount));
/** The same amount in the other currency (for the "≈" line on invoices). */
export const altMoney = (amount, c, rate) => (c === 'KHR' ? round2((Number(amount) || 0) / (Number(rate) || 4100)) : toRiel(amount, rate));
export const fmtAlt = (amount, c, rate, khmer = false) => (c === 'KHR' ? usd(altMoney(amount, c, rate), khmer) : khr(altMoney(amount, c, rate), khmer));

// Browser only (one landlord per page): the app sets this once from settings so every screen formats alike.
let clientCurrency = 'USD';
export const setClientCurrency = (c) => { clientCurrency = c === 'KHR' ? 'KHR' : 'USD'; };
export const getClientCurrency = () => clientCurrency;
export const money = (amount, khmer = false) => fmtMoney(amount, clientCurrency, khmer);

/** Date parts as seen on a wall clock in Phnom Penh. */
export function nowInCambodia(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    ym: `${parts.year}-${parts.month}`,
  };
}

/** "2026-11" → "ខែវិច្ឆិកា ឆ្នាំ២០២៦" */
export function monthKm(ym, khmer = true) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `ខែ${MONTHS_KM[m - 1] || ''} ឆ្នាំ${num(y, khmer)}`;
}

/** "2026-11-13" → "ថ្ងៃទី១៣ ខែវិច្ឆិកា ឆ្នាំ២០២៦" */
export function dateKm(ymd, khmer = true) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `ថ្ងៃទី${num(d, khmer)} ${monthKm(`${y}-${String(m).padStart(2, '0')}`, khmer)}`;
}

/** Short form for tight UI: "១៣ វិច្ឆិកា" */
export function dateShortKm(ymd, khmer = true) {
  if (!ymd) return '—';
  const [, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return `${num(d, khmer)} ${MONTHS_KM[m - 1] || ''}`;
}

/** Chhankitek (Khmer lunar) date, e.g. "ថ្ងៃសុក្រ ៤កើត ខែកត្តិក ឆ្នាំមមី អដ្ឋស័ក ពុទ្ធសករាជ ២៥៧០" */
export function lunarKm(ymd) {
  try {
    return toKhmerLunarDate(String(ymd).slice(0, 10)).lunarDateText;
  } catch {
    return '';
  }
}

export function isSilDay(ymd) {
  try {
    return toKhmerLunarDate(String(ymd).slice(0, 10)).isSilDay;
  } catch {
    return false;
  }
}

/** Cambodian public & religious holidays between two ISO dates (inclusive). */
export function holidaysBetween(fromYmd, toYmd) {
  const years = new Set([+fromYmd.slice(0, 4), +toYmd.slice(0, 4)]);
  const out = [];
  for (const y of years) {
    try {
      for (const h of getKhmerHolidays(y)) if (h.date >= fromYmd && h.date <= toYmd) out.push(h);
    } catch { /* outside supported range */ }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function weekdayKm(ymd) {
  const d = new Date(String(ymd).slice(0, 10) + 'T00:00:00Z');
  return 'ថ្ងៃ' + DAYS_KM[d.getUTCDay()];
}

/** Time-appropriate Khmer greeting. */
export function greetingKm(hour) {
  if (hour < 11) return 'អរុណសួស្តី';
  if (hour < 17) return 'ទិវាសួស្តី';
  return 'សាយណ្ហសួស្តី';
}

// ---------- Search ----------

const INVISIBLES = /[​-‍⁠﻿]/g;

/** Normalise Khmer + Latin text for comparison: canonical Khmer cluster order,
 *  no zero-width spaces, ASCII digits, lower case. */
export function normalizeText(value) {
  let s = String(value ?? '').replace(INVISIBLES, '');
  try { s = khnormal(s); } catch { /* keep raw */ }
  return asciiDigits(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Break a query into words; Khmer runs (written without spaces) are split with
 *  split-khmer's dictionary segmentation. */
export function tokenize(value) {
  const words = [];
  for (const chunk of normalizeText(value).split(' ')) {
    if (!chunk) continue;
    if (containsKhmer(chunk)) {
      try { words.push(...splitKhmer(chunk).map((w) => w.trim()).filter(Boolean)); continue; } catch { /* fallthrough */ }
    }
    words.push(chunk);
  }
  return words;
}

/** True when every word of the query appears somewhere in the record. */
export function matchesQuery(fields, query) {
  const q = tokenize(query);
  if (!q.length) return true;
  const hay = normalizeText((Array.isArray(fields) ? fields : [fields]).filter(Boolean).join(' ')).replace(/ /g, '');
  return q.every((w) => hay.includes(w));
}

// ---------- Validation ----------

/** Accepts 012345678, 012 345 678, +855 12 345 678, ០១២៣៤៥៦៧៨ … returns "012 345 678" or ''. */
export function normalizePhone(value) {
  let digits = asciiDigits(value).replace(/[^\d+]/g, '');
  if (digits.startsWith('+855')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('855') && digits.length >= 11) digits = '0' + digits.slice(3);
  digits = digits.replace(/\D/g, '');
  if (!/^0[1-9]\d{7,8}$/.test(digits)) return '';
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export const isKhmerName = (value) => !!value && isKhmerWithWhitespace(String(value).trim());
export const hasKhmer = (value) => containsKhmer(String(value ?? ''));

/** Gender, ID types and relations used in customer profiles. */
export const GENDERS = [['female', 'ស្រី'], ['male', 'ប្រុស'], ['other', 'ផ្សេងៗ']];
export const ID_TYPES = [
  ['national_id', 'អត្តសញ្ញាណប័ណ្ណសញ្ជាតិខ្មែរ'],
  ['passport', 'លិខិតឆ្លងដែន'],
  ['family_book', 'សៀវភៅគ្រួសារ'],
  ['driving', 'ប័ណ្ណបើកបរ'],
  ['other', 'ផ្សេងៗ'],
];
export const labelOf = (pairs, key) => (pairs.find(([k]) => k === key) || [, ''])[1];
