// Private customer documents (ID card front/back, profile photo, signed contract).
// Stored as bytea rows scoped to the landlord; never publicly addressable.
import multer from 'multer';
import { uid, now, save, orgId } from './db.js';
import { putFile, getFile, deleteFile } from './store.js';

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
  if (meta?.id) await deleteFile(orgId(), meta.id);
}

/** Store an uploaded file into tenant.files[slot]. Returns an error string or ''. */
export async function storeFile(tenant, slot, file) {
  if (!SLOTS[slot]) return 'ប្រភេទឯកសារមិនត្រឹមត្រូវ';
  if (!file?.buffer?.length) return 'សូមជ្រើសរើសឯកសារ';
  const kind = sniff(file.buffer);
  if (!kind || (slot !== 'contract' && kind[0] === 'pdf')) return 'អនុញ្ញាតតែរូបភាព JPG, PNG ឬ WEBP' + (slot === 'contract' ? ' ឬ PDF' : '');
  const meta = { id: uid(16), ext: kind[0], type: kind[1], size: file.buffer.length, at: now() };
  await putFile(orgId(), meta.id, meta.type, file.buffer);
  await removeFile(tenant.files?.[slot]);
  tenant.files = { ...(tenant.files || {}), [slot]: meta };
  tenant.updatedAt = now();
  save();
  return '';
}

export async function sendStored(res, org, meta) {
  const f = meta?.id && await getFile(org, meta.id);
  if (!f) return res.status(404).end();
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.end(f.data);
}
