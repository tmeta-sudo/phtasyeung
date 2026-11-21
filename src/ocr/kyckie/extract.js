// kyc-kie (MIT, mrrtmob — https://github.com/mrrtmob/kyc-kie): raw OCR text of an ID card,
// passport or visa → structured fields. A character-level BiGRU-CRF tagger finds the spans,
// rules read the fixed-pattern fields (MRZ with check digits, dates, labels).
//
// Works with any onnxruntime build (web in the browser, web or node in tests): pass the
// module as `ort`, an InferenceSession for model.onnx and the parsed model.onnx.json.
import { DOC_CLASSES, LABELS, VOCAB, encode, tagsToSpans, viterbi } from './common.js';
import { assemble } from './rules.js';

/** Check the CRF metadata matches this code and keep it in typed form. */
export function makeTagger(ort, session, meta) {
  if (meta.labels.join() !== LABELS.join() || meta.vocab_size !== VOCAB.length) {
    throw new Error('kyc-kie model was exported with another label set or vocabulary');
  }
  return { ort, session, trans: meta.transitions, start: Float32Array.from(meta.start), end: Float32Array.from(meta.end) };
}

/** {spans [{start, end, label, text}], kind} for an array of code points. */
async function tag(chars, tagger) {
  if (!chars.join('').trim()) return { spans: [], kind: 'other' };
  const ids = BigInt64Array.from(encode(chars), (i) => BigInt(i));
  const out = await tagger.session.run({ ids: new tagger.ort.Tensor('int64', ids, [1, ids.length]) });
  const em = out.emissions.data;
  const cls = out.doc_class.data;
  const spans = tagsToSpans(viterbi(em, chars.length, tagger.trans, tagger.start, tagger.end));
  for (const s of spans) s.text = chars.slice(s.start, s.end).join('');
  let best = 0;
  for (let i = 1; i < cls.length; i++) if (cls[i] > cls[best]) best = i;
  return { spans, kind: DOC_CLASSES[best] };
}

/** {fields, sources, spans} for one raw OCR text. */
export async function extract(text, tagger, today) {
  const chars = Array.from(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  const { spans, kind } = await tag(chars, tagger);
  const { fields, sources } = assemble(chars, spans, kind, today);
  return { fields, sources, spans };
}

/** OCR lines (strings or {text}) of the front and back → one text, front first. */
export const linesToText = (...sides) => sides.flat().map((l) => String(typeof l === 'string' ? l : l?.text ?? '').trim()).filter(Boolean).join('\n');

/** kyc-kie fields → the tenant profile fields the form uses. */
export function toProfile(k) {
  const out = {};
  if (k.full_name_km) out.nameKm = k.full_name_km;
  if (k.full_name_en) out.nameEn = k.full_name_en;
  const num = k.document_number || k.passport_number;
  if (num) out.idNumber = num.replace(/\s*\(\d{1,2}\)$/, ''); // the card's "(01)" issue count is not part of the number
  if (k.sex === 'F') out.gender = 'female'; else if (k.sex === 'M') out.gender = 'male';
  if (k.date_of_birth) out.dob = k.date_of_birth;
  if (k.issue_date) out.idIssued = k.issue_date;
  if (k.expiry_date) out.idExpiry = k.expiry_date;
  if (k.address) out.addressDetail = k.address;
  if (k.document_type === 'passport') out.idType = 'passport';
  else if (k.document_type === 'id_card') out.idType = 'national_id';
  return out;
}
