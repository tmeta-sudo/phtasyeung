// Repair-request numbers for the landlord: how many, how fast they were answered and fixed.

const HOUR = 3600000;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** First owner reply time (older tickets have no firstReplyAt: use the messages). */
export const firstReplyAt = (t) => t.firstReplyAt || t.messages?.find((m) => m.from === 'owner')?.at || null;
/** When it was marked done (older tickets: the last update, if done). */
export const doneAt = (t) => t.doneAt || (t.status === 'done' ? t.updatedAt : null);

/**
 * Stats for repair tickets created in the last `days` days, as of `now` (ms).
 * Hours are medians; null when there is nothing to measure.
 */
export function repairStats(tickets = [], { days = 90, now = Date.now() } = {}) {
  const since = now - days * 24 * HOUR;
  const list = tickets.filter((t) => t.kind === 'maintenance' && new Date(t.createdAt).getTime() >= since);
  const reply = [];
  const fix = [];
  for (const t of list) {
    const c = new Date(t.createdAt).getTime();
    const r = firstReplyAt(t);
    if (r) reply.push(Math.max(0, new Date(r).getTime() - c) / HOUR);
    const d = doneAt(t);
    if (d && t.status === 'done') fix.push(Math.max(0, new Date(d).getTime() - c) / HOUR);
  }
  const waiting = tickets.filter((t) => t.kind === 'maintenance' && t.status !== 'done');
  const oldest = waiting.reduce((a, t) => Math.min(a, new Date(t.createdAt).getTime()), Infinity);
  return {
    count: list.length,
    done: fix.length,
    open: waiting.length,
    oldestOpenH: waiting.length ? (now - oldest) / HOUR : null,
    medianReplyH: median(reply),
    medianFixH: median(fix),
  };
}

/** 3.5 h → "៣.៥ ម៉ោង"-style text is left to the caller; this gives [value, unit] in h or days. */
export const hoursOrDays = (h) => (h == null ? null : h < 48 ? [Math.round(h * 10) / 10, 'h'] : [Math.round((h / 24) * 10) / 10, 'd']);
