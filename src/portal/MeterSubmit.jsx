import React, { useState } from 'react';
import { Gauge, Camera, Check } from 'lucide-react';
import { api, compressImage } from '../api.js';
import { monthKm, num } from '../../shared/khmer.js';

/** Tenant sends this month's meter numbers (and optional photos) from the portal. */
export default function MeterSubmit({ token, data, onDone, notify }) {
  const k = data.property.khmerNumerals;
  const room = data.room;
  const ym = data.today?.ym || new Date().toISOString().slice(0, 7);
  const recorded = data.meters?.some((m) => m.month === ym);
  const mine = data.myReading?.month === ym ? data.myReading : null;
  const kinds = [['water', '💧 ទឹក', 'm³'], ['electric', '⚡ ភ្លើង', 'kWh']].filter(([kk]) => !(data.sharedKinds || []).includes(kk));
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({});
  const [photos, setPhotos] = useState({});
  const [busy, setBusy] = useState(false);
  if (!room || recorded || !kinds.length) return null;
  const last = data.meters?.[0];
  const prev = { water: last ? last.water : null, electric: last ? last.electric : null };

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('POST', `/api/portal/${token}/readings`, { water: f.water, electric: f.electric });
      for (const [kind, file] of Object.entries(photos)) {
        const form = new FormData();
        form.set('file', await compressImage(file, 1600));
        await api('POST', `/api/portal/${token}/readings/${r.result.id}/photo/${kind}`, form).catch(() => {});
      }
      notify(r.result.approved ? '✅ បានកត់លេខកុងទ័រ' : '📨 បានផ្ញើទៅម្ចាស់ផ្ទះ — អរគុណ!');
      setOpen(false);
      onDone();
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  }

  if (mine?.status === 'pending' && !open) {
    return <div className="pt-card pt-meter-sent"><Check size={18} /><span><b>បានផ្ញើលេខកុងទ័រ {monthKm(ym, k)}</b><small>រង់ចាំម្ចាស់ផ្ទះពិនិត្យ</small></span></div>;
  }
  if (!open) {
    return (
      <button className="pt-card pt-tg" onClick={() => setOpen(true)}>
        <span className="pt-tg-icon"><Gauge size={18} /></span>
        <span><b>ផ្ញើលេខកុងទ័រ</b><small>{mine?.status === 'rejected' ? 'លេខមុនមិនត្រឹមត្រូវ — សូមផ្ញើម្តងទៀត' : `កត់ទឹក ភ្លើង ខែ${monthKm(ym, k).replace(/ ឆ្នាំ.*/, '')} ដោយខ្លួនឯង`}</small></span>
      </button>
    );
  }
  return (
    <form className="pt-card pt-meter-form" onSubmit={send}>
      <b>ផ្ញើលេខកុងទ័រ · {monthKm(ym, k)}</b>
      {kinds.map(([kind, label, unit]) => (
        <label key={kind} className="pt-meter-row">
          <span>{label}{prev[kind] != null && <small>ខែមុន {num(prev[kind], k)} {unit}</small>}</span>
          <input type="number" inputMode="decimal" step="any" min={prev[kind] ?? 0} required value={f[kind] ?? ''} onChange={(e) => setF({ ...f, [kind]: e.target.value })} />
          <span className={'pt-cam ' + (photos[kind] ? 'has' : '')}>
            <Camera size={16} />
            <input type="file" accept="image/*" capture="environment" aria-label={`រូប${label}`} onChange={(e) => e.target.files?.[0] && setPhotos({ ...photos, [kind]: e.target.files[0] })} />
          </span>
        </label>
      ))}
      <small className="pt-hint">📷 ថតរូបកុងទ័រ (មិនចាំបាច់) — ជួយម្ចាស់ផ្ទះពិនិត្យបានលឿន</small>
      <div className="pt-actions"><button type="button" className="pt-ghost" onClick={() => setOpen(false)}>បោះបង់</button><button className="pt-pink" disabled={busy}>{busy ? '…' : 'ផ្ញើ'}</button></div>
    </form>
  );
}
