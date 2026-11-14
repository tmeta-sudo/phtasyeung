// Platform owner ("super admin") console + landlord-facing news and feedback.
// Super admins are listed in SUPER_ADMIN_EMAILS (comma separated). They see
// aggregate statistics and account metadata only — never customers' personal
// data or ID documents.
import { listErrors, resolveError, resolveAllErrors } from './errors.js';
import { q, uid, rateLimit } from './store.js';
import { requireOwner } from './auth.js';
import { api as tgApi, appUrl, platformBotDiagnostics, ensurePlatformWebhook } from './telegram.js';
import { nowInCambodia } from '../shared/khmer.js';

const PLATFORM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const superEmails = () => String(process.env.SUPER_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const superTelegramIds = () => String(process.env.SUPER_ADMIN_TELEGRAM_IDS || '').split(',').map((e) => e.trim()).filter(Boolean);
export const isSuper = (email, telegramId) =>
  superEmails().includes(String(email || '').toLowerCase()) || (!!telegramId && superTelegramIds().includes(String(telegramId)));

const fail = (error, status = 400) => { throw Object.assign(new Error(error), { status }); };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v) => Number(v) || 0;

export const KINDS = ['feature', 'issue'];
export const STATUSES = ['new', 'planned', 'progress', 'done', 'declined'];
const STATUS_KM = { new: 'ថ្មី', planned: 'គ្រោងនឹងធ្វើ', progress: 'កំពុងធ្វើ', done: 'រួចរាល់', declined: 'មិនធ្វើ' };
const NEWS_KINDS = ['feature', 'improvement', 'fix', 'notice'];

async function requireSuper(req, res, next) {
  await requireOwner(req, res, async () => {
    try {
      const { rows } = await q('SELECT telegram_id FROM users WHERE id = $1', [req.session.userId]);
      if (!isSuper(req.session.email, rows[0]?.telegram_id)) return res.status(403).json({ error: 'សម្រាប់អ្នកគ្រប់គ្រងប្រព័ន្ធប៉ុណ្ណោះ' });
      // The platform console controls every landlord account: it needs a session that passed two-factor sign-in.
      if (process.env.SUPER_REQUIRE_2FA !== '0' && !req.session.mfa) {
        return res.status(403).json({ error: 'ផ្ទាំងអ្នកគ្រប់គ្រងប្រព័ន្ធ ត្រូវការការចូល ២ ជំហាន៖ ការកំណត់ → សុវត្ថិភាពគណនី → បើក 2FA (ឬចេញ ហើយចូលម្តងទៀតដោយលេខកូដ)។', code: 'need-2fa' });
      }
      next();
    } catch (e) { next(e); }
  });
}

const audit = (req, action, target = '', detail = '') =>
  q('INSERT INTO admin_audit (actor, action, target, detail) VALUES ($1, $2, $3, $4)', [req.session.email, action, target, str(detail, 500)]);

/** Send a Telegram message to every owner chat of one landlord (their own bot or the platform bot). */
async function notifyOrgOwners(orgId, html) {
  const { rows } = await q(`SELECT doc->'settings'->'telegram' AS tg FROM orgs WHERE id = $1 AND NOT suspended`, [orgId]);
  const tg = rows[0]?.tg && (typeof rows[0].tg === 'string' ? JSON.parse(rows[0].tg) : rows[0].tg);
  const token = tg?.token || PLATFORM_TOKEN;
  if (!token) return 0;
  let n = 0;
  for (const c of tg?.adminChats || []) {
    await tgApi(token, 'sendMessage', { chat_id: c.chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }).then(() => { n += 1; }).catch(() => {});
    await new Promise((r) => setTimeout(r, 40));
  }
  return n;
}

export function superRoutes(app) {
  // ---------- landlord side: what's new ----------

  app.get('/api/news', requireOwner, async (req, res) => {
    const { rows } = await q('SELECT id, kind, title, body, link, published_at FROM announcements WHERE published ORDER BY published_at DESC LIMIT 30');
    const seen = (await q('SELECT seen_news_at FROM users WHERE id = $1', [req.session.userId])).rows[0]?.seen_news_at;
    res.json({ items: rows, unread: rows.filter((r) => !seen || new Date(r.published_at) > new Date(seen)).length });
  });

  app.post('/api/news/seen', requireOwner, async (req, res) => {
    await q('UPDATE users SET seen_news_at = now() WHERE id = $1', [req.session.userId]);
    res.json({ ok: true });
  });

  // ---------- landlord side: feature requests & issue reports ----------

  app.get('/api/feedback', requireOwner, async (req, res) => {
    const org = req.session.orgId;
    const board = await q(
      `SELECT f.id, f.title, f.body, f.status, f.reply, f.votes, f.created_at, f.org_id = $1 AS mine,
              EXISTS (SELECT 1 FROM feedback_votes v WHERE v.feedback_id = f.id AND v.org_id = $1) AS voted
         FROM feedback f WHERE f.kind = 'feature' AND f.status <> 'declined' ORDER BY f.votes DESC, f.created_at DESC LIMIT 200`, [org]);
    const mine = await q(`SELECT id, kind, title, body, status, reply, votes, created_at, updated_at FROM feedback WHERE org_id = $1 ORDER BY created_at DESC LIMIT 100`, [org]);
    res.json({ board: board.rows, mine: mine.rows });
  });

  app.post('/api/feedback', requireOwner, async (req, res) => {
    const b = req.body || {};
    if (!(await rateLimit(`feedback:${req.session.orgId}`, 10, 3600))) fail('ផ្ញើច្រើនពេក។ សូមព្យាយាមម្តងទៀតក្រោយ ១ ម៉ោង។', 429);
    const kind = KINDS.includes(b.kind) ? b.kind : fail('ប្រភេទមិនត្រឹមត្រូវ');
    const title = str(b.title, 140) || fail('សូមបញ្ចូលចំណងជើង');
    const context = {
      page: str(b.context?.page, 200), ua: str(req.headers['user-agent'], 300), screen: str(b.context?.screen, 30),
      lang: str(b.context?.lang, 20), online: !!b.context?.online, standalone: !!b.context?.standalone,
    };
    const id = 'f' + uid(8);
    await q('INSERT INTO feedback (id, org_id, user_email, kind, title, body, context, votes) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)',
      [id, req.session.orgId, req.session.email, kind, title, str(b.body, 4000), JSON.stringify(context), kind === 'feature' ? 1 : 0]);
    if (kind === 'feature') await q('INSERT INTO feedback_votes (feedback_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, req.session.orgId]);
    res.json({ ok: true, id });
  });

  app.post('/api/feedback/:id/vote', requireOwner, async (req, res) => {
    const { rows } = await q("SELECT id FROM feedback WHERE id = $1 AND kind = 'feature'", [req.params.id]);
    if (!rows.length) fail('រកមិនឃើញ', 404);
    const del = await q('DELETE FROM feedback_votes WHERE feedback_id = $1 AND org_id = $2 RETURNING 1', [req.params.id, req.session.orgId]);
    if (!del.rows.length) await q('INSERT INTO feedback_votes (feedback_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, req.session.orgId]);
    await q('UPDATE feedback SET votes = (SELECT count(*) FROM feedback_votes WHERE feedback_id = $1) WHERE id = $1', [req.params.id]);
    res.json({ ok: true, voted: !del.rows.length });
  });

  // ---------- super admin ----------

  app.get('/api/super/stats', requireSuper, async (req, res) => {
    const ym = nowInCambodia().ym;
    const [orgs, inv, linked, signups, files, fb, recent] = await Promise.all([
      q(`SELECT count(*) AS orgs,
                count(*) FILTER (WHERE suspended) AS suspended,
                count(*) FILTER (WHERE created_at > now() - interval '30 days') AS new30,
                count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new7,
                count(*) FILTER (WHERE last_active > now() - interval '7 days') AS active7,
                count(*) FILTER (WHERE last_active > now() - interval '30 days') AS active30,
                coalesce(sum(jsonb_array_length(doc->'rooms')), 0) AS rooms,
                coalesce(sum(jsonb_array_length(doc->'tenants')), 0) AS tenants,
                coalesce(sum(jsonb_array_length(doc->'invoices')), 0) AS invoices,
                count(*) FILTER (WHERE coalesce(doc->'settings'->'khqr'->>'accountId', '') <> '') AS khqr,
                count(*) FILTER (WHERE (doc->'settings'->'auto'->>'enabled')::boolean) AS auto,
                count(*) FILTER (WHERE jsonb_array_length(coalesce(doc->'settings'->'telegram'->'adminChats', '[]'::jsonb)) > 0) AS owner_tg,
                count(*) FILTER (WHERE coalesce(doc->'settings'->'telegram'->>'token', '') <> '') AS own_bot
           FROM orgs`),
      q(`SELECT count(*) AS n, coalesce(sum((i->>'total')::numeric), 0) AS total,
                coalesce(sum((i->>'total')::numeric) FILTER (WHERE i->>'status' = 'paid'), 0) AS paid,
                count(*) FILTER (WHERE i->>'sentAt' IS NOT NULL) AS sent
           FROM orgs o, jsonb_array_elements(o.doc->'invoices') i WHERE i->>'month' = $1`, [ym]),
      q(`SELECT count(*) AS n FROM orgs o, jsonb_array_elements(o.doc->'tenants') t WHERE t->'telegram'->>'chatId' IS NOT NULL`),
      q(`SELECT to_char(created_at AT TIME ZONE 'Asia/Phnom_Penh', 'YYYY-MM-DD') AS d, count(*) AS n
           FROM orgs WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
      q('SELECT count(*) AS n, coalesce(sum(size), 0) AS bytes FROM files'),
      q(`SELECT kind, status, count(*) AS n FROM feedback GROUP BY 1, 2`),
      q(`SELECT o.id, o.created_at, o.last_active, o.suspended, o.doc->'settings'->>'propertyName' AS name,
                jsonb_array_length(o.doc->'rooms') AS rooms, jsonb_array_length(o.doc->'tenants') AS tenants,
                (SELECT min(email) FROM users u WHERE u.org_id = o.id) AS email
           FROM orgs o ORDER BY o.created_at DESC LIMIT 8`),
    ]);
    let dbBytes = 0;
    try { dbBytes = num((await q('SELECT pg_database_size(current_database()) AS b')).rows[0].b); } catch { /* not available */ }
    const o = orgs.rows[0];
    const twofa = (await q('SELECT count(*) FILTER (WHERE totp_secret IS NOT NULL)::int AS on, count(*)::int AS all FROM users')).rows[0];
    const secret = (v) => String(process.env[v] || '').length >= 24;
    res.json({
      // Platform security checklist (values never leave the server; only whether each is in place).
      security: {
        appSecret: secret('APP_SECRET'), cronSecret: secret('CRON_SECRET'), https: req.secure || req.headers['x-forwarded-proto'] === 'https',
        superTwoFactor: !!req.session.mfa, requireSuper2fa: process.env.SUPER_REQUIRE_2FA !== '0',
        usersWith2fa: num(twofa.on), users: num(twofa.all),
      },
      month: ym,
      landlords: { total: num(o.orgs), suspended: num(o.suspended), new7: num(o.new7), new30: num(o.new30), active7: num(o.active7), active30: num(o.active30) },
      usage: { rooms: num(o.rooms), tenants: num(o.tenants), invoices: num(o.invoices), tenantsOnTelegram: num(linked.rows[0].n) },
      adoption: { khqr: num(o.khqr), auto: num(o.auto), ownerTelegram: num(o.owner_tg), ownBot: num(o.own_bot) },
      thisMonth: { invoices: num(inv.rows[0].n), billed: num(inv.rows[0].total), paid: num(inv.rows[0].paid), sent: num(inv.rows[0].sent) },
      storage: { files: num(files.rows[0].n), fileBytes: num(files.rows[0].bytes), dbBytes },
      signups: signups.rows.map((r) => ({ day: r.d, n: num(r.n) })),
      feedback: fb.rows.map((r) => ({ kind: r.kind, status: r.status, n: num(r.n) })),
      recent: recent.rows,
      runtime: { serverless: !!process.env.VERCEL, appUrl: appUrl(), platformBot: !!PLATFORM_TOKEN },
    });
  });

  app.get('/api/super/landlords', requireSuper, async (req, res) => {
    const search = `%${str(req.query.q, 80).toLowerCase()}%`;
    const { rows } = await q(
      `SELECT o.id, o.created_at, o.last_active, o.suspended,
              o.doc->'settings'->>'propertyName' AS name, o.doc->'settings'->>'phone' AS phone,
              jsonb_array_length(o.doc->'rooms') AS rooms, jsonb_array_length(o.doc->'tenants') AS tenants,
              jsonb_array_length(o.doc->'invoices') AS invoices,
              coalesce(o.doc->'settings'->'khqr'->>'accountId', '') <> '' AS khqr,
              coalesce((o.doc->'settings'->'auto'->>'enabled')::boolean, false) AS auto,
              jsonb_array_length(coalesce(o.doc->'settings'->'telegram'->'adminChats', '[]'::jsonb)) > 0 AS owner_tg,
              (SELECT min(email) FROM users u WHERE u.org_id = o.id) AS email,
              (SELECT coalesce(sum(size), 0) FROM files f WHERE f.org_id = o.id) AS file_bytes
         FROM orgs o
        WHERE lower(coalesce(o.doc->'settings'->>'propertyName', '')) LIKE $1
           OR EXISTS (SELECT 1 FROM users u WHERE u.org_id = o.id AND u.email LIKE $1)
        ORDER BY o.created_at DESC LIMIT 300`, [search]);
    res.json({ landlords: rows.map((r) => ({ ...r, file_bytes: num(r.file_bytes) })) });
  });

  app.post('/api/super/landlords/:id/suspend', requireSuper, async (req, res) => {
    const suspended = !!req.body?.suspended;
    const { rows } = await q('UPDATE orgs SET suspended = $2 WHERE id = $1 RETURNING id', [req.params.id, suspended]);
    if (!rows.length) fail('រកមិនឃើញ', 404);
    if (suspended) await q('DELETE FROM sessions WHERE org_id = $1', [req.params.id]);
    await audit(req, suspended ? 'suspend' : 'unsuspend', req.params.id, str(req.body?.reason, 300));
    res.json({ ok: true });
  });

  // Announcements ("what's new")
  app.get('/api/super/announcements', requireSuper, async (req, res) => {
    res.json({ items: (await q('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 200')).rows });
  });

  const cleanNews = (b) => ({
    kind: NEWS_KINDS.includes(b.kind) ? b.kind : 'feature',
    title: str(b.title, 160) || fail('សូមបញ្ចូលចំណងជើង'),
    body: str(b.body, 5000),
    link: /^https?:\/\//.test(b.link || '') || String(b.link || '').startsWith('/') ? str(b.link, 300) : '',
    published: !!b.published,
  });

  app.post('/api/super/announcements', requireSuper, async (req, res) => {
    const n = cleanNews(req.body || {});
    const id = 'n' + uid(8);
    await q('INSERT INTO announcements (id, kind, title, body, link, published, published_at) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() END)',
      [id, n.kind, n.title, n.body, n.link, n.published]);
    await audit(req, 'news.create', id, n.title);
    res.json({ ok: true, id });
  });

  app.put('/api/super/announcements/:id', requireSuper, async (req, res) => {
    const n = cleanNews(req.body || {});
    const { rows } = await q(
      `UPDATE announcements SET kind = $2, title = $3, body = $4, link = $5, published = $6,
              published_at = CASE WHEN $6 AND published_at IS NULL THEN now() WHEN NOT $6 THEN NULL ELSE published_at END
        WHERE id = $1 RETURNING id`, [req.params.id, n.kind, n.title, n.body, n.link, n.published]);
    if (!rows.length) fail('រកមិនឃើញ', 404);
    await audit(req, 'news.update', req.params.id, n.title);
    res.json({ ok: true });
  });

  app.delete('/api/super/announcements/:id', requireSuper, async (req, res) => {
    await q('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    await audit(req, 'news.delete', req.params.id);
    res.json({ ok: true });
  });

  // Push an announcement to every landlord's owner Telegram.
  app.post('/api/super/announcements/:id/broadcast', requireSuper, async (req, res) => {
    const { rows } = await q('SELECT * FROM announcements WHERE id = $1 AND published', [req.params.id]);
    const n = rows[0] || fail('សូមផ្សព្វផ្សាយ (publish) ជាមុនសិន');
    if (n.broadcast_at && !req.body?.again) fail('បានផ្ញើរួចហើយ');
    const icon = { feature: '🎉', improvement: '✨', fix: '🛠', notice: '📢' }[n.kind] || '📢';
    const base = appUrl() || process.env.LOCAL_URL || '';
    const link = n.link ? (n.link.startsWith('/') ? base + n.link : n.link) : base;
    const html = `${icon} <b>${esc(n.title)}</b>\n\n${esc(n.body).slice(0, 3000)}${link ? `\n\n🔗 ${esc(link)}` : ''}\n\n— ក្រុមការងារផ្ទះយើង`;
    const orgs = (await q(`SELECT id FROM orgs WHERE NOT suspended AND jsonb_array_length(coalesce(doc->'settings'->'telegram'->'adminChats', '[]'::jsonb)) > 0`)).rows;
    let sent = 0;
    for (const o of orgs) sent += await notifyOrgOwners(o.id, html);
    await q('UPDATE announcements SET broadcast_at = now() WHERE id = $1', [n.id]);
    await audit(req, 'news.broadcast', n.id, `${sent} chats`);
    res.json({ ok: true, landlords: orgs.length, sent });
  });

  // Feedback inbox
  app.get('/api/super/feedback', requireSuper, async (req, res) => {
    const kind = KINDS.includes(req.query.kind) ? req.query.kind : null;
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const { rows } = await q(
      `SELECT f.*, o.doc->'settings'->>'propertyName' AS org_name FROM feedback f LEFT JOIN orgs o ON o.id = f.org_id
        WHERE ($1::text IS NULL OR f.kind = $1) AND ($2::text IS NULL OR f.status = $2)
        ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'progress' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END, f.votes DESC, f.created_at DESC LIMIT 300`,
      [kind, status]);
    res.json({ items: rows });
  });

  app.put('/api/super/feedback/:id', requireSuper, async (req, res) => {
    const status = STATUSES.includes(req.body?.status) ? req.body.status : fail('ស្ថានភាពមិនត្រឹមត្រូវ');
    const reply = str(req.body?.reply, 3000);
    const { rows } = await q('UPDATE feedback SET status = $2, reply = $3, updated_at = now() WHERE id = $1 RETURNING org_id, kind, title, status', [req.params.id, status, reply]);
    const f = rows[0] || fail('រកមិនឃើញ', 404);
    await audit(req, 'feedback.update', req.params.id, status);
    if (req.body?.notify && f.org_id) {
      const label = f.kind === 'issue' ? '🐞 របាយការណ៍បញ្ហា' : '💡 សំណើមុខងារ';
      await notifyOrgOwners(f.org_id, `${label}: <b>${esc(f.title)}</b>\nស្ថានភាព: <b>${STATUS_KM[status]}</b>${reply ? `\n\n💬 ${esc(reply)}` : ''}\n\n— ក្រុមការងារផ្ទះយើង`);
    }
    res.json({ ok: true });
  });

  app.delete('/api/super/feedback/:id', requireSuper, async (req, res) => {
    await q('DELETE FROM feedback WHERE id = $1', [req.params.id]);
    await audit(req, 'feedback.delete', req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/super/telegram', requireSuper, async (req, res) => res.json(await platformBotDiagnostics()));

  app.post('/api/super/telegram/fix', requireSuper, async (req, res) => {
    const r = await ensurePlatformWebhook({ force: true });
    await audit(req, 'telegram.webhook', 'platform', r.previousUrl ? `from ${r.previousUrl}` : r.reason || 'ok');
    res.json({ ...r, diagnostics: await platformBotDiagnostics() });
  });

  app.get('/api/super/errors', requireSuper, async (req, res) => res.json({ items: await listErrors({ resolved: req.query.resolved === '1' }) }));
  app.post('/api/super/errors/resolve', requireSuper, async (req, res) => {
    if (req.body?.all) await resolveAllErrors(); else await resolveError(req.body?.fingerprint);
    res.json({ items: await listErrors() });
  });

  // Reports about public listings / the map.
  app.get('/api/super/reports', requireSuper, async (req, res) => {
    const { rows } = await q(`SELECT o.id, o.doc->'settings'->>'propertyName' AS name, o.doc->'settings'->'listing'->>'slug' AS slug,
        o.listing_hidden AS hidden, count(*)::int AS count, max(r.created_at) AS last_at,
        json_agg(json_build_object('reason', r.reason, 'note', r.note, 'at', r.created_at) ORDER BY r.created_at DESC) AS items
      FROM listing_reports r JOIN orgs o ON o.id = r.org_id
      WHERE ${req.query.resolved === '1' ? 'r.resolved' : 'NOT r.resolved'}
      GROUP BY o.id ORDER BY max(r.created_at) DESC LIMIT 200`);
    res.json({ items: rows.map((r) => ({ ...r, items: (typeof r.items === 'string' ? JSON.parse(r.items) : r.items).slice(0, 20) })) });
  });
  app.post('/api/super/reports/:orgId/hide', requireSuper, async (req, res) => {
    const hidden = !!req.body?.hidden;
    const { rows } = await q('UPDATE orgs SET listing_hidden = $2 WHERE id = $1 RETURNING id', [req.params.orgId, hidden]);
    if (!rows.length) fail('រកមិនឃើញ', 404);
    await q('UPDATE listing_reports SET resolved = true WHERE org_id = $1', [req.params.orgId]);
    await audit(req, hidden ? 'hide-listing' : 'show-listing', req.params.orgId, str(req.body?.reason, 300));
    if (hidden) await notifyOrgOwners(req.params.orgId, '⚠️ <b>ទំព័របន្ទប់ទំនេររបស់អ្នកត្រូវបានលាក់ពីសាធារណៈ</b>\nមានអ្នករាយការណ៍ថាព័ត៌មានមិនត្រឹមត្រូវ។ សូមពិនិត្យតម្លៃ រូបភាព និងបន្ទប់ទំនេរ ហើយទាក់ទងក្រុមការងារផ្ទះយើង (មតិ និងសំណើ)។').catch(() => {});
    res.json({ ok: true });
  });
  app.post('/api/super/reports/:orgId/dismiss', requireSuper, async (req, res) => {
    await q('UPDATE listing_reports SET resolved = true WHERE org_id = $1', [req.params.orgId]);
    await audit(req, 'dismiss-reports', req.params.orgId);
    res.json({ ok: true });
  });

  app.get('/api/super/audit', requireSuper, async (req, res) => {
    res.json({ items: (await q('SELECT * FROM admin_audit ORDER BY at DESC LIMIT 200')).rows });
  });
}
