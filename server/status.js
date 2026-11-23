// Public status page data (/status): is the app up, can it reach its database and Telegram,
// and when did the daily jobs (invoices, reminders, backups) last run. No landlord data.
import { q } from './store.js';
import { api as tgApi } from './telegram.js';

const CACHE_MS = 30000;
let cached = null;

async function timed(fn) {
  const t0 = Date.now();
  try { await fn(); return { ok: true, ms: Date.now() - t0 }; } catch { return { ok: false, ms: Date.now() - t0 }; }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export async function statusReport() {
  if (cached && Date.now() - cached.t < CACHE_MS) return cached.v;
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const [database, telegram, kv] = await Promise.all([
    timed(() => withTimeout(q('SELECT 1'), 5000)),
    token ? timed(() => withTimeout(tgApi(token, 'getMe'), 5000)) : Promise.resolve(null),
    q("SELECT key, value FROM platform_kv WHERE key IN ('daily_last', 'status_note')").then((r) => r.rows).catch(() => []),
  ]);
  const get = (k) => { try { return JSON.parse(kv.find((r) => r.key === k)?.value || 'null'); } catch { return null; } };
  const daily = get('daily_last');
  // The daily run happens at least once a day (every 15 min locally); older than 26 h means something is stuck.
  const dailyOk = daily ? Date.now() - Date.parse(daily.at) < 26 * 3600000 : null;
  const checks = [
    { id: 'app', ok: true },
    { id: 'database', ...database },
    ...(telegram ? [{ id: 'telegram', ...telegram }] : []),
    { id: 'daily', ok: dailyOk, at: daily?.at || null },
  ];
  const note = get('status_note');
  const v = {
    ok: checks.every((c) => c.ok !== false),
    checks,
    note: note?.text ? note : null,
    time: new Date().toISOString(),
  };
  cached = { t: Date.now(), v };
  return v;
}

export const clearStatusCache = () => { cached = null; };

export function statusRoutes(app) {
  app.get('/api/status', async (req, res) => {
    const r = await statusReport();
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.status(r.checks.find((c) => c.id === 'database')?.ok === false ? 503 : 200).json(r);
  });
}
