import React, { useRef, useState } from 'react';
import { ScanText, Upload, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { loadChakkhu, readDocument } from './chakkhu.js';
import { parseIdCard } from './idcard.js';
import { dateKm, GENDERS, labelOf } from '../../shared/khmer.js';

const FIELDS = [
  ['nameKm', 'ឈ្មោះ (ខ្មែរ)'], ['nameEn', 'ឈ្មោះ (ឡាតាំង)'], ['idNumber', 'លេខអត្តសញ្ញាណប័ណ្ណ'], ['gender', 'ភេទ'],
  ['dob', 'ថ្ងៃខែឆ្នាំកំណើត'], ['idIssued', 'ថ្ងៃចេញ'], ['idExpiry', 'ថ្ងៃផុតកំណត់'], ['addressDetail', 'អាសយដ្ឋាន'],
];
const show = (k, v) => (k === 'gender' ? labelOf(GENDERS, v) : ['dob', 'idIssued', 'idExpiry'].includes(k) ? dateKm(v) : v);

/**
 * Read a Khmer ID card on this device with Chakkhu OCR and offer the fields.
 * onApply(fields, { front, back }) — the photos are passed back so they can be saved too.
 */
export default function IdScanner({ initial = {}, onApply, onClose }) {
  const [files, setFiles] = useState({ front: initial.front || null, back: initial.back || null });
  const [stage, setStage] = useState('pick'); // pick | loading | reading | done | error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [lines, setLines] = useState({ front: [], back: [] });
  const [chosen, setChosen] = useState({});
  const [error, setError] = useState('');
  const inputs = { front: useRef(), back: useRef() };

  async function run() {
    setError('');
    try {
      setStage('loading');
      const model = await loadChakkhu((p) => setProgress(p));
      setStage('reading');
      const read = {};
      for (const side of ['front', 'back']) {
        if (!files[side]) { read[side] = []; continue; }
        setProgress(0);
        const doc = await readDocument(model, files[side], { onLine: (i, n) => setProgress(i / n) });
        read[side] = doc.lines;
      }
      setLines(read);
      const r = parseIdCard(read.front, read.back);
      setResult(r);
      setChosen(Object.fromEntries(Object.keys(r.fields).map((k) => [k, true])));
      setStage('done');
    } catch (e) {
      console.error(e);
      setError(e.message || 'OCR error');
      setStage('error');
    }
  }

  return (
    <Modal title="ស្កេនអត្តសញ្ញាណប័ណ្ណ" sub="អានដោយ Chakkhu OCR នៅលើឧបករណ៍របស់អ្នក" onClose={onClose} wide>
      <p className="ocr-privacy"><ShieldCheck size={15} /> រូបភាពមិនត្រូវបានផ្ញើទៅកន្លែងណាទេ — ការអានធ្វើឡើងក្នុង browser របស់អ្នក។ លើកដំបូងត្រូវទាញយកម៉ូដែល ~៣៩MB (តែម្តង)។</p>
      <div className="ocr-sides">
        {['front', 'back'].map((side) => (
          <button key={side} type="button" className={'ocr-side ' + (files[side] ? 'has' : '')} onClick={() => inputs[side].current.click()} disabled={stage === 'loading' || stage === 'reading'}>
            {files[side] ? <img src={URL.createObjectURL(files[side])} alt="" /> : <span><Upload size={20} />{side === 'front' ? 'ផ្នែកខាងមុខ' : 'ផ្នែកខាងក្រោយ (MRZ)'}</span>}
            <small>{side === 'front' ? 'មុខ — ឈ្មោះខ្មែរ ថ្ងៃខែ' : 'ក្រោយ — ឈ្មោះឡាតាំង លេខ ថ្ងៃកំណើត'}</small>
            <input ref={inputs[side]} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles((x) => ({ ...x, [side]: f })); setStage('pick'); }} />
          </button>
        ))}
      </div>
      <p className="muted small">💡 ថតឱ្យត្រង់ ពន្លឺល្អ គ្មានពន្លឺចាំង ហើយកាត់ឱ្យនៅតែប័ណ្ណ។</p>

      {(stage === 'loading' || stage === 'reading') && (
        <div className="ocr-progress">
          <Loader2 size={16} className="spin" />
          <span>{stage === 'loading' ? 'កំពុងរៀបចំម៉ូដែល Chakkhu…' : 'កំពុងអានអក្សរ…'}</span>
          <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </div>
      )}
      {stage === 'error' && <p className="form-error">មិនអាចអានបានទេ៖ {error}</p>}

      {stage === 'done' && result && (
        <div className="ocr-result">
          {result.mrz && <p className={'mrz-badge ' + (result.mrz.passed === result.mrz.checks ? 'ok' : 'warn')}><CheckCircle2 size={14} /> MRZ {result.mrz.passed}/{result.mrz.checks} លេខត្រួតពិនិត្យត្រឹមត្រូវ</p>}
          {Object.keys(result.fields).length ? (
            <div className="ocr-fields">
              {FIELDS.filter(([k]) => result.fields[k]).map(([k, l]) => (
                <label key={k} className={'ocr-field ' + (chosen[k] ? 'on' : '')}>
                  <input type="checkbox" checked={!!chosen[k]} onChange={(e) => setChosen({ ...chosen, [k]: e.target.checked })} />
                  <span>{l}</span><b>{show(k, result.fields[k])}</b>
                </label>
              ))}
            </div>
          ) : <p className="form-warn">រកមិនឃើញព័ត៌មានច្បាស់លាស់។ សូមថតម្តងទៀតឱ្យច្បាស់ ឬបំពេញដោយដៃ។</p>}
          <details className="ocr-raw"><summary>អក្សរដែលអានបាន ({lines.front.length + lines.back.length} ជួរ)</summary>
            {[...lines.front, ...lines.back].map((l, i) => <div key={i}><span>{Math.round(l.confidence * 100)}%</span>{l.text}</div>)}
          </details>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>បោះបង់</button>
        {stage !== 'done'
          ? <button type="button" className="btn primary" disabled={!files.front && !files.back || stage === 'loading' || stage === 'reading'} onClick={run}><ScanText size={15} /> អាន</button>
          : <button type="button" className="btn primary" onClick={() => { onApply(Object.fromEntries(Object.entries(result.fields).filter(([k]) => chosen[k])), files); onClose(); }}><CheckCircle2 size={15} /> បំពេញទម្រង់</button>}
      </div>
    </Modal>
  );
}
