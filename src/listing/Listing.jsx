import React, { useEffect, useState } from 'react';
import { MapPin, Phone, Send, Share2, X, Check, Home } from 'lucide-react';
import { api } from '../api.js';
import { ROOM_FEATURES } from '../../shared/features.js';
import { num } from '../../shared/khmer.js';
import './listing.css';

/** Public page of vacant rooms: photos, price, features, map — and a 30-second inquiry form. */
export default function Listing({ slug }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(null); // room or {} for general
  const [sent, setSent] = useState(false);
  useEffect(() => { api('GET', `/api/listing/${slug}`).then((x) => { setD(x); document.title = `${x.property.name} · បន្ទប់ជួល`; }).catch((e) => setError(e.message)); }, [slug]);
  if (error) return <div className="ls-shell"><div className="ls-empty"><Home size={40} /><b>{error}</b></div></div>;
  if (!d) return <div className="ls-shell"><div className="ls-empty"><span className="spinner" /></div></div>;
  const k = d.property.khmerNumerals;
  const money = (v) => `$${num(Number(v).toFixed(0), k)}`;
  const url = location.href.split('#')[0];
  const shareText = `${d.property.name} — បន្ទប់ទំនេរ ${d.rooms.length} · ចាប់ពី ${d.rooms.length ? money(Math.min(...d.rooms.map((r) => r.rent))) : ''}/ខែ`;
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: d.property.name, text: shareText, url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(url);
    alert('បានចម្លងតំណ');
  }
  const photo = (r, id) => `/api/listing/${slug}/photo/${encodeURIComponent(r.id)}/${id}`;
  return (
    <div className="ls-shell">
      <header className="ls-hero" style={d.property.coverUrl ? { backgroundImage: `linear-gradient(180deg, rgba(10,20,40,.15), rgba(10,20,40,.75)), url(${d.property.coverUrl})` } : undefined}>
        <div className="ls-hero-in">
          <span className="ls-badge">🏠 បន្ទប់ទំនេរ {num(d.rooms.length, k)}</span>
          <h1>{d.property.name}</h1>
          {d.property.address && <p><MapPin size={15} /> {d.property.address}</p>}
          <div className="ls-actions">
            {d.property.phone && <a className="ls-btn light" href={`tel:${d.property.phone.replace(/\s/g, '')}`}><Phone size={16} /> {d.property.phone}</a>}
            {Number.isFinite(d.property.lat) && <a className="ls-btn light" href={`https://maps.google.com/?q=${d.property.lat},${d.property.lng}`} target="_blank" rel="noreferrer"><MapPin size={16} /> ផែនទី</a>}
            <button className="ls-btn light" onClick={share}><Share2 size={16} /> ចែករំលែក</button>
          </div>
        </div>
      </header>
      {d.intro && <p className="ls-intro">{d.intro}</p>}
      <main className="ls-rooms">
        {d.rooms.map((r) => (
          <article key={r.id} className="ls-room">
            <div className="ls-photos">
              {r.photos.length ? r.photos.map((id) => <img key={id} src={photo(r, id)} alt={`បន្ទប់ ${r.id}`} loading="lazy" />) : <div className="ls-nophoto"><Home size={36} /></div>}
            </div>
            <div className="ls-body">
              <div className="ls-top"><b>បន្ទប់ {r.id}</b><span className="ls-price">{money(r.rent)}<small>/ខែ</small></span></div>
              {(r.building || r.floor) && <small className="ls-muted">{[r.building, r.floor && `ជាន់ ${r.floor}`].filter(Boolean).join(' · ')}</small>}
              {r.features.length > 0 && <div className="ls-feats">{ROOM_FEATURES.filter((f) => r.features.includes(f.id)).map((f) => <span key={f.id}>{f.icon} {f.km}</span>)}</div>}
              {r.note && <p className="ls-note">{r.note}</p>}
              <button className="ls-btn primary" onClick={() => { setAsk(r); setSent(false); }}>សួរព័ត៌មាន / កក់បន្ទប់</button>
            </div>
          </article>
        ))}
        {!d.rooms.length && <div className="ls-empty"><b>ពេលនេះមិនមានបន្ទប់ទំនេរទេ</b><button className="ls-btn primary" onClick={() => { setAsk({}); setSent(false); }}>ទុកលេខទូរស័ព្ទ — យើងនឹងទាក់ទងពេលទំនេរ</button></div>}
      </main>
      {(d.addons.length > 0 || d.deposit.months) && (
        <section className="ls-info">
          {d.deposit.months > 0 && <p>💵 ប្រាក់កក់ {num(d.deposit.months, k)} ខែ{d.deposit.prepaid ? ` + បង់មុន ${num(d.deposit.prepaid, k)} ខែ` : ''}</p>}
          {d.addons.length > 0 && <div className="ls-feats">{d.addons.map((a) => <span key={a.label}>{a.icon} {a.label} {money(a.price)}</span>)}</div>}
        </section>
      )}
      <footer className="ls-foot">
        <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><Send size={14} /> Telegram</a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">Facebook</a>
        <span>ដំណើរការដោយ <b>ផ្ទះយើង</b></span>
      </footer>
      {ask && <Inquiry slug={slug} room={ask} sent={sent} onSent={() => setSent(true)} onClose={() => setAsk(null)} />}
    </div>
  );
}

function Inquiry({ slug, room, sent, onSent, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', moveIn: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('POST', `/api/listing/${slug}/inquiry`, { ...f, roomId: room.id || '' }); onSent(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="ls-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ls-sheet" onSubmit={submit}>
        <button type="button" className="ls-close" onClick={onClose} aria-label="បិទ"><X size={18} /></button>
        {sent ? (
          <div className="ls-done"><Check size={40} /><b>បានផ្ញើរួចរាល់!</b><p>ម្ចាស់ផ្ទះនឹងទាក់ទងអ្នកឆាប់ៗ។</p><button type="button" className="ls-btn primary" onClick={onClose}>យល់ព្រម</button></div>
        ) : (
          <>
            <h2>{room.id ? `បន្ទប់ ${room.id}` : 'ទុកលេខទូរស័ព្ទ'}</h2>
            <input required placeholder="ឈ្មោះរបស់អ្នក" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
            <input required type="tel" inputMode="tel" placeholder="លេខទូរស័ព្ទ (ឧ. 012 345 678)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
            <label className="ls-label">ចង់ចូលនៅថ្ងៃ (មិនចាំបាច់)<input type="date" value={f.moveIn} onChange={(e) => setF({ ...f, moveIn: e.target.value })} /></label>
            <textarea rows={3} placeholder="សំណួរ (មិនចាំបាច់)" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
            <input className="ls-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden="true" />
            {err && <p className="ls-err">{err}</p>}
            <button className="ls-btn primary" disabled={busy}>{busy ? '…' : 'ផ្ញើទៅម្ចាស់ផ្ទះ'}</button>
          </>
        )}
      </form>
    </div>
  );
}
