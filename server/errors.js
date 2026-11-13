// Error monitoring without a third-party service: server and browser errors are grouped by fingerprint
// in the platform database and shown to the super admin. No customer data is stored — only messages,
// stack traces, the page path and which landlord account it happened in.
import { q, sha256 } from './store.js';

const clip = (s, n) => String(s ?? '').slice(0, n);
// Strip things that could be personal: emails, long digit runs (phones/IDs), tokens in URLs.
const scrub = (s) => String(s ?? '')
  .replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '<email>')
  .replace(/\b\d{7,}\b/g, '<number>')
  .replace(/\/(portal|p|join|t)\/[A-Za-z0-9_-]{8,}/g, '/$1/<token>');

let sinceTrim = 0;

export async function recordError({ source = 'server', message, stack = '', path = '', orgId = null, ua = '' }) {
  try {
    const msg = clip(scrub(message || 'Unknown error'), 500);
    const st = clip(scrub(stack), 4000);
    const firstFrame = st.split('\n').find((l) => /at |@/.test(l)) || '';
    const fp = sha256(`${source}|${msg.replace(/\d+/g, '#')}|${firstFrame.replace(/[?#].*$/, '').replace(/:\d+:\d+/g, '')}`).slice(0, 32);
    await q(`INSERT INTO errors (fingerprint, source, message, stack, path, org_id, ua) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (fingerprint) DO UPDATE SET count = errors.count + 1, last_at = now(), path = $5, org_id = COALESCE($6, errors.org_id), ua = $7, resolved = false`,
    [fp, source, msg, st, clip(scrub(path), 300), orgId, clip(ua, 200)]);
    if (++sinceTrim >= 50) {
      sinceTrim = 0;
      await q('DELETE FROM errors WHERE fingerprint IN (SELECT fingerprint FROM errors ORDER BY last_at DESC OFFSET 1000)');
    }
  } catch (e) {
    console.error('[errors] could not record', e.message);
  }
}

export async function listErrors({ resolved = false } = {}) {
  return (await q('SELECT * FROM errors WHERE resolved = $1 ORDER BY last_at DESC LIMIT 200', [resolved])).rows;
}

export const resolveError = (fp) => q('UPDATE errors SET resolved = true WHERE fingerprint = $1', [String(fp)]);
export const resolveAllErrors = () => q('UPDATE errors SET resolved = true WHERE resolved = false');

let installed = false;
/** Record crashes that escape request handling (timers, Telegram polling, schedulers). */
export function installProcessHandlers() {
  if (installed) return;
  installed = true;
  process.on('unhandledRejection', (e) => {
    console.error('[unhandledRejection]', e);
    recordError({ source: 'server', message: `Unhandled: ${e?.message || e}`, stack: e?.stack, path: 'process' });
  });
}
