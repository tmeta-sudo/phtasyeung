// KHQR (Cambodia's national QR payment standard, NBC Bakong) via bakong-khqr.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

const ascii = (s, max) => String(s || '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim().slice(0, max);

/** Validate the Bakong account id format: name@bank */
export const isBakongId = (id) => /^[A-Za-z0-9._-]{1,32}@[A-Za-z0-9]{2,12}$/.test(String(id || '').trim());

/** Build a dynamic KHQR string for an amount (USD). Returns '' when not configured. */
export function khqrFor(settings, { amount, bill, expiresAt }) {
  const k = settings.khqr || {};
  if (!isBakongId(k.accountId)) return '';
  const merchantName = ascii(k.merchantName || settings.propertyNameEn || 'Rental', 25) || 'Rental';
  const city = ascii(k.city || 'Phnom Penh', 15) || 'Phnom Penh';
  const optional = {
    currency: khqrData.currency.usd,
    amount: Math.round(Number(amount) * 100) / 100,
    billNumber: ascii(bill, 25),
    storeLabel: ascii(settings.propertyNameEn, 25) || undefined,
    expirationTimestamp: Math.max(expiresAt || 0, Date.now() + 60 * 60 * 1000),
  };
  if (!optional.storeLabel) delete optional.storeLabel;
  try {
    const res = new BakongKHQR().generateIndividual(new IndividualInfo(k.accountId.trim(), merchantName, city, optional));
    return res?.data?.qr || '';
  } catch {
    return '';
  }
}

export function decodeKhqr(text) {
  try {
    if (!BakongKHQR.verify(text).isValid) return null;
    return BakongKHQR.decode(text).data;
  } catch {
    return null;
  }
}
