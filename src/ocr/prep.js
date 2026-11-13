// Photo clean-up before OCR: find the card on the table, straighten it, crop it, even out the light.
// Everything runs on a small preview for speed; the final crop is taken from the full-size image.

const PREVIEW = 480;

function gray(px, i) { return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; }

function preview(canvas) {
  const s = Math.min(1, PREVIEW / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s)); c.height = Math.max(1, Math.round(canvas.height * s));
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return { c, s, px: c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data };
}

/** Median colour of a thin frame around the photo = the table / background. */
function borderColor(px, W, H) {
  const rs = []; const gs = []; const bs = [];
  const add = (x, y) => { const i = (y * W + x) * 4; rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); };
  const m = Math.max(1, Math.round(Math.min(W, H) * 0.02));
  for (let x = 0; x < W; x += 2) for (let d = 0; d < m; d++) { add(x, d); add(x, H - 1 - d); }
  for (let y = 0; y < H; y += 2) for (let d = 0; d < m; d++) { add(d, y); add(W - 1 - d, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  // How uniform the border is (median absolute deviation) tells us whether there is a background at all.
  const mr = med(rs); const mg = med(gs); const mb = med(bs);
  const dev = med(rs.map((v, i) => Math.abs(v - mr) + Math.abs(gs[i] - mg) + Math.abs(bs[i] - mb)));
  return { r: mr, g: mg, b: mb, dev };
}

/**
 * Largest blob that is clearly different from the background. Returns its pixels' bounding box and
 * the blob mask, or null if the card already fills the photo.
 */
function cardBlob(px, W, H) {
  const bg = borderColor(px, W, H);
  const thr = Math.max(40, bg.dev * 3);
  const mask = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) mask[i] = Math.abs(px[j] - bg.r) + Math.abs(px[j + 1] - bg.g) + Math.abs(px[j + 2] - bg.b) > thr ? 1 : 0;
  // Close small holes (text on the card is "background coloured" sometimes): dilate then erode, radius 2.
  const morph = (src, val) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let hit = !val;
      for (let dy = -2; dy <= 2 && hit !== val; dy++) for (let dx = -2; dx <= 2; dx++) {
        const yy = y + dy; const xx = x + dx;
        if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
        if (!!src[yy * W + xx] === val) { hit = val; break; }
      }
      out[y * W + x] = hit ? 1 : 0;
    }
    return out;
  };
  // Open first (removes thin wood-grain streaks and specks), then close (fills text holes on the card).
  const closed = morph(morph(morph(morph(mask, false), true), true), false);
  // Largest 4-connected component.
  const label = new Int32Array(W * H);
  let best = { n: 0 }; let id = 0;
  const stack = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!closed[i] || label[i]) continue;
    id += 1; let sp = 0; stack[sp++] = i; label[i] = id;
    let n = 0; let x0 = W; let y0 = H; let x1 = 0; let y1 = 0;
    while (sp) {
      const k = stack[--sp]; n += 1;
      const x = k % W; const y = (k - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const nb of [k - 1, k + 1, k - W, k + W]) {
        if (nb < 0 || nb >= W * H || label[nb] || !closed[nb]) continue;
        if ((nb === k - 1 && x === 0) || (nb === k + 1 && x === W - 1)) continue;
        label[nb] = id; stack[sp++] = nb;
      }
    }
    if (n > best.n) best = { n, id, x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }
  const area = W * H;
  const boxArea = (best.x1 - best.x0) * (best.y1 - best.y0);
  // Accept only a plausible card: big enough, not the whole frame, and fairly solid inside its box.
  if (!best.n || best.n < area * 0.12 || boxArea > area * 0.97 || best.n < boxArea * 0.35) return null;
  return { ...best, label, bg };
}

/** Card angle from its outline: the rotation whose bounding box is smallest (a minimum-area rectangle). */
function edgeAngle(blob, W, H) {
  const pts = [];
  const L = blob.label; const id = blob.id;
  for (let y = blob.y0; y < blob.y1; y++) for (let x = blob.x0; x < blob.x1; x++) {
    const k = y * W + x;
    if (L[k] !== id) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || L[k - 1] !== id || L[k + 1] !== id || L[k - W] !== id || L[k + W] !== id) pts.push(x, y);
  }
  let best = 0; let bestA = Infinity;
  const area = (deg) => {
    const a = (deg * Math.PI) / 180; const sn = Math.sin(a); const cs = Math.cos(a);
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const u = pts[i] * cs + pts[i + 1] * sn; const v = -pts[i] * sn + pts[i + 1] * cs;
      if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v;
    }
    return (x1 - x0) * (y1 - y0);
  };
  for (let d = -44; d <= 44; d += 1) { const A = area(d); if (A < bestA) { bestA = A; best = d; } }
  const c = best;
  for (let d = c - 1; d <= c + 1; d += 0.1) { const A = area(d); if (A < bestA) { bestA = A; best = d; } }
  return best;
}

/** Skew angle (degrees) that makes text rows sharpest, from dark-pixel projection profiles. */
function skewAngle(px, W, H, box) {
  const { x0, y0, x1, y1 } = box;
  // Only look well inside the card (never at the table texture or the card's own edge).
  const m = Math.round(Math.min(W, H) * 0.02);
  const inside = box.label
    ? (x, y) => x >= m && y >= m && x < W - m && y < H - m && box.label[y * W + x] === box.id && box.label[(y - m) * W + x] === box.id
      && box.label[(y + m) * W + x] === box.id && box.label[y * W + x - m] === box.id && box.label[y * W + x + m] === box.id
    : () => true;
  const pts = [];
  let sum = 0; let cnt = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inside(x, y)) { sum += gray(px, (y * W + x) * 4); cnt += 1; }
  const mean = sum / Math.max(1, cnt);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inside(x, y) && gray(px, (y * W + x) * 4) < mean * 0.7) pts.push(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
  if (pts.length < 200) return 0;
  const N = Math.ceil(Math.hypot(W, H)) + 2;
  const hist = new Float64Array(N * 2);
  const score = (deg) => {
    const a = (deg * Math.PI) / 180; const sn = Math.sin(a); const cs = Math.cos(a);
    hist.fill(0);
    for (let i = 0; i < pts.length; i += 2) hist[Math.round(-pts[i] * sn + pts[i + 1] * cs) + N] += 1;
    let s = 0; for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    return s;
  };
  let best = 0; let bestS = -1;
  for (let d = -20; d <= 20; d += 1) { const s = score(d); if (s > bestS) { bestS = s; best = d; } }
  const c = best;
  for (let d = c - 1; d <= c + 1; d += 0.1) { const s = score(d); if (s > bestS) { bestS = s; best = d; } }
  return Math.abs(best) < 0.3 ? 0 : best;
}

function rotated(canvas, deg, fill) {
  const a = (deg * Math.PI) / 180;
  const sn = Math.abs(Math.sin(a)); const cs = Math.abs(Math.cos(a));
  const w = canvas.width; const h = canvas.height;
  const c = document.createElement('canvas');
  c.width = Math.round(w * cs + h * sn); c.height = Math.round(w * sn + h * cs);
  const g = c.getContext('2d');
  g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate(a); g.drawImage(canvas, -w / 2, -h / 2);
  return c;
}

/** Stretch contrast so the darkest 1% is black and the brightest 1% is white (helps dim photos). */
function normalise(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data; const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(gray(d, i))] += 1;
  const total = d.length / 4; let lo = 0; let hi = 255; let acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > total * 0.01) break; }
  acc = 0;
  for (; hi > 0; hi--) { acc += hist[hi]; if (acc > total * 0.01) break; }
  if (hi - lo < 40 || (lo < 12 && hi > 243)) return canvas; // already fine
  const k = 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - lo) * k));
  g.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Straighten and crop an ID card photo. Returns { canvas, angle, cropped, rotated90 }.
 * Safe on already-clean scans: if no card edge is found it only fixes the skew/contrast.
 */
export function prepareCard(src) {
  let canvas = src;
  let rotated90 = false;
  // ID cards are landscape: a portrait photo was taken sideways.
  if (canvas.height > canvas.width * 1.15) { canvas = rotated(canvas, 90, '#fff'); rotated90 = true; }

  let p = preview(canvas);
  let blob = cardBlob(p.px, p.c.width, p.c.height);
  const box = blob || { x0: 0, y0: 0, x1: p.c.width, y1: p.c.height };
  let angle = blob ? edgeAngle(blob, p.c.width, p.c.height) : skewAngle(p.px, p.c.width, p.c.height, box);
  if (Math.abs(angle) < 0.3) angle = 0;
  const fill = blob ? `rgb(${blob.bg.r},${blob.bg.g},${blob.bg.b})` : '#fff';
  if (angle) {
    canvas = rotated(canvas, -angle, fill);
    p = preview(canvas);
    blob = cardBlob(p.px, p.c.width, p.c.height);
  }
  let cropped = false;
  if (blob) {
    const pad = 0.01 * Math.max(p.c.width, p.c.height);
    const x0 = Math.max(0, (blob.x0 - pad) / p.s); const y0 = Math.max(0, (blob.y0 - pad) / p.s);
    const x1 = Math.min(canvas.width, (blob.x1 + pad) / p.s); const y1 = Math.min(canvas.height, (blob.y1 + pad) / p.s);
    const c = document.createElement('canvas');
    c.width = Math.round(x1 - x0); c.height = Math.round(y1 - y0);
    const g = c.getContext('2d');
    g.drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    // Paint whatever is not card (table corners left by the rotation) white, so line finding sees clean margins.
    const W = p.c.width; const H = p.c.height;
    const mk = document.createElement('canvas'); mk.width = W; mk.height = H;
    const mg = mk.getContext('2d'); const md = mg.createImageData(W, H);
    // Shrink the card mask by 2 preview pixels so the dark outline at the card's edge is dropped too.
    const L = blob.label; const id = blob.id; const e = 2;
    for (let y = e; y < H - e; y++) for (let x = e; x < W - e; x++) {
      const i = y * W + x;
      if (L[i] === id && L[i - e] === id && L[i + e] === id && L[i - e * W] === id && L[i + e * W] === id
        && L[i - e * W - e] === id && L[i - e * W + e] === id && L[i + e * W - e] === id && L[i + e * W + e] === id) md.data[i * 4 + 3] = 255;
    }
    mg.putImageData(md, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mk, x0 * p.s, y0 * p.s, c.width * p.s, c.height * p.s, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    canvas = c; cropped = true;
  }
  return { canvas: normalise(canvas), angle, cropped, rotated90 };
}

/** Turn a canvas upside down (for a second try when a sideways photo was rotated the wrong way). */
export const flip180 = (canvas) => rotated(canvas, 180, '#fff');
