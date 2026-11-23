// ID scanner accuracy: only field names and outcomes are counted, never values.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot({ SUPER_ADMIN_EMAILS: 'boss-ocr@example.com' }); });
after(async () => { await env?.close(); });

test('counts outcomes per field, ignores anything else, and only the platform admin can read them', async () => {
  const { c } = await landlord(env.url);
  let r = await c.post('/api/ocr-stats', { source: 'kyc', outcomes: { nameKm: 'ok', idNumber: 'fixed', dob: 'ok', idExpiry: 'missed', evil: 'ok', nameEn: 'SOK SOPHEA' } });
  assert.equal(r.counted, 4);
  await c.post('/api/ocr-stats', { source: 'kyc', outcomes: { nameKm: 'ok', idNumber: 'ok' } });
  await c.post('/api/ocr-stats', { source: 'regex', outcomes: { nameKm: 'fixed' } });
  await assert.rejects(client(env.url).post('/api/ocr-stats', { outcomes: { nameKm: 'ok' } }), /401/);
  await assert.rejects(c.get('/api/super/ocr'), /403/);

  const boss = client(env.url);
  await boss.post('/api/auth/signup', { email: 'boss-ocr@example.com', password: 'lotus-river-2026', propertyName: 'Platform' });
  r = await boss.get('/api/super/ocr');
  const n = (source, field, outcome) => r.rows.find((x) => x.source === source && x.field === field && x.outcome === outcome)?.n || 0;
  assert.equal(n('kyc', 'nameKm', 'ok'), 2);
  assert.equal(n('kyc', 'idNumber', 'fixed'), 1);
  assert.equal(n('kyc', 'idNumber', 'ok'), 1);
  assert.equal(n('kyc', 'idExpiry', 'missed'), 1);
  assert.equal(n('regex', 'nameKm', 'fixed'), 1);
  assert.ok(!JSON.stringify(r).includes('SOPHEA'));
  assert.ok(r.rows.every((x) => x.field !== 'evil'));
});

test('scan outcomes compare what was offered with what was saved', async () => {
  const { scanOutcomes } = await import('../src/ocr/scanStats.js');
  const out = scanOutcomes(
    { nameKm: 'សុខ សុភា', nameEn: 'SOK SOPHEA', idNumber: '010234567', dob: '1990-03-05', addressDetail: 'ភូមិ៣' },
    { nameKm: 'សុខ  សុភា', nameEn: 'sok sophea', idNumber: '010234561', dob: '', gender: 'female', address: { detail: 'ភូមិ៣' } },
  );
  assert.deepEqual(out, { nameKm: 'ok', nameEn: 'ok', idNumber: 'fixed', gender: 'missed', dob: 'rejected', addressDetail: 'ok' });
});
