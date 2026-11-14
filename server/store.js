// Storage: Postgres (Neon in production via DATABASE_URL) or embedded PGlite for
// zero-setup local use. Each landlord ("org") is one JSONB document, locked with
// SELECT … FOR UPDATE for the duration of a request so concurrent edits serialise.
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

export const als = new AsyncLocalStorage();
export const uid = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');
export const now = () => new Date().toISOString();
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orgs (id text PRIMARY KEY, doc jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text UNIQUE NOT NULL, pass_hash text NOT NULL, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner', reset_hash text, reset_expires timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, org_id text NOT NULL, expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS lookups (kind text NOT NULL, key text NOT NULL, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, PRIMARY KEY (kind, key, org_id));
CREATE INDEX IF NOT EXISTS lookups_org ON lookups(org_id);
CREATE TABLE IF NOT EXISTS files (id text PRIMARY KEY, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, mime text NOT NULL, size int NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS files_org ON files(org_id);
ALTER TABLE files ADD COLUMN IF NOT EXISTS backend text NOT NULL DEFAULT 'db';
ALTER TABLE files ADD COLUMN IF NOT EXISTS ref text NOT NULL DEFAULT '';
ALTER TABLE files ALTER COLUMN data DROP NOT NULL;
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, count int NOT NULL);
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS listing_hidden boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS listing_reports (id text PRIMARY KEY, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, reason text NOT NULL,
  note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), resolved boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS listing_reports_org ON listing_reports(org_id);
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS last_active timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seen_news_at timestamptz;
CREATE TABLE IF NOT EXISTS announcements (id text PRIMARY KEY, kind text NOT NULL DEFAULT 'feature', title text NOT NULL, body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '', published boolean NOT NULL DEFAULT false, published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), broadcast_at timestamptz);
CREATE TABLE IF NOT EXISTS feedback (id text PRIMARY KEY, org_id text REFERENCES orgs(id) ON DELETE SET NULL, user_email text NOT NULL DEFAULT '', kind text NOT NULL,
  title text NOT NULL, body text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'new', reply text NOT NULL DEFAULT '', context jsonb NOT NULL DEFAULT '{}'::jsonb,
  votes int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS feedback_kind ON feedback(kind, status);
CREATE TABLE IF NOT EXISTS feedback_votes (feedback_id text NOT NULL REFERENCES feedback(id) ON DELETE CASCADE, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, PRIMARY KEY (feedback_id, org_id));
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_name text;
CREATE INDEX IF NOT EXISTS users_tg ON users(telegram_id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS can_reset_until timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device text NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip text NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS tg_logins (id text PRIMARY KEY, mode text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'pending',
  user_id text, telegram_id text, ip text NOT NULL DEFAULT '', ua text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS platform_kv (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE IF NOT EXISTS push_subs (id text PRIMARY KEY, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, user_id text, sub jsonb NOT NULL,
  ua text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS push_subs_org ON push_subs(org_id);
CREATE TABLE IF NOT EXISTS invites (id text PRIMARY KEY, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, role text NOT NULL, name text NOT NULL DEFAULT '',
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), expires timestamptz NOT NULL, used_by text, used_at timestamptz);
CREATE INDEX IF NOT EXISTS invites_org ON invites(org_id);
CREATE TABLE IF NOT EXISTS errors (fingerprint text PRIMARY KEY, source text NOT NULL, message text NOT NULL, stack text NOT NULL DEFAULT '',
  path text NOT NULL DEFAULT '', org_id text, ua text NOT NULL DEFAULT '', count int NOT NULL DEFAULT 1, resolved boolean NOT NULL DEFAULT false,
  first_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS memberships (user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, org_id));
CREATE TABLE IF NOT EXISTS admin_audit (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, action text NOT NULL, target text NOT NULL DEFAULT '', detail text NOT NULL DEFAULT '');
`;

let driver; // { query(sql, params) -> {rows}, tx(fn(q)) }
let ready;

async function makeDriver() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: +process.env.PG_POOL_MAX || 5, idleTimeoutMillis: 10000 });
    pool.on('error', (e) => console.error('[pg]', e.message));
    return {
      kind: 'postgres',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn((sql, params) => client.query(sql, params));
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = path.resolve(process.env.DATA_DIR || 'data', 'pglite');
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  return {
    kind: 'pglite',
    query: (sql, params) => db.query(sql, params),
    exec: (sql) => db.exec(sql),
    tx: (fn) => db.transaction((t) => fn((sql, params) => t.query(sql, params))),
  };
}

export function init() {
  if (!ready) {
    ready = (async () => {
      driver = await makeDriver();
      await driver.exec(SCHEMA);
      return driver;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export const storeKind = () => driver?.kind || '';

// Upgrades older landlord documents in place when they are opened (set by app.js).
let migrateDocument = (d) => d;
export const setDocMigrator = (fn) => { migrateDocument = fn; };

/** Run a query on the current transaction when inside withOrg, else on the pool. */
export async function q(sql, params = []) {
  await init();
  const ctx = als.getStore();
  return (ctx?.q || driver.query)(sql, params);
}

// ---------- orgs ----------

export async function createOrg(doc) {
  await init();
  const id = 'o' + uid(8);
  doc.id = id;
  await driver.query('INSERT INTO orgs (id, doc) VALUES ($1, $2::jsonb)', [id, JSON.stringify(doc)]);
  await driver.tx((tq) => syncLookups(tq, id, doc));
  return id;
}

export async function listOrgIds() {
  const { rows } = await q('SELECT id FROM orgs WHERE NOT suspended ORDER BY created_at');
  return rows.map((r) => r.id);
}

/**
 * Lock the org row, expose its document through db()/save() for the duration of fn,
 * then persist it (and refresh lookup keys) if anything changed.
 */
export async function withOrg(orgId, fn) {
  await init();
  if (als.getStore()?.orgId === orgId) return fn(); // already inside this org
  return driver.tx(async (tq) => {
    const { rows } = await tq('SELECT doc, suspended FROM orgs WHERE id = $1 FOR UPDATE', [orgId]);
    if (!rows.length) { const e = new Error('Org not found'); e.status = 404; throw e; }
    if (rows[0].suspended) { const e = new Error('គណនីនេះត្រូវបានផ្អាក។ សូមទាក់ទងក្រុមការងារផ្ទះយើង។'); e.status = 403; throw e; }
    const raw = typeof rows[0].doc === 'string' ? JSON.parse(rows[0].doc) : rows[0].doc;
    const ctx = { orgId, doc: migrateDocument(raw), dirty: false, q: tq, after: [] };
    const out = await als.run(ctx, fn);
    if (ctx.dirty) {
      await tq('UPDATE orgs SET doc = $2::jsonb, updated_at = now(), last_active = now() WHERE id = $1', [orgId, JSON.stringify(ctx.doc)]);
      await syncLookups(tq, orgId, ctx.doc);
    }
    return out;
  });
}

/** Keys that let webhooks and public links find their org without scanning every document. */
function lookupKeys(doc) {
  const keys = [];
  const botKey = doc.settings?.telegram?.token ? doc.id : 'platform';
  for (const t of doc.tenants || []) {
    if (t.portalToken) keys.push(['portal', t.portalToken]);
    if (t.linkCode) keys.push(['link', t.linkCode]);
    if (t.telegram?.chatId) keys.push([`chat:${botKey}`, String(t.telegram.chatId)]);
  }
  for (const c of doc.settings?.telegram?.adminChats || []) keys.push([`chat:${botKey}`, String(c.chatId)]);
  if (doc.settings?.telegram?.adminLinkCode) keys.push(['admin-link', doc.settings.telegram.adminLinkCode]);
  if (doc.settings?.listing?.enabled && doc.settings.listing.slug) keys.push(['listing', doc.settings.listing.slug]);
  return keys;
}

async function syncLookups(tq, orgId, doc) {
  await tq('DELETE FROM lookups WHERE org_id = $1', [orgId]);
  const keys = [...new Map(lookupKeys(doc).map((k) => [k.join('\u0000'), k])).values()];
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const params = [orgId];
    const values = chunk.map(([kind, key]) => { params.push(kind, key); return `($${params.length - 1}, $${params.length}, $1)`; });
    await tq(`INSERT INTO lookups (kind, key, org_id) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`, params);
  }
}

export async function findOrgs(kind, key) {
  const { rows } = await q('SELECT l.org_id FROM lookups l JOIN orgs o ON o.id = l.org_id WHERE l.kind = $1 AND l.key = $2 AND NOT o.suspended', [kind, String(key)]);
  return rows.map((r) => r.org_id);
}

// ---------- users & sessions ----------

export async function getUserByEmail(email) {
  const { rows } = await q('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
  return rows[0] || null;
}
export async function getUser(id) {
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}
export async function createUser({ email, passHash, orgId, role = 'owner' }) {
  const id = 'u' + uid(8);
  await q('INSERT INTO users (id, email, pass_hash, org_id, role) VALUES ($1, $2, $3, $4, $5)', [id, String(email).trim().toLowerCase(), passHash, orgId, role]);
  return id;
}
export const setPassword = (userId, passHash) => q('UPDATE users SET pass_hash = $2, reset_hash = NULL, reset_expires = NULL WHERE id = $1', [userId, passHash]);
export const setReset = (userId, hash, expires) => q('UPDATE users SET reset_hash = $2, reset_expires = $3 WHERE id = $1', [userId, hash, expires]);
export const ownersOf = async (orgId) => (await q('SELECT id, email FROM users WHERE org_id = $1', [orgId])).rows;

export async function createSession(userId, orgId, days, { canReset = false, device = '', ip = '', mfa = false } = {}) {
  const token = uid(32); // 256 random bits; only its SHA-256 is stored
  await q('DELETE FROM sessions WHERE expires < now()');
  await q('INSERT INTO sessions (id, user_id, org_id, expires, can_reset_until, device, ip, mfa, last_seen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())',
    [sha256(token), userId, orgId, new Date(Date.now() + days * 86400000).toISOString(), canReset ? new Date(Date.now() + 30 * 60000).toISOString() : null,
      String(device).slice(0, 80), String(ip).slice(0, 60), !!mfa]);
  return token;
}
/** Remember when a session was last used (at most every few minutes, to keep writes low). */
export const touchSession = (id) => q("UPDATE sessions SET last_seen = now() WHERE id = $1 AND (last_seen IS NULL OR last_seen < now() - interval '5 minutes')", [id]);
export async function getSession(token) {
  if (!token) return null;
  // The role is for the property the session is looking at: the user's own account, or an extra property they added.
  const { rows } = await q(`SELECT s.*, u.email, u.org_id AS home_org,
      COALESCE(m.role, CASE WHEN u.org_id = s.org_id THEN u.role END) AS role
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
    WHERE s.id = $1 AND s.expires > now()`, [sha256(token)]);
  return rows[0]?.role ? rows[0] : null;
}
export const deleteSession = (token) => q('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
export const deleteUserSessions = (userId) => q('DELETE FROM sessions WHERE user_id = $1', [userId]);

// ---------- files (private documents, stored in the database) ----------

export async function putFile(orgId, id, mime, buffer) {
  await q('INSERT INTO files (id, org_id, mime, size, data) VALUES ($1, $2, $3, $4, $5)', [id, orgId, mime, buffer.length, buffer]);
}
export async function getFile(orgId, id) {
  const { rows } = await q('SELECT mime, data FROM files WHERE id = $1 AND org_id = $2', [id, orgId]);
  if (!rows[0]) return null;
  return { mime: rows[0].mime, data: Buffer.from(rows[0].data) };
}
export const deleteFile = (orgId, id) => q('DELETE FROM files WHERE id = $1 AND org_id = $2', [id, orgId]);

// ---------- rate limiting (shared across serverless instances) ----------

/** Returns true when the action is allowed. */
export async function rateLimit(key, max, windowSec) {
  const { rows } = await q(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval THEN now() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, String(windowSec)],
  );
  if (Math.random() < 0.02) q("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'").catch(() => {});
  return rows[0].count <= max;
}
export const clearRateLimit = (key) => q('DELETE FROM rate_limits WHERE key = $1', [key]);

// ---------- several properties under one login ----------

export async function propertiesOf(userId) {
  const { rows } = await q(`SELECT o.id, o.doc->'settings'->>'propertyName' AS name, x.role, x.home, o.suspended,
      jsonb_array_length(COALESCE(o.doc->'rooms', '[]'::jsonb)) AS rooms
    FROM (SELECT org_id, role, true AS home FROM users WHERE id = $1
          UNION ALL SELECT org_id, role, false FROM memberships WHERE user_id = $1) x
    JOIN orgs o ON o.id = x.org_id ORDER BY x.home DESC, o.created_at`, [userId]);
  return rows;
}
export const addMembership = (userId, orgId, role = 'owner') => q('INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, orgId, role]);
export const switchSessionOrg = (token, orgId) => q('UPDATE sessions SET org_id = $2 WHERE id = $1', [sha256(token), orgId]);
