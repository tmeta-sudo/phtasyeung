// Read a bank transfer screenshot on this device (Chakkhu OCR), then parse it.
import { loadChakkhu, readDocument, imageToCanvas } from './chakkhu.js';
import { parseSlip } from './slipParse.js';

export async function readSlip(blob, { onProgress } = {}) {
  const model = await loadChakkhu((p) => onProgress?.(p * 0.5));
  const canvas = await imageToCanvas(blob, 1400);
  const lines = [...(await readDocument(model, canvas, { prepare: false, onLine: (i, n) => onProgress?.(0.5 + (i / n) * 0.3) })).lines];
  // Bank apps often use white text on a dark header (the amount!) — read a negative copy too.
  const inv = document.createElement('canvas');
  inv.width = canvas.width; inv.height = canvas.height;
  const g = inv.getContext('2d');
  g.filter = 'invert(1)';
  g.drawImage(canvas, 0, 0);
  try { lines.push(...(await readDocument(model, inv, { prepare: false, onLine: (i, n) => onProgress?.(0.8 + (i / n) * 0.2) })).lines); } catch { /* first pass is enough */ }
  return parseSlip(lines);
}
