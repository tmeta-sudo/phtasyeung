// Which scanned ID fields the landlord kept, fixed, removed, or had to type because the scan
// missed them. Only these outcomes leave the device — never the names, numbers or dates.

export const SCAN_FIELDS = ['nameKm', 'nameEn', 'idNumber', 'gender', 'dob', 'idIssued', 'idExpiry', 'addressDetail'];
const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** offered: what the scanner produced; saved: the customer form as saved. */
export function scanOutcomes(offered = {}, saved = {}) {
  const out = {};
  for (const k of SCAN_FIELDS) {
    const final = k === 'addressDetail' ? saved.address?.detail : saved[k];
    const got = offered[k];
    if (got) out[k] = !norm(final) ? 'rejected' : norm(final) === norm(got) ? 'ok' : 'fixed';
    else if (norm(final)) out[k] = 'missed';
  }
  return out;
}
