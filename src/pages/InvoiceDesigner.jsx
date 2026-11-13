import React, { useMemo, useRef, useState } from 'react';
import { GripVertical, Eye, EyeOff, ArrowUp, ArrowDown, ArrowLeft, Save, Image as ImageIcon, RotateCcw, Palette } from 'lucide-react';
import { useApp, useFmt, Field, navigate } from '../ui.jsx';
import InvoiceDoc, { DEFAULT_DESIGN, BLOCK_LABELS, invoiceProperty } from '../InvoiceDoc.jsx';
import { nodeToPng, shareBlob } from '../exportImage.js';

const ACCENTS = ['#1f5bff', '#0f9d75', '#e1232e', '#f2669a', '#7a5cff', '#e3a008', '#0d1424', '#00a3c4'];
const FONTS = [['Moul', 'មូល (ផ្លូវការ)'], ['Koulen', 'គូលេន (ដិត)'], ['Bokor', 'បូកគោ'], ['Battambang', 'បាត់ដំបង'], ['Siemreap', 'សៀមរាប'], ['Kantumruy Pro', 'កន្ទុំរុយ (ទំនើប)']];
const SIZES = [['a5', 'A5 បោះពុម្ព'], ['square', 'ការ៉េ (Telegram)'], ['story', 'បញ្ឈរ (Story)'], ['receipt', 'វិក្កយបត្រតូច']];
const HEADERS = [['line', 'បន្ទាត់'], ['band', 'ពណ៌ពេញ'], ['card', 'ប្រអប់'], ['minimal', 'សាមញ្ញ']];
const PRESETS = [
  ['បុរាណ', { headerStyle: 'line', titleFont: 'Moul', accent: '#1f5bff', size: 'a5', radius: 16 }],
  ['ទំនើប', { headerStyle: 'band', titleFont: 'Koulen', accent: '#7a5cff', size: 'square', radius: 24 }],
  ['ស្រស់', { headerStyle: 'card', titleFont: 'Bokor', accent: '#f2669a', size: 'story', radius: 28 }],
  ['វិក្កយបត្រតូច', { headerStyle: 'minimal', titleFont: 'Battambang', accent: '#0d1424', size: 'receipt', radius: 6 }],
];

const SAMPLE = {
  id: 'sample', number: 'INV-202611-0001', month: new Date().toISOString().slice(0, 7), roomId: 'A-101', name: 'សុខ ស្រីនាង', status: 'unpaid', rate: 4100,
  items: [
    { key: 'rent', label: 'ថ្លៃជួលបន្ទប់', qty: 1, unit: 'ខែ', rate: 150, amount: 150 },
    { key: 'water', label: 'ថ្លៃទឹក', qty: 12, unit: 'm³', rate: 0.5, amount: 6, from: 124, to: 136 },
    { key: 'electric', label: 'ថ្លៃភ្លើង', qty: 120, unit: 'kWh', rate: 0.25, amount: 30, from: 1260, to: 1380 },
  ],
  total: 186, totalKhr: 762600, issuedAt: new Date().toISOString().slice(0, 10), dueDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  khqr: '00020101021229190015sample@khqr5204599953038405405186.005802KH5913PHTEAH YEUNG6010Phnom Penh6304ABCD',
};

export default function InvoiceDesigner() {
  const { state, call, notify } = useApp();
  const { k } = useFmt();
  const [d, setD] = useState(() => ({ ...DEFAULT_DESIGN, ...(state.settings.invoiceDesign || {}) }));
  const [dragging, setDragging] = useState(null);
  const docRef = useRef();
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const sample = useMemo(() => state.invoices.find((i) => i.khqr) || state.invoices.at(-1) || SAMPLE, [state.invoices]);
  const hidden = new Set(d.hidden);

  const move = (from, to) => {
    if (to < 0 || to >= d.blocks.length || from === to) return;
    const b = [...d.blocks];
    const [x] = b.splice(from, 1);
    b.splice(to, 0, x);
    set({ blocks: b });
  };
  const toggle = (key) => set({ hidden: hidden.has(key) ? d.hidden.filter((h) => h !== key) : [...d.hidden, key] });

  async function png() {
    const blob = await nodeToPng(docRef.current);
    await shareBlob(blob, `invoice-design.png`, 'វិក្កយបត្រ');
  }

  return (
    <>
      <div className="page-head">
        <button className="btn ghost" onClick={() => navigate('/invoices')}><ArrowLeft size={16} /> វិក្កយបត្រ</button>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => setD({ ...DEFAULT_DESIGN })}><RotateCcw size={15} /> លំនាំដើម</button>
          <button className="btn ghost" onClick={png}><ImageIcon size={15} /> PNG</button>
          <button className="btn primary" onClick={() => call('PUT', '/api/settings', { invoiceDesign: d }, 'បានរក្សាទុករចនាប័ទ្ម ✅')}><Save size={15} /> រក្សាទុក</button>
        </div>
      </div>
      <h1 className="designer-title"><Palette size={26} /> រចនាវិក្កយបត្រ</h1>
      <div className="designer">
        <aside className="card designer-panel">
          <b className="small-title">គំរូរហ័ស</b>
          <div className="preset-row">{PRESETS.map(([l, p]) => <button key={l} type="button" className="preset" style={{ '--pc': p.accent }} onClick={() => set(p)}><i />{l}</button>)}</div>

          <b className="small-title">ផ្នែក — អូសដើម្បីរៀបលំដាប់</b>
          <ul className="block-list">
            {d.blocks.map((key, i) => (
              <li key={key} draggable
                className={(dragging === i ? 'dragging ' : '') + (hidden.has(key) ? 'off' : '')}
                onDragStart={() => setDragging(i)} onDragEnd={() => setDragging(null)}
                onDragOver={(e) => { e.preventDefault(); if (dragging !== null && dragging !== i) { move(dragging, i); setDragging(i); } }}>
                <GripVertical size={16} className="grip" />
                <span>{BLOCK_LABELS[key]}</span>
                <button type="button" onClick={() => move(i, i - 1)} aria-label="ឡើងលើ"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(i, i + 1)} aria-label="ចុះក្រោម"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => toggle(key)} aria-label={hidden.has(key) ? 'បង្ហាញ' : 'លាក់'}>{hidden.has(key) ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </li>
            ))}
          </ul>

          <b className="small-title">ពណ៌</b>
          <div className="swatches">
            {ACCENTS.map((c) => <button key={c} type="button" className={d.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={c} />)}
            <label className="swatch-custom"><input type="color" value={d.accent} onChange={(e) => set({ accent: e.target.value })} /></label>
          </div>

          <div className="form-grid">
            <Field label="ពុម្ពអក្សរចំណងជើង"><select value={d.titleFont} onChange={(e) => set({ titleFont: e.target.value })}>{FONTS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}</select></Field>
            <Field label="ទំហំ"><select value={d.size} onChange={(e) => set({ size: e.target.value })}>{SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="ក្បាល"><select value={d.headerStyle} onChange={(e) => set({ headerStyle: e.target.value })}>{HEADERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label={`ជ្រុងមូល (${d.radius}px)`}><input type="range" min="0" max="32" value={d.radius} onChange={(e) => set({ radius: +e.target.value })} /></Field>
          </div>
          <div className="toggle-row">
            {[['showRiel', 'ជារៀល'], ['showWords', 'ជាអក្សរ'], ['showLunar', 'ចន្ទគតិ']].map(([key, l]) => (
              <label key={key} className={'chip-toggle ' + (d[key] ? 'on' : '')}><input type="checkbox" checked={d[key]} onChange={(e) => set({ [key]: e.target.checked })} />{l}</label>
            ))}
          </div>
          <Field label="កំណត់ចំណាំខាងក្រោម"><textarea rows={2} maxLength={300} value={d.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        </aside>
        <div className="designer-preview">
          <InvoiceDoc inv={sample} property={invoiceProperty(state.settings)} khmer={k} design={d} innerRef={docRef} />
          {sample === SAMPLE && <p className="muted small center">ឧទាហរណ៍ — វិក្កយបត្រពិតនឹងប្រើព័ត៌មានរបស់អ្នក</p>}
        </div>
      </div>
    </>
  );
}
