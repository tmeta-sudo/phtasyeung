// Work without internet (basements, weak signal): keep a small copy of what the meter page needs,
// queue readings on the phone, and send them when the connection is back.
// Only rooms, active tenants' names and recent readings are kept — no money, ID cards or phone numbers.
const CACHE = 'py-offline-state';
const QUEUE = 'py-meter-queue';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export const isNetworkError = (e) => !e?.status && (e instanceof TypeError || /fetch|network|Failed/i.test(String(e?.message)));

export function cacheState(st) {
  if (!st?.rooms) return;
  const months = new Set([st.today?.ym]);
  write(CACHE, {
    rooms: st.rooms.map(({ id, building, floor, water, electric, features }) => ({ id, building, floor, water, electric, features, rent: 0, extras: [] })),
    tenants: st.tenants.filter((t) => t.status === 'active').map(({ id, nameKm, nameEn, roomId, status }) => ({ id, nameKm, nameEn, roomId, status, files: {} })),
    meters: st.meters.filter((m) => months.has(m.month)),
    sharedReadings: (st.sharedReadings || []).filter((m) => months.has(m.month)),
    settings: { propertyName: st.settings.propertyName, khmerNumerals: st.settings.khmerNumerals, sharedMeters: st.settings.sharedMeters || [], khqr: {}, telegram: { adminChats: [] }, bakong: {}, backup: {}, addons: [], tiers: {} },
    account: { role: st.account?.role, email: st.account?.email },
    today: st.today, bot: {}, invoices: [], events: [], activities: [], tickets: [], notices: [], expenses: [], meterSubmissions: [],
    savedAt: Date.now(),
  });
}

export const cachedState = () => read(CACHE, null);

export const queued = () => read(QUEUE, []);
export function queueReading(r) {
  const q = queued().filter((x) => !(x.roomId === r.roomId && x.month === r.month));
  q.push({ ...r, at: Date.now() });
  write(QUEUE, q);
  // Apply locally so the screen shows it as recorded.
  const c = cachedState();
  if (c) {
    const room = c.rooms.find((x) => x.id === r.roomId);
    if (room) {
      c.meters.push({ id: 'q-' + r.roomId, roomId: r.roomId, month: r.month, oldWater: room.water, water: r.water === '' ? room.water : +r.water, oldElectric: room.electric, electric: r.electric === '' ? room.electric : +r.electric, queued: true });
      write(CACHE, c);
    }
  }
  return q.length;
}

/** Send queued readings. Returns { sent, failed: [{roomId, error}] }. */
export async function flushQueue(api) {
  const q = queued();
  if (!q.length || navigator.onLine === false) return { sent: 0, failed: [] };
  let sent = 0; const failed = []; const left = [];
  for (const r of q) {
    try { await api('POST', '/api/meters', { roomId: r.roomId, month: r.month, water: r.water, electric: r.electric }); sent += 1; } catch (e) {
      if (isNetworkError(e)) left.push(r); else failed.push({ roomId: r.roomId, error: e.message });
    }
  }
  write(QUEUE, left);
  return { sent, failed };
}
