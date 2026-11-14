import React, { useState } from 'react';
import { curSymbol, getClientCurrency } from '../../shared/khmer.js';
import { Zap, Droplets, Plus, Trash2, Layers, Share2 } from 'lucide-react';
import { useApp, useFmt } from '../ui.jsx';

/** Price bands (like EDC) for electricity/water, and meters shared by several rooms. */
export default function UtilityCard() {
  const { state, call } = useApp();
  const { $ } = useFmt();
  const st = state.settings;
  const [tiers, setTiers] = useState(() => ({ electric: [...(st.tiers?.electric || [])], water: [...(st.tiers?.water || [])] }));
  const [groups, setGroups] = useState(() => (st.sharedMeters || []).map((g) => ({ ...g })));
  const [kind, setKind] = useState('electric');
  const list = tiers[kind];
  const setList = (next) => setTiers({ ...tiers, [kind]: next });
  const example = (() => {
    const q = kind === 'electric' ? 150 : 15;
    const bands = [...list].filter((b) => +b.rate > 0).sort((a, b) => (a.upTo === '' || a.upTo == null ? Infinity : +a.upTo) - (b.upTo === '' || b.upTo == null ? Infinity : +b.upTo));
    if (!bands.length) return null;
    let left = q; let from = 0; let total = 0;
    for (const b of bands) { const cap = b.upTo === '' || b.upTo == null ? Infinity : +b.upTo; const take = Math.max(0, Math.min(left, cap - from)); total += take * +b.rate; left -= take; from = cap; }
    if (left > 0) total += left * +bands.at(-1).rate;
    return `ឧ. ${q} ${kind === 'electric' ? 'kWh' : 'm³'} = ${$(Math.round(total * 100) / 100)}`;
  })();

  return (
    <div className="card util-card">
      <h3 className="sec-title"><Layers size={17} /> តម្លៃតាមកម្រិត និងកុងទ័ររួម</h3>
      <div className="seg">
        <button type="button" className={kind === 'electric' ? 'on' : ''} onClick={() => setKind('electric')}><Zap size={14} /> ភ្លើង</button>
        <button type="button" className={kind === 'water' ? 'on' : ''} onClick={() => setKind('water')}><Droplets size={14} /> ទឹក</button>
      </div>
      <p className="muted small">{list.length ? 'គិតតាមកម្រិត ដូច EDC — កម្រិតទាបតម្លៃមួយ កម្រិតខ្ពស់តម្លៃមួយទៀត។' : `ឥឡូវគិតតម្លៃតែមួយ (${$(kind === 'electric' ? st.electricRate : st.waterRate)}/${kind === 'electric' ? 'kWh' : 'm³'})។ បន្ថែមកម្រិត ប្រសិនបើចង់គិតដូច EDC។`}</p>
      {list.map((b, i) => (
        <div key={i} className="tier-row">
          <span>{i === 0 ? '០' : (list[i - 1].upTo || '…')} –</span>
          <input type="number" inputMode="decimal" placeholder="ដល់ (ទុកទំនេរ = ឡើងទៅ)" value={b.upTo ?? ''} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, upTo: e.target.value } : x)))} aria-label="ដល់" />
          <input type="number" inputMode="decimal" step="0.001" placeholder={`${curSymbol(getClientCurrency())} / ឯកតា`} value={b.rate} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} aria-label="តម្លៃ" />
          <button type="button" className="icon-btn" aria-label="លុប" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="row-btns">
        <button type="button" className="btn ghost sm" onClick={() => setList([...list, { upTo: '', rate: '' }])}><Plus size={14} /> បន្ថែមកម្រិត</button>
        {example && <small className="muted">{example}</small>}
      </div>

      <h4 className="sub-title"><Share2 size={15} /> កុងទ័ររួម (មួយកុងទ័រ ច្រើនបន្ទប់)</h4>
      <p className="muted small">ចែកការប្រើប្រាស់ស្មើៗគ្នា ក្នុងចំណោមបន្ទប់ដែលមានអ្នកជួល។</p>
      {groups.map((g, i) => (
        <div key={g.id || i} className="share-group">
          <div className="share-top">
            <input value={g.name} placeholder="ឈ្មោះ (ឧ. ជាន់ ២)" onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <select value={g.kind} onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}><option value="electric">⚡ ភ្លើង</option><option value="water">💧 ទឹក</option></select>
            {!g.id && <input type="number" inputMode="decimal" placeholder="លេខបច្ចុប្បន្ន" value={g.reading ?? ''} onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, reading: e.target.value } : x)))} />}
            <button type="button" className="icon-btn" aria-label="លុប" onClick={() => setGroups(groups.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
          <div className="room-chips">{state.rooms.map((r) => {
            const on = g.rooms?.includes(r.id);
            return <button type="button" key={r.id} className={'chip-toggle ' + (on ? 'on' : '')} onClick={() => setGroups(groups.map((x, j) => (j === i ? { ...x, rooms: on ? x.rooms.filter((y) => y !== r.id) : [...(x.rooms || []), r.id] } : x)))}>{r.id}</button>;
          })}</div>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => setGroups([...groups, { name: '', kind: 'electric', rooms: [], reading: '' }])}><Plus size={14} /> បន្ថែមកុងទ័ររួម</button>
      <button type="button" className="btn primary" onClick={() => call('PUT', '/api/settings', { tiers, sharedMeters: groups }, (r) => { setGroups(r.settings.sharedMeters.map((g) => ({ ...g }))); return 'បានរក្សាទុក'; })}>រក្សាទុក</button>
    </div>
  );
}
