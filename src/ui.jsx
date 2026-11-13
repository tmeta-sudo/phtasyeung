import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { X, Check, AlertTriangle } from 'lucide-react';
import { usd, num, normalizeText } from '../shared/khmer.js';

// ---------- router ----------
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); window.addEventListener('popstate', fn); return () => { listeners.delete(fn); window.removeEventListener('popstate', fn); }; };
export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  listeners.forEach((fn) => fn());
  window.scrollTo({ top: 0 });
}
export const usePath = () => useSyncExternalStore(subscribe, () => location.pathname);

// ---------- app context ----------
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/** Formatting helpers bound to the "Khmer numerals" preference. */
export function useFmt() {
  const app = useApp();
  const k = app?.state?.settings?.khmerNumerals ?? true;
  return useMemo(() => ({ k, n: (v) => num(v, k), $: (v) => usd(v, k) }), [k]);
}

// ---------- toast ----------
export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={'toast ' + (toast.error ? 'error' : '')} role="status">
      {toast.error ? <AlertTriangle size={17} /> : <Check size={17} />} {toast.text}
    </div>
  );
}

// ---------- modal ----------
export function Modal({ title, sub, onClose, wide, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); };
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + (wide ? 'wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="បិទ"><X size={19} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, wide, children, error }) {
  return (
    <label className={'field ' + (wide ? 'wide ' : '') + (error ? 'has-error' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

// ---------- QR ----------
export function QR({ value, size = 160, className = '', dark = '#0b1220', label }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    if (!value) { setSvg(''); return undefined; }
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark, light: '#ffffff' } })
      .then((s) => live && setSvg(s)).catch(() => live && setSvg(''));
    return () => { live = false; };
  }, [value, dark]);
  if (!value) return <div className={'qr qr-empty ' + className} style={{ width: size, height: size }}>QR</div>;
  return <div className={'qr ' + className} style={{ width: size, height: size }} role="img" aria-label={label || 'QR code'} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ---------- avatar ----------
const PALETTE = ['#dbe6ff', '#e5dcff', '#ffe1ec', '#dff5ea', '#fff0d6', '#dcf2fb'];
export function Avatar({ name = '', src, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const letter = (name.trim()[0] || '?').toUpperCase();
  const bg = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  if (src && !broken) return <img className="avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(true)} />;
  return <span className="avatar" style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}>{letter}</span>;
}

export const tenantPhoto = (t) => (t?.files?.photo ? `/api/tenants/${t.id}/files/photo?v=${t.files.photo.id}` : '');

// ---------- status ----------
export const STATUS = {
  paid: ['បានបង់', 'ok'],
  claimed: ['រង់ចាំបញ្ជាក់', 'warn'],
  unpaid: ['មិនទាន់បង់', 'muted'],
  overdue: ['ហួសកំណត់', 'danger'],
};
export const invStatus = (inv) => (inv.status !== 'paid' && inv.overdue ? 'overdue' : inv.status);
export function StatusPill({ inv }) {
  const [label, tone] = STATUS[invStatus(inv)] || STATUS.unpaid;
  return <span className={'pill ' + tone}><i />{label}</span>;
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <span className="empty-icon"><Icon size={22} /></span>}
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

// ---------- Cambodian address (pumi by Seanghay) ----------
let pumiCache = null;
export function usePumi() {
  const [data, setData] = useState(pumiCache);
  useEffect(() => {
    if (pumiCache) return;
    Promise.all([import('pumi/provinces'), import('pumi/districts'), import('pumi/communes')]).then(([p, d, c]) => {
      const pick = (m) => m.default || m;
      pumiCache = { provinces: pick(p), districts: pick(d), communes: pick(c), byId: new Map() };
      for (const list of [pumiCache.provinces, pumiCache.districts, pumiCache.communes]) for (const x of list) pumiCache.byId.set(x.id, x);
      setData(pumiCache);
    });
  }, []);
  return data;
}

let villageCache = null;
function useVillages(enabled) {
  const [v, setV] = useState(villageCache);
  useEffect(() => {
    if (!enabled || villageCache) return;
    import('pumi/villages').then((m) => { villageCache = m.default || m; setV(villageCache); });
  }, [enabled]);
  return v;
}

export function addressText(address, pumi) {
  if (!address) return '';
  const parts = [address.detail];
  if (pumi) {
    for (const id of [address.communeId, address.districtId, address.provinceId]) {
      const x = id && pumi.byId.get(id);
      if (x) parts.push(`${x.unit.km}${x.name.km}`);
    }
  }
  return parts.filter(Boolean).join(', ');
}

export function AddressPicker({ value = {}, onChange }) {
  const pumi = usePumi();
  const villages = useVillages(!!value.communeId);
  const set = (patch) => onChange({ ...value, ...patch });
  const districts = useMemo(() => pumi?.districts.filter((d) => d.parent === value.provinceId) || [], [pumi, value.provinceId]);
  const communes = useMemo(() => pumi?.communes.filter((c) => c.parent === value.districtId) || [], [pumi, value.districtId]);
  const vill = useMemo(() => villages?.filter((v) => v.parent === value.communeId) || [], [villages, value.communeId]);
  const opt = (x) => <option key={x.id} value={x.id}>{x.unit.km}{x.name.km} · {x.name.latin}</option>;
  return (
    <>
      <Field label="រាជធានី / ខេត្ត">
        <select value={value.provinceId || ''} onChange={(e) => set({ provinceId: e.target.value, districtId: '', communeId: '', villageId: '' })}>
          <option value="">— ជ្រើសរើស —</option>
          {pumi?.provinces.map(opt)}
        </select>
      </Field>
      <Field label="ខណ្ឌ / ស្រុក / ក្រុង">
        <select value={value.districtId || ''} disabled={!districts.length} onChange={(e) => set({ districtId: e.target.value, communeId: '', villageId: '' })}>
          <option value="">— ជ្រើសរើស —</option>
          {districts.map(opt)}
        </select>
      </Field>
      <Field label="សង្កាត់ / ឃុំ">
        <select value={value.communeId || ''} disabled={!communes.length} onChange={(e) => set({ communeId: e.target.value, villageId: '' })}>
          <option value="">— ជ្រើសរើស —</option>
          {communes.map(opt)}
        </select>
      </Field>
      <Field label="ភូមិ">
        <select value={value.villageId || ''} disabled={!vill.length} onChange={(e) => set({ villageId: e.target.value })}>
          <option value="">{value.communeId && !villages ? 'កំពុងផ្ទុក…' : '— ជ្រើសរើស —'}</option>
          {vill.map(opt)}
        </select>
      </Field>
      <Field label="ផ្ទះលេខ / ផ្លូវ" wide>
        <input value={value.detail || ''} onChange={(e) => set({ detail: e.target.value })} placeholder="ឧ. ផ្ទះលេខ ១២ ផ្លូវ ២៧១" />
      </Field>
    </>
  );
}

/** Village name lookup for display (loads lazily). */
export function useVillageName(id) {
  const villages = useVillages(!!id);
  return useMemo(() => {
    const v = id && villages?.find((x) => x.id === id);
    return v ? `${v.unit.km}${v.name.km}` : '';
  }, [id, villages]);
}

// ---------- print ----------
export function printNode(node) {
  const root = document.getElementById('print-root');
  return { root, node };
}

export function PrintPortal({ children }) {
  return createPortal(children, document.getElementById('print-root'));
}

export const searchKey = (...parts) => normalizeText(parts.filter(Boolean).join(' '));
