// kyc-kie (MIT, mrrtmob — https://github.com/mrrtmob/kyc-kie), ported from Python to
// JavaScript: the label set, the character vocabulary, BIO → spans and Viterbi decoding.
// No model or browser API here, so it runs in Node tests too.

export const ENTITIES = ['DOC_NO', 'PASSPORT_NO', 'NAME_KM', 'NAME_EN', 'SURNAME', 'GIVEN', 'SEX', 'DOB', 'NATIONALITY',
  'POB', 'ADDRESS', 'HEIGHT', 'ISSUE', 'EXPIRY', 'VISA_TYPE', 'MARKS'];
export const LABELS = ['O', ...ENTITIES.flatMap((e) => [`B-${e}`, `I-${e}`])];

/** Fields of the final object, in output order (mrz and mrz_valid are added after). */
export const FIELDS = ['document_type', 'document_number', 'passport_number', 'full_name_km', 'full_name_en', 'surname',
  'given_names', 'sex', 'date_of_birth', 'nationality', 'place_of_birth', 'address', 'height_cm',
  'distinguishing_marks', 'issue_date', 'expiry_date', 'visa_type'];

export const DOC_CLASSES = ['other', 'id_card', 'passport', 'visa'];

// ---- character vocabulary (fixed: must match the table the model was trained with) ----
const BUCKETS = ['<pad>', '<khmer>', '<latin>', '<digit>', '<cjk>', '<thai>', '<letter>', '<other>'];
const CHARS = ['\n'];
for (let c = 32; c < 127; c++) CHARS.push(String.fromCharCode(c));
for (let c = 0x1780; c < 0x17FA; c++) CHARS.push(String.fromCharCode(c));
CHARS.push(...'«»—–•·…“”‘’°№×');
export const VOCAB = [...BUCKETS, ...CHARS];
const CHAR_ID = new Map(VOCAB.map((c, i) => [c, i]));
const B = Object.fromEntries(BUCKETS.map((b, i) => [b, i]));
const SPACES = new Set(['\t', '\r', ' ', '​', '‌', '‍', '　']);

/** One id per character (code point). Unknown characters go to a bucket for their script. */
export function charId(ch) {
  const i = CHAR_ID.get(ch);
  if (i !== undefined) return i;
  const o = ch.codePointAt(0);
  if ((o >= 0x1780 && o <= 0x17FF) || (o >= 0x19E0 && o <= 0x19FF)) return B['<khmer>'];
  if ((o >= 0x2E80 && o <= 0x9FFF) || (o >= 0xAC00 && o <= 0xD7AF) || (o >= 0xF900 && o <= 0xFAFF) || (o >= 0xFF00 && o <= 0xFFEF)) return B['<cjk>'];
  if (o >= 0x0E00 && o <= 0x0E7F) return B['<thai>'];
  if (SPACES.has(ch)) return CHAR_ID.get(' ');
  if (/\p{Nd}/u.test(ch)) return B['<digit>'];
  if (/\p{L}/u.test(ch)) {
    const base = Array.from(ch.normalize('NFD'))[0]; // É -> E, ữ -> u
    if (base !== ch && CHAR_ID.has(base)) return CHAR_ID.get(base);
    return o < 0x250 ? B['<latin>'] : B['<letter>'];
  }
  if (/\p{M}/u.test(ch)) return B['<letter>'];
  return B['<other>'];
}

/** Ids for an array of code points. */
export const encode = (chars) => chars.map(charId);

/** Label ids → [{start, end, label}] (end exclusive, code-point offsets). A stray I- opens a span. */
export function tagsToSpans(tags) {
  const spans = [];
  let start = null;
  let ent = null;
  for (let i = 0; i <= tags.length; i++) {
    const lab = i < tags.length ? LABELS[tags[i]] : 'O';
    if (start !== null && (lab === 'O' || lab[0] === 'B' || lab.slice(2) !== ent)) {
      spans.push({ start, end: i, label: ent });
      start = ent = null;
    }
    if (lab !== 'O' && start === null) { start = i; ent = lab.slice(2); }
  }
  return spans;
}

/**
 * Best label sequence under the CRF. em: flat Float32Array (T × L) of emissions;
 * trans[i][j]: score of label i followed by j. float32 arithmetic, like the reference.
 */
export function viterbi(em, T, trans, start, end) {
  const L = start.length;
  const f = Math.fround;
  let score = new Float32Array(L);
  for (let j = 0; j < L; j++) score[j] = f(start[j] + em[j]);
  const back = new Int32Array(T * L);
  const next = new Float32Array(L);
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < L; j++) {
      let best = -Infinity;
      let arg = 0;
      for (let i = 0; i < L; i++) {
        const v = f(score[i] + trans[i][j]);
        if (v > best) { best = v; arg = i; }
      }
      back[t * L + j] = arg;
      next[j] = f(best + em[t * L + j]);
    }
    score.set(next);
  }
  let best = 0;
  let bestV = -Infinity;
  for (let j = 0; j < L; j++) {
    const v = f(score[j] + end[j]);
    if (v > bestV) { bestV = v; best = j; }
  }
  const path = new Array(T);
  path[T - 1] = best;
  for (let t = T - 1; t > 0; t--) { best = back[t * L + best]; path[t - 1] = best; }
  return path;
}
