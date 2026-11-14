// Pure helpers: turn OCR lines into meter-reading candidates (unit-tested in Node).
import { asciiDigits } from '../../shared/khmer.js';

/** All plausible numbers in OCR lines: digit runs, digits split by spaces (drum meters), and a decimal guess. */
export function numberCandidates(lines) {
  const out = new Map();
  // Each value remembers its best confidence and how many separate reads agreed on it.
  const add = (v, conf, why) => {
    if (!Number.isFinite(v) || v < 0) return;
    const k = String(v); const cur = out.get(k);
    if (!cur) out.set(k, { value: v, conf, why, votes: why === 'number' || why === 'joined' ? 1 : 0 });
    else { if (why === 'number' || why === 'joined') cur.votes += 1; if (cur.conf < conf) Object.assign(cur, { conf, why }); }
  };
  for (const l of lines) {
    const text = asciiDigits(String(l.text || '')).replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/[sS]/g, '5').replace(/[bB]/g, '8');
    const conf = l.confidence ?? 0.5;
    for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) add(parseFloat(m[0].replace(',', '.')), conf, 'number');
    // Drum meters: "0 4 5 2 3" → 04523
    for (const m of text.matchAll(/\d(?:[\s-]+\d){2,}/g)) {
      const joined = m[0].replace(/[\s-]+/g, '');
      add(parseInt(joined, 10), conf * 0.95, 'joined');
      // Last drum is often the red decimal wheel.
      if (joined.length >= 4) add(parseInt(joined.slice(0, -1), 10), conf * 0.8, 'no-decimal');
    }
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly.length >= 3) { add(parseInt(digitsOnly, 10), conf * 0.7, 'all'); if (digitsOnly.length >= 4) add(parseInt(digitsOnly.slice(0, -1), 10), conf * 0.6, 'all-no-decimal'); }
  }
  return [...out.values()];
}

/** Rank candidates against the previous reading: must not go backwards, small increases first. */
export function rankReadings(cands, previous = 0) {
  const prev = +previous || 0;
  return cands
    .filter((c) => c.value >= prev && c.value - prev <= Math.max(5000, prev * 0.5))
    .map((c) => ({ ...c, score: c.conf + Math.min(4, Math.max(0, (c.votes || 0) - 1)) * 0.15 - Math.min(1, (c.value - prev) / Math.max(200, prev * 0.2)) * 0.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

