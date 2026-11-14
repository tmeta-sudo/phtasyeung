// When a bill is due: the landlord's default (N days after issue), or the tenant's own payday
// (many workers are paid on fixed days, sometimes twice a month), moved off Khmer public holidays.
import { holidaysBetween } from '../shared/khmer.js';

export const isHoliday = (ymd) => holidaysBetween(ymd, ymd).length > 0;
export const holidayOn = (ymd) => holidaysBetween(ymd, ymd)[0] || null;

export function addDays(ymd, days) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The first day on or after `ymd` that is not a public holiday (looks at most two weeks ahead). */
export function afterHolidays(ymd) {
  let d = ymd;
  for (let i = 0; i < 14 && isHoliday(d); i++) d = addDays(d, 1);
  return d;
}

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Day `day` of month `ym` (clamped: the 31st becomes the 30th or 28th in short months). */
export function dayInMonth(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(Math.min(Math.max(1, day), lastDay(y, m))).padStart(2, '0')}`;
}
const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

/**
 * Due date(s) for an invoice issued `today` for `month`.
 * Returns { dueDate, dueDate2?, payday } — dueDate2 only when the tenant pays in two halves.
 */
export function dueDatesFor(tenant, month, today, settings) {
  const shift = settings.holidays?.shiftDue !== false ? afterHolidays : (d) => d;
  const day = Math.round(+tenant?.pay?.day || 0);
  if (!(day >= 1 && day <= 31)) return { dueDate: shift(addDays(today, +settings.dueDays || 7)), payday: false };
  // The tenant's payday in the invoice month; if that day has already passed, the next one.
  let first = dayInMonth(month, day);
  if (first < today) first = dayInMonth(nextMonth(first.slice(0, 7)), day);
  const out = { dueDate: shift(first), payday: true };
  const day2 = Math.round(+tenant.pay.day2 || 0);
  if (day2 >= 1 && day2 <= 31 && day2 !== day) {
    let second = dayInMonth(first.slice(0, 7), day2);
    if (second <= first) second = dayInMonth(nextMonth(first.slice(0, 7)), day2);
    out.dueDate2 = shift(second);
  }
  return out;
}
