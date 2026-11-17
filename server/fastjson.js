// Faster API replies: JSON is compressed (brotli or gzip), and every GET carries an ETag so the app's
// background refresh gets a tiny "304 nothing changed" instead of the whole landlord state again.
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const MIN_COMPRESS = 1400; // smaller than one network packet: not worth the CPU
const BR = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }; // fast, still ~10x smaller for JSON

export const etagOf = (buf) => `"${crypto.createHash('sha1').update(buf).digest('base64url')}"`;

/** Pick an encoding the browser accepts: br > gzip > none. */
export function encodingFor(header) {
  const q = {};
  for (const part of String(header || '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    const qv = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    q[name.trim()] = qv ? parseFloat(qv.slice(2)) || 0 : 1;
  }
  if (q.br > 0) return 'br';
  if (q.gzip > 0) return 'gzip';
  return '';
}

export function fastJson(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  res.json = (obj) => {
    const body = Buffer.from(JSON.stringify(obj ?? null));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    if (ok) {
      const tag = etagOf(body);
      res.setHeader('ETag', tag);
      const cc = String(res.getHeader('Cache-Control') || '');
      // Public, cacheable answers (the map) are left to the browser/CDN; private data is checked here.
      if (req.method === 'GET' && !/public/.test(cc) && String(req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(tag)) {
        res.status(304);
        return res.end();
      }
    }
    if (req.method === 'HEAD') { res.setHeader('Content-Length', body.length); return res.end(); }
    if (body.length < MIN_COMPRESS) { res.setHeader('Content-Length', body.length); return res.end(body); }
    res.setHeader('Vary', 'Accept-Encoding');
    const enc = encodingFor(req.headers['accept-encoding']);
    const out = enc === 'br' ? zlib.brotliCompressSync(body, BR) : enc === 'gzip' ? zlib.gzipSync(body, { level: 5 }) : body;
    if (enc) res.setHeader('Content-Encoding', enc);
    res.setHeader('Content-Length', out.length);
    return res.end(out);
  };
  return next();
}
