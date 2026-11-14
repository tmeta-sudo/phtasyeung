// Team roles. Every signed-in route is checked here; anything not listed needs the owner (deny by default).
//   owner   — everything: money settings, KHQR, Telegram bot, storage, backup, team, delete account
//   manager — day-to-day: customers (incl. ID cards), rooms, invoices, meters, contracts, messages
//   staff   — operations only: meters, maintenance messages, tasks. Never sees money or ID cards.

export const ROLES = ['owner', 'manager', 'staff'];
const RANK = { staff: 1, manager: 2, owner: 3 };
export const atLeast = (role, need) => (RANK[role] || 0) >= RANK[need];

const RULES = [
  // [method, path (Express route pattern, or prefix ending in *), minimum role]
  ['GET', '/api/state', 'staff'],
  ['POST', '/api/meters', 'staff'],
  ['POST', '/api/meters/shared', 'staff'],
  ['*', '/api/meter-submissions*', 'staff'],
  ['*', '/api/meters/:id/photo/:kind', 'staff'],
  ['DELETE', '/api/meters/shared/:id', 'manager'],
  ['DELETE', '/api/meters/:id', 'manager'],
  ['POST', '/api/tickets/:id/reply', 'staff'],
  ['GET', '/api/tickets/:id/photo/:i', 'staff'],
  ['PUT', '/api/tickets/:id', 'staff'],
  ['POST', '/api/activities', 'staff'],
  ['PUT', '/api/activities/:id', 'staff'],
  ['DELETE', '/api/activities/:id', 'manager'],
  ['*', '/api/push/*', 'staff'],
  ['*', '/api/news*', 'staff'],
  ['*', '/api/feedback*', 'staff'],
  ['*', '/api/super/*', 'staff'], // the super-admin check itself is separate
  ['POST', '/api/auth/password', 'staff'],
  ['POST', '/api/auth/telegram/unlink', 'staff'],
  ['GET', '/api/team/me', 'staff'],
  ['GET', '/api/properties', 'staff'],
  ['POST', '/api/properties/switch', 'staff'],

  ['GET', '/api/settings/signature', 'manager'],
  ['GET', '/api/rooms/:id/photos/:pid', 'staff'],
  ['*', '/api/rooms*', 'manager'],
  ['*', '/api/tenants*', 'manager'],
  ['*', '/api/invoices*', 'manager'],
  ['POST', '/api/auto/run', 'manager'],
  ['*', '/api/notices*', 'manager'],
  ['*', '/api/expenses*', 'manager'],
  ['PUT', '/api/settings', 'manager'], // the handler limits managers to invoice/utility keys
];

export function requiredRole(method, routePath) {
  if (!routePath) return 'owner';
  for (const [m, p, role] of RULES) {
    if (m !== '*' && m !== method) continue;
    if (p.endsWith('*') ? routePath.startsWith(p.slice(0, -1)) : routePath === p) return role;
  }
  return 'owner';
}

/** Settings a manager may change (the rest stay with the owner). */
export const MANAGER_SETTINGS = new Set(['holidays', 'listing', 'autoApproveReadings', 'addons', 'tiers', 'sharedMeters', 'carryOver', 'lateFee', 'invoiceDesign', 'waterRate', 'electricRate', 'exchangeRate', 'dueDays', 'khmerNumerals']);

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

/** What a staff member may see: rooms and people to find, meters, tasks and maintenance — no money, no ID cards. */
export function staffView(st) {
  const s = st.settings || {};
  return {
    ...st,
    rooms: st.rooms.map((r) => pick(r, ['id', 'building', 'floor', 'note', 'water', 'electric'])).map((r) => ({ ...r, rent: 0, extras: [] })),
    tenants: st.tenants.filter((t) => t.status === 'active').map((t) => ({
      ...pick(t, ['id', 'nameKm', 'nameEn', 'phone', 'roomId', 'status', 'gender']),
      files: {},
      telegram: t.telegram?.chatId ? { linked: true } : null,
    })),
    invoices: [],
    events: [],
    notices: [],
    expenses: [],
    settings: {
      ...pick(s, ['propertyName', 'propertyNameEn', 'address', 'phone', 'khmerNumerals', 'location', 'theme']),
      khqr: {}, telegram: { adminChats: [] }, bakong: { enabled: false }, backup: {}, auto: {}, contract: {},
      waterRate: 0, electricRate: 0, exchangeRate: s.exchangeRate, invoiceDesign: s.invoiceDesign,
      sharedMeters: (s.sharedMeters || []).map(({ id, name, kind, rooms, reading }) => ({ id, name, kind, rooms, reading })), tiers: { electric: [], water: [] },
    },
    bot: { ok: !!st.bot?.ok, username: st.bot?.username || '' },
  };
}
