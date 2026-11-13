// Web Push to the landlord's phones/computers. Zero setup: VAPID keys come from env if given,
// otherwise they are generated once and kept in the database.
import webpush from 'web-push';
import { q, sha256 } from './store.js';

let keysPromise;
function vapid() {
  keysPromise ||= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    const { rows } = await q("SELECT value FROM platform_kv WHERE key = 'vapid'");
    if (rows.length) return JSON.parse(rows[0].value);
    const fresh = webpush.generateVAPIDKeys();
    await q("INSERT INTO platform_kv (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(fresh)]);
    return JSON.parse((await q("SELECT value FROM platform_kv WHERE key = 'vapid'")).rows[0].value);
  })().catch((e) => { keysPromise = null; throw e; });
  return keysPromise;
}

export const publicKey = async () => (await vapid()).publicKey;

// Only real browser push services (prevents using the server to call arbitrary/internal URLs).
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
function okEndpoint(endpoint) {
  let u; try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (process.env.NODE_ENV === 'test' && u.hostname === '127.0.0.1') return true;
  return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
}
const validSub = (s) => s && typeof s.endpoint === 'string' && s.endpoint.length < 1000 && okEndpoint(s.endpoint)
  && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string';

export async function subscribe(orgId, userId, sub, ua = '') {
  if (!validSub(sub)) { const e = new Error('Subscription មិនត្រឹមត្រូវ'); e.status = 400; throw e; }
  const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100) } };
  await q(`INSERT INTO push_subs (id, org_id, user_id, sub, ua) VALUES ($1, $2, $3, $4::jsonb, $5)
    ON CONFLICT (id) DO UPDATE SET org_id = $2, user_id = $3, sub = $4::jsonb, ua = $5`, [sha256(sub.endpoint), orgId, userId, JSON.stringify(clean), String(ua).slice(0, 200)]);
}

export const unsubscribe = (orgId, endpoint) => q('DELETE FROM push_subs WHERE id = $1 AND org_id = $2', [sha256(String(endpoint || '')), orgId]);

export async function devices(orgId) {
  const { rows } = await q('SELECT id, ua, created_at FROM push_subs WHERE org_id = $1 ORDER BY created_at DESC', [orgId]);
  return rows.map((r) => ({ id: r.id.slice(0, 12), ua: r.ua, at: r.created_at }));
}

/** Plain text from the Telegram-style HTML we already write for notifications. */
export const htmlToText = (html) => String(html).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Send to every device of a landlord. Never throws; drops subscriptions the browser revoked. */
export async function pushToOrg(orgId, { title, body = '', url = '/', tag, roles = ['owner', 'manager'] } = {}) {
  if (!orgId) return 0;
  let rows;
  try {
    rows = (await q(`SELECT p.id, p.sub FROM push_subs p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.org_id = $1 AND COALESCE(u.role, 'owner') = ANY($2::text[])`, [orgId, roles])).rows;
  } catch { return 0; }
  if (!rows.length) return 0;
  const k = await vapid();
  const payload = JSON.stringify({ title: String(title).slice(0, 120), body: String(body).slice(0, 400), url, tag });
  let sent = 0;
  await Promise.all(rows.map(async (r) => {
    const sub = typeof r.sub === 'string' ? JSON.parse(r.sub) : r.sub;
    try {
      await webpush.sendNotification(sub, payload, {
        TTL: 24 * 3600, urgency: 'high', timeout: 8000,
        vapidDetails: { subject: process.env.VAPID_SUBJECT || 'https://phteahyeung.app', publicKey: k.publicKey, privateKey: k.privateKey },
      });
      sent += 1;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await q('DELETE FROM push_subs WHERE id = $1', [r.id]).catch(() => {});
      else console.error('[push]', e.statusCode || '', e.message);
    }
  }));
  return sent;
}
