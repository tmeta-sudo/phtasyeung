import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Home as HomeIcon, UsersRound, DoorOpen, ReceiptText, Gauge, QrCode, Send, Settings, Wrench, Search, Bell, ScanLine,
  LogOut, ChevronRight, ChevronDown, Menu, X,
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

const NAV = [
  ['/', 'ទំព័រដើម', HomeIcon],
  ['/customers', 'អតិថិជន', UsersRound],
  ['/rooms', 'បន្ទប់', DoorOpen],
  ['/invoices', 'វិក្កយបត្រ', ReceiptText],
  ['/meters', 'កុងទ័រ', Gauge],
  ['/qr', 'QR', QrCode],
  ['/telegram', 'Telegram', Send],
];

export default function App() {
  const [auth, setAuth] = useState(null);
  const refreshAuth = useCallback(() => api('GET', '/api/auth/state').then(setAuth).catch(() => setAuth({ error: true })), []);
  useEffect(() => { refreshAuth(); }, [refreshAuth]);
  if (!auth) return <div className="boot"><span className="spinner" /></div>;
  if (!auth.authed) return <Login setup={auth.setupRequired} onDone={refreshAuth} />;
  return <Admin onLogout={refreshAuth} />;
}

function Login({ setup, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (setup && pw !== pw2) return setError('ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា');
    setBusy(true);
    try {
      await api('POST', setup ? '/api/auth/setup' : '/api/auth/login', { password: pw });
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="login">
      <div className="login-photo"><div className="login-caption"><b>ផ្ទះយើង</b><span>ជួល បង់ប្រាក់ និងគ្រប់គ្រងអតិថិជន ក្នុងកន្លែងតែមួយ</span></div></div>
      <form className="login-card" onSubmit={submit}>
        <span className="logo lg">ផ</span>
        <h1>{setup ? 'បង្កើតពាក្យសម្ងាត់ម្ចាស់ផ្ទះ' : 'ចូលគណនីម្ចាស់ផ្ទះ'}</h1>
        <p>{setup ? 'ជាលើកដំបូង សូមកំណត់ពាក្យសម្ងាត់ (យ៉ាងហោចណាស់ ៨ តួ)។' : 'សូមបញ្ចូលពាក្យសម្ងាត់របស់អ្នក។'}</p>
        <input type="password" autoFocus autoComplete={setup ? 'new-password' : 'current-password'} placeholder="ពាក្យសម្ងាត់" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={setup ? 8 : 1} />
        {setup && <input type="password" autoComplete="new-password" placeholder="បញ្ជាក់ពាក្យសម្ងាត់" value={pw2} onChange={(e) => setPw2(e.target.value)} required />}
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary block" disabled={busy}>{setup ? 'បង្កើត និងចូល' : 'ចូល'}</button>
      </form>
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

  const notify = useCallback((text, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 5000 : 3000);
  }, []);

  const load = useCallback(() => api('GET', '/api/state').then(setState).catch((e) => (e.status === 401 ? onLogout() : notify(e.message, true))), [notify, onLogout]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  /** Call an endpoint that returns the full admin state. Returns the response or null. */
  const call = useCallback(async (method, url, body, success) => {
    try {
      const res = await api(method, url, body);
      if (res.tenants) setState(res);
      if (success) notify(typeof success === 'function' ? success(res) : success);
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
  const badges = { '/invoices': claimed, '/customers': missingId };
  const section = '/' + (path.split('/')[1] || '');
  const current = NAV.find(([p]) => p === section) || (section === '/settings' ? ['/settings', 'ការកំណត់'] : section === '/tasks' ? ['/tasks', 'ការងារ'] : NAV[0]);

  let page;
  const customerMatch = path.match(/^\/customers\/(.+)$/);
  if (customerMatch) page = <CustomerDetail id={decodeURIComponent(customerMatch[1])} />;
  else if (section === '/customers') page = <Customers />;
  else if (section === '/rooms') page = <Rooms />;
  else if (section === '/invoices') page = <Invoices />;
  else if (section === '/meters') page = <Meters />;
  else if (section === '/qr') page = <QrCenter />;
  else if (section === '/telegram') page = <TelegramPage />;
  else if (section === '/settings') page = <SettingsPage />;
  else if (section === '/tasks') page = <Tasks />;
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
            {NAV.map(([p, label, Icon]) => (
              <button key={p} className={section === p ? 'active' : ''} onClick={() => navigate(p)}>
                <Icon size={16} /> <span>{label}</span>
                {!!badges[p] && <em className="count">{num(badges[p], state.settings.khmerNumerals)}</em>}
              </button>
            ))}
            <button className={'nav-extra ' + (section === '/tasks' ? 'active' : '')} onClick={() => navigate('/tasks')}><Wrench size={16} /> <span>ការងារ</span></button>
            <button className={'nav-extra ' + (section === '/settings' ? 'active' : '')} onClick={() => navigate('/settings')}><Settings size={16} /> <span>ការកំណត់</span></button>
          </nav>
          <div className="topbar-right">
            <GlobalSearch />
            <button className="icon-btn" onClick={ctx.openScanner} aria-label="ស្កេន QR" title="ស្កេន QR"><ScanLine size={18} /></button>
            <Notifications />
            <ProfileMenu onLogout={async () => { await api('POST', '/api/auth/logout'); onLogout(); }} />
            <button className="icon-btn burger" onClick={() => setMenuOpen((v) => !v)} aria-label="ម៉ឺនុយ">{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </header>
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

function ProfileMenu({ onLogout }) {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="pop-wrap">
      <button className="profile-btn" onClick={() => setOpen((v) => !v)} aria-label="គណនី">
        <span className="logo sm">{state.settings.propertyName.trim()[0] || 'ផ'}</span><ChevronDown size={15} />
      </button>
      {open && (
        <div className="dropdown right" onMouseLeave={() => setOpen(false)}>
          <p className="pad"><b>{greetingKm(state.today.hour)}!</b><br /><small className="muted">ម្ចាស់ផ្ទះ · {state.settings.propertyName}</small></p>
          <button onClick={() => { setOpen(false); navigate('/settings'); }}><Settings size={16} /> ការកំណត់</button>
          <button onClick={onLogout}><LogOut size={16} /> ចាកចេញ</button>
        </div>
      )}
    </div>
  );
}

