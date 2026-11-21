// kyc-kie port: the JavaScript tagger + rules give the same fields as the Python package
// (expected values in fixtures/kyckie.json were produced by kyc-kie 0.1.0 itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as ort from 'onnxruntime-web';
import { makeTagger, extract, toProfile, linesToText } from '../src/ocr/kyckie/extract.js';
import { parseMrz, parseDate, normHeight, normNumber, normSex } from '../src/ocr/kyckie/rules.js';

const dir = new URL('../src/ocr/kyckie/', import.meta.url);
const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/kyckie.json', import.meta.url), 'utf8'));
const TODAY = new Date(2026, 10, 21);
let tagger;
const getTagger = async () => tagger ||= makeTagger(ort,
  await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(new URL('model.onnx', dir)))),
  JSON.parse(fs.readFileSync(new URL('model.onnx.json', dir), 'utf8')));

for (const c of cases) {
  test(`kyc-kie: ${c.name} matches the Python reference`, async () => {
    const { fields } = await extract(c.text, await getTagger(), TODAY);
    assert.deepEqual(fields, c.expected);
  });
}

test('kyc-kie: fields map onto the tenant profile', async () => {
  const lines = cases[0].text.split('\n').map((text) => ({ text, confidence: 0.9 }));
  const { fields } = await extract(linesToText(lines.slice(0, 10), lines.slice(10)), await getTagger(), TODAY);
  assert.deepEqual(toProfile(fields), {
    nameKm: 'សុខ សុភា', nameEn: 'SOK SOPHEA', idNumber: '010234567', gender: 'female', dob: '1990-03-05',
    idIssued: '2020-06-12', idExpiry: '2030-06-11', addressDetail: 'ផ្ទះ១២ ផ្លូវ២៧១ ភូមិ៣ សង្កាត់ទឹកថ្លា ខណ្ឌសែនសុខ ភ្នំពេញ', idType: 'national_id',
  });
  assert.equal(toProfile({ document_number: '100456789 (01)' }).idNumber, '100456789');
});

test('kyc-kie: empty text gives nulls, not an error', async () => {
  const { fields } = await extract('  \n ', await getTagger(), TODAY);
  assert.equal(fields.document_type, null);
  assert.equal(fields.mrz, null);
});

test('kyc-kie rules: MRZ repair, dates, numbers', () => {
  const m = parseMrz('IDKHM0102345670<<<<<<<<<<<<<<< 9OO3O59F3006117KHM<<<<<<<<<<<4 SOK<<SOPHEA<<<<<<<<<<<<<<<<<<<', TODAY);
  assert.equal(m.dates_ok, true);
  assert.equal(m.dob, '1990-03-05');
  assert.equal(m.number, '010234567');
  assert.deepEqual([m.surname, m.given], ['SOK', 'SOPHEA']);
  assert.equal(parseDate('ថ្ងៃទី០៥ ខែមីនា ឆ្នាំ១៩៩០'), '1990-03-05');
  assert.equal(parseDate('05 MAR / MARS 90', TODAY), '1990-03-05');
  assert.equal(parseDate('3l.O2.2020'), null); // not a real day
  assert.equal(normHeight('158.5'), 158); // Python rounds halves to even
  assert.equal(normHeight('1.72'), 172);
  assert.equal(normNumber('010234567 (០១)'), '010234567 (01)');
  assert.equal(normSex('ស្រី'), 'F');
});
