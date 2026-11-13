// Team: the owner invites managers and staff with a one-time link (7 days). Each person has their own login.
import { q, uid, sha256, getUserByEmail, createUser, deleteUserSessions, rateLimit, withOrg } from './store.js';
import { requireOwner, hashPassword, startSession } from './auth.js';
import { ROLES } from './roles.js';
import { logEvent } from './db.js';

const err = (status, error) => Object.assign(new Error(error), { status });
const isEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(e || '').trim());
const ROLE_KM = { owner: 'ម្ចាស់ផ្ទះ', manager: 'អ្នកគ្រប់គ្រង', staff: 'បុគ្គលិក' };

async function findInvite(token) {
  const { rows } = await q(`SELECT i.*, o.doc->'settings'->>'propertyName' AS property FROM invites i JOIN orgs o ON o.id = i.org_id
    WHERE i.id = $1 AND i.used_at IS NULL AND i.expires > now() AND NOT o.suspended`, [sha256(String(token || ''))]);
  return rows[0] || null;
}

async function team(orgId, meId) {
  const members = (await q('SELECT id, email, role, telegram_name, created_at FROM users WHERE org_id = $1 ORDER BY created_at', [orgId])).rows
    .map((u) => ({ id: u.id, email: /@telegram\.local$/.test(u.email) ? '' : u.email, role: u.role, telegram: u.telegram_name || '', at: u.created_at, you: u.id === meId }));
  const invites = (await q('SELECT id, role, name, created_at, expires FROM invites WHERE org_id = $1 AND used_at IS NULL AND expires > now() ORDER BY created_at DESC', [orgId])).rows
    .map((i) => ({ id: i.id.slice(0, 16), role: i.role, name: i.name, at: i.created_at, expires: i.expires }));
  return { members, invites };
}

export function teamRoutes(app) {
  app.get('/api/team/me', requireOwner, (req, res) => res.json({ role: req.session.role }));

  app.get('/api/team', requireOwner, async (req, res) => res.json(await team(req.session.orgId, req.session.userId)));

  app.post('/api/team/invites', requireOwner, async (req, res) => {
    const role = String(req.body?.role || '');
    if (!['manager', 'staff'].includes(role)) throw err(400, 'តួនាទីមិនត្រឹមត្រូវ');
    const { rows } = await q('SELECT count(*)::int AS n FROM invites WHERE org_id = $1 AND used_at IS NULL AND expires > now()', [req.session.orgId]);
    if (rows[0].n >= 20) throw err(400, 'មានការអញ្ជើញច្រើនពេក — សូមលុបចាស់ៗខ្លះ');
    const token = uid(18);
    await q('INSERT INTO invites (id, org_id, role, name, created_by, expires) VALUES ($1, $2, $3, $4, $5, $6)',
      [sha256(token), req.session.orgId, role, String(req.body?.name || '').trim().slice(0, 60), req.session.userId, new Date(Date.now() + 7 * 86400000).toISOString()]);
    res.json({ token, ...(await team(req.session.orgId, req.session.userId)) });
  });

  app.delete('/api/team/invites/:id', requireOwner, async (req, res) => {
    await q('DELETE FROM invites WHERE org_id = $1 AND substr(id, 1, 16) = $2', [req.session.orgId, String(req.params.id)]);
    res.json(await team(req.session.orgId, req.session.userId));
  });

  app.put('/api/team/:userId', requireOwner, async (req, res) => {
    const role = String(req.body?.role || '');
    if (!ROLES.includes(role)) throw err(400, 'តួនាទីមិនត្រឹមត្រូវ');
    if (req.params.userId === req.session.userId) throw err(400, 'មិនអាចប្តូរតួនាទីខ្លួនឯងបានទេ');
    const r = await q('UPDATE users SET role = $3 WHERE id = $1 AND org_id = $2', [req.params.userId, req.session.orgId, role]);
    if (!r.rowCount) throw err(404, 'រកមិនឃើញសមាជិក');
    await deleteUserSessions(req.params.userId); // sign in again with the new rights
    res.json(await team(req.session.orgId, req.session.userId));
  });

  app.delete('/api/team/:userId', requireOwner, async (req, res) => {
    if (req.params.userId === req.session.userId) throw err(400, 'មិនអាចដកខ្លួនឯងចេញបានទេ');
    await q('DELETE FROM push_subs WHERE user_id = $1 AND org_id = $2', [req.params.userId, req.session.orgId]);
    const r = await q('DELETE FROM users WHERE id = $1 AND org_id = $2', [req.params.userId, req.session.orgId]);
    if (!r.rowCount) throw err(404, 'រកមិនឃើញសមាជិក');
    res.json(await team(req.session.orgId, req.session.userId));
  });

  // ----- public: the invited person opens the link -----

  app.get('/api/join/:token', async (req, res) => {
    if (!(await rateLimit(`join:${req.ip}`, 30, 600))) throw err(429, 'ព្យាយាមច្រើនដងពេក');
    const inv = await findInvite(req.params.token);
    if (!inv) throw err(404, 'តំណអញ្ជើញនេះផុតកំណត់ ឬបានប្រើរួចហើយ');
    res.json({ property: inv.property, role: inv.role, roleKm: ROLE_KM[inv.role], name: inv.name });
  });

  app.post('/api/join/:token', async (req, res) => {
    if (!(await rateLimit(`join:${req.ip}`, 30, 600))) throw err(429, 'ព្យាយាមច្រើនដងពេក');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!isEmail(email)) throw err(400, 'អ៊ីមែលមិនត្រឹមត្រូវ');
    if (password.length < 8) throw err(400, 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួ');
    const inv = await findInvite(req.params.token);
    if (!inv) throw err(404, 'តំណអញ្ជើញនេះផុតកំណត់ ឬបានប្រើរួចហើយ');
    if (await getUserByEmail(email)) throw err(409, 'អ៊ីមែលនេះមានគណនីរួចហើយ — សូមប្រើអ៊ីមែលផ្សេង');
    // Claim the invite first so it can be used only once, even with two clicks at the same time.
    const claim = await q('UPDATE invites SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id', [inv.id]);
    if (!claim.rowCount) throw err(404, 'តំណអញ្ជើញនេះបានប្រើរួចហើយ');
    const userId = await createUser({ email, passHash: hashPassword(password), orgId: inv.org_id, role: inv.role });
    await q('UPDATE invites SET used_by = $2 WHERE id = $1', [inv.id, userId]);
    await withOrg(inv.org_id, () => logEvent('admin', `${inv.name || email} បានចូលរួមជា${ROLE_KM[inv.role]}`)).catch(() => {});
    await startSession(req, res, { id: userId, org_id: inv.org_id });
    res.json({ ok: true });
  });
}
