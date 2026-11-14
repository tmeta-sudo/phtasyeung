import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, SlidersHorizontal, List, Map as MapIcon, X, Home, Search, Share2 } from 'lucide-react';
import { api } from '../api.js';
import { ROOM_FEATURES } from '../../shared/features.js';
import { fmtMoney } from '../../shared/khmer.js';
import './listing.css';

const PHNOM_PENH = [11.5564, 104.9282];
const QUICK = ['ac', 'hotwater', 'bathroom', 'wifi', 'bed', 'fridge'];
const PRICES = [[0, 'គ្រប់តម្លៃ'], [60, '≤ $60'], [100, '≤ $100'], [150, '≤ $150'], [250, '≤ $250']];

const priceOf = (p, r) => fmtMoney(r.rent, p.currency, false).replace('.00', '');
const usd = (p, r) => r.rent * p.usdRate;
// Pins stay short: riel is said the Khmer way, in ម៉ឺន (10,000 ៛), e.g. 30ម៉ឺន៛.
const pinPrice = (p, r) => (p.currency === 'KHR' && r.rent >= 10000 ? `${+(r.rent / 10000).toFixed(1)}ម៉ឺន៛` : priceOf(p, r));

// Filters and the map position live in the address (?max=100&f=ac,wifi&c=11.55,104.92,15),
// so a search can be shared on Facebook or Telegram and opens exactly the same view.
function readUrl() {
  const u = new URLSearchParams(location.search);
  const c = (u.get('c') || '').split(',').map(Number);
  return {
    max: PRICES.some(([v]) => v === +u.get('max')) ? +u.get('max') : 0,
    feats: (u.get('f') || '').split(',').filter((id) => QUICK.includes(id)),
    center: c.length === 3 && c.every(Number.isFinite) ? c : null,
  };
}
const START = readUrl();

/** Find a place in Cambodia by name (Khmer or Latin), using OpenStreetMap's Nominatim. */
async function findPlace(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kh&limit=1&accept-language=km,en&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('search');
  return (await r.json())[0] || null;
}

/** Group pins that would overlap on screen at this zoom (simple grid clustering, no extra library). */
function cluster(map, places) {
  const cell = 56; const groups = new Map();
  for (const p of places) {
    const pt = map.project([p.lat, p.lng], map.getZoom());
    const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;
    const g = groups.get(key) || { items: [], lat: 0, lng: 0 };
    g.items.push(p); g.lat += p.lat; g.lng += p.lng;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, lat: g.lat / g.items.length, lng: g.lng / g.items.length }));
}

/** Public map: every vacant room from landlords who publish them. Tap a pin → their rooms page. */
export default function MapPage() {
  const box = useRef(); const map = useRef(); const layer = useRef();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [maxUsd, setMaxUsd] = useState(START.max);
  const [feats, setFeats] = useState(START.feats);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [shared, setShared] = useState('');
  const [sel, setSel] = useState(null);
  const [view, setView] = useState(0); // bumps when the map moves
  const [listOpen, setListOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    document.title = 'ផែនទីបន្ទប់ជួលទំនេរ · ផ្ទះយើង';
    api('GET', '/api/map').then(setData).catch((e) => setError(e.message));
    const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView(START.center ? START.center.slice(0, 2) : PHNOM_PENH, START.center ? START.center[2] : 12);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('moveend zoomend', () => setView((v) => v + 1));
    m.on('click', () => setSel(null));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 60);
    return () => m.remove();
  }, []);

  // Places that still have a room matching the filters (only those rooms are kept).
  const places = useMemo(() => (data?.places || []).map((p) => ({
    ...p,
    rooms: p.rooms.filter((r) => (!maxUsd || usd(p, r) <= maxUsd) && feats.every((f) => r.features.includes(f))),
  })).filter((p) => p.rooms.length), [data, maxUsd, feats]);

  // Fit the map to the results the first time they arrive.
  const fitted = useRef(!!START.center); // a shared link keeps its own view
  useEffect(() => {
    if (fitted.current || !places.length || !map.current) return;
    fitted.current = true;
    if (places.length === 1) map.current.setView([places[0].lat, places[0].lng], 15);
    else map.current.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng])).pad(0.15), { maxZoom: 15 });
  }, [places]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    layer.current.clearLayers();
    for (const g of cluster(m, places)) {
      if (g.items.length > 1) {
        const n = g.items.reduce((a, p) => a + p.rooms.length, 0);
        L.marker([g.lat, g.lng], { icon: L.divIcon({ className: 'mp-cluster', html: `<span>${n}</span>`, iconSize: [46, 46], iconAnchor: [23, 23] }) })
          .on('click', () => m.fitBounds(L.latLngBounds(g.items.map((p) => [p.lat, p.lng])).pad(0.3), { maxZoom: 17 }))
          .addTo(layer.current);
      } else {
        const p = g.items[0];
        const cheapest = p.rooms.reduce((a, r) => (usd(p, r) < usd(p, a) ? r : a), p.rooms[0]);
        const on = sel?.slug === p.slug;
        L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'mp-price' + (on ? ' on' : ''), html: `<span>${pinPrice(p, cheapest)}${p.rooms.length > 1 ? `<small>+${p.rooms.length - 1}</small>` : ''}</span>`, iconSize: null, iconAnchor: [0, 0] }), zIndexOffset: on ? 1000 : 0 })
          .on('click', (e) => { L.DomEvent.stopPropagation(e); setSel(p); })
          .addTo(layer.current);
      }
    }
  }, [places, view, sel]);

  const visible = useMemo(() => {
    const m = map.current; if (!m) return places;
    const b = m.getBounds();
    return places.filter((p) => b.contains([p.lat, p.lng]));
  }, [places, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const roomsVisible = visible.reduce((a, p) => a + p.rooms.length, 0);

  // Keep the address in step with what is on screen.
  useEffect(() => {
    const m = map.current; if (!m) return;
    const c = m.getCenter();
    const u = new URLSearchParams();
    if (maxUsd) u.set('max', maxUsd);
    if (feats.length) u.set('f', feats.join(','));
    if (fitted.current) u.set('c', `${c.lat.toFixed(4)},${c.lng.toFixed(4)},${m.getZoom()}`);
    history.replaceState(null, '', '/map' + (u.toString() ? '?' + u : ''));
  }, [maxUsd, feats, view]);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true); setError('');
    try {
      const hit = await findPlace(q.trim());
      if (!hit) { setShared('រកមិនឃើញកន្លែងនេះ — សាកល្បងឈ្មោះសង្កាត់ ឬខណ្ឌ'); return; }
      fitted.current = true;
      const b = hit.boundingbox?.map(Number);
      if (b?.length === 4) map.current.fitBounds([[b[0], b[2]], [b[1], b[3]]], { maxZoom: 16 });
      else map.current.setView([+hit.lat, +hit.lon], 15);
      setSel(null);
    } catch { setShared('មិនអាចស្វែងរកបានពេលនេះ'); } finally { setSearching(false); }
  }
  async function share() {
    const url = location.href;
    const text = 'បន្ទប់ជួលទំនេរនៅលើផែនទី · ផ្ទះយើង';
    if (navigator.share) { try { await navigator.share({ title: text, url }); return; } catch (err) { if (err.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); setShared('បានចម្លងតំណ ✅'); } catch { setShared(url); }
  }
  useEffect(() => { if (!shared) return undefined; const t = setTimeout(() => setShared(''), 2600); return () => clearTimeout(t); }, [shared]);

  function nearMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => { map.current.setView([pos.coords.latitude, pos.coords.longitude], 15); setLocating(false); }, () => setLocating(false), { enableHighAccuracy: true, timeout: 10000 });
  }
  const toggle = (f) => setFeats((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]));

  return (
    <div className="mpg">
      <header className="mpg-top">
        <a href="/" className="mpg-brand" aria-label="ផ្ទះយើង"><img src="/icons/icon-192.png" alt="" width="34" height="34" /><span><b>បន្ទប់ជួលទំនេរ</b><small>{data ? `${roomsVisible} បន្ទប់នៅលើផែនទីនេះ` : 'កំពុងផ្ទុក…'}</small></span></a>
        <form className="mpg-search" onSubmit={search} role="search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ស្វែងរកតំបន់ ឧ. ទួលគោក, សែនសុខ" aria-label="ស្វែងរកតំបន់" enterKeyHint="search" />
          {searching ? <span className="spinner sm" /> : <button type="button" className="mpg-share" onClick={share} aria-label="ចែករំលែក"><Share2 size={16} /></button>}
        </form>
        <div className="mpg-filters">
          <span className="mpg-chip-ico"><SlidersHorizontal size={15} /></span>
          {PRICES.map(([v, label]) => <button key={v} className={'mpg-chip ' + (maxUsd === v ? 'on' : '')} onClick={() => setMaxUsd(v)}>{label}</button>)}
          {QUICK.map((id) => { const f = ROOM_FEATURES.find((x) => x.id === id); return <button key={id} className={'mpg-chip ' + (feats.includes(id) ? 'on' : '')} onClick={() => toggle(id)}>{f.icon} {f.km}</button>; })}
        </div>
      </header>
      <div ref={box} className="mpg-map" />
      <button className="mpg-fab locate" onClick={nearMe} aria-label="នៅជិតខ្ញុំ"><LocateFixed size={20} className={locating ? 'spin' : ''} /> នៅជិតខ្ញុំ</button>
      <button className="mpg-fab list" onClick={() => setListOpen((v) => !v)}>{listOpen ? <><MapIcon size={18} /> ផែនទី</> : <><List size={18} /> បញ្ជី ({visible.length})</>}</button>
      {error && <div className="mpg-msg">{error}</div>}
      {shared && <div className="mpg-toast">{shared}</div>}
      {data && !places.length && <div className="mpg-msg">{data.places.length ? 'គ្មានបន្ទប់ត្រូវនឹងតម្រង — សូមដកតម្រងខ្លះ' : 'មិនទាន់មានបន្ទប់ទំនេរនៅលើផែនទីទេ'}</div>}

      {sel && !listOpen && (
        <div className="mpg-card">
          <button className="mpg-x" onClick={() => setSel(null)} aria-label="បិទ"><X size={16} /></button>
          <PlaceCard p={sel} />
        </div>
      )}
      {listOpen && (
        <div className="mpg-list">
          {visible.length ? visible.map((p) => <div key={p.slug} className="mpg-item"><PlaceCard p={p} onFocus={() => { setListOpen(false); setSel(p); map.current.setView([p.lat, p.lng], Math.max(map.current.getZoom(), 16)); }} /></div>)
            : <p className="mpg-empty">រំកិល ឬពង្រីកផែនទី ដើម្បីមើលបន្ទប់</p>}
        </div>
      )}
    </div>
  );
}

function PlaceCard({ p, onFocus }) {
  const photo = p.rooms.find((r) => r.photo);
  const feats = [...new Set(p.rooms.flatMap((r) => r.features))];
  const prices = p.rooms.map((r) => r.rent);
  const range = Math.min(...prices) === Math.max(...prices) ? priceOf(p, p.rooms[0]) : `${fmtMoney(Math.min(...prices), p.currency).replace('.00', '')} – ${fmtMoney(Math.max(...prices), p.currency).replace('.00', '')}`;
  return (
    <div className="mpg-place">
      <div className="mpg-photo" onClick={onFocus}>{photo ? <img src={`/api/listing/${p.slug}/photo/${encodeURIComponent(photo.id)}/${photo.photo}`} alt="" loading="lazy" /> : <Home size={28} />}</div>
      <div className="mpg-info">
        <b onClick={onFocus}>{p.name}</b>
        <span className="mpg-price-line">{range}<small>/ខែ</small> · {p.rooms.length} បន្ទប់ទំនេរ</span>
        {p.address && <small className="mpg-addr">{p.address}</small>}
        {feats.length > 0 && <span className="mpg-feats">{ROOM_FEATURES.filter((f) => feats.includes(f.id)).slice(0, 6).map((f) => <i key={f.id} title={f.km}>{f.icon}</i>)}</span>}
        <span className="mpg-actions">
          <a className="ls-btn primary" href={`/v/${p.slug}`}>មើលបន្ទប់</a>
          <a className="ls-btn light" href={`https://maps.google.com/?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">ផ្លូវទៅ</a>
        </span>
      </div>
    </div>
  );
}
