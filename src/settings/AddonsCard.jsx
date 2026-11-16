import React, { useState } from 'react';
import { PackagePlus, Plus, Trash2, Minus } from 'lucide-react';
import { fmtMoney, priceCur, convertAmount } from '../../shared/khmer.js';
import { useApp, useFmt } from '../ui.jsx';
import { DEFAULT_ADDONS } from '../../shared/features.js';
import CurToggle from '../CurToggle.jsx';

const ICONS = ['🛵', '🚗', '🚲', '📶', '🗑️', '❄️', '🧺', '🧹', '💧', '📺', '🔑', '🐶', '➕'];

/** The landlord's price list of add-ons (parking, Wi-Fi…): one clear card per add-on, priced in ៛ or $. */
export default function AddonsCard() {
  const { state, call } = useApp();
  const { c: billing, k } = useFmt();
  const rate = state.settings.exchangeRate;
  const [list, setList] = useState(() => (state.settings.addons || []).map((a) => ({ ...a })));
  const upd = (i, patch) => setList(list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const missing = DEFAULT_ADDONS.filter((d) => !list.some((a) => a.id === d.id));
  const changed = JSON.stringify(list) !== JSON.stringify(state.settings.addons || []);

  return (
    <div className="card addons-card">
      <h3 className="sec-title"><PackagePlus size={17} /> សេវាបន្ថែម (គិតប្រចាំខែ)</h3>
      <p className="muted small">ឧ. ចំណតម៉ូតូ Wi-Fi សំរាម។ ពេលបញ្ចូលអតិថិជន អ្នកគ្រាន់តែធីក — ប្រព័ន្ធបូកចូលវិក្កយបត្ររៀងរាល់ខែ។ តម្លៃអាចជា <b>៛</b> ឬ <b>$</b>។</p>

      {list.map((a, i) => {
        const ac = priceCur(a.cur, billing);
        const max = Math.max(1, +a.max || 1);
        return (
          <div key={a.id || i} className="addon-card">
            <div className="ac-top">
              <select className="ac-icon" value={ICONS.includes(a.icon) ? a.icon : ''} onChange={(e) => upd(i, { icon: e.target.value })} aria-label="រូប">
                {!ICONS.includes(a.icon) && <option value="">{a.icon}</option>}
                {ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input className="ac-name" value={a.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="ឈ្មោះសេវា (ឧ. ចំណតម៉ូតូ)" aria-label="ឈ្មោះសេវា" />
              <button type="button" className="icon-btn" aria-label="លុប" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
            <div className="ac-fields">
              <label className="ac-field">
                <span>តម្លៃ ក្នុង ១ ខែ</span>
                <span className="ac-price">
                  <input type="number" inputMode="decimal" min="0" step={ac === 'KHR' ? 1000 : 0.5} value={a.price} onChange={(e) => upd(i, { price: e.target.value })} placeholder={ac === 'KHR' ? '20000' : '5'} aria-label="តម្លៃ" />
                  <CurToggle value={a.cur} billing={billing} onChange={(v) => upd(i, { cur: v })} />
                </span>
              </label>
              <div className="ac-field">
                <span>អតិថិជនម្នាក់យកបាន</span>
                <span className="stepper">
                  <button type="button" onClick={() => upd(i, { max: Math.max(1, max - 1) })} disabled={max <= 1} aria-label="បន្ថយ"><Minus size={14} /></button>
                  <b>{max}</b>
                  <button type="button" onClick={() => upd(i, { max: Math.min(20, max + 1) })} disabled={max >= 20} aria-label="បន្ថែម"><Plus size={14} /></button>
                </span>
              </div>
            </div>
            {+a.price > 0 && a.label && (
              <small className="ac-preview">
                {a.icon} {a.label}: {fmtMoney(+a.price, ac, k)} / ខែ{max > 1 ? ` · ម្នាក់យកបានរហូតដល់ ${max}` : ''}
                {ac !== billing && <> · ≈ {fmtMoney(convertAmount(+a.price, ac, billing, rate), billing, k)} ក្នុងវិក្កយបត្រ</>}
              </small>
            )}
          </div>
        );
      })}

      <div className="row-btns">
        <button type="button" className="btn ghost sm" onClick={() => setList([...list, { icon: '➕', label: '', price: '', max: 1, cur: '' }])}><Plus size={14} /> សេវាថ្មី</button>
        {missing.map((d) => <button type="button" key={d.id} className="btn ghost sm" onClick={() => setList([...list, { ...d }])}>{d.icon} {d.label}</button>)}
      </div>
      <button type="button" className="btn primary" disabled={!changed} onClick={() => call('PUT', '/api/settings', { addons: list }, (r) => { setList(r.settings.addons.map((a) => ({ ...a }))); return 'បានរក្សាទុក'; })}>រក្សាទុក</button>
    </div>
  );
}
