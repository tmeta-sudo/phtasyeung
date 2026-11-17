// Shared by the public map page and the map on the landing page.
import { fmtMoney } from '../../shared/khmer.js';
import './pins.css';

export const PHNOM_PENH = [11.5564, 104.9282];

export const priceOf = (p, r) => fmtMoney(r.rent, p.currency, false).replace('.00', '');
/** A room's rent in US$, so riel and dollar landlords compare on one scale. */
export const usdOf = (p, r) => r.rent * p.usdRate;
// Pins stay short: riel is said the Khmer way, in ម៉ឺន (10,000 ៛), e.g. 30ម៉ឺន៛.
export const pinPrice = (p, r) => (p.currency === 'KHR' && r.rent >= 10000 ? `${+(r.rent / 10000).toFixed(1)}ម៉ឺន៛` : priceOf(p, r));
export const cheapestRoom = (p) => p.rooms.reduce((a, r) => (usdOf(p, r) < usdOf(p, a) ? r : a), p.rooms[0]);

/** Group pins that would overlap on screen at this zoom (simple grid clustering, no extra library). */
export function cluster(map, places) {
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

/** Price pins and numbered cluster bubbles on a Leaflet layer. */
export function drawPins(L, map, layer, places, { selected, onSelect } = {}) {
  layer.clearLayers();
  for (const g of cluster(map, places)) {
    if (g.items.length > 1) {
      const n = g.items.reduce((a, p) => a + p.rooms.length, 0);
      L.marker([g.lat, g.lng], { icon: L.divIcon({ className: 'mp-cluster', html: `<span>${n}</span>`, iconSize: [46, 46], iconAnchor: [23, 23] }) })
        .on('click', () => map.fitBounds(L.latLngBounds(g.items.map((p) => [p.lat, p.lng])).pad(0.3), { maxZoom: 17 }))
        .addTo(layer);
    } else {
      const p = g.items[0];
      const on = selected === p.slug;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'mp-price' + (on ? ' on' : ''), html: `<span>${pinPrice(p, cheapestRoom(p))}${p.rooms.length > 1 ? `<small>+${p.rooms.length - 1}</small>` : ''}</span>`, iconSize: null, iconAnchor: [0, 0] }), zIndexOffset: on ? 1000 : 0 })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); onSelect?.(p); })
        .addTo(layer);
    }
  }
}

/** Find a place in Cambodia by name (Khmer or Latin), using OpenStreetMap's Nominatim. */
export async function findPlace(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kh&limit=1&accept-language=km,en&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('search');
  return (await r.json())[0] || null;
}
