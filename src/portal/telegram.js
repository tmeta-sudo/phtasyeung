// When the tenant's page is opened from the bot it runs inside Telegram (a "Mini App").
// Telegram passes its launch data in the URL hash; no Telegram script is loaded.
let cached;
export function inTelegram() {
  if (cached !== undefined) return cached;
  try {
    const hash = location.hash || '';
    if (hash.includes('tgWebApp')) sessionStorage.setItem('py-in-tg', hash);
    const saved = sessionStorage.getItem('py-in-tg') || '';
    cached = !!saved || !!window.TelegramWebviewProxy;
    // Follow Telegram's light/dark theme on first open.
    const m = saved.match(/tgWebAppThemeParams=([^&]+)/);
    if (m && !localStorage.getItem('py-theme')) {
      const bg = JSON.parse(decodeURIComponent(m[1])).bg_color || '';
      const v = /^#[0-9a-f]{6}$/i.test(bg) ? parseInt(bg.slice(1, 3), 16) * 0.299 + parseInt(bg.slice(3, 5), 16) * 0.587 + parseInt(bg.slice(5, 7), 16) * 0.114 : 255;
      document.documentElement.dataset.theme = v < 128 ? 'dark' : 'light';
    }
    // Keep the address tidy and the launch data out of screenshots.
    if (hash.includes('tgWebApp')) history.replaceState(null, '', location.pathname + location.search);
  } catch { cached = false; }
  return cached;
}
