import React, { useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../ui.jsx';
import { DEFAULT_ADDONS } from '../../shared/features.js';

/** The landlord's price list of add-ons (parking, Wi-Fi…), ticked per tenant and billed monthly. */
export default function AddonsCard() {
  const { state, call } = useApp();
  const [list, setList] = useState(() => (state.settings.addons || []).map((a) => ({ ...a })));
  const upd = (i, k, v) => setList(list.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  const missing = DEFAULT_ADDONS.filter((d) => !list.some((a) => a.id === d.id));
  return (
    <div className="card addons-card">
      <h3 className="sec-title"><PackagePlus size={17} /> សេវាបន្ថែម (គិតប្រចាំខែ)</h3>
      <p className="muted small">ធីកសម្រាប់អតិថិជនម្នាក់ៗ ពេលបញ្ចូល ឬកែប្រែព័ត៌មាន — បូកចូលវិក្កយបត្ររៀងរាល់ខែដោយស្វ័យប្រវត្តិ។</p>
      {list.map((a, i) => (
        <div key={a.id || i} className="addon-edit">
          <input className="ae-icon" value={a.icon} onChange={(e) => upd(i, 'icon', e.target.value)} aria-label="រូប" maxLength={4} />
          <input value={a.label} onChange={(e) => upd(i, 'label', e.target.value)} placeholder="ឈ្មោះ" aria-label="ឈ្មោះ" />
          <input type="number" inputMode="decimal" step="0.5" min="0" value={a.price} onChange={(e) => upd(i, 'price', e.target.value)} aria-label="តម្លៃ $/ខែ" placeholder="$" />
          <input type="number" min="1" max="20" value={a.max} onChange={(e) => upd(i, 'max', e.target.value)} aria-label="ចំនួនអតិបរមា" title="ចំនួនអតិបរមាក្នុងមួយអតិថិជន (ឧ. ម៉ូតូ ៥ គ្រឿង)" />
          <button type="button" className="icon-btn" aria-label="លុប" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="row-btns">
        <button type="button" className="btn ghost sm" onClick={() => setList([...list, { icon: '➕', label: '', price: '', max: 1 }])}><Plus size={14} /> បន្ថែម</button>
        {missing.map((d) => <button type="button" key={d.id} className="btn ghost sm" onClick={() => setList([...list, { ...d }])}>{d.icon} {d.label}</button>)}
      </div>
      <button type="button" className="btn primary" onClick={() => call('PUT', '/api/settings', { addons: list }, (r) => { setList(r.settings.addons.map((a) => ({ ...a }))); return 'បានរក្សាទុក'; })}>រក្សាទុក</button>
    </div>
  );
}
