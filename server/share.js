// Link previews for public pages. When a listing (/v/slug) or the room map is shared on Facebook,
// Telegram or Messenger, the preview shows the house name, price, vacant rooms and a photo instead
// of the generic app card. The page is the normal app shell with its <head> rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let shell = '';
/** The built index.html: from the build (bundled module or dist/), else fetched from our own site. */
export async function appShell(origin) {
  if (shell) return shell;
  try { shell = (await import('./shell.generated.js')).default; } catch { /* not generated (local dev) */ }
  if (!shell) { try { shell = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8'); } catch { /* not built */ } }
  if (!shell && origin && process.env.VERCEL) {
    const r = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
    if (r?.ok) shell = await r.text();
  }
  // Last resort (tests, CI without a build): the source page. It still carries correct previews.
  if (!shell && !process.env.VERCEL) { try { shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); } catch { /* none */ } }
  return shell;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Public origin of this request (https://host), for absolute links in previews and the sitemap. */
export function originOf(req, configured = '') {
  if (configured) return configured;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim();
  return /^[\w.-]+(:\d+)?$/.test(host) ? `${proto}://${host}` : '';
}

/** Replace the shell's title/description/preview tags with page-specific ones. */
export function withMeta(html, { title, description, image, url, imageAlt, jsonLd }) {
  const abs = (u) => (u && !/^https?:/.test(u) && url ? new URL(u, url).href : u);
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/\s*<meta (property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g, '');
  const tags = [
    ['property', 'og:title', title], ['property', 'og:description', description], ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'ផ្ទះយើង'], ['property', 'og:locale', 'km_KH'],
    url && ['property', 'og:url', url],
    ['property', 'og:image', abs(image || '/icons/icon-512.png')],
    imageAlt && ['property', 'og:image:alt', imageAlt],
    ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', title], ['name', 'twitter:description', description],
  ].filter(Boolean).map(([k, n, v]) => `    <meta ${k}="${n}" content="${esc(v)}" />`);
  if (url) tags.push(`    <link rel="canonical" href="${esc(url)}" />`);
  // Structured data so search engines understand the page; "<" is escaped so it cannot close the script.
  if (jsonLd) tags.push(`    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);
  out = out.replace('</head>', `${tags.join('\n')}\n  </head>`);
  return out;
}

export function sendHtml(res, html, maxAge = 300) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short shared cache: previews refresh within minutes when prices or vacancies change.
  res.setHeader('Cache-Control', `public, max-age=60, s-maxage=${maxAge}`);
  res.end(html);
}
