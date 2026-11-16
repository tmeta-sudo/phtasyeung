import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, landlord, client } from './helpers.js';

let env; let secret;
before(async () => {
  env = await boot({ SUPER_ADMIN_EMAILS: 'fbboss@example.com', SUPER_ADMIN_TELEGRAM_IDS: '90909' });
  const { webhookSecret } = await import('../server/telegram.js');
  secret = webhookSecret('1:test');
});
after(async () => { await env?.close(); });

let upd = 5000;
const say = (chatId, text, extra = {}) => fetch(`${env.url}/api/telegram/webhook/platform`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
  body: JSON.stringify({ update_id: upd++, message: { message_id: upd, date: 0, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'S' }, text, ...extra } }),
});
const sentTo = (chat) => env.tg.calls.map((c, i) => ({ ...c, i })).filter((c) => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chat));

test('feedback is a conversation: super admin alerted on Telegram, replies from Telegram or web reach the owner', async () => {
  const { c, state } = await landlord(env.url);
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  for (const id of await listOrgIds()) await withOrg(id, () => { if (db().tenants.some((t) => t.id === state.tenants[0].id)) { db().settings.telegram.adminChats = [{ chatId: 81818 }]; save(); } });

  const { id } = await c.post('/api/feedback', { kind: 'issue', title: 'Invoice PNG is cut', body: 'On my phone the right side is missing' });
  const alert = sentTo(90909).at(-1);
  assert.match(alert.payload.text, /Invoice PNG is cut/);
  assert.match(alert.payload.text, /right side is missing/);
  assert.equal(alert.payload.reply_markup.force_reply, true);

  // Super admin swipe-replies on Telegram → saved in the thread, owner told on Telegram.
  const alertMsgId = alert.i + 1; // fake Telegram numbers messages by call count
  await say(90909, 'Thanks, fixed in the next update', { reply_to_message: { message_id: alertMsgId } });
  assert.match(sentTo(90909).at(-1).payload.text, /បានផ្ញើចម្លើយ/);
  assert.match(sentTo(81818).at(-1).payload.text, /fixed in the next update/);
  let mine = (await c.get('/api/feedback')).mine.find((f) => f.id === id);
  assert.equal(mine.messages.at(-1).from, 'team');
  assert.equal(mine.owner_unread, 1);

  // Owner answers back → super admin alerted again.
  await c.post(`/api/feedback/${id}/messages`, { text: 'Great, thank you!' });
  assert.match(sentTo(90909).at(-1).payload.text, /Great, thank you!/);
  await c.post(`/api/feedback/${id}/read`);
  mine = (await c.get('/api/feedback')).mine.find((f) => f.id === id);
  assert.equal(mine.owner_unread, 0);
  assert.deepEqual(mine.messages.map((m) => m.from), ['team', 'owner']);

  // Web reply from the console, with a status change.
  const { q } = await import('../server/store.js');
  await q("DELETE FROM rate_limits WHERE key LIKE 'signup:%'");
  const boss = client(env.url);
  await boss.post('/api/auth/signup', { email: 'fbboss@example.com', password: 'platform-owner-77', propertyName: 'Platform' });
  const row = (await boss.get('/api/super/feedback')).items.find((f) => f.id === id);
  assert.equal(row.team_unread, 1);
  await boss.post(`/api/super/feedback/${id}/reply`, { text: 'Released today', status: 'done' });
  assert.match(sentTo(81818).at(-1).payload.text, /Released today/);
  mine = (await c.get('/api/feedback')).mine.find((f) => f.id === id);
  assert.equal(mine.status, 'done');
  await assert.rejects(c.post('/api/super/feedback/' + id + '/reply', { text: 'x' }), /403/, 'landlords cannot answer as the team');
  await assert.rejects(boss.post(`/api/feedback/${id}/messages`, { text: 'x' }), /404/, 'only the owner of a request adds to it');
});
