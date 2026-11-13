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
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, count int NOT NULL);
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
  const { rows } = await q('SELECT id FROM orgs ORDER BY created_at');
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
    const { rows } = await tq('SELECT doc FROM orgs WHERE id = $1 FOR UPDATE', [orgId]);
    if (!rows.length) { const e = new Error('Org not found'); e.status = 404; throw e; }
    const ctx = { orgId, doc: typeof rows[0].doc === 'string' ? JSON.parse(rows[0].doc) : rows[0].doc, dirty: false, q: tq, after: [] };
    const out = await als.run(ctx, fn);
    if (ctx.dirty) {
      await tq('UPDATE orgs SET doc = $2::jsonb, updated_at = now() WHERE id = $1', [orgId, JSON.stringify(ctx.doc)]);
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
  const { rows } = await q('SELECT org_id FROM lookups WHERE kind = $1 AND key = $2', [kind, String(key)]);
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
export async function createUser({ email, passHash, orgId }) {
  const id = 'u' + uid(8);
  await q('INSERT INTO users (id, email, pass_hash, org_id) VALUES ($1, $2, $3, $4)', [id, String(email).trim().toLowerCase(), passHash, orgId]);
  return id;
}
export const setPassword = (userId, passHash) => q('UPDATE users SET pass_hash = $2, reset_hash = NULL, reset_expires = NULL WHERE id = $1', [userId, passHash]);
export const setReset = (userId, hash, expires) => q('UPDATE users SET reset_hash = $2, reset_expires = $3 WHERE id = $1', [userId, hash, expires]);
export const ownersOf = async (orgId) => (await q('SELECT id, email FROM users WHERE org_id = $1', [orgId])).rows;

export async function createSession(userId, orgId, days) {
  const token = uid(24);
  await q('DELETE FROM sessions WHERE expires < now()');
  await q('INSERT INTO sessions (id, user_id, org_id, expires) VALUES ($1, $2, $3, $4)', [sha256(token), userId, orgId, new Date(Date.now() + days * 86400000).toISOString()]);
  return token;
}
export async function getSession(token) {
  if (!token) return null;
  const { rows } = await q('SELECT s.*, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires > now()', [sha256(token)]);
  return rows[0] || null;
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
