import React, { useMemo, useState } from 'react';
import { Plus, Send, Download, Printer, Check, Trash2, BellRing, ReceiptText, Undo2, Pencil, Palette, Image as ImageIcon } from 'lucide-react';
import { navigate } from '../ui.jsx';
import { useApp, useFmt, Modal, StatusPill, Empty, invStatus } from '../ui.jsx';
import InvoiceDoc, { invoiceProperty } from '../InvoiceDoc.jsx';
import { nodeToPng, shareBlob } from '../exportImage.js';
import { api } from '../api.js';
import { monthKm, matchesQuery, dateKm } from '../../shared/khmer.js';

export default function Invoices() {
  const { state, call, openInvoice, print } = useApp();
  const { n, $, k } = useFmt();
  const [month, setMonth] = useState(state.today.ym);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const all = state.invoices.filter((i) => i.month === month);
  const list = useMemo(() => all.filter((i) => (filter === 'all' || invStatus(i) === filter) && matchesQuery([i.name, i.roomId, i.number], q))
    .sort((a, b) => a.roomId.localeCompare(b.roomId)), [all, filter, q]);
  const sum = (arr) => arr.reduce((s, i) => s + i.total, 0);
  const paid = all.filter((i) => i.status === 'paid');
  const unsent = all.filter((i) => !i.sentAt && i.status !== 'paid');
  const property = invoiceProperty(state.settings);
  const design = state.settings.invoiceDesign;
  const botOk = state.bot.running;

  function exportCSV() {
    const rows = [['លេខ', 'ខែ', 'បន្ទប់', 'អតិថិជន', ...['ថ្លៃជួល', 'ទឹក', 'ភ្លើង', 'ផ្សេងៗ'], 'សរុប USD', 'សរុប KHR', 'ស្ថានភាព', 'ថ្ងៃបង់']];
    for (const i of state.invoices.filter((x) => x.month === month)) {
      const by = (key) => i.items.filter((it) => (key === 'extra' ? !['rent', 'water', 'electric'].includes(it.key) : it.key === key)).reduce((s, it) => s + it.amount, 0);
      rows.push([i.number, i.month, i.roomId, i.name, by('rent'), by('water'), by('electric'), by('extra'), i.total, i.totalKhr, { paid: 'បានបង់', claimed: 'រង់ចាំបញ្ជាក់', unpaid: 'មិនទាន់បង់' }[i.status], i.paidAt ? i.paidAt.slice(0, 10) : '']);
    }
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `invoices-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <>
      <div className="page-head">
        <h1>វិក្កយបត្រ</h1>
        <div className="head-actions">
          <input className="month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="ខែ" />
          <button className="btn ghost" onClick={() => navigate('/invoices/design')}><Palette size={16} /> រចនា</button>
          <button className="btn ghost" onClick={exportCSV} disabled={!all.length}><Download size={16} /> Excel</button>
          <button className="btn ghost" onClick={() => print(<div className="print-stack">{all.map((i) => <InvoiceDoc key={i.id} inv={i} property={property} khmer={k} design={design} />)}</div>)} disabled={!all.length}><Printer size={16} /> បោះពុម្ពទាំងអស់</button>
          <button className="btn primary" onClick={() => call('POST', '/api/invoices/generate', { month, send: botOk }, (r) => `បានបង្កើត ${n(r.result.created)}${r.result.sent ? ` · ផ្ញើ Telegram ${n(r.result.sent.ok)}` : ''}`)}>
            <Plus size={16} /> បង្កើត{botOk ? ' និងផ្ញើ' : ''}
          </button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="card stat"><small>សរុប {monthKm(month, k)}</small><b>{$(sum(all))}</b><span className="muted">{n(all.length)} វិក្កយបត្រ</span></div>
        <div className="card stat"><small>បានបង់</small><b className="ok-text">{$(sum(paid))}</b><span className="muted">{n(paid.length)} បន្ទប់</span></div>
        <div className="card stat"><small>មិនទាន់បង់</small><b>{$(sum(all) - sum(paid))}</b><span className="muted">{n(all.length - paid.length)} បន្ទប់</span></div>
        <div className="card stat dark">
          <small>Telegram</small><b>{n(all.length - unsent.length)}/{n(all.length)}</b>
          <div className="stat-btns">
            <button className="btn white sm" disabled={!botOk || !unsent.length} onClick={() => call('POST', '/api/invoices/send-month', { month }, (r) => `ផ្ញើបាន ${n(r.result.ok)}${r.result.failed ? ` · បរាជ័យ ${n(r.result.failed)}` : ''}`)}><Send size={14} /> ផ្ញើ {n(unsent.length)}</button>
            <button className="btn ghost-dark sm" disabled={!botOk} onClick={() => call('POST', '/api/invoices/send-month', { month, all: true, reminder: true }, (r) => `រំលឹកបាន ${n(r.result.ok)}`)}><BellRing size={14} /> រំលឹក</button>
          </div>
        </div>
      </div>

      <div className="chips-row">
        {[['all', 'ទាំងអស់'], ['unpaid', 'មិនទាន់បង់'], ['claimed', 'រង់ចាំបញ្ជាក់'], ['overdue', 'ហួសកំណត់'], ['paid', 'បានបង់']].map(([key, label]) => (
          <button key={key} className={'tab-chip ' + (filter === key ? 'active' : '')} onClick={() => setFilter(key)}>{label} <em>{n(key === 'all' ? all.length : all.filter((i) => invStatus(i) === key).length)}</em></button>
        ))}
        <div className="search-pill grow"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ស្វែងរក…" aria-label="ស្វែងរកវិក្កយបត្រ" /></div>
      </div>

      <section className="card">
        <div className="rows">
          {list.map((i) => (
            <button key={i.id} className="row inv-row" onClick={() => openInvoice(i.id)}>
              <span className="room-tag">{i.roomId}</span>
              <span><b>{i.name}</b><small className="muted">{i.number} · ផុត {dateKm(i.dueDate, k).replace('ថ្ងៃទី', '')}{!i.hasMeter ? ' · គ្មានកុងទ័រ' : ''}</small></span>
              <span className="tg-state">{i.sentAt ? <span title="បានផ្ញើ Telegram">✈️ {i.reminders?.length ? `+${n(i.reminders.length)}` : ''}</span> : i.sendError ? <span className="danger-text" title={i.sendError}>⚠️</span> : ''}</span>
              <b>{$(i.total)}</b>
              <StatusPill inv={i} />
            </button>
          ))}
        </div>
        {!list.length && <Empty icon={ReceiptText} title="មិនទាន់មានវិក្កយបត្រ">ចុច «បង្កើត» ដើម្បីបង្កើតវិក្កយបត្រសម្រាប់គ្រប់បន្ទប់ដែលមានអ្នកជួល។ កត់កុងទ័រជាមុនសិន ដើម្បីគិតថ្លៃទឹក និងភ្លើង។</Empty>}
      </section>
    </>
  );
}

export function InvoiceModal({ id, onClose }) {
  const { state, call, print, setState, notify } = useApp();
  const { $, k } = useFmt();
  const inv = state.invoices.find((i) => i.id === id);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const docRef = React.useRef();
  if (!inv) return null;
  const tenant = state.tenants.find((t) => t.id === inv.tenantId);
  const property = invoiceProperty(state.settings);
  const design = state.settings.invoiceDesign;
  const canSend = state.bot.running && tenant?.telegram?.chatId;
  const lastClaim = inv.claims?.at(-1);

  async function saveItems() {
    if (await call('PUT', `/api/invoices/${inv.id}`, { items: editing }, 'បានកែប្រែវិក្កយបត្រ')) setEditing(null);
  }

  return (
    <Modal title={`វិក្កយបត្រ ${inv.roomId}`} sub={inv.number} onClose={onClose} wide>
      {inv.status === 'claimed' && (
        <div className="claim-banner">
          <span>💸 អតិថិជនបានជូនដំណឹងថាបានបង់ តាម{lastClaim?.source === 'portal' ? 'គេហទំព័រ' : ' Telegram'}{lastClaim?.telegramFileId ? ' (មានរូបបង្កាន់ដៃនៅក្នុង Telegram)' : ''}។</span>
          <span>
            <button className="btn ghost sm" onClick={() => call('PUT', `/api/invoices/${inv.id}`, { status: 'unpaid' }, 'បានបដិសេធ')}>មិនទាន់ទទួល</button>
            <button className="btn primary sm" onClick={() => call('PUT', `/api/invoices/${inv.id}`, { status: 'paid' }, 'បានបញ្ជាក់ការបង់ប្រាក់')}><Check size={14} /> បញ្ជាក់</button>
          </span>
        </div>
      )}
      {editing ? (
        <div className="stack-form">
          {editing.map((it, i) => (
            <div key={i} className="extra-row">
              <input value={it.label} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="បរិយាយ" />
              <input type="number" step="any" value={it.amount} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="ចំនួន" />
              <button type="button" className="icon-btn" onClick={() => setEditing(editing.filter((_, j) => j !== i))} aria-label="លុប"><Trash2 size={15} /></button>
            </div>
          ))}
          <div className="row-btns">
            <button className="btn ghost sm" onClick={() => setEditing([...editing, { key: 'extra', label: '', qty: 1, unit: '', amount: '' }])}><Plus size={14} /> ថ្លៃបន្ថែម</button>
            <button className="btn ghost sm" onClick={() => setEditing([...editing, { key: 'discount', label: 'បញ្ចុះតម្លៃ', qty: 1, unit: '', amount: '' }])}><Plus size={14} /> បញ្ចុះតម្លៃ</button>
          </div>
          <div className="form-actions"><button className="btn ghost" onClick={() => setEditing(null)}>បោះបង់</button><button className="btn primary" onClick={saveItems}>រក្សាទុក</button></div>
        </div>
      ) : (
        <InvoiceDoc inv={inv} property={property} khmer={k} design={design} innerRef={docRef} />
      )}
      {!editing && (
        <div className="modal-actions">
          <button className="btn ghost danger" onClick={() => window.confirm('លុបវិក្កយបត្រនេះ?') && call('DELETE', `/api/invoices/${inv.id}`, undefined, 'បានលុប').then((r) => r && onClose())}><Trash2 size={15} /></button>
          {inv.status !== 'paid' && <button className="btn ghost" onClick={() => setEditing(inv.items.map((x) => ({ ...x })))}><Pencil size={15} /> កែ</button>}
          <button className="btn ghost" onClick={() => print(<InvoiceDoc inv={inv} property={property} khmer={k} design={design} />)}><Printer size={15} /> បោះពុម្ព</button>
          <button className="btn ghost" disabled={!!busy} onClick={async () => { setBusy('png'); try { await shareBlob(await nodeToPng(docRef.current), `${inv.number}.png`, inv.number); } finally { setBusy(''); } }}><ImageIcon size={15} /> {busy === 'png' ? '…' : 'PNG'}</button>
          <button className="btn ghost" disabled={!canSend || !!busy} title="ផ្ញើរូបវិក្កយបត្រដែលបានរចនា ទៅ Telegram អតិថិជន"
            onClick={async () => {
              setBusy('img');
              try {
                const form = new FormData();
                form.set('file', await nodeToPng(docRef.current), `${inv.number}.png`);
                setState(await api('POST', `/api/invoices/${inv.id}/send-image`, form));
                notify('បានផ្ញើរូបវិក្កយបត្រតាម Telegram ✅');
              } catch (e) { notify(e.message, true); } finally { setBusy(''); }
            }}><Send size={15} /> {busy === 'img' ? '…' : 'ផ្ញើរូបភាព'}</button>
          <button className="btn ghost" disabled={!canSend || inv.status === 'paid'} title={canSend ? '' : 'អតិថិជនមិនទាន់ភ្ជាប់ Telegram ឬ bot មិនដំណើរការ'}
            onClick={() => call('POST', `/api/invoices/${inv.id}/send`, { reminder: !!inv.sentAt }, inv.sentAt ? 'បានផ្ញើការរំលឹក' : 'បានផ្ញើតាម Telegram')}>
            <Send size={15} /> {inv.sentAt ? 'រំលឹក' : 'ផ្ញើ Telegram'}
          </button>
          {inv.status === 'paid'
            ? <button className="btn ghost" onClick={() => call('PUT', `/api/invoices/${inv.id}`, { status: 'unpaid' }, 'បានសម្គាល់មិនទាន់បង់')}><Undo2 size={15} /> មិនទាន់បង់</button>
            : <button className="btn primary" onClick={() => call('PUT', `/api/invoices/${inv.id}`, { status: 'paid' }, `បានទទួល ${$(inv.total)}`)}><Check size={15} /> បានបង់</button>}
        </div>
      )}
    </Modal>
  );
}
