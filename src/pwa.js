// PWA helpers: service worker, install prompt, update notice, online status.
import { useEffect, useState, useSyncExternalStore } from 'react';

let deferredPrompt = null;
let updateWorker = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; emit(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; emit(); });
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const track = (w) => w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { updateWorker = w; emit(); }
      });
      if (reg.waiting && navigator.serviceWorker.controller) { updateWorker = reg.waiting; emit(); }
      reg.addEventListener('updatefound', () => track(reg.installing));
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch { /* unsupported or blocked */ }
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

export function usePwa() {
  const snap = useSyncExternalStore(subscribe, () => `${!!deferredPrompt}|${!!updateWorker}|${navigator.onLine}`);
  const [canInstall, updateReady, online] = snap.split('|').map((x) => x === 'true');
  return {
    canInstall,
    iosHint: !canInstall && isIOS() && !isStandalone(),
    standalone: isStandalone(),
    online,
    updateReady,
    async install() {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      emit();
      return outcome === 'accepted';
    },
    applyUpdate() { updateWorker?.postMessage('skip-waiting'); },
  };
}

/** Point the page's manifest / icon / theme at a different app (used by the customer portal). */
export function useAppIdentity({ manifest, appleIcon, theme, title }) {
  useEffect(() => {
    const m = document.getElementById('manifest');
    const a = document.getElementById('apple-icon');
    const t = document.querySelector('meta[name=theme-color]');
    const prev = [m?.href, a?.href, t?.content, document.title];
    if (m && manifest) m.href = manifest;
    if (a && appleIcon) a.href = appleIcon;
    if (t && theme) t.content = theme;
    if (title) document.title = title;
    return () => { if (m) m.href = prev[0]; if (a) a.href = prev[1]; if (t) t.content = prev[2]; document.title = prev[3]; };
  }, [manifest, appleIcon, theme, title]);
}

/** Small banner: offline / update available / install. */
export function useInstallState() {
  const pwa = usePwa();
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem('py-install-dismissed') === '1'; } catch { return false; } });
  return {
    ...pwa,
    showInstall: (pwa.canInstall || pwa.iosHint) && !dismissed,
    dismiss() { setDismissed(true); try { localStorage.setItem('py-install-dismissed', '1'); } catch { /* ignore */ } },
  };
}
