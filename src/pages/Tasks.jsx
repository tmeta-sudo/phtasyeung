import React, { useState } from 'react';
import { Plus, Trash2, Wrench, UserPlus, Check } from 'lucide-react';
import { useApp, Modal, Field, Empty } from '../ui.jsx';

export default function Tasks() {
  const { state, call } = useApp();
  const [kind, setKind] = useState('maintenance');
  const [form, setForm] = useState(null);
  const list = state.activities.filter((a) => a.kind === kind).sort((a, b) => a.done - b.done || b.at.localeCompare(a.at));
  return (
    <>
      <div className="page-head">
        <h1>ការងារ</h1>
        <div className="head-actions"><button className="btn primary" onClick={() => setForm({ kind, title: '', detail: '', roomId: '' })}><Plus size={16} /> បន្ថែម</button></div>
      </div>
      <div className="chips-row">
        <button className={'tab-chip ' + (kind === 'maintenance' ? 'active' : '')} onClick={() => setKind('maintenance')}><Wrench size={14} /> ការថែទាំ</button>
        <button className={'tab-chip ' + (kind === 'lead' ? 'active' : '')} onClick={() => setKind('lead')}><UserPlus size={14} /> អ្នកចាប់អារម្មណ៍</button>
      </div>
      <section className="card">
        <div className="rows">
          {list.map((a) => (
            <div key={a.id} className={'row static ' + (a.done ? 'done' : '')}>
              <button className={'check ' + (a.done ? 'on' : '')} onClick={() => call('PUT', `/api/activities/${a.id}`, { done: !a.done })} aria-label="បញ្ចប់"><Check size={14} /></button>
              <span><b>{a.title}</b><small className="muted">{[a.roomId, a.detail].filter(Boolean).join(' · ')}</small></span>
              <button className="icon-btn" onClick={() => window.confirm('លុប?') && call('DELETE', `/api/activities/${a.id}`)} aria-label="លុប"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        {!list.length && <Empty icon={kind === 'lead' ? UserPlus : Wrench} title="មិនទាន់មានកំណត់ត្រា" />}
      </section>
      {form && (
        <Modal title={form.kind === 'lead' ? 'អ្នកចាប់អារម្មណ៍ថ្មី' : 'ការថែទាំថ្មី'} onClose={() => setForm(null)}>
          <form className="stack-form" onSubmit={async (e) => { e.preventDefault(); if (await call('POST', '/api/activities', form, 'បានរក្សាទុក')) setForm(null); }}>
            <div className="form-grid">
              <Field label="ចំណងជើង" wide><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus placeholder={form.kind === 'lead' ? 'ឈ្មោះ · ទូរស័ព្ទ' : 'ឧ. ម៉ាស៊ីនត្រជាក់ខូច'} /></Field>
              <Field label="បន្ទប់"><select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}><option value="">—</option>{state.rooms.map((r) => <option key={r.id}>{r.id}</option>)}</select></Field>
              <Field label="ព័ត៌មានបន្ថែម"><input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></Field>
            </div>
            <div className="form-actions"><button className="btn primary">រក្សាទុក</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
