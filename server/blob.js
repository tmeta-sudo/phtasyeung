// Where uploaded documents (ID cards, photos, contracts) live.
//
//   db      — Postgres bytea (default; fine for small/medium use)
//   r2      — Cloudflare R2 for the whole platform, when R2_* env vars are set
//   gdrive  — the landlord's OWN Google Drive (per landlord, opt-in). Files sit in a
//             "ផ្ទះយើង" folder in their Drive; the app only sees files it created
//             (drive.file scope) and keeps an encrypted refresh token.
//
// The files table always keeps a small row (id, org, mime, size, backend, ref) so a
// file can be found, served only to its landlord/customer, and moved between backends.
import crypto from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { q } from './store.js';

// ---------- secrets ----------

const KEY = crypto.createHash('sha256').update(String(process.env.APP_SECRET || process.env.CRON_SECRET || process.env.DATABASE_URL || 'local-dev-secret')).digest();
export const hasAppSecret = () => !!process.env.APP_SECRET;

export function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}
export function unseal(sealed) {
  const [iv, tag, enc] = String(sealed || '').split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ---------- Cloudflare R2 (S3 API) ----------

const r2Config = () => {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !(R2_ACCOUNT_ID || R2_ENDPOINT)) return null;
  return {
    bucket: R2_BUCKET,
    endpoint: (R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/+$/, ''),
    client: new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' }),
  };
};
export const r2Enabled = () => !!r2Config();

async function r2(method, key, body, type) {
  const c = r2Config();
  const res = await c.client.fetch(`${c.endpoint}/${c.bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`, {
    method, body, headers: type ? { 'content-type': type } : undefined,
  });
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new Error(`R2 ${method} ${res.status}`);
  return res;
}

// ---------- Google Drive (landlord's own) ----------

const G_OAUTH = process.env.GOOGLE_OAUTH_BASE || 'https://oauth2.googleapis.com';
const G_API = process.env.GOOGLE_API_BASE || 'https://www.googleapis.com';
export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const tokenCache = new Map(); // orgId -> { token, exp }

export async function googleExchange(code, redirectUri) {
  const res = await fetch(`${G_OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || 'Google sign-in failed');
  return j;
}

async function googleToken(orgId, gdrive) {
  const hit = tokenCache.get(orgId);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  const res = await fetch(`${G_OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: unseal(gdrive.refreshToken), grant_type: 'refresh_token' }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw Object.assign(new Error('Google Drive access was removed. Please reconnect.'), { code: 'GDRIVE_AUTH' });
  tokenCache.set(orgId, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

export async function googleApi(orgId, gdrive, path, init = {}) {
  const token = await googleToken(orgId, gdrive);
  const res = await fetch(`${G_API}${path}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } });
  if (!res.ok && !(init.method === 'DELETE' && res.status === 404)) throw new Error(`Google Drive ${res.status}`);
  return res;
}

export async function googleEmail(accessToken) {
  const res = await fetch(`${G_API}/oauth2/v3/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } });
  return res.ok ? (await res.json()).email || '' : '';
}

export async function googleCreateFolder(accessToken, name) {
  const res = await fetch(`${G_API}/drive/v3/files?fields=id`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const j = await res.json();
  if (!res.ok || !j.id) throw new Error('Could not create the Google Drive folder');
  return j.id;
}

/** Create or overwrite a file in the landlord's Drive folder. Returns the Drive file id. */
export async function googleUpload(orgId, gdrive, { name, mime, data, fileId = '' }) {
  const boundary = 'py' + crypto.randomBytes(8).toString('hex');
  const meta = fileId ? { name } : { name, parents: [gdrive.folderId] };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await googleApi(orgId, gdrive, `/upload/drive/v3/files${fileId ? `/${fileId}` : ''}?uploadType=multipart&fields=id`, {
    method: fileId ? 'PATCH' : 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body,
  });
  return (await res.json()).id;
}

// ---------- the storage API used by the app ----------

/** Decide where a new file goes for this landlord. */
export function backendFor(settings) {
  const g = settings?.storage;
  if (g?.mode === 'gdrive' && g.gdrive?.refreshToken && g.gdrive?.folderId && googleEnabled()) return 'gdrive';
  return r2Enabled() ? 'r2' : 'db';
}

export async function putBlob(orgId, settings, { id, mime, data, name }) {
  const backend = backendFor(settings);
  let ref = '';
  if (backend === 'r2') { ref = `${orgId}/${id}`; await r2('PUT', ref, data, mime); }
  if (backend === 'gdrive') ref = await googleUpload(orgId, settings.storage.gdrive, { name: name || id, mime, data });
  await q('INSERT INTO files (id, org_id, mime, size, data, backend, ref) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, orgId, mime, data.length, backend === 'db' ? data : null, backend, ref]);
  return backend;
}

async function readBackend(orgId, settings, row) {
  if (row.backend === 'r2') return Buffer.from(await (await r2('GET', row.ref)).arrayBuffer());
  if (row.backend === 'gdrive') return Buffer.from(await (await googleApi(orgId, settings.storage.gdrive, `/drive/v3/files/${row.ref}?alt=media`)).arrayBuffer());
  return row.data ? Buffer.from(row.data) : null;
}

export async function getBlob(orgId, settings, id) {
  const { rows } = await q('SELECT mime, data, backend, ref FROM files WHERE id = $1 AND org_id = $2', [id, orgId]);
  if (!rows[0]) return null;
  const data = await readBackend(orgId, settings, rows[0]);
  return data && { mime: rows[0].mime, data };
}

export async function deleteBlob(orgId, settings, id) {
  const { rows } = await q('DELETE FROM files WHERE id = $1 AND org_id = $2 RETURNING backend, ref', [id, orgId]);
  const r = rows[0];
  if (!r) return;
  try {
    if (r.backend === 'r2') await r2('DELETE', r.ref);
    if (r.backend === 'gdrive') await googleApi(orgId, settings.storage.gdrive, `/drive/v3/files/${r.ref}`, { method: 'DELETE' });
  } catch (e) { console.error('[blob] delete failed', e.message); }
}

/** Move up to `limit` of this landlord's files into their current target backend. */
export async function migrateBlobs(orgId, settings, limit = 20) {
  const target = backendFor(settings);
  const { rows } = await q('SELECT id, mime, data, backend, ref FROM files WHERE org_id = $1 AND backend <> $2 LIMIT $3', [orgId, target, limit]);
  let moved = 0;
  for (const row of rows) {
    const data = await readBackend(orgId, { ...settings, storage: settings.storage }, row).catch(() => null);
    if (!data) continue;
    let ref = '';
    if (target === 'r2') { ref = `${orgId}/${row.id}`; await r2('PUT', ref, data, row.mime); }
    if (target === 'gdrive') ref = await googleUpload(orgId, settings.storage.gdrive, { name: row.id, mime: row.mime, data });
    await q('UPDATE files SET backend = $2, ref = $3, data = $4 WHERE id = $1', [row.id, target, ref, target === 'db' ? data : null]);
    if (row.backend === 'r2') await r2('DELETE', row.ref).catch(() => {});
    moved += 1;
  }
  const { rows: left } = await q('SELECT count(*) AS n FROM files WHERE org_id = $1 AND backend <> $2', [orgId, target]);
  return { target, moved, remaining: Number(left[0].n) };
}

export async function storageSummary(orgId) {
  const { rows } = await q('SELECT backend, count(*) AS n, coalesce(sum(size), 0) AS bytes FROM files WHERE org_id = $1 GROUP BY backend', [orgId]);
  return rows.map((r) => ({ backend: r.backend, files: Number(r.n), bytes: Number(r.bytes) }));
}
