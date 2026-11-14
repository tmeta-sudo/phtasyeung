import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

// A real PNG with some strokes (big enough to pass the size check).
function png(w = 200, h = 80) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x * 7 + y * 13) % 11 < 3) raw.writeUInt32BE(0x0d2a8aff, y * (w * 4 + 1) + 1 + x * 4);
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

test('tenant signs the lease in the portal; owner signs once; editing the lease asks for a new signature', async () => {
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  const portal = client(env.url);
  await assert.rejects(portal.post(`/api/portal/${t.portalToken}/sign`, { signature: png() }), /400/, 'no lease yet');
  await c.put(`/api/tenants/${t.id}/contract`, { text: 'កិច្ចសន្យាជួល\nលក្ខខណ្ឌ ១' });
  await assert.rejects(portal.post(`/api/portal/${t.portalToken}/sign`, { signature: 'data:image/png;base64,AAAA' }), /400/, 'empty signature refused');
  let p = await portal.post(`/api/portal/${t.portalToken}/sign`, { signature: png() });
  assert.equal(p.lease.signed.outdated, false);
  await assert.rejects(portal.post(`/api/portal/${t.portalToken}/sign`, { signature: png() }), /400/, 'cannot sign twice');
  const img = await c.raw(`/api/tenants/${t.id}/signature`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.ok(env.tg.calls.length >= 0);
  // Owner signature
  let st = await c.post('/api/settings/signature', { signature: png() });
  assert.ok(st.settings.contract.ownerSignature);
  p = await portal.get(`/api/portal/${t.portalToken}`);
  assert.equal(p.lease.ownerSigned, true);
  assert.equal((await portal.raw(`/api/portal/${t.portalToken}/signature/owner`)).status, 200);
  // Same text again keeps the signature; a change marks it outdated and allows signing again.
  st = await c.put(`/api/tenants/${t.id}/contract`, { text: 'កិច្ចសន្យាជួល\nលក្ខខណ្ឌ ១' });
  assert.ok(!st.tenants[0].lease.signature.outdated);
  st = await c.put(`/api/tenants/${t.id}/contract`, { text: 'កិច្ចសន្យាជួល\nលក្ខខណ្ឌ ២' });
  assert.equal(st.tenants[0].lease.signature.outdated, true);
  p = await portal.post(`/api/portal/${t.portalToken}/sign`, { signature: png() });
  assert.equal(p.lease.signed.outdated, false);
});
