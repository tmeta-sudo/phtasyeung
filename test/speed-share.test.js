import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { boot, landlord, client } from './helpers.js';
import { encodingFor } from '../server/fastjson.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('state is compressed, and an unchanged background refresh is a body-less 304', async () => {
  const { c } = await landlord(env.url, { rooms: 3 });
  const first = await c.raw('/api/state', { headers: { 'accept-encoding': 'br' } });
  assert.equal(first.headers.get('content-encoding'), 'br');
  const tag = first.headers.get('etag');
  assert.match(tag, /^"[\w-]{20,}"$/);
  assert.ok((await first.json()).rooms.length === 3, 'decodes to the normal state');
  const again = await c.raw('/api/state', { headers: { 'if-none-match': tag } });
  assert.equal(again.status, 304);
  assert.equal((await again.arrayBuffer()).byteLength, 0);
  // Any change gives a new fingerprint and the full state again.
  await c.post('/api/rooms', { id: 'Z9', rent: 50 });
  const changed = await c.raw('/api/state', { headers: { 'if-none-match': tag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('etag'), tag);
});

test('the state fingerprint does not change by the minute', async () => {
  const { c } = await landlord(env.url);
  const st = await c.get('/api/state');
  assert.equal(st.today.minute, undefined);
  assert.equal(typeof st.today.hour, 'number');
});

test('encoding negotiation respects q=0 and prefers brotli', () => {
  assert.equal(encodingFor('gzip, deflate, br'), 'br');
  assert.equal(encodingFor('br;q=0, gzip'), 'gzip');
  assert.equal(encodingFor('identity'), '');
  assert.equal(encodingFor(''), '');
  assert.ok(zlib.brotliDecompressSync); // the runtime has brotli
});

test('a shared listing link shows the house, its vacant rooms and price; unknown links are 404', async () => {
  const { c } = await landlord(env.url, { rooms: 1 });
  await c.post('/api/rooms', { id: 'B1', rent: 85, features: ['ac', 'wifi'] });
  await c.post('/api/rooms', { id: 'B2', rent: 120 });
  await c.put('/api/settings', { propertyName: 'Lotus <House>', listing: { enabled: true, slug: 'lotus-house', intro: 'Near the market' }, location: { lat: 11.56, lng: 104.92, addressText: 'Toul Kork' } });
  const res = await fetch(`${env.url}/v/lotus-house`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>Lotus &lt;House&gt; · បន្ទប់ទំនេរ 2 · ចាប់ពី \$85\/ខែ<\/title>/, 'escaped name, count and lowest price');
  assert.match(html, /property="og:description" content="📍 Toul Kork — ❄️ [^"]*Near the market"/);
  assert.match(html, /rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/v\/lotus-house"/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1, 'the generic preview is replaced, not duplicated');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.deepEqual([ld['@type'], ld.offers.lowPrice, ld.offers.highPrice, ld.offers.offerCount], ['Residence', 85, 120, 2]);
  assert.ok(html.includes('id="root"'), 'still the app');

  const missing = await fetch(`${env.url}/v/no-such-house`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /រកមិនឃើញ/);
});

test('sitemap lists public listings only; robots.txt keeps private pages out', async () => {
  const { c } = await landlord(env.url);
  await c.put('/api/settings', { listing: { enabled: true, slug: 'sitemap-house' } });
  const { c: hidden } = await landlord(env.url);
  await hidden.put('/api/settings', { listing: { enabled: false, slug: 'private-house' } });
  const xml = await (await fetch(`${env.url}/sitemap.xml`)).text();
  assert.match(xml, /<loc>http:\/\/127\.0\.0\.1:\d+\/v\/sitemap-house<\/loc>/);
  assert.match(xml, /\/map<\/loc>/);
  assert.ok(!xml.includes('private-house'));
  const robots = await (await fetch(`${env.url}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/p\//);
  assert.match(robots, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
  const anon = client(env.url);
  const map = await anon.raw('/map');
  assert.match(await map.text(), /<title>[^<]*ផែនទី/);
});
