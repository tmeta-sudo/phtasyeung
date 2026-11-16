import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Printer, Pencil, Eye } from 'lucide-react';
import { useApp, Field } from '../ui.jsx';
import { ContractDoc } from '../ContractDoc.jsx';
import { PLACEHOLDERS, contractValues, fillTemplate } from '../contract.js';

const A4_W = 794; // 210 mm at 96 dpi
const A4_H = 1123; // 297 mm

/** An A4 sheet scaled to the space it has; dashed lines mark where each printed page ends. */
function A4Preview({ children }) {
  const box = useRef();
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(A4_H);
  const page = useRef();
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (box.current) setScale(Math.min(1, box.current.clientWidth / A4_W));
      if (page.current) setHeight(Math.max(A4_H, page.current.scrollHeight));
    });
    if (box.current) ro.observe(box.current);
    if (page.current) ro.observe(page.current);
    return () => ro.disconnect();
  }, []);
  const pages = Math.ceil(height / A4_H);
  return (
    <div className="a4-wrap" ref={box} style={{ height: pages * A4_H * scale + 8 }}>
      <div className="a4-page" ref={page} style={{ width: A4_W, minHeight: pages * A4_H, transform: `scale(${scale})` }}>
        {children}
        {Array.from({ length: pages - 1 }, (_, i) => <div key={i} className="a4-break" style={{ top: (i + 1) * A4_H }}><span>ទំព័រ {i + 2}</span></div>)}
      </div>
    </div>
  );
}

/** Lease template editor with a live A4 preview filled with a sample tenant. */
export default function ContractEditor({ f, set, save }) {
  const { state, print } = useApp();
  const [tab, setTab] = useState('edit'); // phones: one panel at a time
  const area = useRef();
  const tpl = f.contract?.template || '';
  const setTpl = (template) => set('contract', { ...f.contract, template });

  // Insert a placeholder where the cursor is (not at the end), then put the cursor after it.
  function insert(key) {
    const el = area.current;
    const token = `{{${key}}}`;
    if (!el) return setTpl(tpl + token);
    const a = el.selectionStart ?? tpl.length; const b = el.selectionEnd ?? a;
    setTpl(tpl.slice(0, a) + token + tpl.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  }

  const sample = useMemo(() => {
    const room = state.rooms[0] || { id: 'A1', building: 'អគារ A', rent: f.currency === 'KHR' ? 400000 : 100 };
    const start = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
    const end = `${+start.slice(0, 4) + 1}${start.slice(4)}`;
    const tenant = { nameKm: 'សុខ ចាន់ថា', gender: 'female', dob: '1998-04-14', idNumber: '010203040', phone: '012 345 678', contract: { start, end }, address: {} };
    const values = contractValues({ tenant, room, settings: { ...state.settings, ...f, contract: f.contract }, propertyAddress: state.settings.location?.addressText || f.address, addressOf: () => 'ភូមិ១ ឃុំ១ ស្រុក១ ខេត្តកំពង់ចាម' });
    return { text: fillTemplate(tpl, values), values };
  }, [tpl, f, state.rooms, state.settings]);
  // Placeholders the app does not know stay as typed in the contract: point them out.
  const unknown = [...new Set((tpl.match(/\{\{\s*(\w+)\s*\}\}/g) || []).map((x) => x.replace(/[{}\s]/g, '')))].filter((k) => !(k in sample.values));

  // Same as a printed contract without e-signatures: the template's own signature lines are used.
  const doc = <ContractDoc text={sample.text} property={state.settings.propertyName} />;
  return (
    <form className="card wide-card contract-editor" onSubmit={(e) => save(e, { ownerName: f.ownerName, contract: f.contract })}>
      <h3 className="sec-title"><FileText size={17} /> គំរូកិច្ចសន្យា</h3>
      <div className="form-grid three">
        <Field label="ឈ្មោះម្ចាស់ផ្ទះ (ក្នុងកិច្ចសន្យា)"><input value={f.ownerName || ''} onChange={(e) => set('ownerName', e.target.value)} placeholder="ឧ. លី សុខា" /></Field>
        <Field label="ប្រាក់កក់ (ខែ)"><input type="number" min="0" max="12" value={f.contract?.depositMonths ?? 1} onChange={(e) => set('contract', { ...f.contract, depositMonths: e.target.value })} /></Field>
        <Field label="បង់មុន (ខែ)"><input type="number" min="0" max="12" value={f.contract?.prepaidMonths ?? 1} onChange={(e) => set('contract', { ...f.contract, prepaidMonths: e.target.value })} /></Field>
      </div>

      <div className="seg ce-tabs">
        <button type="button" className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}><Pencil size={14} /> កែអត្ថបទ</button>
        <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}><Eye size={14} /> មើល A4</button>
      </div>

      <div className={'ce-split show-' + tab}>
        <div className="ce-edit">
          <Field label="អត្ថបទគំរូ" hint="ចុចប៊ូតុងខាងក្រោម ដើម្បីបញ្ចូលព័ត៌មានអតិថិជន ត្រង់កន្លែងទស្សន៍ទ្រនិច">
            <textarea ref={area} rows={18} className="contract-text" value={tpl} onChange={(e) => setTpl(e.target.value)} spellCheck={false} />
          </Field>
          <div className="ph-list">{PLACEHOLDERS.map(([k, l]) => <button type="button" key={k} onClick={() => insert(k)} title={`បញ្ចូល {{${k}}}`}><b>{l}</b><small>{`{{${k}}}`}</small></button>)}</div>
          {unknown.length > 0 && <p className="form-warn">⚠️ មិនស្គាល់៖ {unknown.map((k) => `{{${k}}}`).join(' ')} — នឹងបង្ហាញដដែលក្នុងកិច្ចសន្យា</p>}
        </div>
        <div className="ce-preview">
          <div className="ce-preview-head"><span>គំរូ A4 · ទិន្នន័យសាកល្បង</span><button type="button" className="btn ghost sm" onClick={() => print(doc)}><Printer size={14} /> បោះពុម្ពគំរូ</button></div>
          <A4Preview>{doc}</A4Preview>
        </div>
      </div>
      <button className="btn primary">រក្សាទុក</button>
    </form>
  );
}
