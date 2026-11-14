import React, { useMemo, useState } from 'react';
import { DoorOpen, Plus, Trash2, Printer, Wallet, Check } from 'lucide-react';
import { useApp, useFmt, Modal, Field } from '../ui.jsx';
import { dateKm, usdInWords } from '../../shared/khmer.js';

const QUICK = ['សម្អាតបន្ទប់', 'ជួសជុលជញ្ជាំង / ថ្នាំ', 'ខូចខាតឧបករណ៍', 'សោ / កាតទ្វារបាត់', 'ថ្លៃទឹកភ្លើងចុងក្រោយ'];

/** Printable Khmer settlement slip (both sides sign). */
export function SettlementDoc({ t, s, property, k }) {
  const { $ } = { $: (v) => `$${Number(v).toFixed(2)}` };
  return (
    <div className="settle-doc">
      <h2>លិខិតទូទាត់ប្រាក់កក់ពេលចាកចេញ</h2>
      <p className="muted">{property}</p>
      <dl>
        <div><dt>អ្នកជួល</dt><dd>{t.nameKm || t.nameEn}</dd></div>
        <div><dt>បន្ទប់</dt><dd>{t.roomId}</dd></div>
        <div><dt>ថ្ងៃចាកចេញ</dt><dd>{dateKm(s.date, k)}</dd></div>
      </dl>
      <table>
        <tbody>
          <tr><td>ប្រាក់កក់ដែលបានទទួល</td><td>{$(s.deposit)}</td></tr>
          {s.deductions.map((d, i) => <tr key={i}><td>− {d.label}</td><td>−{$(d.amount)}</td></tr>)}
          {s.applied > 0 && <tr><td>− ទូទាត់វិក្កយបត្រមិនទាន់បង់ ({s.settled.join(', ')})</td><td>−{$(s.applied)}</td></tr>}
        </tbody>
        <tfoot>
          <tr className="grand"><td>ប្រាក់សងវិញ</td><td>{$(s.refund)}</td></tr>
          {s.owes > 0 && <tr className="owe"><td>អ្នកជួលនៅជំពាក់</td><td>{$(s.owes)}</td></tr>}
        </tfoot>
      </table>
      {s.refund > 0 && <p className="words">ជាអក្សរ៖ {usdInWords(s.refund)}</p>}
      <div className="signs"><div>ហត្ថលេខាម្ចាស់ផ្ទះ</div><div>ហត្ថលេខាអ្នកជួល</div></div>
    </div>
  );
}

export default function MoveOutModal({ t, onClose }) {
  const { state, call, print } = useApp();
  const { $, k } = useFmt();
  const [date, setDate] = useState(state.today.ymd);
  const [rows, setRows] = useState([]);
  const [useDeposit, setUseDeposit] = useState(true);
  const [done, setDone] = useState(null);
  const deposit = t.deposit?.held || 0;
  const open = state.invoices.filter((i) => i.tenantId === t.id && i.status !== 'paid' && (i.balance ?? i.total) > 0);
  const unpaid = open.reduce((a, i) => a + (i.balance ?? i.total), 0);
  const p = useMemo(() => {
    const ded = rows.reduce((a, r) => a + (Math.abs(+r.amount) || 0), 0);
    const avail = useDeposit ? Math.max(0, deposit - ded) : 0;
    const applied = Math.min(avail, unpaid);
    const left = useDeposit ? deposit - ded - applied : deposit;
    return { ded, applied, refund: Math.max(0, left), owes: Math.max(0, -left) + (unpaid - applied) };
  }, [rows, deposit, unpaid, useDeposit]);

  async function confirm() {
    if (!window.confirm(`បញ្ជាក់ថា ${t.nameKm || t.nameEn} ចាកចេញពីបន្ទប់ ${t.roomId}? បន្ទប់នឹងទំនេរ។`)) return;
    const r = await call('POST', `/api/tenants/${t.id}/moveout`, { date, deductions: rows, useDeposit }, 'បានទូទាត់ និងចាកចេញ ✅');
    if (r) setDone(r.result);
  }
  const property = state.settings.propertyName;

  if (done) {
    return (
      <Modal title="ការទូទាត់រួចរាល់" onClose={onClose}
        footer={<div className="row-btns"><button className="btn ghost" onClick={onClose}>បិទ</button><button className="btn primary" onClick={() => print(<SettlementDoc t={t} s={done} property={property} k={k} />)}><Printer size={16} /> បោះពុម្ពលិខិតទូទាត់</button></div>}>
        <SettlementDoc t={t} s={done} property={property} k={k} />
      </Modal>
    );
  }
  return (
    <Modal title={`ចាកចេញ · បន្ទប់ ${t.roomId}`} sub={t.nameKm || t.nameEn} onClose={onClose}
      footer={<button className="btn primary block" onClick={confirm}><Check size={16} /> បញ្ជាក់ការចាកចេញ</button>}>
      <div className="moveout">
        <Field label="ថ្ងៃចាកចេញ"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="mo-line"><span><Wallet size={15} /> ប្រាក់កក់ដែលបានទទួល</span><b>{$(deposit)}</b></div>
        {!deposit && <p className="form-warn">មិនទាន់កត់ត្រាប្រាក់កក់។ កែនៅកាត «ប្រាក់កក់» ជាមុន ប្រសិនបើបានទទួល។</p>}
        <b className="small">កាត់ចេញ</b>
        {rows.map((r, i) => (
          <div key={i} className="extra-row">
            <input value={r.label} placeholder="ហេតុផល" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input type="number" inputMode="decimal" step="0.5" value={r.amount} placeholder="$" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <button type="button" className="icon-btn" aria-label="លុប" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
        <div className="notice-templates">{QUICK.map((q) => <button type="button" key={q} onClick={() => setRows([...rows, { label: q, amount: '' }])}><Plus size={12} /> {q}</button>)}</div>
        {unpaid > 0 && <label className="switch-row"><input type="checkbox" checked={useDeposit} onChange={(e) => setUseDeposit(e.target.checked)} /><span><b>កាត់វិក្កយបត្រមិនទាន់បង់ពីប្រាក់កក់ ({$(unpaid)})</b><small>{open.map((i) => i.number).join(', ')}</small></span></label>}
        <div className="mo-sum">
          {p.ded > 0 && <div><span>កាត់ចេញ</span><b>−{$(p.ded)}</b></div>}
          {p.applied > 0 && <div><span>ទូទាត់វិក្កយបត្រ</span><b>−{$(p.applied)}</b></div>}
          <div className="grand"><span>ប្រាក់សងវិញ</span><b>{$(p.refund)}</b></div>
          {p.owes > 0 && <div className="owe"><span>អ្នកជួលនៅជំពាក់</span><b>{$(p.owes)}</b></div>}
        </div>
        <p className="muted small"><DoorOpen size={13} /> បន្ទាប់ពីបញ្ជាក់៖ អតិថិជនក្លាយជា «អតីតអ្នកជួល» បន្ទប់ទំនេរ ហើយផ្ញើសេចក្តីសង្ខេបតាម Telegram។</p>
      </div>
    </Modal>
  );
}

/** Deposit card on the customer page. */
export function DepositCard({ t }) {
  const { call, state } = useApp();
  const { $, k } = useFmt();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ held: t.deposit?.held ?? t.contract?.deposit ?? '', date: t.deposit?.receivedAt || state.today.ymd, note: t.deposit?.note || '' });
  return (
    <section className="card">
      <h3 className="sec-title"><Wallet size={17} /> ប្រាក់កក់</h3>
      {t.moveOut ? (
        <p className="muted">បានទូទាត់ពេលចាកចេញ {dateKm(t.moveOut.date, k)} · សងវិញ {$(t.moveOut.refund)}{t.moveOut.owes > 0 ? ` · នៅជំពាក់ ${$(t.moveOut.owes)}` : ''}</p>
      ) : edit ? (
        <form className="pay-form" onSubmit={async (e) => { e.preventDefault(); if (await call('PUT', `/api/tenants/${t.id}/deposit`, { ...f, held: +f.held }, 'បានរក្សាទុក')) setEdit(false); }}>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={f.held} onChange={(e) => setF({ ...f, held: e.target.value })} placeholder="$" aria-label="ចំនួន" />
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="ថ្ងៃទទួល" />
          <div className="row-btns"><button type="button" className="btn ghost sm" onClick={() => setEdit(false)}>បោះបង់</button><button className="btn primary sm">រក្សាទុក</button></div>
        </form>
      ) : (
        <div className="mo-line"><span>{t.deposit?.held ? `បានទទួល ${dateKm(t.deposit.receivedAt, k)}${t.deposit.source === 'movein' ? ' (ពីវិក្កយបត្រចូលស្នាក់នៅ)' : ''}` : 'មិនទាន់កត់ត្រា'}</span><b>{$(t.deposit?.held || 0)}</b>
          <button className="btn ghost sm" onClick={() => setEdit(true)}>កែ</button></div>
      )}
    </section>
  );
}
