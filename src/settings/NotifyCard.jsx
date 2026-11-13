import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2, Smartphone } from 'lucide-react';
import { useApp } from '../ui.jsx';
import { api } from '../api.js';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** "Notify this phone" — one tap; works next to (or instead of) Telegram. */
export default function NotifyCard() {
  const { notify } = useApp();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState([]);
  const ok = supported();

  useEffect(() => {
    if (!ok) return;
    currentSub().then((s) => setOn(!!s)).catch(() => {});
    api('GET', '/api/push/devices').then((r) => setDevices(r.devices)).catch(() => {});
  }, [ok]);

  async function enable() {
    setBusy(true);
    try {
      if (await Notification.requestPermission() !== 'granted') throw new Error('សូមអនុញ្ញាតការជូនដំណឹងក្នុង browser ជាមុនសិន');
      const reg = await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { key } = await api('GET', '/api/push/key');
      const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      const r = await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
      setDevices(r.devices); setOn(true);
      await api('POST', '/api/push/test', {});
      notify('បានបើកការជូនដំណឹងលើឧបករណ៍នេះ 🔔');
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await currentSub();
      if (sub) { const r = await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }); setDevices(r.devices); await sub.unsubscribe(); }
      setOn(false);
      notify('បានបិទការជូនដំណឹងលើឧបករណ៍នេះ');
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }

  return (
    <div className="card notify-card">
      <h3 className="sec-title"><BellRing size={17} /> ការជូនដំណឹងលើទូរស័ព្ទ</h3>
      <p className="muted small">ទទួលដំណឹងភ្លាមៗ ពេលអតិថិជនបង់ប្រាក់ រាយការណ៍ជួសជុល ឬ Bakong បញ្ជាក់ប្រាក់ចូល — ទោះមិនបើក Telegram ក៏ដោយ។</p>
      {!ok ? (
        <p className="notify-hint"><Smartphone size={16} /> {isIos() && !standalone()
          ? 'នៅលើ iPhone៖ ចុច «Share» → «Add to Home Screen» ហើយបើកកម្មវិធីពីអេក្រង់ដើម ដើម្បីបើកការជូនដំណឹង។'
          : 'Browser នេះមិនគាំទ្រការជូនដំណឹងទេ។ សូមប្រើ Chrome ឬដំឡើងកម្មវិធី។'}</p>
      ) : (
        <button className={'btn ' + (on ? 'ghost' : 'primary')} onClick={on ? disable : enable} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : on ? <BellOff size={16} /> : <BellRing size={16} />}
          {on ? 'បិទលើឧបករណ៍នេះ' : 'បើកការជូនដំណឹងលើឧបករណ៍នេះ'}
        </button>
      )}
      {on && <button className="link-btn" onClick={() => api('POST', '/api/push/test', {}).then((r) => notify(r.sent ? 'បានផ្ញើការសាកល្បង' : 'មិនមានឧបករណ៍', !r.sent)).catch((e) => notify(e.message, true))}>ផ្ញើការសាកល្បង</button>}
      {devices.length > 0 && <p className="muted small">ឧបករណ៍ដែលបានភ្ជាប់៖ {devices.length}</p>}
    </div>
  );
}
