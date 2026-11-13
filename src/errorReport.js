// Sends browser errors to the platform error log (super admin → Errors). At most 10 per page load,
// each distinct message once; errors from browser extensions are ignored.
const seen = new Set();
let sent = 0;

export function reportError(error, extra = '') {
  try {
    const message = String(error?.message || error || 'Unknown error').slice(0, 500);
    const stack = String(error?.stack || '').slice(0, 4000) + (extra ? `\n${String(extra).slice(0, 1000)}` : '');
    if (/extension:\/\/|ResizeObserver loop|Script error\.?$/i.test(message + stack)) return;
    if (seen.has(message) || sent >= 10) return;
    seen.add(message); sent += 1;
    const body = JSON.stringify({ message, stack, path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/errors', new Blob([body], { type: 'application/json' }));
    else fetch('/api/errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* never let reporting break the app */ }
}

export function installErrorReporting() {
  if (!import.meta.env.PROD) return;
  window.addEventListener('error', (e) => reportError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
