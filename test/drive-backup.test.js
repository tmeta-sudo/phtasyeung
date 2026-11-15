import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, landlord } from './helpers.js';

// A fake Google: OAuth token exchange/refresh/revoke, userinfo, and Drive folder + multipart uploads.
let google; let env;
const calls = { uploads: [], patches: [], revoked: [] };
function fakeGoogle() {
  let n = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      const url = req.url;
      if (url === '/token') return json({ access_token: 'at-' + (++n), refresh_token: 'rt-secret', expires_in: 3600 });
      if (url === '/revoke') { calls.revoked.push(new URLSearchParams(body.toString()).get('token')); return json({}); }
      if (url.startsWith('/oauth2/v3/userinfo')) return json({ email: 'landlord@gmail.com' });
      if (url.startsWith('/drive/v3/files')) return json({ id: 'folder-1' });
      if (url.startsWith('/upload/drive/v3/files')) {
        const meta = JSON.parse(body.toString('latin1').split('\r\n\r\n')[1].split('\r\n')[0]);
        const zipAt = body.indexOf(Buffer.from('PK'));
        const rec = { name: meta.name, parents: meta.parents, isZip: zipAt > 0, bytes: body.length };
        if (req.method === 'PATCH') { calls.patches.push({ ...rec, id: url.split('/')[5].split('?')[0] }); return json({ id: url.split('/')[5].split('?')[0] }); }
        calls.uploads.push(rec);
        return json({ id: 'file-' + (++n) });
      }
      res.statusCode = 404; res.end();
    });
  });
  return new Promise((r) => server.listen(0, () => r({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

before(async () => {
  google = await fakeGoogle();
  env = await boot({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', GOOGLE_OAUTH_BASE: google.url, GOOGLE_API_BASE: google.url });
});
after(async () => { await env?.close(); google?.close(); });

async function connect(c, purpose) {
  const { url } = await c.get(`/api/storage/google/start${purpose ? `?purpose=${purpose}` : ''}`);
  const u = new URL(url);
  assert.equal(u.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/drive.file', 'only files the app creates');
  const res = await c.raw(`/api/storage/google/callback?code=abc&state=${encodeURIComponent(u.searchParams.get('state'))}`, { redirect: 'manual' });
  return res.headers.get('location');
}

test('one tap: connect Google Drive for backups, first backup at once, monthly copy, revoke on disconnect', async () => {
  const { c } = await landlord(env.url);
  const st0 = await c.get('/api/state');
  assert.equal(st0.runtime.googleDrive, true);

  const where = await connect(c);
  assert.equal(where, '/settings?drive=connected#backup');
  let st = await c.get('/api/state');
  assert.equal(st.settings.storage.mode, 'database', 'backup-only: ID cards stay where they are');
  assert.equal(st.settings.storage.gdrive.email, 'landlord@gmail.com');
  assert.ok(st.settings.storage.gdrive.lastBackupAt, 'first backup already done');
  assert.ok(!JSON.stringify(st).includes('rt-secret'), 'refresh token never reaches the browser');
  const names = calls.uploads.map((u) => u.name);
  assert.ok(names.includes('phteah-yeung-backup.zip'));
  assert.ok(names.some((x) => /^phteah-yeung-\d{4}-\d{2}\.zip$/.test(x)), 'monthly copy');
  assert.ok(calls.uploads.every((u) => u.isZip && u.parents?.[0] === 'folder-1'));
  assert.ok(st.settings.backup.lastAt, 'counts as a backup in the status line');

  // "Back up now": overwrites the same file, no second monthly copy.
  const before = calls.uploads.length;
  const r = await c.post('/api/storage/backup');
  assert.ok(r.bytes > 100);
  assert.equal(calls.uploads.length, before);
  assert.equal(calls.patches.at(-1).name, 'phteah-yeung-backup.zip');

  // Disconnect: access withdrawn at Google, nothing left on our side.
  await c.post('/api/storage/disconnect');
  assert.deepEqual(calls.revoked, ['rt-secret']);
  st = await c.get('/api/state');
  assert.equal(st.settings.storage.gdrive, null);
});

test('connecting for storage still moves files to Drive', async () => {
  const { c } = await landlord(env.url);
  assert.equal(await connect(c, 'storage'), '/settings?storage=connected');
  assert.equal((await c.get('/api/state')).settings.storage.mode, 'gdrive');
});
