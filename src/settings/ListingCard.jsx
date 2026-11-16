import React, { lazy, Suspense, useState } from 'react';
const MapPicker = lazy(() => import('../MapPicker.jsx'));
import { Store, Copy, Send, ExternalLink } from 'lucide-react';
import { useApp, QR } from '../ui.jsx';

/** Public page of vacant rooms — share on Facebook/Telegram; inquiries land in the Inbox. */
export default function ListingCard() {
  const { state, call, notify, base } = useApp();
  const L = state.settings.listing || {};
  const suggest = (state.settings.propertyNameEn || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  const [f, setF] = useState({ enabled: !!L.enabled, slug: L.slug || suggest, intro: L.intro || '', showPhone: L.showPhone !== false, onMap: L.onMap !== false });
  const url = `${base}/v/${L.slug}`;
  const vacant = state.rooms.filter((r) => !state.tenants.some((t) => t.status === 'active' && t.roomId === r.id)).length;
  return (
    <div className="card listing-card">
      <h3 className="sec-title"><Store size={17} /> ទំព័របន្ទប់ទំនេរ (សាធារណៈ)</h3>
      <p className="muted small">បង្ហាញបន្ទប់ទំនេរ ({vacant}) ជាមួយរូបភាព តម្លៃ និងបរិក្ខារ។ អ្នកចង់ជួលផ្ញើលេខទូរស័ព្ទ → មកដល់ «សារ» និង Telegram របស់អ្នក។ បន្ទប់ដែលមានអ្នកជួលនឹងបាត់ដោយស្វ័យប្រវត្តិ។</p>
      <label className="switch-row"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /><span><b>បើកទំព័រសាធារណៈ</b></span></label>
      {f.enabled && (
        <>
          <label className="field"><span>តំណ</span><div className="slug-row"><small>{base.replace(/^https?:\/\//, '')}/v/</small><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="sokha-rooms" /></div></label>
          <label className="field"><span>សេចក្តីណែនាំ (មិនចាំបាច់)</span><textarea rows={2} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} placeholder="ឧ. ជិតផ្សារ ជិតសាលា មានសន្តិសុខ ២៤ម៉ោង" /></label>
          <label className="switch-row small"><input type="checkbox" checked={f.showPhone} onChange={(e) => setF({ ...f, showPhone: e.target.checked })} /><span><b>បង្ហាញលេខទូរស័ព្ទ</b></span></label>
          <label className="switch-row small"><input type="checkbox" checked={f.onMap} onChange={(e) => setF({ ...f, onMap: e.target.checked })} /><span><b>បង្ហាញលើផែនទីបន្ទប់ជួលសាធារណៈ</b><small className="muted"> · <a href="/map" target="_blank" rel="noreferrer">មើលផែនទី</a></small></span></label>
          {f.onMap && !Number.isFinite(state.settings.location?.lat) && (
            // Without a pin the house cannot appear on the public map: set it right here, in one tap.
            <div className="pin-needed">
              <p className="form-warn">📍 ផ្ទះរបស់អ្នកមិនទាន់មានទីតាំងលើផែនទីទេ — អ្នករកបន្ទប់មិនទាន់ឃើញនៅលើ <a href="/map" target="_blank" rel="noreferrer">ផែនទី</a>។ ចុចលើផែនទីខាងក្រោម (ឬ 📍 ទីតាំងរបស់ខ្ញុំ) ដើម្បីដាក់ម្ជុល។</p>
              <Suspense fallback={<div className="spinner" />}>
                <MapPicker value={{}} height={260} onPick={(p) => call('PUT', '/api/settings', { location: { ...(state.settings.location || {}), lat: p.lat, lng: p.lng } }, '📍 បានដាក់ទីតាំង — ផ្ទះរបស់អ្នកនឹងបង្ហាញលើផែនទីសាធារណៈ')} />
              </Suspense>
            </div>
          )}
          {f.onMap && Number.isFinite(state.settings.location?.lat) && L.enabled && <p className="muted small">✅ បង្ហាញលើ <a href="/map" target="_blank" rel="noreferrer">ផែនទីសាធារណៈ</a> (បន្ទប់ទំនេរ {vacant})។ ប្តូរទីតាំងនៅ «ទីតាំងផ្ទះ»។</p>}
        </>
      )}
      <button className="btn primary" onClick={() => call('PUT', '/api/settings', { listing: f }, 'បានរក្សាទុក')}>រក្សាទុក</button>
      {L.enabled && L.slug && (
        <div className="listing-share">
          <QR value={url} size={110} label="Listing QR" />
          <div>
            <code>{url}</code>
            <div className="row-btns">
              <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(url).then(() => notify('បានចម្លង'))}><Copy size={14} /> ចម្លង</button>
              <a className="btn tg sm" href={`https://t.me/share/url?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer"><Send size={14} /> Telegram</a>
              <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> មើល</a>
            </div>
            <small className="muted">បន្ថែមរូបបន្ទប់នៅទំព័រ បន្ទប់ → កែប្រែ</small>
          </div>
        </div>
      )}
    </div>
  );
}
