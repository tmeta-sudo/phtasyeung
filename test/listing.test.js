import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env;
before(async () => { env = await boot(); });
after(async () => { await env?.close(); });

test('public listing shows only vacant rooms, takes inquiries into the Inbox, and can be turned off', async () => {
  const { c } = await landlord(env.url, { rooms: 2 }); // A1, A2 rented
  await c.post('/api/rooms', { id: 'B1', rent: 150, features: ['ac', 'hotwater'] });
  await assert.rejects(c.put('/api/settings', { listing: { enabled: true, slug: 'ab' } }), /400/, 'slug too short');
  await c.put('/api/settings', { listing: { enabled: true, slug: 'Sokha Rooms!', intro: 'ជិតផ្សារ' } });
  const st = await c.get('/api/state');
  assert.equal(st.settings.listing.slug, 'sokha-rooms');
  const anon = client(env.url);
  const page = await anon.get('/api/listing/sokha-rooms');
  assert.deepEqual(page.rooms.map((r) => r.id), ['B1']);
  assert.deepEqual(page.rooms[0].features, ['ac', 'hotwater']);
  assert.equal(page.intro, 'ជិតផ្សារ');
  assert.ok(!JSON.stringify(page).includes('portalToken') && !JSON.stringify(page).includes('Tenant 1'), 'no tenant data on the public page');

  // Another landlord cannot take the same link.
  const other = await landlord(env.url);
  await assert.rejects(other.c.put('/api/settings', { listing: { enabled: true, slug: 'sokha-rooms' } }), /400/);

  await assert.rejects(anon.post('/api/listing/sokha-rooms/inquiry', { name: 'Dara', phone: '12' }), /400/);
  await anon.post('/api/listing/sokha-rooms/inquiry', { name: 'bot', phone: '012345678', website: 'spam.example' });
  await anon.post('/api/listing/sokha-rooms/inquiry', { name: 'ដារ៉ា', phone: '012 345 678', roomId: 'B1', message: 'ចង់មើលបន្ទប់' });
  const inbox = (await c.get('/api/state')).tickets.filter((t) => t.kind === 'inquiry');
  assert.equal(inbox.length, 1, 'honeypot request ignored');
  assert.equal(inbox[0].roomId, 'B1');
  assert.match(inbox[0].messages[0].text, /012/);

  await c.put('/api/settings', { listing: { enabled: false } });
  await assert.rejects(anon.get('/api/listing/sokha-rooms'), /404/);
});
