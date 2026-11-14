import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { ROOM_FEATURES } from '../shared/features.js';
import { useFmt } from './ui.jsx';

/** Tick room features (AC, fan, hot water…). */
export function FeaturePicker({ value = [], onChange }) {
  const on = new Set(value);
  return (
    <div className="feature-grid">
      {ROOM_FEATURES.map((f) => (
        <label key={f.id} className={'feature-tick ' + (on.has(f.id) ? 'on' : '')}>
          <input type="checkbox" checked={on.has(f.id)} onChange={() => onChange(on.has(f.id) ? value.filter((x) => x !== f.id) : [...value, f.id])} />
          <span className="ft-icon">{f.icon}</span><span>{f.km}</span>
        </label>
      ))}
    </div>
  );
}

/** Feature icons for cards and the listing page. */
export function FeatureIcons({ ids = [], labels = false }) {
  const list = ROOM_FEATURES.filter((f) => ids.includes(f.id));
  if (!list.length) return null;
  return <span className={'feature-icons ' + (labels ? 'labels' : '')}>{list.map((f) => <span key={f.id} title={f.km}>{f.icon}{labels && <small>{f.km}</small>}</span>)}</span>;
}

/** Tick paid add-ons with a quantity (2 motorbikes…). value = [{ id, qty }] */
export function AddonsPicker({ catalog = [], value = [], onChange }) {
  const { $ } = useFmt();
  const qty = (id) => value.find((x) => x.id === id)?.qty || 0;
  const setQty = (a, q) => {
    const next = value.filter((x) => x.id !== a.id);
    if (q > 0) next.push({ id: a.id, qty: Math.min(a.max || 9, q) });
    onChange(next);
  };
  if (!catalog.length) return <p className="muted small">មិនទាន់មានសេវាបន្ថែម — កំណត់នៅ ការកំណត់ → សេវាបន្ថែម</p>;
  return (
    <div className="addon-list">
      {catalog.map((a) => {
        const q = qty(a.id);
        return (
          <div key={a.id} className={'addon-row ' + (q ? 'on' : '')}>
            <label className="addon-tick">
              <input type="checkbox" checked={q > 0} onChange={(e) => setQty(a, e.target.checked ? 1 : 0)} />
              <span className="ft-icon">{a.icon}</span>
              <span><b>{a.label}</b><small>{$(a.price)}/ខែ</small></span>
            </label>
            {q > 0 && (a.max || 1) > 1 && (
              <span className="stepper">
                <button type="button" onClick={() => setQty(a, q - 1)} aria-label="បន្ថយ"><Minus size={14} /></button>
                <b>{q}</b>
                <button type="button" onClick={() => setQty(a, q + 1)} disabled={q >= (a.max || 9)} aria-label="បន្ថែម"><Plus size={14} /></button>
              </span>
            )}
            {q > 0 && <b className="addon-sum">{$(a.price * q)}</b>}
          </div>
        );
      })}
    </div>
  );
}

export const addonsTotal = (catalog = [], value = []) => value.reduce((s, x) => s + (catalog.find((a) => a.id === x.id)?.price || 0) * x.qty, 0);
