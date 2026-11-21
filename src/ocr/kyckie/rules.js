// kyc-kie (MIT, mrrtmob — https://github.com/mrrtmob/kyc-kie), the plain-code half,
// ported from Python: machine-readable zone (with check digits), dates, label-anchored
// regexes, and the assembly of the final fields from the tagger's spans.
//
// `today` is anything with a year: a Date, or omitted for now.
import { FIELDS } from './common.js';

const yearOf = (today) => (today instanceof Date ? today : new Date()).getFullYear();
/** Python's str.translate: a function mapping each character of `from` to the one at the same place in `to`. */
const translate = (from, to) => {
  const m = new Map([...from].map((c, i) => [c, to[i]]));
  return (t) => Array.from(t, (c) => m.get(c) ?? c).join('');
};
const KH2LAT = translate('០១២៣៤៥៦៧៨៩', '0123456789');
const TO_DIGIT = translate('OQDIL|ZSBG', '0001112586');
const TO_ALPHA = translate('0125868', 'OIZSBGB');

const KH_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, SEPT: 9,
  OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
  JANV: 1, FEV: 2, FEVR: 2, MARS: 3, AVR: 4, MAI: 5, JUIN: 6, JUIL: 7, AOUT: 8, DEZ: 12, OKT: 10,
};

const stripAccents = (s) => s.normalize('NFD').replace(/\p{Mn}/gu, '');
const isDigit = (c) => c >= '0' && c <= '9';
const isAlpha = (c) => /\p{L}/u.test(c);
const count = (s, pred) => { let n = 0; for (const c of s) if (pred(c)) n++; return n; };
const rstrip = (s, ch) => { let e = s.length; while (e > 0 && s[e - 1] === ch) e--; return s.slice(0, e); };
const lstrip = (s, ch) => { let b = 0; while (b < s.length && s[b] === ch) b++; return s.slice(b); };
const ljust = (s, n, ch) => (s.length >= n ? s : s + ch.repeat(n - s.length));
const nz = (s) => s || null;
/** A real calendar date as YYYY-MM-DD, or null. */
function isoDate(y, m, d) {
  if (![y, m, d].every(Number.isInteger) || y < 1 || y > 9999 || m < 1 || m > 12 || d < 1) return null;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (d > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Python int() on a digit string: null when it is not one. */
const int = (s) => (typeof s === 'number' ? s : /^\s*[0-9]+\s*$/.test(s ?? '') ? parseInt(s, 10) : null);

// ======================= machine-readable zone =======================
export function checkDigit(s) {
  let total = 0;
  [...s].forEach((c, i) => {
    const v = isDigit(c) ? +c : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 55 : 0;
    total += v * [7, 3, 1][i % 3];
  });
  return String(total % 10);
}

const mrzClean = (tok) => tok.toUpperCase().replace(/«/g, '<<').replace(/[‹〈]/g, '<').replace(/[^A-Z0-9<]/g, '');
const looksMrz = (t) => t.length >= 24 && t.length <= 48 && (count(t, (c) => c === '<') >= 3 || (t.length >= 28 && count(t, isDigit) >= 10));

/** Machine-readable lines in reading order, even when OCR glued or split them. */
export function mrzTokens(text) {
  const out = [];
  for (const line of text.split('\n')) {
    let toks = [];
    for (const t of line.split(/\s+/).filter(Boolean).map(mrzClean)) {
      if (t.length > 48 && count(t, (c) => c === '<') >= 6) { // lines glued together: cut at the standard widths
        let best = null;
        for (const nw of [[3, 30], [2, 30], [2, 44], [2, 36]]) if (!best || Math.abs(t.length - nw[0] * nw[1]) < Math.abs(t.length - best[0] * best[1])) best = nw;
        const [n, w] = best;
        for (let i = 0; i < n; i++) toks.push(i < n - 1 ? t.slice(i * w, (i + 1) * w) : t.slice(i * w));
      } else toks.push(t);
    }
    toks = toks.filter(looksMrz);
    if (!toks.length) {
      const whole = mrzClean(line);
      if (looksMrz(whole) && count(line, (c) => c === '<') >= 3) toks = [whole];
    }
    out.push(...toks);
  }
  return out;
}

function yymmdd(s, birth, year) {
  if (!/^[0-9]{6}/.test(s)) return null;
  const yy = +s.slice(0, 2);
  const y = birth ? (2000 + yy <= year ? 2000 + yy : 1900 + yy) : (yy < 80 ? 2000 + yy : 1900 + yy);
  return isoDate(y, +s.slice(2, 4), +s.slice(4, 6));
}

/** birth(6) check sex expiry(6) check starting at i, both check digits right. */
function dateWindow(tok, i, year) {
  const w = tok.slice(i, i + 15);
  if (w.length < 15) return null;
  const b = TO_DIGIT(w.slice(0, 7));
  const e = TO_DIGIT(w.slice(8, 15));
  const sex = w[7];
  if (!(/^[0-9]+$/.test(b) && /^[0-9]+$/.test(e) && 'MFX<'.includes(sex))) return null;
  if (checkDigit(b.slice(0, 6)) !== b[6] || checkDigit(e.slice(0, 6)) !== e[6]) return null;
  const dob = yymmdd(b, true, year);
  const exp = yymmdd(e, false, year);
  if (!dob || !exp) return null;
  return { dob, expiry: exp, sex: 'MF'.includes(sex) ? sex : null };
}

/** [number, check digit right?] for a 9-character document number field. */
function number(field9, check, digitsOnly = false) {
  const cands = digitsOnly ? [TO_DIGIT(field9)] : [field9, field9.replace(/O/g, '0'), field9.replace(/I/g, '1').replace(/O/g, '0')];
  const chk = TO_DIGIT(check);
  for (const c of cands) if (c.length === 9 && checkDigit(c) === chk) return [rstrip(c, '<'), true];
  return [rstrip(cands[0], '<'), false];
}

function names(s0) {
  const s = rstrip(lstrip(TO_ALPHA(s0), '<').split(/<{3,}/)[0], '<'); // what follows the filler is noise
  if (!s) return [null, null];
  const i = s.indexOf('<<');
  const parts = i < 0 ? [s] : [s.slice(0, i), s.slice(i + 2)];
  const sur = nz(parts[0].replace(/</g, ' ').trim());
  const giv = parts.length > 1 ? nz(parts[1].replace(/</g, ' ').trim()) : null;
  return [sur, giv];
}

/** null when there are no machine-readable lines; otherwise what they say, with number_ok / dates_ok. */
export function parseMrz(text, today) {
  const year = yearOf(today);
  const toks = mrzTokens(text);
  if (!toks.length) return null;
  const r = { lines: toks, type: null, number: null, number_ok: false, nationality: null, dob: null,
    expiry: null, sex: null, dates_ok: false, surname: null, given: null };
  let data = null;
  let off = null;
  for (let k = 0; k < toks.length && data === null; k++) { // the line with the dates: usual offsets first, then anywhere
    const t = toks[k];
    const order = [13, 0];
    for (let j = 0; j < t.length - 14; j++) if (j !== 13 && j !== 0) order.push(j);
    for (const i of order) {
      const w = dateWindow(t, i, year);
      if (w) { data = k; off = i; Object.assign(r, w, { dates_ok: true }); break; }
    }
  }
  let twoLine = null;
  if (data !== null) {
    const t = toks[data];
    if (off >= 8) { // passport / visa: number(9) check nationality(3) dates
      twoLine = true;
      r.nationality = nz(TO_ALPHA(t.slice(off - 3, off)).replace(/</g, ''));
      [r.number, r.number_ok] = number(ljust(t.slice(Math.max(0, off - 13), off - 4), 9, '<').slice(0, 9), t[off - 4]);
    } else { // card: dates first, nationality after; the number is on the line above
      twoLine = false;
      r.nationality = nz(TO_ALPHA(t.slice(off + 15, off + 18)).replace(/</g, ''));
    }
  } else { // no valid check digits anywhere: read fixed columns, trusted last
    const long = toks.map((t, k) => [t, k]).filter(([t]) => t.length >= 34).map(([, k]) => k);
    if (long.length) {
      twoLine = true;
      data = long.at(-1);
      const t = ljust(toks[data], 28, '<');
      [r.number, r.number_ok] = number(t.slice(0, 9), t[9]);
      r.number = r.number || null;
      r.nationality = nz(TO_ALPHA(t.slice(10, 13)).replace(/</g, ''));
      r.dob = yymmdd(TO_DIGIT(t.slice(13, 19)), true, year);
      r.expiry = yymmdd(TO_DIGIT(t.slice(21, 27)), false, year);
      r.sex = 'MF'.includes(t[20]) ? t[20] : null;
    } else if (toks.length >= 2) {
      twoLine = false;
      const cand = toks.map((t, k) => [t, k]).filter(([t]) => count(TO_DIGIT(t.slice(0, 15)), isDigit) >= 11 && !/^(ID|I<|AC|C<)/.test(t)).map(([, k]) => k);
      if (cand.length) {
        data = cand[0];
        const t = ljust(toks[data], 18, '<');
        r.dob = yymmdd(TO_DIGIT(t.slice(0, 6)), true, year);
        r.expiry = yymmdd(TO_DIGIT(t.slice(8, 14)), false, year);
        r.sex = 'MF'.includes(t[7]) ? t[7] : null;
        r.nationality = nz(TO_ALPHA(t.slice(15, 18)).replace(/</g, ''));
      }
    }
  }
  let others = toks.map((_, k) => k).filter((k) => k !== data);
  if (twoLine === false) {
    const first = others.filter((k) => /^[IAC1][A-Z<0-9][A-Z<0-9]{3}/.test(toks[k]) && count(toks[k], isDigit) >= 6);
    if (first.length) {
      const t = toks[first[0]];
      r.type = 'id_card';
      const cambodia = TO_ALPHA(t.slice(2, 5)) === 'KHM';
      [r.number, r.number_ok] = number(ljust(t.slice(5, 14), 9, '<'), t.slice(14, 15) || '?', cambodia);
      others = others.filter((k) => k !== first[0]);
    }
    const name = others.filter((k) => rstrip(toks[k], '<').includes('<<') || count(toks[k], isAlpha) >= 6);
    if (name.length) [r.surname, r.given] = names(toks[name.at(-1)]);
  } else {
    const name = others.filter((k) => count(toks[k], isAlpha) > count(toks[k], isDigit) + 4);
    if (name.length) {
      let t = toks[name[0]];
      if ('PV'.includes(t[0]) && t.length >= 30) {
        r.type = t[0] === 'P' ? 'passport' : 'visa';
        t = t.slice(5);
      } else if (/^[A-Z<]{2}[A-Z]{3}/.test(t) && t.length >= 40) t = t.slice(5);
      [r.surname, r.given] = names(t);
    }
  }
  return r;
}

// ======================= dates =======================
const N = '[0-9]';
const LAT = 'A-Za-zÀ-ÿ';
const DATE_RES = [
  ['ymd', new RegExp(`(?<![0-9])(${N}{4})\\s?[./\\-年]\\s?(${N}{1,2})\\s?[./\\-月]\\s?(${N}{1,2})(?![0-9])`, 'g')],
  ['dmy', new RegExp(`(?<![0-9])(${N}{1,2})\\s?[./\\-]\\s?(${N}{1,2})\\s?[./\\-]\\s?(${N}{4})(?![0-9])`, 'g')],
  ['dMy', new RegExp(`(?<![0-9])(${N}{1,2})\\s?[-/. ]?\\s?(?:${N}{1,2}月\\s?/\\s?)?([${LAT}]{3,9})\\.?(?:\\s?/\\s?[${LAT}]{3,9}\\.?)?\\s?[-/., ]?\\s?(${N}{4}|${N}{2})(?![0-9])`, 'g')],
  ['kh', new RegExp(`(${N}{1,2})\\s?(?:ខែ\\s?)?(${KH_MONTHS.join('|')})\\s?(?:ឆ្នាំ\\s?)?(${N}{4})`, 'g')],
];
const FIX = /(?<=[0-9])[OoIl|](?=[0-9./\-])|(?<=[0-9./\- ])[OoIl|](?=[0-9])/g;

/** Khmer digits as 0-9, and O / l between digits read as 0 / 1. Same length. */
function numeric(text) {
  let t = KH2LAT(text);
  for (let i = 0; i < 2; i++) t = t.replace(FIX, (m) => ('Oo'.includes(m) ? '0' : '1'));
  return t;
}

function iso(y0, m, d, year) {
  let y = int(y0);
  const mm = int(m);
  const dd = int(d);
  if (y === null || mm === null || dd === null) return null;
  if (y < 100) y += y > (year % 100) + 15 ? 1900 : 2000;
  if (y < 1900 || y > 2100) return null;
  return isoDate(y, mm, dd);
}

/** [[start, end, 'YYYY-MM-DD']] for every date in the text, left to right (UTF-16 offsets). */
export function findDates(text, today) {
  const year = yearOf(today);
  const t = numeric(text);
  const found = [];
  for (const [kind, rx] of DATE_RES) {
    for (const m of t.matchAll(rx)) {
      const s = m.index;
      const e = m.index + m[0].length;
      if (found.some(([a, b]) => a < e && s < b)) continue;
      const [, a, b, c] = m;
      let v;
      if (kind === 'ymd') v = iso(a, b, c, year);
      else if (kind === 'dmy') v = iso(c, b, a, year);
      else if (kind === 'kh') v = iso(c, KH_MONTHS.indexOf(b) + 1, a, year);
      else {
        const mon = stripAccents(b).toUpperCase();
        const mm = MONTHS[mon] || MONTHS[mon.slice(0, 4)] || MONTHS[mon.slice(0, 3)];
        v = mm ? iso(c, mm, a, year) : null;
      }
      if (v) found.push([s, e, v]);
    }
  }
  return found.sort((x, y) => x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0));
}

export function parseDate(s, today) {
  const d = findDates(s, today);
  if (d.length) return d[0][2];
  const digits = (/[A-Za-z]{3}/.test(s) ? '' : TO_DIGIT(numeric(s))).replace(/[^0-9]/g, '');
  if (digits.length === 8) { // separators lost
    const year = yearOf(today);
    return iso(digits.slice(4), digits.slice(2, 4), digits.slice(0, 2), year) || iso(digits.slice(0, 4), digits.slice(4, 6), digits.slice(6), year);
  }
  return null;
}

// ======================= label-anchored rules =======================
const DOB_L = ['ថ្ងៃខែឆ្នាំកំណើត', 'ថ្ងៃកំណើត', 'date of birth', 'birth date', 'dob', 'date de naissance', '出生日期', 'ngày sinh'];
const ISSUE_L = ['សុពលភាព', 'ថ្ងៃចេញ', 'កាលបរិច្ឆេទចេញ', 'ថ្ងៃផ្តល់', 'ចេញថ្ងៃទី', 'date of issue', 'issue date', 'issued on',
  '签发日期', 'ngày cấp', 'date de délivrance'];
const EXPIRY_L = ['ថ្ងៃផុតកំណត់', 'សុពលភាពដល់', 'ផុតសុពលភាព', 'ដល់ថ្ងៃ', 'date of expiry', 'expiry date', 'valid until', 'expires',
  'date of expiration', '有效期至', 'có giá trị đến', "date d'expiration"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ROLE_RX = [['date_of_birth', DOB_L], ['issue_date', ISSUE_L], ['expiry_date', EXPIRY_L]]
  .map(([role, ls]) => [role, new RegExp([...ls].sort((a, b) => b.length - a.length).map(esc).join('|'), 'gi')]);
// Python's \b is Unicode-aware; JS's is ASCII-only, so spell it out.
const WB = '(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))';
/** Case-insensitive ASCII letters inside a regex that is otherwise case-sensitive (Python's (?i:…)). */
const ci = (s) => s.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const SEX_RX = new RegExp(`(?:ភេទ|${ci('sex')}|${ci('gender')}|性别)[^\\n]{0,12}?(ប្រុស|ស្រី|${WB}${ci('female')}${WB}|${WB}${ci('male')}${WB}|${WB}[MF]${WB}|男|女)`, 'u');
const HEIGHT_RX = new RegExp(`(?:កំពស់|កម្ពស់|${ci('height')})[^\\n0-9០-៩]{0,12}([0-9០-៩]{1,3}(?:[.,][0-9០-៩]{1,2})?)`, 'u');
const KHID_RX = /^[ \t]*([0-9០-៩]{9}(?:[ \t]*\([ \t]*[0-9០-៩]{1,2}[ \t]*\))?)[ \t]*$/m;
const SUFFIX_RX = /^(.*?[A-Z0-9])\s*\(\s*([0-9]{1,2})\s*\)?\s*$/;
const F_RX = new RegExp(`${WB}F${WB}|FEM|NỮ`, 'u');
const M_RX = new RegExp(`${WB}M${WB}|MAL|NAM${WB}`, 'u');

export function normSex(s) {
  if (!s) return null;
  const u = s.trim().toUpperCase();
  if (s.includes('ស្រ') || s.includes('女') || s.includes('ី') || F_RX.test(u)) return 'F';
  if (s.includes('ប') || s.includes('ុ') || s.includes('男') || M_RX.test(u)) return 'M';
  if (u[0] === 'F' || u[0] === 'M') return u[0];
  return null;
}

/** Python's round(): halves go to the even neighbour. */
const roundHalfEven = (v) => { const f = Math.floor(v); const d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };

export function normHeight(s) {
  const m = KH2LAT(s || '').match(/[0-9]{1,3}(?:[.,][0-9]{1,2})?/);
  if (!m) return null;
  let v = parseFloat(m[0].replace(',', '.'));
  if (v < 3) v *= 100;
  v = roundHalfEven(v);
  return v >= 50 && v <= 250 ? v : null;
}

/** Letters and digits only. A Khmer ID's issue count in brackets is kept: '010234567 (០១)' -> '010234567 (01)'. */
export function normNumber(s0) {
  const s = KH2LAT(s0 || '').toUpperCase().trim();
  const m = s.match(SUFFIX_RX);
  const n = (m ? m[1] : s).replace(/[^A-Z0-9]/g, '');
  if (m && n) return `${n} (${m[2]})`;
  return n || null;
}

/** The machine-readable lines have the bare number; add the bracket the card prints after it. */
function withSuffix(num, ...seen) {
  for (const s of seen) if (num && s && s.includes(' (') && s.split(' (')[0] === num) return s;
  return num;
}

/** Fields a label on the same line gives away: {field: value}. */
export function anchored(text, today) {
  const out = {};
  for (const line of text.split('\n')) {
    const dates = findDates(line, today);
    const labels = ROLE_RX.flatMap(([role, rx]) => [...line.matchAll(rx)].map((m) => [m.index, m.index + m[0].length, role]));
    dates.forEach(([a], i) => {
      const prevEnd = i ? dates[i - 1][1] : 0;
      const near = labels.filter((l) => prevEnd <= l[0] && l[1] <= a);
      if (near.length) {
        const best = near.reduce((x, y) => (y[1] > x[1] || (y[1] === x[1] && y[1] - y[0] > x[1] - x[0]) ? y : x));
        if (!(best[2] in out)) out[best[2]] = dates[i][2];
      }
    });
  }
  let m = text.match(SEX_RX);
  if (m && normSex(m[1])) out.sex = normSex(m[1]);
  m = text.match(HEIGHT_RX);
  if (m && normHeight(m[1])) out.height_cm = normHeight(m[1]);
  return out;
}

const VISA_KW = ['visa', 'ទិដ្ឋាការ'];
const PASS_KW = ['passport', 'លិខិតឆ្លងដែន', 'passeport', '护照', 'hộ chiếu'];
const ID_KW = ['អត្តសញ្ញាណប័ណ្ណ', 'identity card', 'គោត្តនាមនិងនាម', 'id card', 'ភិនភាគ', 'idkhm', '身份证'];

/** Machine-readable line with right check digits, then the model's class, then keywords. */
export function detectType(text, mrz, labels, modelType = null) {
  if (mrz && mrz.type && mrz.dates_ok) return mrz.type;
  if (modelType != null) return modelType === 'other' ? null : modelType;
  if (mrz && mrz.type) return mrz.type;
  const low = text.toLowerCase();
  if (VISA_KW.some((k) => low.includes(k))) return 'visa';
  if (ID_KW.some((k) => low.includes(k))) return 'id_card';
  if (PASS_KW.some((k) => low.includes(k))) return 'passport';
  if (labels.has('VISA_TYPE')) return 'visa';
  if (['SURNAME', 'GIVEN', 'PASSPORT_NO'].some((l) => labels.has(l))) return 'passport';
  if (['NAME_KM', 'DOC_NO', 'ADDRESS', 'POB'].some((l) => labels.has(l))) return 'id_card';
  return null;
}

const STRIP = ' \t:;,.៖-/|';
export function clean(s, upper = false) {
  let t = s.replace(/\s+/g, ' ');
  let a = 0;
  let b = t.length;
  while (a < b && STRIP.includes(t[a])) a++;
  while (b > a && STRIP.includes(t[b - 1])) b--;
  t = t.slice(a, b);
  return (upper ? t.toUpperCase() : t) || null;
}

/**
 * Final fields from the raw text (an array of code points or a string), the tagger's spans
 * [{start, end, label}] (code-point offsets) and the model's document class.
 * Returns {fields, sources} — sources says where each value came from: mrz / rule / model.
 */
export function assemble(text0, spans, docType = null, today) {
  const chars = Array.isArray(text0) ? text0 : Array.from(text0);
  const text = chars.join('');
  const by = {};
  for (const s of [...spans].sort((a, b) => a.start - b.start)) (by[s.label] ||= []).push(chars.slice(s.start, s.end).join(''));
  const mrz = parseMrz(text, today);
  const rule = anchored(text, today);
  const f = Object.fromEntries(FIELDS.map((k) => [k, null]));
  const src = {};
  const put = (name, ...choices) => {
    for (const [value, where] of choices) if (value != null && value !== '') { f[name] = value; src[name] = where; return; }
  };
  const first = (label, fn) => {
    for (const t of by[label] || []) { const v = fn(t); if (v != null) return v; }
    return null;
  };
  const joined = (label, upper = false) => (by[label] ? clean(by[label].join(' '), upper) : null);

  const ok = !!(mrz && mrz.dates_ok);
  put('document_type', [detectType(text, mrz, new Set(Object.keys(by)), docType), docType ? 'model' : 'rule']);
  const kind = f.document_type;
  const date = (t) => parseDate(t, today);
  put('sex', [ok ? mrz.sex : null, 'mrz'], [rule.sex, 'rule'], [first('SEX', normSex), 'model'], [mrz?.sex, 'mrz, check digit wrong']);
  put('date_of_birth', [ok ? mrz.dob : null, 'mrz'], [rule.date_of_birth, 'rule'], [first('DOB', date), 'model'], [mrz?.dob, 'mrz, check digit wrong']);
  put('expiry_date', [ok ? mrz.expiry : null, 'mrz'], [rule.expiry_date, 'rule'], [first('EXPIRY', date), 'model'], [mrz?.expiry, 'mrz, check digit wrong']);
  put('issue_date', [rule.issue_date, 'rule'], [first('ISSUE', date), 'model']);
  put('height_cm', [rule.height_cm, 'rule'], [first('HEIGHT', normHeight), 'model']);

  const [mnum, mok] = mrz ? [mrz.number, mrz.number_ok] : [null, false];
  const docNo = first('DOC_NO', normNumber);
  const passNo = first('PASSPORT_NO', normNumber);
  if (kind === 'visa') {
    put('document_number', [docNo, 'model']);
    put('passport_number', [passNo, 'model'], [mnum, mok ? 'mrz' : 'mrz, check digit wrong']);
  } else if (kind === 'passport') {
    put('document_number', [mok ? mnum : null, 'mrz'], [passNo, 'model'], [docNo, 'model'], [mnum, 'mrz, check digit wrong']);
    put('passport_number', [f.document_number, src.document_number]);
  } else {
    const km = kind === 'id_card' ? text.match(KHID_RX) : null;
    const printed = km ? normNumber(km[1]) : null;
    put('document_number', [mok ? withSuffix(mnum, printed, docNo) : null, 'mrz'], [printed, 'rule'], [docNo, 'model'], [mnum, 'mrz, check digit wrong']);
    put('passport_number', [passNo, 'model']);
  }

  put('full_name_km', [joined('NAME_KM'), 'model']);
  put('surname', [joined('SURNAME', true), 'model'], [mrz?.surname, 'mrz']);
  put('given_names', [joined('GIVEN', true), 'model'], [mrz?.given, 'mrz']);
  const both = [f.surname, f.given_names].filter(Boolean).join(' ') || null;
  put('full_name_en', [joined('NAME_EN', true), 'model'], [both, 'surname + given names']);
  put('nationality', [joined('NATIONALITY'), 'model'], [mrz?.nationality, 'mrz']);
  put('place_of_birth', [joined('POB'), 'model']);
  put('address', [joined('ADDRESS'), 'model']);
  put('visa_type', [joined('VISA_TYPE'), 'model']);
  put('distinguishing_marks', [joined('MARKS'), 'model']);
  f.mrz = mrz ? mrz.lines.join('\n') : null;
  f.mrz_valid = mrz ? (mrz.dates_ok && (mrz.number_ok || mrz.number === null)) : null;
  if (mrz) { src.mrz = 'rule'; src.mrz_valid = 'rule'; }
  return { fields: f, sources: src };
}
