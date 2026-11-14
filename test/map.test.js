import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot({ MAP_CACHE_MS: '0', SUPER_ADMIN_EMAILS: 'mapboss@example.com' }); });
after(async () => { await env?.close(); });

const PIN = { lat: 11.55, lng: 104.92, addressText: 'ទួលគោក ភ្នំពេញ' };

test('public map lists only opted-in, located landlords with vacant rooms, without tenant data', async () => {
  const anon = client(env.url);
  const a = await landlord(env.url, { rooms: 2 }); // A1, A2 rented
  await a.c.post('/api/rooms', { id: 'B1', rent: 120, features: ['ac'] });
  await a.c.put('/api/settings', { location: PIN, listing: { enabled: true, slug: 'map-a' } });

  // Riel landlord, located, listed.
  const b = await landlord(env.url);
  await b.c.post('/api/rooms', { id: 'R1', rent: 400000 });
  await b.c.put('/api/settings', { currency: 'KHR', location: { lat: 13.36, lng: 103.86 }, listing: { enabled: true, slug: 'map-b' } });

  // Listed but no map pin → not on the map.
  const c = await landlord(env.url);
  await c.c.post('/api/rooms', { id: 'C1', rent: 90 });
  await c.c.put('/api/settings', { listing: { enabled: true, slug: 'map-c' } });

  // Located but listing turned off → not on the map.
  const d = await landlord(env.url);
  await d.c.post('/api/rooms', { id: 'D1', rent: 90 });
  await d.c.put('/api/settings', { location: PIN });

  let { places } = await anon.get('/api/map');
  const slugs = places.map((p) => p.slug).sort();
  assert.deepEqual(slugs, ['map-a', 'map-b']);
  const pa = places.find((p) => p.slug === 'map-a');
  assert.deepEqual(pa.rooms.map((r) => r.id), ['B1'], 'rented rooms are not on the map');
  assert.deepEqual(pa.rooms[0].features, ['ac']);
  assert.equal(pa.address, 'ទួលគោក ភ្នំពេញ');
  const pb = places.find((p) => p.slug === 'map-b');
  assert.equal(pb.currency, 'KHR');
  assert.ok(pb.usdRate > 0 && pb.usdRate < 0.001, 'riel prices can be compared in dollars');
  const raw = JSON.stringify(places);
  assert.ok(!raw.includes('Tenant 1') && !raw.includes('portalToken') && !raw.includes('phone'), 'no tenant or private data');

  // Landlord hides from the map but keeps the listing page.
  await a.c.put('/api/settings', { listing: { enabled: true, slug: 'map-a', onMap: false } });
  ({ places } = await anon.get('/api/map'));
  assert.deepEqual(places.map((p) => p.slug), ['map-b']);
  assert.equal((await anon.get('/api/listing/map-a')).rooms.length, 1, 'listing page still works');

  // Last vacant room rented → landlord disappears from the map.
  await b.c.post('/api/tenants', { nameKm: 'សុខា', roomId: 'R1', status: 'active' });
  ({ places } = await anon.get('/api/map'));
  assert.deepEqual(places, []);
});
