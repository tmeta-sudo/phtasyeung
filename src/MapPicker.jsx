import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Layers } from 'lucide-react';

// Base maps. Google tiles are offered because many Cambodian users know them best;
// OpenStreetMap is the default (free, community-licensed).
export const LAYERS = {
  osm: { label: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', sub: 'abc', attr: '© OpenStreetMap' },
  google: { label: 'Google', url: 'https://mt{s}.google.com/vt/lyrs=m&hl=km&x={x}&y={y}&z={z}', sub: '0123', attr: '© Google' },
  satellite: { label: 'ផ្កាយរណប', url: 'https://mt{s}.google.com/vt/lyrs=y&hl=km&x={x}&y={y}&z={z}', sub: '0123', attr: '© Google' },
};

const PIN = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [34, 44], iconAnchor: [17, 42] });
const PHNOM_PENH = [11.5564, 104.9282];

/** Interactive map. `value` = { lat, lng } or empty; onPick({ lat, lng }) on click / drag / GPS. */
export default function MapPicker({ value, onPick, height = 340, readOnly = false }) {
  const box = useRef();
  const map = useRef();
  const marker = useRef();
  const tiles = useRef();
  const [layer, setLayer] = useState(() => { try { return localStorage.getItem('py-map-layer') || 'osm'; } catch { return 'osm'; } });
  const [locating, setLocating] = useState(false);
  const has = Number.isFinite(value?.lat) && Number.isFinite(value?.lng);

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(has ? [value.lat, value.lng] : PHNOM_PENH, has ? 17 : 12);
    map.current = m;
    if (!readOnly) m.on('click', (e) => onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    setTimeout(() => m.invalidateSize(), 50);
    return () => m.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const def = LAYERS[layer] || LAYERS.osm;
    tiles.current?.remove();
    tiles.current = L.tileLayer(def.url, { subdomains: def.sub, maxZoom: 20, attribution: def.attr }).addTo(map.current);
    try { localStorage.setItem('py-map-layer', layer); } catch { /* ignore */ }
  }, [layer]);

  useEffect(() => {
    if (!has) { marker.current?.remove(); marker.current = null; return; }
    const ll = [value.lat, value.lng];
    if (!marker.current) {
      marker.current = L.marker(ll, { icon: PIN, draggable: !readOnly }).addTo(map.current);
      marker.current.on('dragend', () => { const p = marker.current.getLatLng(); onPick?.({ lat: p.lat, lng: p.lng }); });
    } else marker.current.setLatLng(ll);
    if (!map.current.getBounds().pad(-0.2).contains(ll)) map.current.setView(ll, Math.max(map.current.getZoom(), 16));
  }, [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); map.current.setView([p.coords.latitude, p.coords.longitude], 18); onPick?.({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={box} className="map-box" />
      <div className="map-tools">
        <label className="map-layer"><Layers size={15} />
          <select value={layer} onChange={(e) => setLayer(e.target.value)} aria-label="ប្រភេទផែនទី">
            {Object.entries(LAYERS).map(([k, l]) => <option key={k} value={k}>{l.label}</option>)}
          </select>
        </label>
        {!readOnly && <button type="button" className="map-btn" onClick={locate} disabled={locating} title="ទីតាំងរបស់ខ្ញុំ"><LocateFixed size={17} /></button>}
      </div>
      {!readOnly && !has && <div className="map-hint">ចុចលើផែនទី ដើម្បីដាក់ទីតាំងផ្ទះ</div>}
    </div>
  );
}

// ---------- reverse geocoding → Cambodian address (pumi ids) ----------

const clean = (s) => String(s || '').toLowerCase()
  .replace(/\b(khan|sangkat|srok|khum|phum|krong|khaet|province|municipality|district|commune|village|city|capital)\b/g, '')
  .replace(/(រាជធានី|ខេត្ត|ខណ្ឌ|ស្រុក|ក្រុង|សង្កាត់|ឃុំ|ភូមិ)/g, '')
  .replace(/[^\p{L}\p{M}\p{N}]/gu, '');

function similar(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length; const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}

/** Best pumi match among `names` (any address field), optionally inside `parent`. */
export function findIn(list, names, parent) {
  const wanted = [...new Set(names.map(clean).filter((w) => w.length > 1))];
  const pool = parent ? list.filter((x) => x.parent === parent) : list;
  let best = null; let score = 0;
  for (const x of pool) {
    const keys = [clean(x.name.latin), clean(x.name.km)];
    for (const w of wanted) for (const k of keys) {
      const sc = similar(w, k);
      if (sc > score) { score = sc; best = x; }
    }
  }
  return score >= 0.78 ? best : null;
}

export function matchPumi(addressKm = {}, addressEn = {}, pumi) {
  const all = [...Object.values(addressKm), ...Object.values(addressEn)].filter((v) => typeof v === 'string');
  const iso = String(addressKm['ISO3166-2-lvl4'] || addressEn['ISO3166-2-lvl4'] || '').match(/^KH-(\d+)$/);
  const prov = (iso && pumi.provinces.find((p) => +p.id === +iso[1])) || findIn(pumi.provinces, all);
  let dist = prov && findIn(pumi.districts, all, prov.id);
  let comm = dist && findIn(pumi.communes, all, dist.id);
  if (prov && !comm) {
    // District boundaries change (e.g. Boeng Keng Kang, 2019): search communes across the province.
    const inProv = new Set(pumi.districts.filter((d) => d.parent === prov.id).map((d) => d.id));
    comm = findIn(pumi.communes.filter((c) => inProv.has(c.parent)), all);
    if (comm) dist = pumi.districts.find((d) => d.id === comm.parent);
  }
  return { provinceId: prov?.id || '', districtId: dist?.id || '', communeId: comm?.id || '' };
}

/** Ask OpenStreetMap (Nominatim) what is at this point, then match it to pumi ids. */
export async function reverseGeocode({ lat, lng }, pumi) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=km,en&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('geocode');
  const j = await res.json();
  const a = j.address || {};
  const en = await fetch(url.replace('accept-language=km,en', 'accept-language=en')).then((r) => r.json()).then((x) => x.address || {}).catch(() => ({}));
  const out = { houseNo: a.house_number || '', street: a.road || en.road || '', provinceId: '', districtId: '', communeId: '', display: j.display_name || '' };
  if (pumi) Object.assign(out, matchPumi(a, en, pumi));
  return out;
}
