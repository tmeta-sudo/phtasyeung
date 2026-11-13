// Turn OCR lines from a Cambodian national ID card (front and/or back) into form fields.
import { asciiDigits } from '../../shared/khmer.js';

const MRZ_CHARS = /^[A-Z0-9<]{20,}$/;
const mrzClean = (s) => asciiDigits(s).toUpperCase().replace(/[«‹＜]/g, '<').replace(/[^A-Z0-9<]/g, '');

/** ICAO 9303 check digit. */
function check(str) {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const v = c === '<' ? 0 : /[0-9]/.test(c) ? +c : c.charCodeAt(0) - 55;
    sum += v * w[i % 3];
  }
  return String(sum % 10);
}

const yymmdd = (s, future) => {
  if (!/^\d{6}$/.test(s)) return '';
  let y = +s.slice(0, 2);
  const now = new Date().getFullYear() % 100;
  y += future ? 2000 : (y > now ? 1900 : 2000);
  return `${y}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
};

/** TD1 MRZ (3 × 30) as printed on the back of the Khmer ID card. */
export function parseMrz(lines) {
  const cand = lines.map((l) => mrzClean(String(typeof l === "string" ? l : l.text ?? ""))).filter((l) => MRZ_CHARS.test(l) && (l.match(/</g) || []).length >= 2);
  if (cand.length < 2) return null;
  const l1 = cand.find((l) => /^I[A-Z<]KHM/.test(l)) || cand[0];
  const l2 = cand.find((l) => /^\d{7}[MF<]\d{7}/.test(l)) || cand.find((l) => /\d{6}.[MF]\d{6}/.test(l));
  const l3 = cand.find((l) => l !== l1 && l !== l2 && /^[A-Z]+<</.test(l));
  const out = { checks: 0, passed: 0 };
  if (l1) {
    const num = l1.slice(5, 14).replace(/<+$/, '');
    if (num) {
      out.idNumber = num;
      out.checks += 1;
      if (check(l1.slice(5, 14)) === l1[14]) out.passed += 1;
    }
  }
  if (l2) {
    const m = l2.match(/(\d{6})(\d)([MF<])(\d{6})(\d)/);
    if (m) {
      out.dob = yymmdd(m[1], false);
      out.gender = m[3] === 'M' ? 'male' : m[3] === 'F' ? 'female' : '';
      out.idExpiry = yymmdd(m[4], true);
      out.checks += 2;
      if (check(m[1]) === m[2]) out.passed += 1;
      if (check(m[4]) === m[5]) out.passed += 1;
    }
  }
  if (l3) {
    const [sur, given = ''] = l3.split('<<');
    out.nameEn = `${sur.replace(/</g, ' ').trim()} ${given.replace(/</g, ' ').trim()}`.trim();
  }
  return out.idNumber || out.dob || out.nameEn ? out : null;
}

const KM_DIGITS = /[០-៩]/;
const toDate = (d, m, y) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Front side (Khmer): name, Latin name, ID number, dates, sex, address. */
export function parseFront(lines) {
  const texts = lines.map((l) => String(typeof l === "string" ? l : l.text ?? "").trim()).filter(Boolean);
  const out = {};
  const all = texts.map((t) => asciiDigits(t));
  // ID number: 9 digits (sometimes printed with spaces)
  for (const t of all) {
    const m = t.replace(/\s+/g, '').match(/(?<!\d)(\d{9,10})(?!\d)/);
    if (m && !/[<]/.test(t)) { out.idNumber = m[1]; break; }
  }
  // dates dd.mm.yyyy (or dd/mm/yyyy)
  const dates = [];
  all.forEach((t, i) => { for (const m of t.matchAll(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g)) dates.push({ i, date: toDate(m[1], m[2], m[3]), line: texts[i] }); });
  const dobLine = dates.find((d) => /កំណើត|កើត|birth/i.test(d.line));
  if (dobLine) out.dob = dobLine.date;
  const validity = dates.filter((d) => /សុពលភាព|valid|ដល់/i.test(d.line));
  if (validity.length >= 2) { out.idIssued = validity[0].date; out.idExpiry = validity.at(-1).date; } else if (validity.length === 1) out.idExpiry = validity[0].date;
  if (!out.dob && dates.length) out.dob = [...dates].sort((a, b) => a.date.localeCompare(b.date))[0].date;
  // sex
  const sexLine = texts.find((t) => /ភេទ/.test(t)) || '';
  if (/ស្រី/.test(sexLine)) out.gender = 'female'; else if (/ប្រុស/.test(sexLine)) out.gender = 'male';
  // Khmer name: after "នាម" label, else the first mostly-Khmer line without a label
  const nameIdx = texts.findIndex((t) => /គោត្តនាម|នាម/.test(t));
  if (nameIdx >= 0) {
    const after = texts[nameIdx].split(/[:៖]/).slice(1).join(' ').trim() || texts[nameIdx].replace(/.*(គោត្តនាម\s*និង\s*នាម|នាម)\s*/, '').trim();
    out.nameKm = after && /[ក-៹]/.test(after) ? after : (texts[nameIdx + 1] && /^[ក-៹\s]+$/.test(texts[nameIdx + 1]) ? texts[nameIdx + 1] : '');
  }
  // Latin name: an all-caps line of letters
  const latin = texts.find((t) => /^[A-Z][A-Z\s.'-]{4,}$/.test(t.trim()) && !/KINGDOM|CAMBODIA|IDENTITY|CARD/.test(t));
  if (latin) out.nameEn = latin.trim().replace(/\s+/g, ' ');
  // address: after "អាសយដ្ឋាន"
  const addrIdx = texts.findIndex((t) => /អាសយដ្ឋាន/.test(t));
  if (addrIdx >= 0) {
    const first = texts[addrIdx].split(/[:៖]/).slice(1).join(' ').trim();
    out.addressDetail = [first, texts[addrIdx + 1] && /[ក-៹]/.test(texts[addrIdx + 1]) && !/សុពលភាព|ភេទ/.test(texts[addrIdx + 1]) ? texts[addrIdx + 1] : ''].filter(Boolean).join(' ').trim();
  }
  if (out.nameKm && KM_DIGITS.test(out.nameKm)) delete out.nameKm;
  return out;
}

/** Merge front + back: the MRZ wins for Latin fields when its check digits pass. */
export function parseIdCard(frontLines = [], backLines = []) {
  const front = parseFront(frontLines);
  const mrz = parseMrz([...backLines, ...frontLines]);
  const fields = { ...front };
  if (mrz) {
    const trusted = mrz.checks > 0 && mrz.passed === mrz.checks;
    for (const k of ['nameEn', 'dob', 'gender', 'idExpiry', 'idNumber']) if (mrz[k] && (trusted || !fields[k])) fields[k] = mrz[k];
  }
  return { fields, mrz };
}
