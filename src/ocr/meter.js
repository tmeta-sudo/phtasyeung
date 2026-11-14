// Read the number on a water/electricity meter photo, on the device (Chakkhu OCR).
// We never trust it blindly: we return a few candidates that make sense next to last month's
// reading, and the person taps the right one.
import { loadChakkhu, readDocument, readLine, imageToCanvas } from './chakkhu.js';
import { numberCandidates, rankReadings } from './meterParse.js';

function crop(src, x, y, w, h, invert = false) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  if (invert) g.filter = 'invert(1)';
  g.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

/**
 * Meter counters are big digits, often light-on-dark (drum wheels) or on an LCD panel, which a
 * document line finder skips. So we also read an inverted copy and horizontal strips through the
 * middle of the photo, where people centre the counter.
 */
export async function readMeterPhoto(file, { previous = 0, onProgress } = {}) {
  const model = await loadChakkhu((p) => onProgress?.(p * 0.5));
  const canvas = await imageToCanvas(file, 1400);
  const W = canvas.width; const H = canvas.height;
  const lines = [];
  const docs = [canvas, crop(canvas, 0, 0, W, H, true)];
  const strips = [];
  for (const hFrac of [0.22, 0.32]) {
    for (const cy of [0.35, 0.45, 0.55, 0.65]) {
      const h = H * hFrac; const y = Math.max(0, Math.min(H - h, H * cy - h / 2));
      strips.push(crop(canvas, W * 0.05, y, W * 0.9, h), crop(canvas, W * 0.05, y, W * 0.9, h, true));
    }
  }
  const total = docs.length + strips.length;
  let done = 0;
  const tick = () => onProgress?.(0.5 + (++done / total) * 0.5);
  for (const d of docs) {
    try { lines.push(...(await readDocument(model, d, { prepare: false })).lines); } catch { /* keep going */ }
    tick();
  }
  for (const s of strips) {
    try { const r = await readLine(model, s); if (r.text) lines.push(r); } catch { /* keep going */ }
    tick();
  }
  return rankReadings(numberCandidates(lines), previous);
}
