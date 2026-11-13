import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Home as HomeIcon, UsersRound, DoorOpen, ReceiptText, Gauge, QrCode, Send, Settings, Wrench, Search, Bell, ScanLine,
  LogOut, ChevronRight, ChevronDown, Menu, X, Shield, Sparkles, Lightbulb, Bug, Download, MessageSquare,
  BarChart3,
} from 'lucide-react';
import { api } from './api.js';
import { AppCtx, useApp, navigate, usePath, Toast, Avatar, tenantPhoto, PrintPortal } from './ui.jsx';
import { matchesQuery, greetingKm, num } from '../shared/khmer.js';
import Home from './pages/Home.jsx';
import Customers, { CustomerDetail, CustomerForm } from './pages/Customers.jsx';
import Rooms from './pages/Rooms.jsx';
import Invoices, { InvoiceModal } from './pages/Invoices.jsx';
import Meters, { MeterModal } from './pages/Meters.jsx';
import QrCenter, { ScannerModal } from './pages/QrCenter.jsx';
import TelegramPage from './pages/Telegram.jsx';
import SettingsPage from './pages/Settings.jsx';
import Tasks from './pages/Tasks.jsx';
import Feedback, { News, useNewsUnread } from './pages/Feedback.jsx';
import Super from './pages/Super.jsx';
import InvoiceDesigner from './pages/InvoiceDesigner.jsx';
import Inbox from './pages/Inbox.jsx';
import Reports from './pages/Reports.jsx';
import TelegramLogin from './TelegramLogin.jsx';
import PwaBar from './PwaBar.jsx';
import { ThemeToggle } from './theme.jsx';
import { usePwa } from './pwa.js';

const NAV = [
  ['/', 'ទំព័រដើម', HomeIcon],
  ['/customers', 'អតិថិជន', UsersRound],
  ['/rooms', 'បន្ទប់', DoorOpen],
  ['/invoices', 'វិក្កយបត្រ', ReceiptText],
  ['/meters', 'កុងទ័រ', Gauge],
  ['/reports', 'របាយការណ៍', BarChart3],
  ['/inbox', 'សារ', MessageSquare],
  ['/qr', 'QR', QrCode],
  ['/telegram', 'Telegram', Send],
];

// Which pages each team role sees (the server enforces the same rules).
const ROLE_PAGES = {
  manager: ['/', '/customers', '/rooms', '/invoices', '/meters', '/inbox', '/qr', '/reports'],
  staff: ['/meters', '/inbox', '/rooms'],
};
const allowedPage = (role, p) => !ROLE_PAGES[role] || ROLE_PAGES[role].includes(p) || ['/settings', '/tasks', '/news', '/feedback', '/super'].includes(p);

const Landing = lazy(() => import('./landing/Landing.jsx'));
const setAuthHint = (on) => { try { if (on) localStorage.setItem('py-authed', '1'); else localStorage.removeItem('py-authed'); } catch { /* ignore */ } };

export default function App() {
  const [auth, setAuth] = useState(null);
  const path = usePath();
  const refreshAuth = useCallback(() => api('GET', '/api/auth/state').then((a) => { setAuthHint(a.authed); setAuth(a); }).catch(() => setAuth({ error: true })), []);
  useEffect(() => { refreshAuth(); }, [refreshAuth]);
  // After signing in from /login or /signup, land on the dashboard.
  useEffect(() => { if (auth?.authed && /^\/(login|signup)$/.test(path)) navigate('/', { replace: true }); }, [auth, path]);
  if (!auth) return <div className="boot"><span className="spinner" /></div>;
  if (path.startsWith('/join/')) return <Join token={decodeURIComponent(path.slice(6))} authed={auth.authed} onDone={async () => { await refreshAuth(); navigate('/', { replace: true }); }} />;
  if (!auth.authed) {
    if (path === '/') return <Suspense fallback={<div className="boot"><span className="spinner" /></div>}><Landing /></Suspense>;
    return <Login onDone={refreshAuth} bot={auth.bot} />;
  }
  return <Admin onLogout={async () => { setAuthHint(false); await refreshAuth(); navigate('/'); }} />;
}

/** Accept a team invite: create a personal login for this landlord's team. */
function Join({ token, authed, onDone }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ email: '', password: '', password2: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('GET', `/api/join/${encodeURIComponent(token)}`).then(setInfo).catch((e) => setError(e.message)); }, [token]);
  async function submit(e) {
    e.preventDefault(); setError('');
    if (f.password !== f.password2) return setError('ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា');
    setBusy(true);
    try {
      if (authed) await api('POST', '/api/auth/logout');
      await api('POST', `/api/join/${encodeURIComponent(token)}`, { email: f.email, password: f.password });
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="login">
      <div className="login-photo"><div className="login-caption"><b>ផ្ទះយើង</b><span>ក្រុមការងារ · គណនីផ្ទាល់ខ្លួនសម្រាប់ម្នាក់ៗ</span></div></div>
      <div className="login-card">
        <div className="login-top"><img src="/icons/icon-192.png" alt="" width="52" height="52" /><ThemeToggle /></div>
        {info ? (
          <>
            <h1>ចូលរួមជា{info.roleKm}</h1>
            <p>អ្នកត្រូវបានអញ្ជើញឱ្យជួយគ្រប់គ្រង <b>{info.property}</b>{info.name ? ` (${info.name})` : ''}។ បង្កើតគណនីរបស់អ្នក៖</p>
            <form className="login-form" onSubmit={submit}>
              <input type="email" autoComplete="username" placeholder="អ៊ីមែល" value={f.email} onChange={set('email')} required />
              <input type="password" autoComplete="new-password" placeholder="ពាក្យសម្ងាត់ (≥ ៨ តួ)" minLength={8} value={f.password} onChange={set('password')} required />
              <input type="password" autoComplete="new-password" placeholder="បញ្ជាក់ពាក្យសម្ងាត់" value={f.password2} onChange={set('password2')} required />
              {authed && <p className="form-warn">អ្នកកំពុងចូលគណនីផ្សេង — វានឹងចេញពីគណនីនោះ។</p>}
              {error && <p className="form-error">{error}</p>}
              <button className="btn primary block" disabled={busy}>{busy ? '…' : 'ចូលរួម'}</button>
            </form>
          </>
        ) : error ? (
          <><h1>តំណមិនដំណើរការ</h1><p className="form-error">{error}</p><button className="btn ghost block" onClick={() => navigate('/')}>ទៅទំព័រដើម</button></>
        ) : <div className="boot"><span className="spinner" /></div>}
      </div>
    </div>
  );
}

function Login({ onDone, bot }) {
  const [mode, setMode] = useState(() => (location.pathname === '/signup' ? 'signup' : 'login')); // login | signup | forgot | reset
  const [viaTelegram, setViaTelegram] = useState(() => (bot && new URLSearchParams(location.search).get('telegram') ? 'login' : null)); // null | 'login' | 'signup'
  const [f, setF] = useState({ email: '', password: '', password2: '', propertyName: '', phone: '', code: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const m = mode;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = (next) => { setMode(next); setError(''); setInfo(''); setViaTelegram(null); };
  async function submit(e) {
    e.preventDefault();
    setError('');
    if ((m === 'signup' || m === 'reset') && f.password !== f.password2) return setError('ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា');
    setBusy(true);
    try {
      if (m === 'login') await api('POST', '/api/auth/login', { email: f.email, password: f.password });
      if (m === 'signup') await api('POST', '/api/auth/signup', { email: f.email, password: f.password, propertyName: f.propertyName, phone: f.phone });
      if (m === 'forgot') { const r = await api('POST', '/api/auth/forgot', { email: f.email }); setInfo(r.message); setMode('reset'); return; }
      if (m === 'reset') await api('POST', '/api/auth/reset', { email: f.email, code: f.code, password: f.password });
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const titles = { login: 'ចូលគណនីម្ចាស់ផ្ទះ', signup: 'បង្កើតគណនីឥតគិតថ្លៃ', forgot: 'ស្តារគណនី', reset: 'កំណត់ពាក្យសម្ងាត់ថ្មី' };
  const subs = {
    login: 'គ្រប់គ្រងបន្ទប់ជួល វិក្កយបត្រ និងអតិថិជនរបស់អ្នក។',
    signup: 'ឥតគិតថ្លៃសម្រាប់ម្ចាស់ផ្ទះជួលខ្មែរ — មិនត្រូវការកាតឥណទាន។',
    forgot: 'វិធីងាយបំផុត៖ ផ្ញើ /recover ទៅ bot Telegram របស់យើង ដើម្បីទទួលតំណចូលគណនី។',
    reset: 'បញ្ចូលលេខកូដពី Telegram និងពាក្យសម្ងាត់ថ្មី។',
  };
  const tgButton = (label, onClick, disabled) => bot && <button type="button" className="btn tg block" onClick={onClick} disabled={disabled}><Send size={17} /> {label}</button>;
  return (
    <div className="login">
      <div className="login-photo">
        <div className="login-caption">
          <b>ផ្ទះយើង</b>
          <span>វិក្កយបត្រស្វ័យប្រវត្តិតាម Telegram · បង់តាម KHQR · គ្រប់គ្រងអតិថិជន</span>
          <ul className="login-points"><li>✓ ឥតគិតថ្លៃ</li><li>✓ ភាសាខ្មែរពេញលេញ</li><li>✓ ទិន្នន័យឯកជន និងសុវត្ថិភាព</li></ul>
        </div>
      </div>
      <div className="login-card">
        <div className="login-top"><button type="button" className="logo-link" onClick={() => navigate('/')} aria-label="ទំព័រដើម"><img src="/icons/icon-192.png" alt="" width="52" height="52" /></button><ThemeToggle /></div>
        {(m === 'login' || m === 'signup') && (
          <div className="seg">
            <button type="button" className={m === 'login' ? 'on' : ''} onClick={() => go('login')}>ចូលគណនី</button>
            <button type="button" className={m === 'signup' ? 'on' : ''} onClick={() => go('signup')}>បង្កើតគណនី</button>
          </div>
        )}
        <h1>{titles[m]}</h1>
        <p>{subs[m]}</p>
        {viaTelegram ? (
          <TelegramLogin mode={viaTelegram} extra={viaTelegram === 'signup' ? { propertyName: f.propertyName, phone: f.phone } : {}} onDone={onDone} onCancel={() => setViaTelegram(null)} />
        ) : (
          <form className="login-form" onSubmit={submit}>
            {m === 'login' && tgButton('ចូលតាម Telegram', () => setViaTelegram('login'))}
            {m === 'signup' && <input autoComplete="organization" placeholder="ឈ្មោះផ្ទះជួល / អគារ (ឧ. ផ្ទះជួលសុខា)" value={f.propertyName} onChange={set('propertyName')} required />}
            {m === 'signup' && tgButton('បង្កើតគណនីតាម Telegram', () => (f.propertyName.trim() ? setViaTelegram('signup') : setError('សូមបញ្ចូលឈ្មោះផ្ទះជួលជាមុនសិន')))}
            {m === 'forgot' && bot && (
              <>
                <a className="btn tg block" href={`https://t.me/${bot}?start=recover`} target="_blank" rel="noreferrer"><Send size={17} /> ស្តារតាម Telegram (/recover)</a>
                {tgButton('ចូលតាម Telegram', () => setViaTelegram('login'))}
              </>
            )}
            {bot && m !== 'reset' && <div className="or"><span>ឬប្រើអ៊ីមែល</span></div>}
            <input type={m === 'login' ? 'text' : 'email'} autoComplete="username" placeholder="អ៊ីមែល" value={f.email} onChange={set('email')} required={m !== 'signup' || !viaTelegram} />
            {m === 'signup' && <input type="tel" autoComplete="tel" placeholder="ទូរស័ព្ទ (មិនចាំបាច់)" value={f.phone} onChange={set('phone')} />}
            {m === 'reset' && <input inputMode="numeric" autoComplete="one-time-code" placeholder="លេខកូដ ៦ ខ្ទង់" value={f.code} onChange={set('code')} required />}
            {m !== 'forgot' && <input type="password" autoComplete={m === 'login' ? 'current-password' : 'new-password'} placeholder={m === 'login' ? 'ពាក្យសម្ងាត់' : 'ពាក្យសម្ងាត់ (≥ ៨ តួ)'} value={f.password} onChange={set('password')} required minLength={m === 'login' ? 1 : 8} />}
            {(m === 'signup' || m === 'reset') && <input type="password" autoComplete="new-password" placeholder="បញ្ជាក់ពាក្យសម្ងាត់" value={f.password2} onChange={set('password2')} required />}
            {info && <p className="form-warn">{info}</p>}
            {error && <p className="form-error">{error}</p>}
            <button className={'btn block ' + (bot ? 'ghost' : 'primary')} disabled={busy}>{busy ? '…' : { login: 'ចូលដោយអ៊ីមែល', signup: 'បង្កើតដោយអ៊ីមែល', forgot: 'ផ្ញើលេខកូដទៅ Telegram ម្ចាស់ផ្ទះ', reset: 'ប្តូរពាក្យសម្ងាត់' }[m]}</button>
            {m === 'login' && <button type="button" className="link-btn center" onClick={() => go('forgot')}>ភ្លេចពាក្យសម្ងាត់ ឬចូលមិនបាន?</button>}
            {(m === 'forgot' || m === 'reset') && <button type="button" className="link-btn center" onClick={() => go('login')}>← ត្រឡប់ទៅចូលគណនី</button>}
            {m === 'signup' && <small className="muted center">ដោយបង្កើតគណនី អ្នកយល់ព្រមរក្សាព័ត៌មានអតិថិជនដោយទំនួលខុសត្រូវ។ អ្នកអាចនាំចេញ ឬលុបទិន្នន័យទាំងអស់បានគ្រប់ពេល។</small>}
          </form>
        )}
      </div>
    </div>
  );
}

function Admin({ onLogout }) {
  const [state, setState] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // {type, ...}
  const [printing, setPrinting] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const path = usePath();
  const toastTimer = useRef();
  useEffect(() => { if (!/^\/(feedback|news)/.test(path)) { try { sessionStorage.setItem('py-last-page', path); } catch { /* ignore */ } } }, [path]);

  const notify = useCallback((text, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 5000 : 3000);
  }, []);

  const load = useCallback(() => api('GET', '/api/state').then(setState).catch((e) => (e.status === 401 ? onLogout() : notify(e.message, true))), [notify, onLogout]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 20000);
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    // A push notification arrived: refresh at once instead of waiting for the next poll.
    const onSw = (e) => e.data?.type === 'refresh' && load();
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onFocus); navigator.serviceWorker?.removeEventListener('message', onSw); };
  }, [load]);

  /** Call an endpoint that returns the full admin state. Returns the response or null. */
  const call = useCallback(async (method, url, body, success) => {
    try {
      const res = await api(method, url, body);
      if (res.tenants) setState(res);
      const msg = success && (typeof success === 'function' ? success(res) : success);
      if (msg) notify(msg);
      return res;
    } catch (e) {
      if (e.status === 401) onLogout();
      notify(e.message, true);
      return null;
    }
  }, [notify, onLogout]);

  const print = useCallback((node) => setPrinting(node), []);
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 350); // let QR SVGs render
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printing]);

  // Deep links from printed QR stickers: /scan/room/A-101, /scan/invoice/<id>, /scan/customer/<id>
  useEffect(() => {
    if (!state) return;
    const m = path.match(/^\/scan\/(room|invoice|customer)\/(.+)$/);
    if (!m) return;
    const id = decodeURIComponent(m[2]);
    navigate('/qr', { replace: true });
    setModal({ type: 'scan-result', text: location.origin + path, preset: { kind: m[1], id } });
  }, [path, state]);

  const ctx = useMemo(() => ({
    state, setState, call, notify, reload: load, print,
    openCustomerForm: (tenant, preset) => setModal({ type: 'customer', tenant, preset }),
    openMeter: (roomId) => setModal({ type: 'meter', roomId }),
    openInvoice: (id) => setModal({ type: 'invoice', id }),
    openScanner: () => setModal({ type: 'scanner' }),
    closeModal: () => setModal(null),
    base: (state?.settings?.publicUrl || location.origin).replace(/\/+$/, ''),
  }), [state, call, notify, load, print]);

  if (!state) return <div className="boot"><span className="spinner" /></div>;

  const claimed = state.invoices.filter((i) => i.status === 'claimed').length;
  const missingId = state.tenants.filter((t) => t.status === 'active' && !t.files?.idFront).length;
  const unreadMsgs = (state.tickets || []).reduce((a, t) => a + (t.unread || 0), 0);
  const badges = { '/invoices': claimed, '/customers': missingId, '/inbox': unreadMsgs };
  const section = '/' + (path.split('/')[1] || '');
  const EXTRA = { '/settings': 'ការកំណត់', '/tasks': 'ការងារ', '/news': 'មានអ្វីថ្មី', '/feedback': 'មតិ និងសំណើ', '/super': 'អ្នកគ្រប់គ្រងប្រព័ន្ធ' };
  const shown = state.account.role === 'staff' && (section === '/' || !allowedPage('staff', section)) ? '/meters' : section;
  const current = NAV.find(([p]) => p === shown) || (EXTRA[section] ? [section, EXTRA[section]] : NAV[0]);

  const role = state.account.role || 'owner';
  const nav = NAV.filter(([p]) => allowedPage(role, p));
  let page;
  const customerMatch = path.match(/^\/customers\/(.+)$/);
  if (!allowedPage(role, section) || (role === 'staff' && section === '/')) page = role === 'staff' ? <Meters /> : <Home />;
  else if (customerMatch) page = <CustomerDetail id={decodeURIComponent(customerMatch[1])} />;
  else if (section === '/customers') page = <Customers />;
  else if (section === '/rooms') page = <Rooms />;
  else if (section === '/inbox') page = <Inbox />;
  else if (path === '/invoices/design') page = <InvoiceDesigner />;
  else if (section === '/invoices') page = <Invoices />;
  else if (section === '/meters') page = <Meters />;
  else if (section === '/reports') page = <Reports />;
  else if (section === '/qr') page = <QrCenter />;
  else if (section === '/telegram') page = <TelegramPage />;
  else if (section === '/settings') page = <SettingsPage />;
  else if (section === '/tasks') page = <Tasks />;
  else if (section === '/news') page = <News />;
  else if (section === '/feedback') page = <Feedback />;
  else if (section === '/super') page = <Super />;
  else page = <Home />;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="frame">
        <header className="topbar">
          <button className="brand" onClick={() => navigate('/')}>
            <span className="logo">ផ</span>
            <span className="brand-name">{state.settings.propertyName}</span>
          </button>
          <nav className={'mainnav ' + (menuOpen ? 'open' : '')} onClick={() => setMenuOpen(false)}>
            {nav.map(([p, label, Icon]) => (
              <button key={p} className={section === p ? 'active' : ''} onClick={() => navigate(p)}>
                <Icon size={16} /> <span>{label}</span>
                {!!badges[p] && <em className="count">{num(badges[p], state.settings.khmerNumerals)}</em>}
              </button>
            ))}
            <button className={'nav-extra ' + (section === '/tasks' ? 'active' : '')} onClick={() => navigate('/tasks')}><Wrench size={16} /> <span>ការងារ</span></button>
            <button className={'nav-extra ' + (section === '/settings' ? 'active' : '')} onClick={() => navigate('/settings')}><Settings size={16} /> <span>ការកំណត់</span></button>
            <button className={'nav-extra ' + (section === '/feedback' ? 'active' : '')} onClick={() => navigate('/feedback')}><Lightbulb size={16} /> <span>មតិ និងសំណើ</span></button>
          </nav>
          <div className="topbar-right">
            <GlobalSearch />
            <button className="icon-btn" onClick={ctx.openScanner} aria-label="ស្កេន QR" title="ស្កេន QR"><ScanLine size={18} /></button>
            <NewsButton path={path} />
            {state.account.super && <button className={'super-pill ' + (section === '/super' ? 'active' : '')} onClick={() => navigate('/super')} title="អ្នកគ្រប់គ្រងប្រព័ន្ធ"><Shield size={16} /> <span>Super</span></button>}
            <Notifications />
            <ProfileMenu onLogout={async () => { await api('POST', '/api/auth/logout'); onLogout(); }} />
            <button className="icon-btn burger" onClick={() => setMenuOpen((v) => !v)} aria-label="ម៉ឺនុយ">{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </header>
        <PwaBar />
        <div className="crumbs">{state.settings.propertyName} <ChevronRight size={13} /> <b>{current[1]}</b></div>
        <main key={section}>{page}</main>
      </div>
      {modal?.type === 'customer' && <CustomerForm tenant={modal.tenant} preset={modal.preset} onClose={() => setModal(null)} />}
      {modal?.type === 'meter' && <MeterModal roomId={modal.roomId} onClose={() => setModal(null)} />}
      {modal?.type === 'invoice' && <InvoiceModal id={modal.id} onClose={() => setModal(null)} />}
      {(modal?.type === 'scanner' || modal?.type === 'scan-result') && <ScannerModal initialText={modal.text} onClose={() => setModal(null)} />}
      {printing && <PrintPortal>{printing}</PrintPortal>}
      <Toast toast={toast} />
    </AppCtx.Provider>
  );
}

function GlobalSearch() {
  const { state, openInvoice } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const out = [];
    for (const t of state.tenants) if (matchesQuery([t.nameKm, t.nameEn, t.phone, t.roomId, t.idNumber], q)) out.push({ key: 't' + t.id, label: t.nameKm || t.nameEn, sub: `អតិថិជន · ${t.roomId || '—'} · ${t.phone || ''}`, go: () => navigate('/customers/' + t.id), photo: tenantPhoto(t) });
    for (const r of state.rooms) if (matchesQuery([r.id, r.building], q)) out.push({ key: 'r' + r.id, label: `បន្ទប់ ${r.id}`, sub: r.building, go: () => navigate('/rooms#' + r.id) });
    for (const i of state.invoices) if (matchesQuery([i.number, i.name, i.roomId], q)) out.push({ key: 'i' + i.id, label: i.number, sub: `${i.roomId} · ${i.name}`, go: () => openInvoice(i.id) });
    return out.slice(0, 8);
  }, [q, state, openInvoice]);
  return (
    <div className="gsearch">
      <Search size={16} />
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="ស្វែងរកអ្វីៗ" aria-label="ស្វែងរក" />
      <kbd>/</kbd>
      {open && q && (
        <div className="dropdown">
          {results.map((r) => (
            <button key={r.key} onMouseDown={() => { r.go(); setQ(''); }}>
              <Avatar name={r.label} src={r.photo} size={30} />
              <span><b>{r.label}</b><small>{r.sub}</small></span>
            </button>
          ))}
          {!results.length && <p className="muted pad">រកមិនឃើញ</p>}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const seenKey = 'py-seen-events';
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(seenKey) || ''; } catch { return ''; } });
  const unread = state.events.filter((e) => e.at > seen && e.kind !== 'admin').length;
  const toggle = () => {
    setOpen((v) => !v);
    const latest = state.events[0]?.at || '';
    setSeen(latest);
    try { localStorage.setItem(seenKey, latest); } catch { /* ignore */ }
  };
  return (
    <div className="pop-wrap">
      <button className="icon-btn" onClick={toggle} aria-label="ការជូនដំណឹង"><Bell size={18} />{unread > 0 && <i className="dot" />}</button>
      {open && (
        <div className="dropdown right events">
          <h4>សកម្មភាពថ្មីៗ</h4>
          {state.events.slice(0, 12).map((e) => (
            <div key={e.id} className="event-row"><i className={'ek ' + e.kind} /><span>{e.text}<small>{new Date(e.at).toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'medium', timeStyle: 'short' })}</small></span></div>
          ))}
          {!state.events.length && <p className="muted pad">មិនទាន់មានសកម្មភាព</p>}
        </div>
      )}
    </div>
  );
}

function NewsButton({ path }) {
  const unread = useNewsUnread(path);
  return (
    <button className="icon-btn" onClick={() => navigate('/news')} aria-label="មានអ្វីថ្មី" title="មានអ្វីថ្មី">
      <Sparkles size={18} />{unread > 0 && <em className="badge">{unread}</em>}
    </button>
  );
}

function ProfileMenu({ onLogout }) {
  const { state } = useApp();
  const pwa = usePwa();
  const [open, setOpen] = useState(false);
  return (
    <div className="pop-wrap">
      <button className="profile-btn" onClick={() => setOpen((v) => !v)} aria-label="គណនី">
        <span className="logo sm">{state.settings.propertyName.trim()[0] || 'ផ'}</span><ChevronDown size={15} />
      </button>
      {open && (
        <div className="dropdown right" onMouseLeave={() => setOpen(false)}>
          <p className="pad"><b>{greetingKm(state.today.hour)}!</b><br /><small className="muted">{state.account.email || (state.account.telegram ? `Telegram · ${state.account.telegram.name}` : '')} · {state.settings.propertyName}</small></p>
          <button onClick={() => { setOpen(false); navigate('/settings'); }}><Settings size={16} /> ការកំណត់</button>
          <button onClick={() => { setOpen(false); navigate('/news'); }}><Sparkles size={16} /> មានអ្វីថ្មី</button>
          <button onClick={() => { setOpen(false); navigate('/feedback?tab=new'); }}><Lightbulb size={16} /> ស្នើមុខងារ</button>
          <button onClick={() => { setOpen(false); navigate('/feedback?tab=new&kind=issue'); }}><Bug size={16} /> រាយការណ៍បញ្ហា</button>
          {pwa.canInstall && <button onClick={() => { setOpen(false); pwa.install(); }}><Download size={16} /> ដំឡើងកម្មវិធី</button>}
          <ThemeToggle withLabel className="menu-item" />
          {state.account.super && <button onClick={() => { setOpen(false); navigate('/super'); }}><Shield size={16} /> អ្នកគ្រប់គ្រងប្រព័ន្ធ</button>}
          <button onClick={onLogout}><LogOut size={16} /> ចាកចេញ</button>
        </div>
      )}
    </div>
  );
}

