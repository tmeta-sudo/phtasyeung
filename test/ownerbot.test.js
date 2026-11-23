// Owner quick answers in Telegram: /income, /expiring, /repairs, /room.
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

let upd = 5000;
const say = async (chatId, text) => fetch(`${env.url}/api/telegram/webhook/platform`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
  body: JSON.stringify({ update_id: upd++, message: { message_id: upd, date: 0, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'O' }, text } }),
});
const lastTo = (chatId) => env.tg.calls.filter((c) => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chatId)).at(-1)?.payload.text || '';

test('owner asks the bot for income, expiring contracts, open repairs and one room', async () => {
  const OWNER = 83001;
  const { c, state } = await landlord(env.url);
  const t = state.tenants[0];
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  const { nowInCambodia } = await import('../shared/khmer.js');
  const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  for (const id of await listOrgIds()) {
    await withOrg(id, () => {
      const x = db().tenants.find((y) => y.id === t.id);
      if (!x) return;
      db().settings.telegram.adminChats = [{ chatId: OWNER }];
      x.contract = { ...(x.contract || {}), start: '2025-01-01', end: soon };
      x.phone = '012 345 678';
      save();
    });
  }
  const inv = (await c.post('/api/invoices/generate', {})).invoices[0];
  await c.post(`/api/invoices/${inv.id}/payments`, { amount: 50 });
  await c.post('/api/expenses', { date: nowInCambodia().ymd, category: 'repair', amount: 20, note: '' });
  await client(env.url).post(`/api/portal/${t.portalToken}/tickets`, { kind: 'maintenance', text: 'Water leaking under the sink' });

  await say(OWNER, '/income');
  let text = lastTo(OWNER);
  assert.match(text, /បានប្រមូល: <b>\$50\.00/);
  assert.match(text, /ចំណាយ: \$20\.00/);
  assert.match(text, /ចំណេញ: <b>\$30\.00/);

  await say(OWNER, '📅 ជិតផុតកំណត់');
  text = lastTo(OWNER);
  assert.match(text, /កិច្ចសន្យាជិតផុត/);
  assert.match(text, /A1/);

  await say(OWNER, '/repairs');
  assert.match(lastTo(OWNER), /Water leaking under the sink/);

  await say(OWNER, '/room a1');
  text = lastTo(OWNER);
  assert.match(text, /បន្ទប់ A1/);
  assert.match(text, /ជំពាក់ \$51\.00/);
  assert.match(text, /012 345 678/);

  await say(OWNER, '/room Z9');
  assert.match(lastTo(OWNER), /រកមិនឃើញបន្ទប់ Z9/);

  // a tenant cannot use owner commands
  await say(99001, '/income');
  assert.doesNotMatch(lastTo(99001), /បានប្រមូល/);
});
