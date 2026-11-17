import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Home, ArrowRight, LocateFixed } from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../ui.jsx';
import { ROOM_FEATURES } from '../../shared/features.js';
import { num } from '../../shared/khmer.js';
import { addBaseLayer, savedLayer } from '../MapPicker.jsx';
import { PHNOM_PENH, priceOf, cheapestRoom, usdOf, drawPins } from '../listing/mapUtil.js';

const AREAS = ['ទួលគោក', 'សែនសុខ', 'ចំការមន', 'មានជ័យ', 'ដង្កោ', 'សៀមរាប'];
const PRICES = [60, 100, 150];

/** Landing-page map of vacant rooms: a live preview that leads into the full /map. Loaded only when scrolled to. */
export default function RoomsMap() {
  const box = useRef(); const map = useRef(); const layer = useRef();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    api('GET', '/api/map').then(setData).catch(() => setData({ places: [] }));
    // Scroll-wheel and one-finger drag stay with the page, so the map never traps someone scrolling past it.
    const touch = matchMedia('(pointer: coarse)').matches;
    const m = L.map(box.current, { zoomControl: !touch, scrollWheelZoom: false, dragging: !touch, tap: false, attributionControl: true }).setView(PHNOM_PENH, 12);
    addBaseLayer(m, savedLayer());
    layer.current = L.layerGroup().addTo(m);
    m.on('zoomend moveend', () => setView((v) => v + 1));
    m.on('click', () => setSel(null));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 60);
    return () => m.remove();
  }, []);

  const places = data?.places || [];
  useEffect(() => {
    const m = map.current;
    if (!m || !places.length) return;
    if (places.length === 1) m.setView([places[0].lat, places[0].lng], 15);
    else m.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng])).pad(0.2), { maxZoom: 15 });
  }, [places]);
  useEffect(() => {
    if (map.current && layer.current) drawPins(L, map.current, layer.current, places, { selected: sel?.slug, onSelect: setSel });
  }, [places, view, sel]);

  const rooms = places.reduce((a, p) => a + p.rooms.length, 0);
  const from = useMemo(() => {
    let best = null;
    for (const p of places) { const r = cheapestRoom(p); if (!best || usdOf(p, r) < usdOf(best.p, best.r)) best = { p, r }; }
    return best && priceOf(best.p, best.r);
  }, [places]);
  // Newest-looking cards first: places with a photo, then the most rooms.
  const cards = useMemo(() => [...places].sort((a, b) => (!!b.rooms.find((r) => r.photo) - !!a.rooms.find((r) => r.photo)) || b.rooms.length - a.rooms.length).slice(0, 8), [places]);

  const openMap = (params = {}) => {
    const u = new URLSearchParams(params);
    const m = map.current;
    if (!params.q && !params.near && m && places.length) { const c = m.getCenter(); u.set('c', `${c.lat.toFixed(4)},${c.lng.toFixed(4)},${m.getZoom()}`); }
    navigate('/map' + (u.toString() ? '?' + u : ''));
  };
  const search = (e) => { e.preventDefault(); openMap(q.trim() ? { q: q.trim() } : {}); };

  return (
    <div className="rm">
      <div className="rm-side">
        <div className="rm-stats">
          <div><b>{data ? num(rooms) : '…'}</b><span>បន្ទប់ទំនេរ</span></div>
          <div><b>{data ? num(places.length) : '…'}</b><span>ផ្ទះជួល</span></div>
          <div><b>{from || '—'}</b><span>ចាប់ពី / ខែ</span></div>
        </div>
        <form className="rm-search" onSubmit={search} role="search">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ចង់នៅតំបន់ណា? ឧ. ទួលគោក" aria-label="ស្វែងរកតំបន់" enterKeyHint="search" />
          <button className="lp-btn primary" type="submit">ស្វែងរក</button>
        </form>
        <div className="rm-chips">
          {AREAS.map((a) => <button key={a} onClick={() => openMap({ q: a })}><MapPin size={13} /> {a}</button>)}
        </div>
        <div className="rm-chips">
          {PRICES.map((v) => <button key={v} onClick={() => openMap({ max: v })}>≤ ${v}</button>)}
          <button onClick={() => openMap({ near: 1 })}><LocateFixed size={13} /> នៅជិតខ្ញុំ</button>
        </div>
        <button className="lp-btn primary lg rm-open" onClick={() => openMap()}>បើកផែនទីពេញ <ArrowRight size={18} /></button>
      </div>

      <div className="rm-map-wrap">
        <div ref={box} className="rm-map" aria-label="ផែនទីបន្ទប់ជួលទំនេរ" />
        {data && !places.length && (
          <div className="rm-empty">
            <b>មិនទាន់មានបន្ទប់នៅលើផែនទីទេ</b>
            <span>ជាម្ចាស់ផ្ទះ? ដាក់បន្ទប់ទំនេររបស់អ្នកឱ្យគេឃើញ — ឥតគិតថ្លៃ។</span>
            <button className="lp-btn primary" onClick={() => navigate('/signup')}>ដាក់បន្ទប់របស់ខ្ញុំ</button>
          </div>
        )}
        {sel && <PlaceMini p={sel} onClose={() => setSel(null)} />}
        <button className="rm-expand" onClick={() => openMap()}>⤢ ពេញអេក្រង់</button>
      </div>

      {cards.length > 0 && (
        <div className="rm-cards" role="list">
          {cards.map((p) => <PlaceMini key={p.slug} p={p} card onFocus={() => { setSel(p); map.current?.setView([p.lat, p.lng], 16); box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} />)}
        </div>
      )}
    </div>
  );
}

function PlaceMini({ p, card, onClose, onFocus }) {
  const photo = p.rooms.find((r) => r.photo);
  const feats = [...new Set(p.rooms.flatMap((r) => r.features))];
  return (
    <div className={card ? 'rm-card' : 'rm-pop'} role={card ? 'listitem' : 'dialog'}>
      {onClose && <button className="rm-x" onClick={onClose} aria-label="បិទ">×</button>}
      <div className="rm-photo" onClick={onFocus}>
        {photo ? <img src={`/api/listing/${p.slug}/photo/${encodeURIComponent(photo.id)}/${photo.photo}`} alt="" loading="lazy" /> : <Home size={26} />}
        <span className="rm-price">{priceOf(p, cheapestRoom(p))}<small>/ខែ</small></span>
      </div>
      <div className="rm-info">
        <b>{p.name || 'ផ្ទះជួល'}</b>
        <small>{p.rooms.length} បន្ទប់ទំនេរ{p.address ? ` · ${p.address}` : ''}</small>
        {feats.length > 0 && <span className="rm-feats">{ROOM_FEATURES.filter((f) => feats.includes(f.id)).slice(0, 5).map((f) => <i key={f.id} title={f.km}>{f.icon}</i>)}</span>}
        <span className="rm-actions">
          <a className="lp-btn primary" href={`/v/${p.slug}`}>មើលបន្ទប់</a>
          {card && <button className="lp-btn ghost" onClick={onFocus}><MapPin size={15} /> ផែនទី</button>}
        </span>
      </div>
    </div>
  );
}
