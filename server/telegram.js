// Telegram bot (raw Bot API over long polling — no webhook or public URL needed).
import QRCode from 'qrcode';
import { db, save, uid, now, logEvent } from './db.js';
import { invoiceTelegramHtml, khqrOf, markPaid, roomOf, isOverdue, generateInvoices } from './invoices.js';
import { usd, khr, monthKm, kmDigits, nowInCambodia, dateKm } from '../shared/khmer.js';

const API = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const status = { configured: false, running: false, username: '', name: '', error: '', lastPollAt: '' };
let loop = null; // { token, abort }

const token = () => process.env.TELEGRAM_BOT_TOKEN || db().settings.telegram.token || '';
export const botStatus = () => ({ ...status });
export const botUsername = () => status.username;

async function call(method, payload, { signal, tok = token() } = {}) {
  const isForm = payload instanceof FormData;
  const res = await fetch(`${API}/bot${tok}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'content-type': 'application/json' },
    body: isForm ? payload : JSON.stringify(payload || {}),
    signal,
  });
  const json = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!json.ok) {
    const err = new Error(json.description || 'Telegram error');
    err.code = json.error_code;
    throw err;
  }
  return json.result;
}

// ---------- lifecycle ----------

export async function restartBot() {
  if (loop) { loop.abort.abort(); loop = null; }
  Object.assign(status, { configured: !!token(), running: false, username: '', name: '', error: '' });
  const tok = token();
  if (!tok) return botStatus();
  const abort = new AbortController();
  loop = { token: tok, abort };
  try {
    const me = await call('getMe', {}, { tok });
    Object.assign(status, { username: me.username, name: me.first_name, running: true });
    await call('setMyCommands', {
      commands: [
        { command: 'invoice', description: 'មើលវិក្កយបត្រ' },
        { command: 'profile', description: 'ព័ត៌មានរបស់ខ្ញុំ' },
        { command: 'help', description: 'ជំនួយ' },
      ],
    }, { tok }).catch(() => {});
  } catch (e) {
    status.error = e.message;
    loop = null;
    return botStatus();
  }
  poll(tok, abort.signal);
  return botStatus();
}

async function poll(tok, signal) {
  let offset = 0;
  let backoff = 1000;
  while (!signal.aborted) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, { signal, tok });
      status.lastPollAt = now();
      status.error = '';
      backoff = 1000;
      for (const u of updates) {
        offset = u.update_id + 1;
        try { await handleUpdate(u); } catch (e) { console.error('[telegram] update failed', e); }
      }
    } catch (e) {
      if (signal.aborted) break;
      status.error = e.message;
      if (e.code === 401 || e.code === 409) { status.running = false; break; }
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30000);
    }
  }
}

// ---------- helpers ----------

const tenantByChat = (chatId) => db().tenants.find((t) => t.telegram?.chatId === chatId);
const isAdminChat = (chatId) => db().settings.telegram.adminChats.some((c) => c.chatId === chatId);
const latestInvoices = (tenant) => db().invoices
  .filter((i) => i.tenantId === tenant.id)
  .sort((a, b) => b.month.localeCompare(a.month) || b.createdAt.localeCompare(a.createdAt));

export function portalUrl(tenant) {
  const base = (db().settings.publicUrl || '').replace(/\/+$/, '');
  return base ? `${base}/p/${tenant.portalToken}` : '';
}

const MENU = {
  keyboard: [[{ text: '🧾 វិក្កយបត្រ' }, { text: '👤 ព័ត៌មានរបស់ខ្ញុំ' }], [{ text: '❓ ជំនួយ' }]],
  resize_keyboard: true,
};
const ADMIN_MENU = {
  keyboard: [[{ text: '📊 សង្ខេបខែនេះ' }, { text: '⏳ មិនទាន់បង់' }], [{ text: '❓ ជំនួយ' }]],
  resize_keyboard: true,
};

export const send = (chatId, html, extra = {}) =>
  call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

export async function notifyAdmins(html, extra = {}) {
  if (!status.running) return;
  for (const c of db().settings.telegram.adminChats) {
    await send(c.chatId, html, extra).catch((e) => console.error('[telegram] admin notify failed', e.message));
  }
}

function invoiceButtons(inv, tenant) {
  const rows = [];
  if (inv.status === 'unpaid') rows.push([{ text: '✅ ខ្ញុំបានបង់ប្រាក់', callback_data: `paid:${inv.id}` }]);
  const url = tenant && portalUrl(tenant);
  if (url && url.startsWith('https://')) rows.push([{ text: '🔗 បើកគណនីរបស់ខ្ញុំ', url }]);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

/** Send one invoice (with its KHQR) to the tenant's Telegram. */
export async function sendInvoice(inv, { reminder = false } = {}) {
  const tenant = db().tenants.find((t) => t.id === inv.tenantId);
  if (!status.running) return { ok: false, error: 'Bot មិនទាន់ដំណើរការ' };
  if (!tenant?.telegram?.chatId) return { ok: false, error: 'អតិថិជនមិនទាន់ភ្ជាប់ Telegram' };
  const qr = khqrOf(inv);
  const caption = invoiceTelegramHtml(inv, { reminder, hasQr: !!qr });
  const reply_markup = invoiceButtons(inv, tenant);
  try {
    let msg;
    if (qr) {
      const png = await QRCode.toBuffer(qr, { width: 640, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#0b1220' } });
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
    save();
    return { ok: true };
  } catch (e) {
    inv.sendError = e.message;
    if (e.code === 403) { // user blocked the bot
      tenant.telegram = { ...tenant.telegram, blocked: true };
    }
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
    await new Promise((res) => setTimeout(res, 60)); // stay well under Telegram's rate limit
  }
  return { ok, failed: errors.length, errors };
}

export async function notifyTenant(tenant, html) {
  if (!status.running || !tenant?.telegram?.chatId) return;
  await send(tenant.telegram.chatId, html).catch(() => {});
}

// ---------- payment claims ----------

export async function claimPayment(inv, source, proof) {
  if (inv.status === 'paid') return;
  inv.status = 'claimed';
  inv.claims.push({ id: uid(), at: now(), source, ...(proof || {}) });
  save();
  logEvent('tenant', `${inv.name} (${inv.roomId}) បានជូនដំណឹងថាបានបង់ ${usd(inv.total)}`, { invoiceId: inv.id });
  const html = `💸 <b>ការជូនដំណឹងការបង់ប្រាក់</b>\n🏠 ${esc(inv.roomId)} · ${esc(inv.name)}\n🧾 ${esc(inv.number)} · ${esc(monthKm(inv.month))}\n💰 <b>${usd(inv.total)}</b> (${khr(inv.totalKhr)})\nតាមរយៈ: ${source === 'portal' ? 'គេហទំព័រអតិថិជន' : 'Telegram'}`;
  const reply_markup = { inline_keyboard: [[{ text: '✅ បញ្ជាក់ថាបានទទួល', callback_data: `ok:${inv.id}` }, { text: '❌ មិនទាន់ទទួល', callback_data: `no:${inv.id}` }]] };
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
  await notifyTenant(tenant, `✅ <b>បានទទួលការបង់ប្រាក់</b>\n🧾 ${esc(inv.number)} · ${esc(monthKm(inv.month))}\n💰 ${usd(inv.total)}\nសូមអរគុណច្រើន! 🙏`);
}

export async function rejectClaim(inv) {
  if (inv.status !== 'claimed') return;
  inv.status = 'unpaid';
  save();
  logEvent('admin', `បានបដិសេធការជូនដំណឹងបង់ប្រាក់ ${inv.roomId}`, { invoiceId: inv.id });
  const tenant = db().tenants.find((t) => t.id === inv.tenantId);
  await notifyTenant(tenant, `⚠️ ម្ចាស់ផ្ទះមិនទាន់ទទួលបានការបង់ប្រាក់សម្រាប់ ${esc(inv.number)} ទេ។ សូមពិនិត្យម្តងទៀត ឬទាក់ទងម្ចាស់ផ្ទះ។`);
}

// ---------- update handling ----------

function profileHtml(t) {
  const room = roomOf(t);
  const lines = [
    '👤 <b>ព័ត៌មានរបស់ខ្ញុំ</b>',
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
  '🧾 /invoice — មើលវិក្កយបត្រ និង KHQR',
  '👤 /profile — ព័ត៌មានរបស់ខ្ញុំ',
  '📷 ផ្ញើរូបបង្កាន់ដៃបង់ប្រាក់ ដើម្បីជូនដំណឹងម្ចាស់ផ្ទះ',
].join('\n');

async function handleUpdate(u) {
  if (u.callback_query) return handleCallback(u.callback_query);
  const m = u.message;
  if (!m || m.chat?.type !== 'private') return;
  const chatId = m.chat.id;
  const text = (m.text || '').trim();
  const admin = isAdminChat(chatId);
  const tenant = tenantByChat(chatId);

  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1] || '';
    const s = db();
    if (payload && payload === `admin-${s.settings.telegram.adminLinkCode}`) {
      if (!admin) s.settings.telegram.adminChats.push({ chatId, name: [m.from.first_name, m.from.last_name].filter(Boolean).join(' '), username: m.from.username || '', linkedAt: now() });
      s.settings.telegram.adminLinkCode = uid(6); // single use
      save();
      logEvent('admin', `ម្ចាស់ផ្ទះបានភ្ជាប់ Telegram (${m.from.first_name || ''})`);
      return send(chatId, '🔐 <b>បានភ្ជាប់ជាម្ចាស់ផ្ទះ</b>\nអ្នកនឹងទទួលការជូនដំណឹងការបង់ប្រាក់ និងការងារសំខាន់ៗនៅទីនេះ។', { reply_markup: ADMIN_MENU });
    }
    const target = payload && s.tenants.find((t) => t.linkCode === payload);
    if (target) {
      // A chat can only belong to one customer.
      for (const t of s.tenants) if (t.telegram?.chatId === chatId && t.id !== target.id) t.telegram = null;
      target.telegram = { chatId, username: m.from.username || '', firstName: m.from.first_name || '', linkedAt: now() };
      target.linkCode = uid(6);
      save();
      logEvent('tenant', `${target.nameKm} (${target.roomId || '—'}) បានភ្ជាប់ Telegram`, { tenantId: target.id });
      await send(chatId, `🙏 <b>សូមស្វាគមន៍ ${esc(target.nameKm)}!</b>\nគណនីរបស់អ្នកត្រូវបានភ្ជាប់ជាមួយ <b>${esc(s.settings.propertyName)}</b>។\nវិក្កយបត្រប្រចាំខែនឹងផ្ញើមកទីនេះដោយស្វ័យប្រវត្តិ។`, { reply_markup: MENU });
      const open = latestInvoices(target).find((i) => i.status !== 'paid');
      if (open) await sendInvoice(open);
      return;
    }
    if (tenant) return send(chatId, `🙏 សួស្តី ${esc(tenant.nameKm)}!`, { reply_markup: MENU });
    if (admin) return send(chatId, '🔐 សួស្តី ម្ចាស់ផ្ទះ!', { reply_markup: ADMIN_MENU });
    return send(chatId, '👋 សួស្តី! សូមស្កេន QR Code ដែលម្ចាស់ផ្ទះផ្តល់ឱ្យ ដើម្បីភ្ជាប់គណនីរបស់អ្នក។');
  }

  if (admin && (text === '/summary' || text === '📊 សង្ខេបខែនេះ')) {
    const ym = nowInCambodia().ym;
    const inv = db().invoices.filter((i) => i.month === ym);
    const paid = inv.filter((i) => i.status === 'paid');
    const sum = (a) => a.reduce((s, i) => s + i.total, 0);
    return send(chatId, `📊 <b>${esc(monthKm(ym))}</b>\nវិក្កយបត្រ: ${kmDigits(inv.length)}\nបានបង់: ${kmDigits(paid.length)} · ${usd(sum(paid))}\nមិនទាន់បង់: ${kmDigits(inv.length - paid.length)} · ${usd(sum(inv) - sum(paid))}`);
  }
  if (admin && (text === '/unpaid' || text === '⏳ មិនទាន់បង់')) {
    const list = db().invoices.filter((i) => i.status !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!list.length) return send(chatId, '🎉 គ្មានវិក្កយបត្រមិនទាន់បង់ទេ។');
    return send(chatId, ['⏳ <b>មិនទាន់បង់</b>', ...list.slice(0, 40).map((i) => `${isOverdue(i) ? '🔴' : i.status === 'claimed' ? '🟡' : '⚪️'} ${esc(i.roomId)} · ${esc(i.name)} · ${usd(i.total)} · ${esc(monthKm(i.month))}`)].join('\n'));
  }
  if (admin && text === '/generate') {
    const created = generateInvoices(nowInCambodia().ym, 'admin');
    const r = await sendInvoices(created);
    return send(chatId, `🧾 បានបង្កើត ${kmDigits(created.length)} · ផ្ញើបាន ${kmDigits(r.ok)}`);
  }

  if (!tenant) {
    if (admin) return send(chatId, '📊 /summary · ⏳ /unpaid · 🧾 /generate', { reply_markup: ADMIN_MENU });
    return send(chatId, 'សូមស្កេន QR Code ពីម្ចាស់ផ្ទះ ដើម្បីភ្ជាប់គណនីរបស់អ្នកជាមុនសិន។');
  }

  if (m.photo?.length || m.document?.mime_type?.startsWith('image/')) {
    const fileId = m.photo ? m.photo[m.photo.length - 1].file_id : m.document.file_id;
    const inv = latestInvoices(tenant).find((i) => i.status !== 'paid');
    if (!inv) return send(chatId, 'មិនមានវិក្កយបត្រដែលត្រូវបង់ទេ។ សូមអរគុណ! 🙏');
    await claimPayment(inv, 'telegram', { telegramFileId: fileId });
    return send(chatId, `📨 បានទទួលរូបបង្កាន់ដៃសម្រាប់ ${esc(inv.number)}។ ម្ចាស់ផ្ទះនឹងបញ្ជាក់ឆាប់ៗ។`);
  }
  if (text === '/invoice' || text === '🧾 វិក្កយបត្រ') {
    const list = latestInvoices(tenant);
    const open = list.filter((i) => i.status !== 'paid');
    if (!list.length) return send(chatId, 'មិនទាន់មានវិក្កយបត្រទេ។');
    for (const inv of (open.length ? open : list.slice(0, 1)).slice(0, 3)) await sendInvoice(inv);
    return;
  }
  if (text === '/profile' || text === '👤 ព័ត៌មានរបស់ខ្ញុំ') return send(chatId, profileHtml(tenant));
  return send(chatId, HELP, { reply_markup: MENU });
}

async function handleCallback(q) {
  const chatId = q.message?.chat?.id;
  const [action, id] = String(q.data || '').split(':');
  const inv = db().invoices.find((i) => i.id === id);
  const answer = (text) => call('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
  if (!inv) return answer('រកមិនឃើញវិក្កយបត្រ');

  if (action === 'paid') {
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
}
