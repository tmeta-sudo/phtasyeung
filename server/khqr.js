// KHQR (Cambodia's national QR payment standard, NBC Bakong) via bakong-khqr.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BakongKHQR, khqrData, IndividualInfo, MerchantInfo } = require('bakong-khqr');

const ascii = (s, max) => String(s || '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim().slice(0, max);

/** Validate the Bakong account id format: name@bank */
export const isBakongId = (id) => /^[A-Za-z0-9._-]{1,32}@[A-Za-z0-9]{2,12}$/.test(String(id || '').trim());

/**
 * Read a landlord's own KHQR (decoded from the picture their bank app shows) and keep
 * just what's needed to create per-invoice dynamic KHQRs. Returns null when invalid.
 */
export function parseKhqrUpload(text) {
  const d = decodeKhqr(String(text || '').trim());
  if (!d || !isBakongId(d.bakongAccountID)) return null;
  return {
    type: d.merchantType === '30' ? 'merchant' : 'individual',
    accountId: d.bakongAccountID,
    merchantName: ascii(d.merchantName, 25),
    city: ascii(d.merchantCity, 15) || 'Phnom Penh',
    merchantId: d.merchantID || '',
    acquiringBank: d.acquiringBank || '',
    accountInformation: d.accountInformation || '',
    mobileNumber: d.mobileNumber || '',
    source: 'upload',
  };
}

/** Build a dynamic KHQR string for an amount in USD or KHR. Returns '' when not configured. */
export function khqrFor(settings, { amount, bill, expiresAt, currency = 'USD' }) {
  const k = settings.khqr || {};
  if (!isBakongId(k.accountId)) return '';
  const merchantName = ascii(k.merchantName || settings.propertyNameEn || 'Rental', 25) || 'Rental';
  const city = ascii(k.city || 'Phnom Penh', 15) || 'Phnom Penh';
  const optional = {
    currency: currency === 'KHR' ? khqrData.currency.khr : khqrData.currency.usd,
    amount: currency === 'KHR' ? Math.round(Number(amount)) : Math.round(Number(amount) * 100) / 100,
    billNumber: ascii(bill, 25),
    storeLabel: ascii(settings.propertyNameEn, 25) || undefined,
    expirationTimestamp: Math.max(expiresAt || 0, Date.now() + 60 * 60 * 1000),
  };
  if (!optional.storeLabel) delete optional.storeLabel;
  if (k.accountInformation) optional.accountInformation = k.accountInformation;
  try {
    const gen = new BakongKHQR();
    const res = k.type === 'merchant' && k.merchantId && k.acquiringBank
      ? gen.generateMerchant(new MerchantInfo(k.accountId.trim(), merchantName, city, k.merchantId, k.acquiringBank, optional))
      : gen.generateIndividual(new IndividualInfo(k.accountId.trim(), merchantName, city, optional));
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
