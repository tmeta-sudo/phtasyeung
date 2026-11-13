// Local / self-hosted entry: `npm run dev` (with Vite) or `npm start` (serves dist/).
// Uses embedded PGlite under DATA_DIR unless DATABASE_URL is set.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { init, q, createOrg, createUser, storeKind, putFile } from './store.js';
import { migrateDoc } from './db.js';
import { refreshPolling, registerAllWebhooks, appUrl } from './telegram.js';
import { runDailyAll } from './scheduler.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const PORT = +process.env.PORT || 5173;

await init();

// One-time import of the single-owner v2 data file (data/db.json) as a landlord account.
const legacy = path.resolve(process.env.DATA_DIR || 'data', 'db.json');
if (fs.existsSync(legacy) && !(await q('SELECT 1 FROM users LIMIT 1')).rows.length) {
  const old = JSON.parse(fs.readFileSync(legacy, 'utf8'));
  const passHash = old.auth?.passwordHash;
  const orgId = await createOrg(migrateDoc(old));
  if (passHash) await createUser({ email: 'admin', passHash, orgId });
  // Move uploaded ID cards/photos from data/uploads into the database.
  const uploads = path.join(path.dirname(legacy), 'uploads');
  let moved = 0;
  for (const t of old.tenants || []) {
    for (const meta of Object.values(t.files || {})) {
      const file = path.join(uploads, `${meta.id}.${meta.ext}`);
      if (/^[\w-]+$/.test(meta.id) && fs.existsSync(file)) { await putFile(orgId, meta.id, meta.type, fs.readFileSync(file)); moved += 1; }
    }
  }
  if (moved) console.log(`  Moved ${moved} uploaded document(s) into the database.`);
  fs.renameSync(legacy, legacy + '.imported');
  console.log('  Imported data/db.json — sign in with email "admin" and your old password.');
}

const host = express();
host.use(app);
if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  host.use(vite.middlewares);
} else {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) { console.error('dist/ not found — run "npm run build" first, or use "npm run dev".'); process.exit(1); }
  host.use(express.static(dist, { index: false, maxAge: '1h' }));
  host.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

host.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n  ផ្ទះយើង → http://localhost:${PORT}/   (database: ${storeKind()})\n`);
  if (appUrl().startsWith('https://')) {
    console.log('  Telegram webhooks:', (await registerAllWebhooks()).join(', ') || 'no bots');
  } else {
    const n = await refreshPolling();
    if (n) console.log(`  Telegram: polling ${n} bot(s)`);
    setInterval(() => refreshPolling().catch(() => {}), 60 * 1000);
  }
  setTimeout(() => runDailyAll({ respectHour: true }).catch((e) => console.error(e)), 10 * 1000);
  setInterval(() => runDailyAll({ respectHour: true }).catch((e) => console.error(e)), 15 * 60 * 1000);
});
