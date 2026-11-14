// Private customer documents (ID card front/back, profile photo, signed contract).
// Stored as bytea rows scoped to the landlord; never publicly addressable.
import multer from 'multer';
import { uid, now, save, orgId, db } from './db.js';
import { putBlob, getBlob, deleteBlob } from './blob.js';

export const SLOTS = { idFront: 'អត្តសញ្ញាណប័ណ្ណ (មុខ)', idBack: 'អត្តសញ្ញាណប័ណ្ណ (ក្រោយ)', photo: 'រូបថត', contract: 'កិច្ចសន្យា' };
const MAX = 4 * 1024 * 1024; // Vercel functions accept bodies up to 4.5 MB; the browser shrinks photos first.

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX, files: 1 } }).single('file');

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['jpg', 'image/jpeg'];
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['png', 'image/png'];
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return ['webp', 'image/webp'];
  if (buf.subarray(0, 5).toString() === '%PDF-') return ['pdf', 'application/pdf'];
  return null;
}

export async function removeFile(meta) {
  if (meta?.id) await deleteBlob(orgId(), db().settings, meta.id);
}

/** Store an uploaded file into tenant.files[slot]. Returns an error string or ''. */
export async function storeFile(tenant, slot, file) {
  if (!SLOTS[slot]) return 'ប្រភេទឯកសារមិនត្រឹមត្រូវ';
  if (!file?.buffer?.length) return 'សូមជ្រើសរើសឯកសារ';
  const kind = sniff(file.buffer);
  if (!kind || (slot !== 'contract' && kind[0] === 'pdf')) return 'អនុញ្ញាតតែរូបភាព JPG, PNG ឬ WEBP' + (slot === 'contract' ? ' ឬ PDF' : '');
  const meta = { id: uid(16), ext: kind[0], type: kind[1], size: file.buffer.length, at: now() };
  const who = (tenant.nameEn || tenant.nameKm || tenant.id).replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 40);
  meta.backend = await putBlob(orgId(), db().settings, { id: meta.id, mime: meta.type, data: file.buffer, name: `${tenant.roomId || 'room'} ${who} ${slot}.${meta.ext}` });
  await removeFile(tenant.files?.[slot]);
  tenant.files = { ...(tenant.files || {}), [slot]: meta };
  tenant.updatedAt = now();
  save();
  return '';
}

export async function sendStored(res, org, meta) {
  let f = null;
  try { f = meta?.id && await getBlob(org, db().settings, meta.id); } catch (e) { console.error('[files]', e.message); }
  if (!f) return res.status(404).end();
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.end(f.data);
}

/** Store a photo that is not a tenant document (meter readings…). Returns { meta } or { error }. */
export async function storeImage(file, name) {
  if (!file?.buffer?.length) return { error: 'សូមជ្រើសរើសរូបភាព' };
  const kind = sniff(file.buffer);
  if (!kind || kind[0] === 'pdf') return { error: 'អនុញ្ញាតតែរូបភាព JPG, PNG ឬ WEBP' };
  const meta = { id: uid(16), ext: kind[0], type: kind[1], size: file.buffer.length, at: now() };
  meta.backend = await putBlob(orgId(), db().settings, { id: meta.id, mime: meta.type, data: file.buffer, name: `${name}.${meta.ext}` });
  return { meta };
}
