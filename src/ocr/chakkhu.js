// On-device Khmer + English OCR with Chakkhu (by Ing Muyleang, Apache-2.0):
// https://huggingface.co/muyleanging/Chakkhu-OCR-Khmer-ONNX
//
// Everything runs in the browser with onnxruntime-web — ID card photos never leave the
// device. The int8 model (~39 MB) is downloaded once and kept in Cache Storage.
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { prepareCard, flip180 } from './prep.js';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { khnormal } from 'khmer-normalizer';

const REPO = 'https://huggingface.co/muyleanging/Chakkhu-OCR-Khmer-ONNX/resolve/main';
const CACHE = 'chakkhu-ocr-v1';
const HEIGHT = 64;
const MAX_W = 4096;
const BLANK = 4;
const EOS = 2;

let loading = null;

/** Fetch a model file through Cache Storage, reporting download progress. */
async function cachedFetch(name, onBytes) {
  const url = `${REPO}/${name}`;
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* private mode */ }
  const hit = cache && await cache.match(url);
  if (hit) { const b = await hit.arrayBuffer(); onBytes(b.byteLength, b.byteLength); return b; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed (${res.status})`);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(got, total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  try { await cache?.put(url, new Response(buf.slice(), { headers: { 'content-type': 'application/octet-stream' } })); } catch { /* quota */ }
  return buf.buffer;
}

/** Load ONNX Runtime + the Chakkhu encoder/decoder (once). onProgress(0..1). */
export function loadChakkhu(onProgress = () => {}) {
  if (!loading) {
    loading = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      const sizes = { 'encoder.int8.onnx': 25877062, 'decoder.int8.onnx': 12999851 };
      const done = {};
      const report = () => onProgress(Object.values(done).reduce((a, b) => a + b, 0) / (sizes['encoder.int8.onnx'] + sizes['decoder.int8.onnx']));
      const [enc, dec, tok] = await Promise.all([
        cachedFetch('encoder.int8.onnx', (g) => { done.e = g; report(); }),
        cachedFetch('decoder.int8.onnx', (g) => { done.d = g; report(); }),
        cachedFetch('tokenizer.json', () => {}),
      ]);
      const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      const encoder = await ort.InferenceSession.create(new Uint8Array(enc), opts);
      const decoder = await ort.InferenceSession.create(new Uint8Array(dec), opts);
      const vocab = JSON.parse(new TextDecoder().decode(tok)).vocab;
      onProgress(1);
      return { ort, encoder, decoder, vocab };
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

const normalize = (s) => { try { return khnormal(s).replace(/\s+/g, ' ').trim(); } catch { return s.trim(); } };

/** Grey line image → Float32 [1,1,64,W] with values 0..1, right-padded white to a multiple of 8. */
function toTensorData(canvas) {
  const w0 = Math.max(16, Math.min(MAX_W, Math.round((canvas.width * HEIGHT) / Math.max(1, canvas.height))));
  const c = document.createElement('canvas');
  c.width = w0; c.height = HEIGHT;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w0, HEIGHT);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w0, HEIGHT);
  const px = ctx.getImageData(0, 0, w0, HEIGHT).data;
  const W = Math.ceil(w0 / 8) * 8;
  const data = new Float32Array(HEIGHT * W).fill(1);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < w0; x++) {
      const i = (y * w0 + x) * 4;
      data[y * W + x] = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    }
  }
  return { data, W, w: w0 };
}

function argmaxRow(arr, offset, V) {
  let best = 0; let bv = -Infinity;
  for (let k = 0; k < V; k++) { const v = arr[offset + k]; if (v > bv) { bv = v; best = k; } }
  return [best, bv];
}

/**
 * Read one text line. Returns { text, confidence }.
 * CTC draft first (fast); then the cluster decoder (greedy) for better accuracy.
 */
export async function readLine(model, canvas, { useDecoder = true } = {}) {
  const { ort, encoder, decoder, vocab } = model;
  const { data, W, w } = toTensorData(canvas);
  const out = await encoder.run({
    images: new ort.Tensor('float32', data, [1, 1, HEIGHT, W]),
    widths: new ort.Tensor('int64', BigInt64Array.from([BigInt(w)]), [1]),
  });
  const ctc = out.ctc_logp;
  const [, T, V] = ctc.dims;
  const len = Math.min(T, Number(out.lens.data[0]));
  const draft = [];
  let prev = -1; let conf = 0;
  for (let t = 0; t < len; t++) {
    const [k, v] = argmaxRow(ctc.data, t * V, V);
    conf += Math.exp(v);
    if (k !== prev && k !== BLANK) draft.push(k);
    prev = k;
  }
  const decode = (ids) => normalize(ids.filter((i) => i >= 5 && i < vocab.length).map((i) => vocab[i]).join(''));
  const draftText = decode(draft);
  let text = draftText;
  if (useDecoder && draft.length) {
    const ids = [1];
    const limit = Math.floor(1.5 * draft.length) + 4;
    for (let step = 0; step < limit; step++) {
      const r = await decoder.run({
        ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        memory: out.memory, mem_pad: out.mem_pad,
      });
      const lp = r.logp;
      const [k] = argmaxRow(lp.data, (ids.length - 1) * lp.dims[2], lp.dims[2]);
      if (k === EOS) break;
      ids.push(k);
    }
    const decText = decode(ids.slice(1));
    if (decText) text = decText;
  }
  return { text, draft: draftText, confidence: len ? conf / len : 0 };
}

// ---------- finding text lines in a photo ----------

/** Draw an image (File/Blob/ImageBitmap) to a canvas no wider than `max`. */
export async function imageToCanvas(src, max = 1600) {
  const bmp = src instanceof ImageBitmap ? src : await createImageBitmap(src);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** Runs of rows/cols whose ink count is above `thr`, as [start, end) pairs. */
function runs(profile, from, to, thr) {
  const out = [];
  let st = -1;
  for (let i = from; i <= to; i++) {
    const on = i < to && profile[i] > thr;
    if (on && st < 0) st = i;
    if (!on && st >= 0) { out.push([st, i]); st = -1; }
  }
  return out;
}

/**
 * Merge row runs into text lines. Small runs (Khmer vowel signs above, subscripts below)
 * are attached to the NEARER neighbouring line; other runs merge only across tiny gaps.
 */
function mergeRuns(rs, gapRatio) {
  if (rs.length < 2) return rs.map((r) => [...r]);
  const hs = rs.map(([a, b]) => b - a).sort((x, y) => x - y);
  const typical = hs[Math.floor(hs.length * 0.75)];
  let list = rs.map((r) => [...r]);
  // 1) small runs join their closest neighbour
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      const [a, b] = list[i];
      if (b - a >= typical * 0.45 || list.length < 2) continue;
      const up = i > 0 ? a - list[i - 1][1] : Infinity;
      const down = i < list.length - 1 ? list[i + 1][0] - b : Infinity;
      if (Math.min(up, down) > typical * 0.8) continue;
      if (up <= down) { list[i - 1][1] = b; list.splice(i, 1); } else { list[i + 1][0] = a; list.splice(i, 1); }
      changed = true;
      break;
    }
  }
  // 2) regular runs merge only across very small gaps
  const out = [];
  for (const r of list) {
    const last = out.at(-1);
    if (last && r[0] - last[1] <= Math.max(2, Math.max(last[1] - last[0], r[1] - r[0]) * gapRatio)) last[1] = r[1];
    else out.push(r);
  }
  return out;
}

/**
 * Split a document photo into text-line crops with a recursive X-Y cut:
 * adaptive threshold → alternately split the region at the widest empty rows / columns
 * until each piece is a single text line. Photos and specks are dropped.
 */
export function findLines(canvas) {
  const { width: W, height: H } = canvas;
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 1; y <= H; y++) {
    let row = 0;
    for (let x = 1; x <= W; x++) { row += g[(y - 1) * W + x - 1]; I[y * (W + 1) + x] = I[(y - 1) * (W + 1) + x] + row; }
  }
  const r = Math.max(8, Math.round(Math.min(W, H) / 40));
  const ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r); const y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r); const x1 = Math.min(W, x + r + 1);
      const mean = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((y1 - y0) * (x1 - x0));
      ink[y * W + x] = g[y * W + x] < mean * 0.85 && g[y * W + x] < 200 ? 1 : 0;
    }
  }
  const colProf = (x0, x1, y0, y1) => { const p = new Uint32Array(W); for (let x = x0; x < x1; x++) { let s = 0; for (let y = y0; y < y1; y++) s += ink[y * W + x]; p[x] = s; } return p; };
  // Row profile that ignores near-solid vertical strokes (card borders, photo edges, table rules).
  const rowProf = (x0, x1, y0, y1) => {
    const cp = colProf(x0, x1, y0, y1);
    const skip = (x) => cp[x] > (y1 - y0) * 0.6;
    const p = new Uint32Array(H);
    for (let y = y0; y < y1; y++) { let s = 0; for (let x = x0; x < x1; x++) if (!skip(x)) s += ink[y * W + x]; p[y] = s; }
    return p;
  };
  const leaves = [];
  const minH = Math.max(7, H * 0.012);

  function cut(x0, y0, x1, y1, depth) {
    if (depth > 12 || x1 - x0 < 6 || y1 - y0 < minH) return;
    // horizontal split (lines)
    const rows = mergeRuns(runs(rowProf(x0, x1, y0, y1), y0, y1, 0), 0.12);
    if (rows.length > 1) { for (const [a, b] of rows) cut(x0, a, x1, b, depth + 1); return; }
    if (!rows.length) return;
    const [ry0, ry1] = rows[0];
    const h = ry1 - ry0;
    // vertical split (columns / words far apart)
    const cols = runs(colProf(x0, x1, ry0, ry1), x0, x1, 0);
    // A tall block isn't a line yet: split on narrow gaps (photo | text column). A line: only on wide gaps.
    const gap = h > Math.max(minH * 4, H * 0.12) ? Math.max(8, W * 0.012) : Math.max(10, h * 1.5);
    const segs = [];
    for (const c of cols) {
      const last = segs.at(-1);
      if (last && c[0] - last[1] <= gap) last[1] = c[1]; else segs.push([...c]);
    }
    if (segs.length > 1) { for (const [a, b] of segs) cut(a, ry0, b, ry1, depth + 1); return; }
    if (!segs.length) return;
    const [sx0, sx1] = segs[0];
    leaves.push([sx0, ry0, sx1, ry1]);
  }
  cut(0, 0, W, H, 0);

  const lines = [];
  for (const [x0, y0, x1, y1] of leaves) {
    const w = x1 - x0; const h = y1 - y0;
    if (h < minH || h > H * 0.3 || w < h * 1.1) continue;
    let filled = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) filled += ink[y * W + x];
    const density = filled / (w * h);
    if (density > 0.6 || density < 0.04) continue; // photo / noise
    const pad = Math.round(h * 0.22);
    const bx = Math.max(0, x0 - pad); const by = Math.max(0, y0 - pad);
    const bw = Math.min(W, x1 + pad) - bx; const bh = Math.min(H, y1 + pad) - by;
    const c = document.createElement('canvas');
    c.width = bw; c.height = bh;
    c.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
    lines.push({ x: bx, y: by, w: bw, h: bh, canvas: c });
  }
  return lines.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.5 ? a.x - b.x : a.y - b.y));
}

/** OCR a whole document photo: returns [{ text, confidence, box }] top-to-bottom. */
/**
 * `score(lines)` lets the caller judge a read (e.g. how many ID fields parsed); it decides between
 * the photo and its upside-down copy. A read scoring >= `good` skips the second try.
 */
export async function readDocument(model, src, { onLine, prepare = true, score, good = Infinity } = {}) {
  let canvas = await imageToCanvas(src);
  let info = { angle: 0, cropped: false, rotated90: false };
  if (prepare) { const r = prepareCard(canvas); canvas = r.canvas; info = r; }
  const readAll = async (cv, base, span) => {
    const lines = findLines(cv);
    const out = [];
    for (const [i, l] of lines.entries()) {
      const r = await readLine(model, l.canvas);
      out.push({ ...r, box: { x: l.x, y: l.y, w: l.w, h: l.h } });
      onLine?.(base + ((i + 1) / lines.length) * span, 1);
    }
    return out;
  };
  const mean = (ls) => (ls.length ? ls.reduce((a, l) => a + l.confidence * Math.min(1, l.text.length / 8), 0) / ls.length : 0);
  const judge = (ls) => (score ? score(ls) : 0) + mean(ls);
  let lines = await readAll(canvas, 0, info.rotated90 ? 0.5 : 1);
  // A sideways photo may have been turned the wrong way: try upside-down and keep the better read.
  if ((info.rotated90 || mean(lines) < 0.35) && judge(lines) < good) {
    const flipped = flip180(canvas);
    const alt = await readAll(flipped, 0.5, 0.5);
    if (judge(alt) > judge(lines)) { lines = alt; canvas = flipped; }
  }
  onLine?.(1, 1);
  return { lines, width: canvas.width, height: canvas.height, canvas, prep: info };
}
