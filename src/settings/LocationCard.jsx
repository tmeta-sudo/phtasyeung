import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Check, Pencil, Share2, Copy, Loader2 } from 'lucide-react';
import { useApp, Field, AddressPicker, usePumi, useVillageName, QR } from '../ui.jsx';
import MapPicker, { reverseGeocode } from '../MapPicker.jsx';

/** Khmer address line from pumi ids + house/street. */
export function useAddressText(loc) {
  const pumi = usePumi();
  const village = useVillageName(loc?.villageId);
  return useMemo(() => {
    if (!loc) return '';
    const parts = [loc.houseNo && `ផ្ទះលេខ ${loc.houseNo}`, loc.street && `ផ្លូវ ${loc.street}`, loc.detail, village];
    for (const id of [loc.communeId, loc.districtId, loc.provinceId]) {
      const x = id && pumi?.byId.get(id);
      if (x) parts.push(`${x.unit.km}${x.name.km}`);
    }
    return parts.filter(Boolean).join(', ');
  }, [loc, pumi, village]);
}

export const mapsLink = (loc) => (Number.isFinite(loc?.lat) ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : '');

export default function LocationCard() {
  const { state, call, notify } = useApp();
  const pumi = usePumi();
  const saved = state.settings.location || {};
  const [loc, setLoc] = useState(saved);
  const [step, setStep] = useState(Number.isFinite(saved.lat) ? 'saved' : 'pick'); // pick | looking | confirm | edit | saved
  const [guess, setGuess] = useState('');
  const text = useAddressText(loc);
  useEffect(() => { if (step === 'saved') setLoc(state.settings.location || {}); }, [state.settings.location]); // eslint-disable-line

  async function pick(p) {
    setLoc((l) => ({ ...l, ...p }));
    setStep('looking');
    try {
      const r = await reverseGeocode(p, pumi);
      setGuess(r.display);
      setLoc((l) => ({ ...l, ...p, houseNo: r.houseNo || l.houseNo || '', street: r.street || l.street || '', provinceId: r.provinceId, districtId: r.districtId, communeId: r.communeId, villageId: '' }));
      setStep('confirm');
    } catch {
      setStep('edit');
    }
  }

  async function save() {
    const res = await call('PUT', '/api/settings', { location: { ...loc, addressText: text }, address: text || state.settings.address }, 'បានរក្សាទុកទីតាំង ✅');
    if (res) setStep('saved');
  }

  const link = mapsLink(loc);
  return (
    <div className="card loc-card wide-card">
      <h3 className="sec-title"><MapPin size={17} /> ទីតាំងផ្ទះជួល</h3>
      <p className="muted">ដាក់ទីតាំងលើផែនទី — អតិថិជនអាចមើលផ្លូវមកបានក្នុង Telegram (📍) និងលើវិក្កយបត្រ។</p>
      <MapPicker value={loc} onPick={pick} />
      {step === 'looking' && <p className="loc-status"><Loader2 size={15} className="spin" /> កំពុងស្វែងរកអាសយដ្ឋាន…</p>}
      {step === 'confirm' && (
        <div className="loc-confirm">
          <b>តើនេះជាអាសយដ្ឋានត្រឹមត្រូវទេ?</b>
          <p>{text || guess || 'រកមិនឃើញអាសយដ្ឋានពិតប្រាកដ'}</p>
          <div className="row-btns">
            <button type="button" className="btn primary sm" onClick={() => setStep('edit')}><Check size={14} /> ត្រឹមត្រូវ — បន្ថែមលម្អិត</button>
            <button type="button" className="btn ghost sm" onClick={() => setStep('edit')}><Pencil size={14} /> កែប្រែ</button>
          </div>
        </div>
      )}
      {step === 'edit' && (
        <div className="stack-form">
          <div className="form-grid">
            <Field label="ផ្ទះលេខ"><input value={loc.houseNo || ''} onChange={(e) => setLoc({ ...loc, houseNo: e.target.value })} placeholder="១២A" /></Field>
            <Field label="ផ្លូវ"><input value={loc.street || ''} onChange={(e) => setLoc({ ...loc, street: e.target.value })} placeholder="២៧១" /></Field>
            <AddressPicker value={{ ...loc, detail: loc.detail }} onChange={(v) => setLoc({ ...loc, ...v })} />
          </div>
          <p className="loc-preview"><MapPin size={14} /> {text || '—'}</p>
          <div className="row-btns"><button type="button" className="btn primary" onClick={save}>រក្សាទុកទីតាំង</button></div>
        </div>
      )}
      {step === 'saved' && (
        <div className="loc-saved">
          <div><b>{text || state.settings.address || '—'}</b>
            <div className="row-btns">
              <button type="button" className="btn ghost sm" onClick={() => setStep('edit')}><Pencil size={14} /> កែអាសយដ្ឋាន</button>
              {link && <button type="button" className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(`${state.settings.propertyName}\n${text}\n${link}`); notify('បានចម្លង'); }}><Copy size={14} /> ចម្លង</button>}
              {link && navigator.share && <button type="button" className="btn ghost sm" onClick={() => navigator.share({ title: state.settings.propertyName, text, url: link }).catch(() => {})}><Share2 size={14} /> ចែករំលែក</button>}
            </div>
          </div>
          {link && <QR value={link} size={86} label="Google Maps QR" />}
        </div>
      )}
    </div>
  );
}
