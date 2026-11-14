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

let upd = 1000;
const say = async (chatId, text, extra = {}) => {
  await fetch(`${env.url}/api/telegram/webhook/platform`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ update_id: upd++, message: { message_id: upd, date: 0, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'T' }, text, ...extra } }),
  });
};
const press = async (chatId, data) => {
  await fetch(`${env.url}/api/telegram/webhook/platform`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ update_id: upd++, callback_query: { id: 'q' + upd, data, from: { id: chatId }, message: { message_id: 1, chat: { id: chatId } } } }),
  });
};
const lastTextTo = (chatId) => env.tg.calls.filter((c) => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chatId)).at(-1)?.payload;

async function setup(chatTenant, chatOwner) {
  const { c, state } = await landlord(env.url);
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  for (const id of await listOrgIds()) {
    await withOrg(id, () => {
      const t = db().tenants.find((x) => x.id === state.tenants[0].id);
      if (!t) return;
      t.telegram = { chatId: chatTenant };
      db().settings.telegram.adminChats = [{ chatId: chatOwner }];
      db().rooms[0].water = 100; db().rooms[0].electric = 2000;
      save();
    });
  }
  return { c, state };
}

test('tenant sends readings through the bot; owner approves with one tap', async () => {
  const { c } = await setup(71001, 72001);
  await say(71001, '📟 ផ្ញើលេខកុងទ័រ');
  assert.match(lastTextTo(71001).text, /ទឹក/);
  await say(71001, '90');
  assert.match(lastTextTo(71001).text, /ធំជាង/, 'lower than last month is refused');
  await say(71001, '១១២'); // Khmer digits
  assert.match(lastTextTo(71001).text, /ភ្លើង/);
  await say(71001, '2150');
  assert.match(lastTextTo(71001).text, /បានផ្ញើលេខកុងទ័រ/);
  const toOwner = env.tg.calls.filter((x) => String(x.payload.chat_id) === '72001').at(-1).payload;
  assert.match(toOwner.text, /លេខកុងទ័រពីអតិថិជន/);
  const approve = JSON.parse(JSON.stringify(toOwner.reply_markup)).inline_keyboard[0][0].callback_data;
  let st = await c.get('/api/state');
  assert.equal(st.meterSubmissions.length, 1);
  await press(72001, approve);
  st = await c.get('/api/state');
  assert.equal(st.meterSubmissions.length, 0);
  const m = st.meters.find((x) => x.roomId === 'A1');
  assert.deepEqual([m.oldWater, m.water, m.oldElectric, m.electric], [100, 112, 2000, 2150]);
  assert.match(lastTextTo(71001).text, /បានទទួលលេខកុងទ័រ/);
});

test('tenant sends readings from the portal; owner rejects; then auto-approval when usage looks normal', async () => {
  const { c, state } = await setup(71002, 72002);
  const portal = client(env.url);
  const tok = state.tenants[0].portalToken;
  await assert.rejects(portal.post(`/api/portal/${tok}/readings`, { water: 50, electric: 2100 }), /400/);
  let r = await portal.post(`/api/portal/${tok}/readings`, { water: 110, electric: 2100 });
  assert.equal(r.result.approved, false);
  let st = await c.get('/api/state');
  await c.post(`/api/meter-submissions/${st.meterSubmissions[0].id}/reject`, { reason: 'test' });
  assert.equal((await c.get('/api/state')).meterSubmissions.length, 0);

  // Build two months of history, then a normal month is approved automatically.
  const { listOrgIds, withOrg } = await import('../server/store.js');
  const { db, save } = await import('../server/db.js');
  for (const id of await listOrgIds()) await withOrg(id, () => {
    if (!db().tenants.some((t) => t.id === state.tenants[0].id)) return;
    db().meters.push({ id: 'h1', roomId: 'A1', month: '2026-01', oldWater: 80, water: 90, oldElectric: 1800, electric: 1900 });
    db().meters.push({ id: 'h2', roomId: 'A1', month: '2026-02', oldWater: 90, water: 100, oldElectric: 1900, electric: 2000 });
    save();
  });
  await c.put('/api/settings', { autoApproveReadings: true });
  r = await portal.post(`/api/portal/${tok}/readings`, { water: 111, electric: 2120 });
  assert.equal(r.result.approved, true);
  st = await c.get('/api/state');
  assert.ok(st.meters.some((m) => m.roomId === 'A1' && m.water === 111));
});

test('a strange jump still waits for the owner even with auto-approval on', async () => {
  const { c, state } = await setup(71003, 72003);
  await c.put('/api/settings', { autoApproveReadings: true });
  const r = await client(env.url).post(`/api/portal/${state.tenants[0].portalToken}/readings`, { water: 900, electric: 9000 });
  assert.equal(r.result.approved, false);
});
