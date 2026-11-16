import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env; let secret;
before(async () => {
  env = await boot();
  const { webhookSecret } = await import('../server/telegram.js');
  secret = webhookSecret('1:test');
});
after(async () => { await env?.close(); });

let upd = 9000;
const say = (chatId, text, extra = {}) => fetch(`${env.url}/api/telegram/webhook/platform`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
  body: JSON.stringify({ update_id: upd++, message: { message_id: upd, date: 0, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'Dara' }, text, ...extra } }),
});
const sentTo = (chat) => env.tg.calls.map((c, i) => ({ ...c, i })).filter((c) => (c.method === 'sendMessage' || c.method === 'sendPhoto') && String(c.payload.chat_id) === String(chat));

async function setupOwner(ownerChat) {
  const { c, state } = await landlord(env.url);
  await c.post('/api/rooms', { id: 'V1', rent: 90 });
  await c.put('/api/settings', { listing: { enabled: true, slug: `rooms-${ownerChat}` } });
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  for (const id of await listOrgIds()) await withOrg(id, () => { if (db().tenants.some((t) => t.id === state.tenants[0].id)) { db().settings.telegram.adminChats = [{ chatId: ownerChat }]; save(); } });
  return c;
}

test('someone asking about a room chats on a temporary page; the owner replies; either side ends it', async () => {
  const c = await setupOwner(61001);
  const anon = client(env.url);
  const r = await anon.post('/api/listing/rooms-61001/inquiry', { name: 'ដារ៉ា', phone: '012 345 678', roomId: 'V1', message: 'Is there parking?' });
  assert.ok(r.chat?.length >= 16);
  assert.match(r.telegram, /^https:\/\/t\.me\/TestBot\?start=q-/);
  assert.match(sentTo(61001).at(-1).payload.text, /parking/, 'owner told on Telegram');

  let page = await anon.get(`/api/q/${r.chat}`);
  assert.equal(page.messages.length, 1);
  assert.ok(!JSON.stringify(page).includes('012'), 'the chat page does not repeat the phone number');
  page = await anon.post(`/api/q/${r.chat}`, { text: 'Also, is water included?' });
  assert.equal(page.messages.length, 2);

  // Owner answers from the Inbox → visible on the chat page.
  let st = await c.get('/api/state');
  const t = st.tickets.find((x) => x.kind === 'inquiry');
  await c.post(`/api/tickets/${t.id}/reply`, { text: 'Yes, free motorbike parking' });
  page = await anon.get(`/api/q/${r.chat}`);
  assert.equal(page.messages.at(-1).from, 'owner');
  assert.equal(page.messages.at(-1).text, 'Yes, free motorbike parking');

  // The asker ends the conversation; the owner can no longer reply; the link stops working after cleanup.
  page = await anon.post(`/api/q/${r.chat}`, { done: true });
  assert.equal(page.status, 'done');
  await assert.rejects(c.post(`/api/tickets/${t.id}/reply`, { text: 'more' }), /បញ្ចប់|400/);
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  const { cleanupInquiries } = await import('../server/scheduler.js');
  for (const id of await listOrgIds()) await withOrg(id, () => { if (db().tickets.some((x) => x.id === t.id)) { assert.equal(cleanupInquiries(Date.now()), 0, 'kept for a week'); assert.equal(cleanupInquiries(Date.now() + 8 * 86400000), 1); save(); } });
  st = await c.get('/api/state');
  assert.ok(!st.tickets.some((x) => x.id === t.id), 'deleted');
  await assert.rejects(anon.get(`/api/q/${r.chat}`), /404/);
});

test('the asker can move the chat to Telegram; messages and replies flow both ways; owner closes it', async () => {
  const c = await setupOwner(61002);
  const anon = client(env.url);
  const r = await anon.post('/api/listing/rooms-61002/inquiry', { name: 'Sophea', phone: '098 765 432', message: 'Hello' });
  await say(62002, `/start q-${r.chat}`);
  assert.match(sentTo(62002).at(-1).payload.text, /ជជែកជាមួយ/);
  await say(62002, 'Can I visit tomorrow?');
  const fwd = sentTo(61002).at(-1);
  assert.match(fwd.payload.text, /visit tomorrow/, 'owner gets the Telegram message');

  // Owner swipe-replies on Telegram → the asker gets it on Telegram.
  await say(61002, 'Yes, at 5 pm', { reply_to_message: { message_id: fwd.i + 1 } });
  assert.match(sentTo(62002).at(-1).payload.text, /5 pm/);
  const page = await anon.get(`/api/q/${r.chat}`);
  assert.equal(page.telegram, true);
  assert.equal(page.messages.at(-1).text, 'Yes, at 5 pm');

  // Owner closes the conversation from the Inbox → the asker is told, and later messages are not taken.
  const st = await c.get('/api/state');
  const t = st.tickets.find((x) => x.kind === 'inquiry');
  await c.put(`/api/tickets/${t.id}`, { status: 'done' });
  assert.match(sentTo(62002).at(-1).payload.text, /បានបញ្ចប់/);
  const before = (await c.get('/api/state')).tickets.find((x) => x.id === t.id).messages.length;
  await say(62002, 'one more thing');
  assert.equal((await c.get('/api/state')).tickets.find((x) => x.id === t.id).messages.length, before);
});
