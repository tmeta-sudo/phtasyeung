// Fill the Khmer lease template from the customer, room and property.
import { dateKm, usd, usdInWords, labelOf, GENDERS, kmDigits } from '../shared/khmer.js';

export function contractValues({ tenant: t, room, settings, lease, addressOf, propertyAddress }) {
  const rent = Number(room?.rent) || 0;
  const dep = Number(lease?.depositMonths ?? settings.contract?.depositMonths ?? 1);
  const pre = Number(lease?.prepaidMonths ?? settings.contract?.prepaidMonths ?? 1);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
  const dash = (v) => v || '……………';
  return {
    property: settings.propertyName,
    today: dateKm(today).replace('ថ្ងៃទី', ''),
    owner: dash(settings.ownerName),
    ownerPhone: dash(settings.phone),
    name: dash(t.nameKm || t.nameEn),
    gender: dash(labelOf(GENDERS, t.gender)),
    dob: t.dob ? dateKm(t.dob).replace('ថ្ងៃទី', '') : '……………',
    idNumber: dash(t.idNumber && kmDigits(t.idNumber)),
    phone: dash(t.phone && kmDigits(t.phone)),
    tenantAddress: dash(addressOf?.(t.address)),
    room: dash(room?.id),
    building: dash(room?.building),
    propertyAddress: dash(propertyAddress || settings.address),
    start: t.contract?.start ? dateKm(t.contract.start).replace('ថ្ងៃទី', '') : '……………',
    end: t.contract?.end ? dateKm(t.contract.end).replace('ថ្ងៃទី', '') : '……………',
    rent: usd(rent, true),
    rentWords: usdInWords(rent),
    depositMonths: kmDigits(dep),
    deposit: usd(rent * dep, true),
    prepaidMonths: kmDigits(pre),
    prepaid: usd(rent * pre, true),
    moveInTotal: usd(rent * (dep + pre), true),
  };
}

export const fillTemplate = (tpl, values) => String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in values ? values[k] : m));

export const PLACEHOLDERS = [
  ['name', 'ឈ្មោះអ្នកជួល'], ['idNumber', 'លេខអត្តសញ្ញាណប័ណ្ណ'], ['phone', 'ទូរស័ព្ទ'], ['room', 'បន្ទប់'], ['rent', 'ថ្លៃជួល'],
  ['deposit', 'ប្រាក់កក់'], ['prepaid', 'បង់មុន'], ['moveInTotal', 'សរុបពេលចូល'], ['start', 'ថ្ងៃចាប់ផ្តើម'], ['end', 'ថ្ងៃបញ្ចប់'],
  ['owner', 'ម្ចាស់ផ្ទះ'], ['propertyAddress', 'អាសយដ្ឋានផ្ទះ'], ['tenantAddress', 'អាសយដ្ឋានអ្នកជួល'], ['today', 'ថ្ងៃនេះ'],
];
