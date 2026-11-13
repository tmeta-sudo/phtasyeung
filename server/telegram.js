// Telegram bots for every landlord.
//  • Platform bot (TELEGRAM_BOT_TOKEN): shared by all landlords — nothing to set up.
//  • Own bot (optional): a landlord pastes a @BotFather token to use their own name.
// Production (Vercel) receives updates by webhook; local dev uses long polling.
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { db, save, uid, now, logEvent, orgId } from './db.js';
import { withOrg, findOrgs, q, listOrgIds } from './store.js';
import { invoiceTelegramHtml, khqrOf, markPaid, roomOf, isOverdue, generateInvoices } from './invoices.js';
import { usd, khr, monthKm, kmDigits, nowInCambodia, dateKm } from '../shared/khmer.js';
import { botLoginStart, botLoginCallback, botRecover, linkTelegramToOrgOwners } from './tglogin.js';

const API = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const PLATFORM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// Accept the username with or without a leading @ (t.me links must not contain it).
let platformUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@+/, '').replace(/^https?:\/\/t\.me\//i, '');
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const appUrl = () => {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return u.replace(/\/+$/, '');
};
export const webhookSecret = (token) => crypto.createHash('sha256').update('tg-webhook:' + token).digest('hex');

// ---------- per-org bot identity ----------

const ownToken = (doc) => doc.settings.telegram.token || '';
export const botKeyOf = (doc) => (ownToken(doc) ? doc.id : 'platform');
const tokenOf = (doc) => ownToken(doc) || PLATFORM_TOKEN;

export async function api(token, method, payload) {
  const isForm = payload instanceof FormData;
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'content-type': 'application/json' },
    body: isForm ? payload : JSON.stringify(payload || {}),
  });
  const json = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!json.ok) throw Object.assign(new Error(json.description || 'Telegram error'), { code: json.error_code });
  return json.result;
}
const call = (method, payload) => api(tokenOf(db()), method, payload);

/**
 * The shared bot's username. The value from TELEGRAM_BOT_USERNAME is checked once
 * against Telegram (getMe), because a wrong value silently breaks every t.me link.
 */
let usernameVerified = false;
export async function platformBotName() {
  if (usernameVerified || !PLATFORM_TOKEN) return platformUsername;
  try {
    const real = (await api(PLATFORM_TOKEN, 'getMe')).username;
    if (platformUsername && platformUsername.toLowerCase() !== real.toLowerCase()) {
      console.warn(`[telegram] TELEGRAM_BOT_USERNAME is "${platformUsername}" but the token belongs to @${real}; using @${real}`);
    }
    platformUsername = real;
    usernameVerified = true;
  } catch { /* offline: fall back to the configured value */ }
  return platformUsername;
}

/** Bot username for the current org (own bot or the shared platform bot). */
export async function botUsername() {
  const doc = db();
  return ownToken(doc) ? doc.settings.telegram.username : platformBotName();
}

export async function botStatus() {
  const doc = db();
  const own = !!ownToken(doc);
  const username = await botUsername();
  return {
    own,
    platformAvailable: !!PLATFORM_TOKEN,
    configured: !!tokenOf(doc),
    running: !!tokenOf(doc) && !!username && !doc.settings.telegram.error,
    username,
    error: doc.settings.telegram.error || '',
  };
}

/** Validate a landlord's own token, cache the username and register the webhook. */
export async function configureOwnBot() {
  const doc = db();
  const t = doc.settings.telegram;
  t.username = '';
  t.error = '';
  if (!t.token) { save(); return; }
  try {
    const me = await api(t.token, 'getMe');
    t.username = me.username;
    await registerBot(t.token, doc.id);
  } catch (e) {
    t.error = e.message;
  }
  save();
}

/** Point a bot at our webhook (production) and publish the Khmer command menu. */
export async function registerBot(token, botKey) {
  const base = appUrl();
  if (base.startsWith('https://')) {
    await api(token, 'setWebhook', {
      url: `${base}/api/telegram/webhook/${botKey}`,
      secret_token: webhookSecret(token),
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
  }
  await api(token, 'setMyCommands', {
    commands: [
      { command: 'invoice', description: 'មើលវិក្កយបត្រ' },
      { command: 'profile', description: 'ព័ត៌មានរបស់ខ្ញុំ' },
      { command: 'repair', description: 'រាយការណ៍ជួសជុល' },
      { command: 'message', description: 'ផ្ញើសារម្ចាស់ផ្ទះ' },
      { command: 'location', description: 'ទីតាំងផ្ទះ' },
      { command: 'contract', description: 'កិច្ចសន្យាជួល' },
      { command: 'recover', description: 'ចូល / ស្តារគណនីម្ចាស់ផ្ទះ' },
      { command: 'help', description: 'ជំនួយ' },
    ],
  }).catch(() => {});
}

// ---------- helpers ----------

const tenantByChat = (chatId) => db().tenants.find((t) => t.telegram?.chatId === chatId);
const isAdminChat = (chatId) => db().settings.telegram.adminChats.some((c) => c.chatId === chatId);
const latestInvoices = (tenant) => db().invoices
  .filter((i) => i.tenantId === tenant.id)
  .sort((a, b) => b.month.localeCompare(a.month) || b.createdAt.localeCompare(a.createdAt));

export function portalUrl(tenant) {
  const base = (db().settings.publicUrl || appUrl()).replace(/\/+$/, '');
  return base ? `${base}/p/${tenant.portalToken}` : '';
}

const MENU = {
  keyboard: [
    [{ text: '🧾 វិក្កយបត្រ' }, { text: '🔧 រាយការណ៍ជួសជុល' }],
    [{ text: '💬 ផ្ញើសារម្ចាស់ផ្ទះ' }, { text: '📍 ទីតាំង' }],
    [{ text: '📄 កិច្ចសន្យា' }, { text: '👤 ព័ត៌មានរបស់ខ្ញុំ' }],
  ],
  resize_keyboard: true,
};
const ADMIN_MENU = { keyboard: [[{ text: '📊 សង្ខេបខែនេះ' }, { text: '⏳ មិនទាន់បង់' }], [{ text: '🔑 ចូលគណនី' }, { text: '❓ ជំនួយ' }]], resize_keyboard: true };

export const send = (chatId, html, extra = {}) =>
  call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

const propertyTag = () => `🏠 <b>${esc(db().settings.propertyName)}</b>\n`;

export async function notifyAdmins(html, extra = {}) {
  if (!tokenOf(db())) return 0;
  let n = 0;
  for (const c of db().settings.telegram.adminChats) {
    await send(c.chatId, html, extra).then(() => { n += 1; }).catch((e) => console.error('[telegram] admin notify failed', e.message));
  }
  return n;
}

const cb = (action, inv) => `${action}:${orgId()}:${inv.id}`;

function invoiceButtons(inv, tenant) {
  const rows = [];
  if (inv.status === 'unpaid') rows.push([{ text: '✅ ខ្ញុំបានបង់ប្រាក់', callback_data: cb('p', inv) }]);
  const url = tenant && portalUrl(tenant);
  if (url && url.startsWith('https://')) rows.push([{ text: '🔗 បើកគណនីរបស់ខ្ញុំ', url }]);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

/** Send one invoice (with its KHQR) to the tenant's Telegram. */
export async function sendInvoice(inv, { reminder = false, image = null } = {}) {
  const tenant = db().tenants.find((t) => t.id === inv.tenantId);
  if (!tokenOf(db())) return { ok: false, error: 'Telegram bot មិនទាន់ដំណើរការ' };
  if (!tenant?.telegram?.chatId) return { ok: false, error: 'អតិថិជនមិនទាន់ភ្ជាប់ Telegram' };
  const qr = khqrOf(inv);
  const caption = invoiceTelegramHtml(inv, { reminder, hasQr: !!qr });
  const reply_markup = invoiceButtons(inv, tenant);
  try {
    let msg;
    if (qr || image) {
      // A designed invoice picture from the web app, or just the KHQR code.
      const png = image || await QRCode.toBuffer(qr, { width: 640, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#0b1220' } });
      const form = new FormData();
      form.set('chat_id', String(tenant.telegram.chatId));
      form.set('caption', caption);
      form.set('parse_mode', 'HTML');
      if (reply_markup) form.set('reply_markup', JSON.stringify(reply_markup));
      form.set('photo', new Blob([png], { type: 'image/png' }), `${inv.number}.png`);
      msg = await call('sendPhoto', form);
    } else {
      msg = await send(tenant.telegram.chatId, caption, reply_markup ? { reply_markup } : {});
    }
    if (reminder) inv.reminders.push(now());
    else inv.sentAt = now();
    inv.sendError = '';
    inv.telegramMessageId = msg.message_id;
    if (tenant.telegram.blocked) tenant.telegram.blocked = false;
    save();
    return { ok: true };
  } catch (e) {
    inv.sendError = e.message;
    if (e.code === 403) tenant.telegram = { ...tenant.telegram, blocked: true };
    save();
    return { ok: false, error: e.message };
  }
}

export async function sendInvoices(invoices, opts) {
  let ok = 0;
  const errors = [];
  for (const inv of invoices) {
    const r = await sendInvoice(inv, opts);
    if (r.ok) ok += 1; else errors.push(`${inv.roomId}: ${r.error}`);
    await new Promise((res) => setTimeout(res, 40)); // stay under Telegram's 30 msg/s limit
  }
  return { ok, failed: errors.length, errors };
}

export async function notifyTenant(tenant, html) {
  if (!tokenOf(db()) || !tenant?.telegram?.chatId) return;
  await send(tenant.telegram.chatId, html).catch(() => {});
}

/** Deliver a password-reset code to the owner's linked Telegram chats. */
export async function sendResetCode(org, code) {
  return withOrg(org, async () => (await notifyAdmins(`🔑 លេខកូដប្តូរពាក្យសម្ងាត់ <b>${esc(db().settings.propertyName)}</b>:\n\n<code>${code}</code>\n\nមានសុពលភាព ១៥ នាទី។ បើអ្នកមិនបានស្នើ សូមមិនអើពើ។`)) > 0);
}

// ---------- payment claims ----------

export async function claimPayment(inv, source, proof) {
  if (inv.status === 'paid') return;
  inv.status = 'claimed';
  inv.claims.push({ id: uid(), at: now(), source, ...(proof || {}) });
  save();
  logEvent('tenant', `${inv.name} (${inv.roomId}) បានជូនដំណឹងថាបានបង់ ${usd(inv.total)}`, { invoiceId: inv.id });
  const html = `💸 <b>ការជូនដំណឹងការបង់ប្រាក់</b>\n${propertyTag()}🚪 ${esc(inv.roomId)} · ${esc(inv.name)}\n🧾 ${esc(inv.number)} · ${esc(monthKm(inv.month))}\n💰 <b>${usd(inv.total)}</b> (${khr(inv.totalKhr)})\nតាមរយៈ: ${source === 'portal' ? 'គេហទំព័រអតិថិជន' : 'Telegram'}`;
  const reply_markup = { inline_keyboard: [[{ text: '✅ បញ្ជាក់ថាបានទទួល', callback_data: cb('ok', inv) }, { text: '❌ មិនទាន់ទទួល', callback_data: cb('no', inv) }]] };
  if (proof?.telegramFileId) {
    for (const c of db().settings.telegram.adminChats) {
      await call('sendPhoto', { chat_id: c.chatId, photo: proof.telegramFileId, caption: html, parse_mode: 'HTML', reply_markup }).catch(() => {});
    }
  } else {
    await notifyAdmins(html, { reply_markup });
  }
}

export async function confirmPayment(inv, via = 'admin') {
  markPaid(inv, via);
  logEvent('admin', `បានបញ្ជាក់ការបង់ប្រាក់ ${inv.roomId} ${usd(inv.total)}`, { invoiceId: inv.id });
  const tenant = db().tenants.find((t) => t.id === inv.tenantId);
  await notifyTenant(tenant, `✅ <b>បានទទួលការបង់ប្រាក់</b>\n${propertyTag()}🧾 ${esc(inv.number)} · ${esc(monthKm(inv.month))}\n💰 ${usd(inv.total)}\nសូមអរគុណច្រើន! 🙏`);
}

export async function rejectClaim(inv) {
  if (inv.status !== 'claimed') return;
  inv.status = 'unpaid';
  save();
  logEvent('admin', `បានបដិសេធការជូនដំណឹងបង់ប្រាក់ ${inv.roomId}`, { invoiceId: inv.id });
  const tenant = db().tenants.find((t) => t.id === inv.tenantId);
  await notifyTenant(tenant, `⚠️ ${propertyTag()}ម្ចាស់ផ្ទះមិនទាន់ទទួលបានការបង់ប្រាក់សម្រាប់ ${esc(inv.number)} ទេ។ សូមពិនិត្យម្តងទៀត ឬទាក់ទងម្ចាស់ផ្ទះ។`);
}

// ---------- update handling ----------

function profileHtml(t) {
  const room = roomOf(t);
  const lines = [
    '👤 <b>ព័ត៌មានរបស់ខ្ញុំ</b>',
    propertyTag().trim(),
    `ឈ្មោះ: <b>${esc(t.nameKm)}</b>${t.nameEn ? ` (${esc(t.nameEn)})` : ''}`,
    `ទូរស័ព្ទ: ${esc(t.phone || '—')}`,
    `បន្ទប់: <b>${esc(t.roomId || '—')}</b>${room ? ` · ${usd(room.rent)}/ខែ` : ''}`,
    `កិច្ចសន្យា: ${esc(dateKm(t.contract?.start) || '—')} ដល់ ${esc(dateKm(t.contract?.end) || '—')}`,
    `អត្តសញ្ញាណប័ណ្ណ: ${t.files?.idFront ? '✅ បានផ្ញើ' : '⚠️ មិនទាន់ផ្ញើ'}`,
  ];
  const url = portalUrl(t);
  if (url) lines.push('', `🔗 គ្រប់គ្រងព័ត៌មាន៖ ${esc(url)}`);
  return lines.join('\n');
}

const HELP = [
  '❓ <b>ជំនួយ</b>',
  '🧾 វិក្កយបត្រ — មើលវិក្កយបត្រ និង KHQR',
  '🔧 រាយការណ៍ជួសជុល — ប្រាប់ម្ចាស់ផ្ទះពីបញ្ហា (អាចផ្ញើរូបបាន)',
  '💬 ផ្ញើសារម្ចាស់ផ្ទះ — សួរ ឬប្រាប់អ្វីមួយ',
  '📍 ទីតាំង — ផែនទី និងអាសយដ្ឋានផ្ទះ',
  '📄 កិច្ចសន្យា — មើលកិច្ចសន្យាជួល',
  '📷 ផ្ញើរូបបង្កាន់ដៃបង់ប្រាក់ ដើម្បីជូនដំណឹងម្ចាស់ផ្ទះ',
].join('\n');

/** Orgs on this bot that know this chat. */
async function orgsForChat(botKey, chatId) {
  return findOrgs(`chat:${botKey}`, String(chatId));
}

/** Entry point for both webhook and polling. */
export async function handleUpdate(botKey, token, u) {
  // Account sign-in / recovery lives on the shared platform bot.
  if (botKey === 'platform' && u.callback_query?.data?.startsWith('L:')) return botLoginCallback(u.callback_query);
  if (u.callback_query) return handleCallback(botKey, token, u.callback_query);
  const m = u.message;
  if (!m || m.chat?.type !== 'private') return;
  const chatId = m.chat.id;
  const text = (m.text || '').trim();
  if (botKey === 'platform') {
    const login = text.match(/^(?:\/start\s+)?login-([\w-]{16,})$/);
    if (login) return botLoginStart(m, login[1]);
    if (['/recover', '/login', '🔑 ចូលគណនី'].includes(text)) return botRecover(m);
  }
  const reply = (html, extra) => api(token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', ...extra }).catch(() => {});

  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1] || '';
    if (payload.startsWith('admin-')) {
      const [org] = await findOrgs('admin-link', payload.slice(6));
      if (org) return withOrg(org, () => linkAdmin(botKey, m));
    } else if (payload) {
      const [org] = await findOrgs('link', payload);
      if (org) return withOrg(org, () => linkTenant(botKey, m, payload));
    }
    const orgs = await orgsForChat(botKey, chatId);
    if (!orgs.length) return reply('👋 សួស្តី! សូមស្កេន QR Code ដែលម្ចាស់ផ្ទះផ្តល់ឱ្យ ដើម្បីភ្ជាប់គណនីរបស់អ្នក។');
    return withOrg(orgs[0], () => {
      if (isAdminChat(chatId)) return send(chatId, `🔐 សួស្តី ម្ចាស់ផ្ទះ ${esc(db().settings.propertyName)}!`, { reply_markup: ADMIN_MENU });
      return send(chatId, `🙏 សួស្តី ${esc(tenantByChat(chatId)?.nameKm || '')}!`, { reply_markup: MENU });
    });
  }

  const orgs = await orgsForChat(botKey, chatId);
  if (!orgs.length) return reply('សូមស្កេន QR Code ពីម្ចាស់ផ្ទះ ដើម្បីភ្ជាប់គណនីរបស់អ្នកជាមុនសិន។');
  // One person can rent from — or own — several places on the shared bot; answer for each.
  let photoHandled = false;
  for (const org of orgs) {
    await withOrg(org, async () => {
      if (botKeyOf(db()) !== botKey) return;
      const admin = isAdminChat(chatId);
      const tenant = tenantByChat(chatId);
      if (admin && m.reply_to_message && await handleOwnerReply(chatId, m)) return;
      if (admin && await handleAdminText(chatId, text)) return;
      if (!tenant) {
        if (admin) await send(chatId, '📊 /summary · ⏳ /unpaid · 🧾 /generate', { reply_markup: ADMIN_MENU });
        return;
      }
      // Tenant is writing a maintenance report / message, or replying to one.
      if (!photoHandled && await handleTenantConversation(tenant, m, text)) { photoHandled = true; return; }
      if (text === '🔧 រាយការណ៍ជួសជុល' || text === '/repair') return startConversation(tenant, 'maintenance');
      if (text === '💬 ផ្ញើសារម្ចាស់ផ្ទះ' || text === '/message') return startConversation(tenant, 'message');
      if (text === '📍 ទីតាំង' || text === '/location') return sendLocationTo(chatId);
      if (text === '📄 កិច្ចសន្យា' || text === '/contract') return sendContractTo(tenant);
      if (m.photo?.length || m.document?.mime_type?.startsWith('image/')) {
        if (photoHandled) return;
        const inv = latestInvoices(tenant).find((i) => i.status !== 'paid');
        if (!inv) return;
        photoHandled = true;
        const fileId = m.photo ? m.photo[m.photo.length - 1].file_id : m.document.file_id;
        await claimPayment(inv, 'telegram', { telegramFileId: fileId });
        await send(chatId, `📨 បានទទួលរូបបង្កាន់ដៃសម្រាប់ ${esc(inv.number)}។ ម្ចាស់ផ្ទះនឹងបញ្ជាក់ឆាប់ៗ។`);
        return;
      }
      if (text === '/invoice' || text === '🧾 វិក្កយបត្រ') {
        const list = latestInvoices(tenant);
        const open = list.filter((i) => i.status !== 'paid');
        if (!list.length) return send(chatId, `${propertyTag()}មិនទាន់មានវិក្កយបត្រទេ។`);
        for (const inv of (open.length ? open : list.slice(0, 1)).slice(0, 3)) await sendInvoice(inv);
        return;
      }
      if (text === '/profile' || text === '👤 ព័ត៌មានរបស់ខ្ញុំ') return send(chatId, profileHtml(tenant));
      if (org === orgs[0]) await send(chatId, HELP, { reply_markup: MENU });
    });
  }
  if ((m.photo?.length || m.document) && !photoHandled) reply('មិនមានវិក្កយបត្រដែលត្រូវបង់ទេ។ សូមអរគុណ! 🙏');
}

async function linkAdmin(botKey, m) {
  const s = db();
  if (botKeyOf(s) !== botKey) return;
  const chatId = m.chat.id;
  if (!isAdminChat(chatId)) s.settings.telegram.adminChats.push({ chatId, name: [m.from.first_name, m.from.last_name].filter(Boolean).join(' '), username: m.from.username || '', linkedAt: now() });
  s.settings.telegram.adminLinkCode = uid(6); // single use
  save();
  if (botKey === 'platform') await linkTelegramToOrgOwners(orgId(), m.from); // enables sign-in & recovery via the bot
  logEvent('admin', `ម្ចាស់ផ្ទះបានភ្ជាប់ Telegram (${m.from.first_name || ''})`);
  return send(chatId, `🔐 <b>បានភ្ជាប់ជាម្ចាស់ផ្ទះ ${esc(s.settings.propertyName)}</b>\nអ្នកនឹងទទួលការជូនដំណឹងការបង់ប្រាក់ និងការងារសំខាន់ៗនៅទីនេះ។`, { reply_markup: ADMIN_MENU });
}

async function linkTenant(botKey, m, code) {
  const s = db();
  if (botKeyOf(s) !== botKey) return;
  const target = s.tenants.find((t) => t.linkCode === code);
  if (!target) return;
  const chatId = m.chat.id;
  for (const t of s.tenants) if (t.telegram?.chatId === chatId && t.id !== target.id) t.telegram = null;
  target.telegram = { chatId, username: m.from.username || '', firstName: m.from.first_name || '', linkedAt: now() };
  target.linkCode = uid(6);
  save();
  logEvent('tenant', `${target.nameKm} (${target.roomId || '—'}) បានភ្ជាប់ Telegram`, { tenantId: target.id });
  await send(chatId, `🙏 <b>សូមស្វាគមន៍ ${esc(target.nameKm)}!</b>\nគណនីរបស់អ្នកត្រូវបានភ្ជាប់ជាមួយ <b>${esc(s.settings.propertyName)}</b>។\nវិក្កយបត្រប្រចាំខែនឹងផ្ញើមកទីនេះដោយស្វ័យប្រវត្តិ។`, { reply_markup: MENU });
  const open = latestInvoices(target).find((i) => i.status !== 'paid');
  if (open) await sendInvoice(open);
}

async function handleAdminText(chatId, text) {
  if (text === '/summary' || text === '📊 សង្ខេបខែនេះ') {
    const ym = nowInCambodia().ym;
    const inv = db().invoices.filter((i) => i.month === ym);
    const paid = inv.filter((i) => i.status === 'paid');
    const sum = (a) => a.reduce((s, i) => s + i.total, 0);
    await send(chatId, `📊 ${propertyTag()}<b>${esc(monthKm(ym))}</b>\nវិក្កយបត្រ: ${kmDigits(inv.length)}\nបានបង់: ${kmDigits(paid.length)} · ${usd(sum(paid))}\nមិនទាន់បង់: ${kmDigits(inv.length - paid.length)} · ${usd(sum(inv) - sum(paid))}`);
    return true;
  }
  if (text === '/unpaid' || text === '⏳ មិនទាន់បង់') {
    const list = db().invoices.filter((i) => i.status !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!list.length) await send(chatId, `${propertyTag()}🎉 គ្មានវិក្កយបត្រមិនទាន់បង់ទេ។`);
    else await send(chatId, [`⏳ ${propertyTag()}<b>មិនទាន់បង់</b>`, ...list.slice(0, 40).map((i) => `${isOverdue(i) ? '🔴' : i.status === 'claimed' ? '🟡' : '⚪️'} ${esc(i.roomId)} · ${esc(i.name)} · ${usd(i.total)} · ${esc(monthKm(i.month))}`)].join('\n'));
    return true;
  }
  if (text === '/generate') {
    const created = generateInvoices(nowInCambodia().ym, 'admin');
    const r = await sendInvoices(created);
    await send(chatId, `🧾 ${propertyTag()}បានបង្កើត ${kmDigits(created.length)} · ផ្ញើបាន ${kmDigits(r.ok)}`);
    return true;
  }
  return false;
}

async function handleCallback(botKey, token, query) {
  const chatId = query.message?.chat?.id;
  const [action, org, id, extra] = String(query.data || '').split(':');
  const answer = (text) => api(token, 'answerCallbackQuery', { callback_query_id: query.id, text }).catch(() => {});
  if (!org || !id) return answer('');
  try {
    return await withOrg(org, async () => {
      if (botKeyOf(db()) !== botKey) return answer('មិនមានសិទ្ធិ');
      if (action.startsWith('t')) return handleTicketCallback(action, id, extra, chatId, answer);
      const inv = db().invoices.find((i) => i.id === id);
      if (!inv) return answer('រកមិនឃើញវិក្កយបត្រ');
      if (action === 'p') {
        const tenant = tenantByChat(chatId);
        if (!tenant || tenant.id !== inv.tenantId) return answer('មិនមានសិទ្ធិ');
        if (inv.status === 'paid') return answer('បានបង់រួចហើយ ✅');
        await claimPayment(inv, 'telegram');
        return answer('បានជូនដំណឹងម្ចាស់ផ្ទះ ✅');
      }
      if (action === 'ok' || action === 'no') {
        if (!isAdminChat(chatId)) return answer('មិនមានសិទ្ធិ');
        if (action === 'ok') {
          if (inv.status !== 'paid') await confirmPayment(inv, 'telegram');
          return answer('បានបញ្ជាក់ ✅');
        }
        await rejectClaim(inv);
        return answer('បានបដិសេធ');
      }
      return answer('');
    });
  } catch {
    return answer('រកមិនឃើញ');
  }
}

// ---------- tenant ↔ owner conversations (maintenance & messages) ----------

const TICKET_KIND = { maintenance: '🔧 ការជួសជុល', message: '💬 សារ' };
const TICKET_STATUS = { open: '🟡 ថ្មី', progress: '🔵 កំពុងដោះស្រាយ', done: '✅ រួចរាល់' };
const CONV_TTL = 15 * 60 * 1000;

function startConversation(tenant, kind) {
  tenant.botState = { mode: kind, at: now() };
  save();
  const ask = kind === 'maintenance'
    ? '🔧 <b>រាយការណ៍ជួសជុល</b>\nសូមរៀបរាប់បញ្ហា (ឧ. ម៉ាស៊ីនត្រជាក់មិនត្រជាក់) ហើយអាចផ្ញើរូបភាពមកជាមួយ។'
    : '💬 <b>ផ្ញើសារទៅម្ចាស់ផ្ទះ</b>\nសរសេរសាររបស់អ្នកខាងក្រោម។';
  return send(tenant.telegram.chatId, ask, { reply_markup: { inline_keyboard: [[{ text: '✖️ បោះបង់', callback_data: `tx:${orgId()}:${tenant.id}` }]] } });
}

const ticketHtml = (t, msg) => `${TICKET_KIND[t.kind]} <b>#${kmDigits(t.no)}</b> · ${esc(t.roomId || '—')} · ${esc(t.name)}\n${TICKET_STATUS[t.status]}\n\n${esc(msg.text || (msg.photo ? '📷 រូបភាព' : ''))}`;

function ownerButtons(t) {
  const o = orgId();
  return { inline_keyboard: [
    [{ text: '↩️ ឆ្លើយតប', callback_data: `tr:${o}:${t.id}` }],
    [{ text: '🔵 កំពុងដោះស្រាយ', callback_data: `ts:${o}:${t.id}:progress` }, { text: '✅ រួចរាល់', callback_data: `ts:${o}:${t.id}:done` }],
  ] };
}

/** Forward a tenant's text/photo to every owner chat and remember the message ids for replies. */
async function forwardToOwners(t, msg) {
  const html = ticketHtml(t, msg);
  for (const c of db().settings.telegram.adminChats) {
    const sent = msg.photo
      ? await call('sendPhoto', { chat_id: c.chatId, photo: msg.photo, caption: html, parse_mode: 'HTML', reply_markup: ownerButtons(t) }).catch(() => null)
      : await send(c.chatId, html, { reply_markup: ownerButtons(t) }).catch(() => null);
    if (sent) t.adminMsgIds.push([c.chatId, sent.message_id]);
  }
  t.adminMsgIds = t.adminMsgIds.slice(-60);
}

async function handleTenantConversation(tenant, m, text) {
  const s = db();
  const photo = m.photo?.length ? m.photo[m.photo.length - 1].file_id : (m.document?.mime_type?.startsWith('image/') ? m.document.file_id : '');
  const body = (m.caption || text || '').trim();
  // 1) Replying (swipe-reply) to one of the bot's ticket messages → add to that ticket.
  const replyId = m.reply_to_message?.message_id;
  let t = replyId && s.tickets.find((x) => x.tenantId === tenant.id && x.tenantMsgIds?.includes(replyId));
  // 2) In "report a problem" / "message the owner" mode → start a ticket.
  const state = tenant.botState;
  if (!t && state && Date.now() - new Date(state.at).getTime() < CONV_TTL && (body || photo) && !body.startsWith('/') && !MENU_TEXTS.includes(body)) {
    s.counters.ticket = (s.counters.ticket || 0) + 1;
    t = { id: uid(), no: s.counters.ticket, kind: state.mode, tenantId: tenant.id, roomId: tenant.roomId, name: tenant.nameKm || tenant.nameEn, status: 'open', createdAt: now(), updatedAt: now(), unread: 0, messages: [], adminMsgIds: [], tenantMsgIds: [] };
    s.tickets.push(t);
    if (s.tickets.length > 500) s.tickets.splice(0, s.tickets.length - 500);
    tenant.botState = null;
    if (state.mode === 'maintenance') s.activities.push({ id: uid(), kind: 'maintenance', title: body.slice(0, 120) || '📷 រូបភាព', detail: `Telegram #${t.no} · ${t.name}`, roomId: tenant.roomId, done: false, at: now(), ticketId: t.id });
  }
  if (!t || (!body && !photo)) return false;
  const msg = { from: 'tenant', text: body.slice(0, 3000), photo, at: now(), via: 'telegram' };
  t.messages.push(msg);
  t.unread = (t.unread || 0) + 1;
  t.updatedAt = now();
  if (t.status === 'done') t.status = 'open';
  save();
  logEvent('tenant', `${TICKET_KIND[t.kind]} #${t.no} ពី ${t.name} (${t.roomId || '—'})`, { ticketId: t.id });
  await forwardToOwners(t, msg);
  const ack = await send(tenant.telegram.chatId, `📨 បានផ្ញើទៅម្ចាស់ផ្ទះ (#${kmDigits(t.no)})។\nឆ្លើយតប (reply) សារនេះ ដើម្បីផ្ញើព័ត៌មានបន្ថែម។`, { reply_markup: MENU }).catch(() => null);
  if (ack) { t.tenantMsgIds = [...(t.tenantMsgIds || []), ack.message_id].slice(-30); save(); }
  return true;
}

/** Owner replied (swipe-reply) to a ticket notification or to the "reply to…" prompt. */
async function handleOwnerReply(chatId, m) {
  const rid = m.reply_to_message?.message_id;
  const t = db().tickets.find((x) => x.adminMsgIds?.some(([c, id]) => c === chatId && id === rid));
  if (!t) return false;
  const text = (m.text || m.caption || '').trim();
  if (!text) return true;
  const r = await replyToTicket(t, text, 'telegram');
  await send(chatId, r.ok ? `✅ បានផ្ញើទៅ ${esc(t.name)} (#${kmDigits(t.no)})` : `⚠️ ${esc(r.error)}`);
  return true;
}

/** Send an owner's reply to the tenant (from Telegram or the web inbox). */
export async function replyToTicket(t, text, via) {
  const tenant = db().tenants.find((x) => x.id === t.tenantId);
  if (!tenant?.telegram?.chatId) return { ok: false, error: 'អតិថិជនមិនទាន់ភ្ជាប់ Telegram' };
  try {
    const sent = await send(tenant.telegram.chatId, `💬 <b>ម្ចាស់ផ្ទះ</b> (#${kmDigits(t.no)})\n\n${esc(text)}\n\n<i>ឆ្លើយតប (reply) សារនេះ ដើម្បីឆ្លើយទៅវិញ។</i>`);
    t.tenantMsgIds = [...(t.tenantMsgIds || []), sent.message_id].slice(-30);
    t.messages.push({ from: 'owner', text: text.slice(0, 3000), at: now(), via });
    t.unread = 0;
    t.updatedAt = now();
    if (t.status === 'open') t.status = 'progress';
    save();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function setTicketStatus(t, status) {
  t.status = status;
  t.updatedAt = now();
  if (status === 'done') {
    const act = db().activities.find((a) => a.ticketId === t.id);
    if (act) act.done = true;
  }
  save();
  const tenant = db().tenants.find((x) => x.id === t.tenantId);
  if (tenant?.telegram?.chatId) await send(tenant.telegram.chatId, `${TICKET_KIND[t.kind]} #${kmDigits(t.no)}: ${TICKET_STATUS[status]}`).catch(() => {});
}

async function handleTicketCallback(action, id, extra, chatId, answer) {
  if (action === 'tx') { // tenant cancels "report a problem"
    const tenant = db().tenants.find((x) => x.id === id && x.telegram?.chatId === chatId);
    if (tenant) { tenant.botState = null; save(); }
    return answer('បានបោះបង់');
  }
  if (!isAdminChat(chatId)) return answer('មិនមានសិទ្ធិ');
  const t = db().tickets.find((x) => x.id === id);
  if (!t) return answer('រកមិនឃើញ');
  if (action === 'tr') {
    const prompt = await send(chatId, `↩️ សរសេរចម្លើយទៅ <b>${esc(t.name)}</b> (#${kmDigits(t.no)})៖`, { reply_markup: { force_reply: true, input_field_placeholder: 'ចម្លើយរបស់អ្នក…' } }).catch(() => null);
    if (prompt) { t.adminMsgIds.push([chatId, prompt.message_id]); save(); }
    return answer('');
  }
  if (action === 'ts' && ['progress', 'done'].includes(extra)) {
    await setTicketStatus(t, extra);
    return answer(TICKET_STATUS[extra]);
  }
  return answer('');
}

const MENU_TEXTS = MENU.keyboard.flat().map((b) => b.text);

/** 📍 Property location: native map pin + Khmer address + Google Maps link. */
export function propertyAddressText(doc = db()) {
  const L = doc.settings.location || {};
  return [L.houseNo && `ផ្ទះលេខ ${L.houseNo}`, L.street && `ផ្លូវ ${L.street}`, L.addressText || doc.settings.address].filter(Boolean).join(', ');
}

async function sendLocationTo(chatId) {
  const s = db().settings;
  const L = s.location || {};
  const addr = propertyAddressText();
  if (Number.isFinite(L.lat) && Number.isFinite(L.lng)) {
    await call('sendVenue', { chat_id: chatId, latitude: L.lat, longitude: L.lng, title: s.propertyName, address: (addr || s.propertyName).slice(0, 200) }).catch(() => {});
    return send(chatId, `📍 <b>${esc(s.propertyName)}</b>\n${esc(addr)}\n🗺 https://maps.google.com/?q=${L.lat},${L.lng}`);
  }
  return send(chatId, addr ? `📍 <b>${esc(s.propertyName)}</b>\n${esc(addr)}` : 'ម្ចាស់ផ្ទះមិនទាន់កំណត់ទីតាំងនៅឡើយទេ។');
}

async function sendContractTo(tenant) {
  const text = tenant.lease?.text;
  if (!text || tenant.lease?.required === false) return send(tenant.telegram.chatId, 'មិនមានកិច្ចសន្យាជាលាយលក្ខណ៍អក្សរទេ។ សូមសាកសួរម្ចាស់ផ្ទះ។');
  const parts = text.match(/[\s\S]{1,3800}/g) || [];
  for (const [i, part] of parts.entries()) await send(tenant.telegram.chatId, (i === 0 ? '📄 <b>កិច្ចសន្យាជួល</b>\n\n' : '') + esc(part));
}

/** Download a Telegram file (ticket photo) for the web inbox. */
export async function fetchTelegramFile(fileId) {
  const f = await call('getFile', { file_id: fileId });
  const res = await fetch(`${API}/file/bot${tokenOf(db())}/${f.file_path}`);
  if (!res.ok) throw new Error('Telegram file error');
  return { type: res.headers.get('content-type') || 'image/jpeg', data: Buffer.from(await res.arrayBuffer()) };
}

// ---------- webhook (production) ----------

export async function tokenForBotKey(botKey) {
  if (botKey === 'platform') return PLATFORM_TOKEN;
  const { rows } = await q("SELECT doc->'settings'->'telegram'->>'token' AS token FROM orgs WHERE id = $1", [botKey]);
  return rows[0]?.token || '';
}

export function webhookRoute(app) {
  app.post('/api/telegram/webhook/:botKey', async (req, res) => {
    const token = await tokenForBotKey(req.params.botKey);
    const given = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    const expected = token ? webhookSecret(token) : '';
    if (!token || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return res.status(401).end();
    try { await handleUpdate(req.params.botKey, token, req.body || {}); } catch (e) { console.error('[telegram] update failed', e); }
    res.json({ ok: true }); // always 200 so Telegram doesn't retry a poisoned update forever
  });
}

/** Register webhooks for the platform bot and every landlord's own bot (idempotent). */
export async function registerAllWebhooks() {
  const out = [];
  if (PLATFORM_TOKEN) out.push(await registerBot(PLATFORM_TOKEN, 'platform').then(() => 'platform: ok', (e) => `platform: ${e.message}`));
  const { rows } = await q("SELECT id, doc->'settings'->'telegram'->>'token' AS token FROM orgs WHERE coalesce(doc->'settings'->'telegram'->>'token', '') <> ''");
  for (const r of rows) out.push(await registerBot(r.token, r.id).then(() => `${r.id}: ok`, (e) => `${r.id}: ${e.message}`));
  return out;
}

/**
 * Make sure Telegram delivers the platform bot's updates to this deployment.
 * Checked once per serverless instance (and before every Telegram sign-in), so the
 * bot works right after deploying — no need to wait for the daily cron.
 */
let webhookCheck = null;
export function ensurePlatformWebhook({ force = false } = {}) {
  const base = appUrl();
  if (!PLATFORM_TOKEN) return Promise.resolve({ ok: false, reason: 'TELEGRAM_BOT_TOKEN មិនទាន់កំណត់' });
  if (!base.startsWith('https://')) return Promise.resolve({ ok: false, reason: 'polling (local)' });
  if (webhookCheck && !force) return webhookCheck;
  webhookCheck = (async () => {
    const url = `${base}/api/telegram/webhook/platform`;
    const before = await api(PLATFORM_TOKEN, 'getWebhookInfo');
    if (force || before.url !== url) {
      await registerBot(PLATFORM_TOKEN, 'platform');
      if (before.url && before.url !== url) console.warn(`[telegram] platform bot webhook moved from ${before.url} to ${url}`);
      return { ok: true, changed: true, previousUrl: before.url || '' };
    }
    return { ok: true, changed: false };
  })().catch((e) => { webhookCheck = null; console.error('[telegram] webhook check failed', e.message); return { ok: false, reason: e.message }; });
  return webhookCheck;
}

/** Live diagnostics for the super admin console. */
export async function platformBotDiagnostics() {
  if (!PLATFORM_TOKEN) return { configured: false };
  const expectedUrl = appUrl() ? `${appUrl()}/api/telegram/webhook/platform` : '';
  try {
    const [me, info] = await Promise.all([api(PLATFORM_TOKEN, 'getMe'), api(PLATFORM_TOKEN, 'getWebhookInfo')]);
    return {
      configured: true,
      username: me.username,
      mode: appUrl().startsWith('https://') ? 'webhook' : 'polling',
      expectedUrl,
      url: info.url || '',
      urlOk: !expectedUrl.startsWith('https://') || info.url === expectedUrl,
      pending: info.pending_update_count || 0,
      lastError: info.last_error_message || '',
      lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : '',
    };
  } catch (e) {
    return { configured: true, error: e.message, expectedUrl };
  }
}

// ---------- long polling (local development) ----------

const pollers = new Map(); // token -> AbortController

async function pollLoop(token, botKey, signal) {
  let offset = 0;
  let backoff = 1000;
  await api(token, 'deleteWebhook', {}).catch(() => {});
  while (!signal.aborted) {
    try {
      const res = await fetch(`${API}/bot${token}/getUpdates`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }), signal,
      });
      const json = await res.json();
      if (!json.ok) throw Object.assign(new Error(json.description), { code: json.error_code });
      backoff = 1000;
      for (const u of json.result) {
        offset = u.update_id + 1;
        try { await handleUpdate(botKey, token, u); } catch (e) { console.error('[telegram] update failed', e); }
      }
    } catch (e) {
      if (signal.aborted) break;
      if (e.code === 401) break;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30000);
    }
  }
}

/** (Re)start polling for the platform bot and all landlords' own bots. */
export async function refreshPolling() {
  const want = new Map();
  if (PLATFORM_TOKEN) want.set(PLATFORM_TOKEN, 'platform');
  const { rows } = await q("SELECT id, doc->'settings'->'telegram'->>'token' AS token FROM orgs WHERE coalesce(doc->'settings'->'telegram'->>'token', '') <> ''");
  for (const r of rows) want.set(r.token, r.id);
  for (const [tok, ctrl] of pollers) if (!want.has(tok)) { ctrl.abort(); pollers.delete(tok); }
  for (const [tok, key] of want) {
    if (pollers.has(tok)) continue;
    const ctrl = new AbortController();
    pollers.set(tok, ctrl);
    pollLoop(tok, key, ctrl.signal);
    api(tok, 'setMyCommands', { commands: [{ command: 'invoice', description: 'មើលវិក្កយបត្រ' }, { command: 'profile', description: 'ព័ត៌មានរបស់ខ្ញុំ' }, { command: 'help', description: 'ជំនួយ' }] }).catch(() => {});
  }
  return pollers.size;
}

export { listOrgIds };
