import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIdCard } from '../src/ocr/idcard.js';
import { kmDigits, asciiDigits, usd, toRiel, monthKm } from '../shared/khmer.js';

const ck = (s) => { const w = [7, 3, 1]; let t = 0; for (let i = 0; i < s.length; i++) { const ch = s[i]; t += (ch === '<' ? 0 : /\d/.test(ch) ? +ch : ch.charCodeAt(0) - 55) * w[i % 3]; } return String(t % 10); };

test('Khmer digits round-trip and keep punctuation', () => {
  assert.equal(kmDigits('15.02.1990'), '១៥.០២.១៩៩០');
  assert.equal(asciiDigits('១៥.០២.១៩៩០'), '15.02.1990');
  assert.equal(usd(1250.5), '$1,250.50');
  assert.equal(toRiel(10, 4100), 41000);
  assert.match(monthKm('2026-11'), /វិច្ឆិកា/);
});

test('ID card: MRZ on the back gives verified fields', () => {
  const l1 = ('IDKHM' + '010203040' + ck('010203040')).padEnd(30, '<');
  const l2 = ('900215' + ck('900215') + 'F' + '310214' + ck('310214') + 'KHM').padEnd(29, '<') + '0';
  const l3 = 'SOK<<SREYNEANG'.padEnd(30, '<');
  const r = parseIdCard([], [{ text: l1 }, { text: l2 }, { text: l3 }]);
  assert.equal(r.fields.idNumber, '010203040');
  assert.equal(r.fields.dob, '1990-02-15');
  assert.equal(r.fields.gender, 'female');
  assert.equal(r.fields.idExpiry, '2031-02-14');
  assert.equal(r.fields.nameEn, 'SOK SREYNEANG');
});

test('ID card: Khmer front lines and empty OCR lines do not crash', () => {
  const r = parseIdCard([
    { text: '' }, { text: 'អត្តលេខ ០១០២០៣០៤០' }, { text: 'គោត្តនាម និងនាម៖ សុខ ស្រីនាង' }, { text: 'ថ្ងៃខែឆ្នាំកំណើត៖ ១៥.០២.១៩៩០' }, { text: 'ភេទ៖ ស្រី' },
  ], [{ text: '' }]);
  assert.equal(r.fields.idNumber, '010203040');
  assert.equal(r.fields.nameKm, 'សុខ ស្រីនាង');
  assert.equal(r.fields.dob, '1990-02-15');
  assert.equal(r.fields.gender, 'female');
});
