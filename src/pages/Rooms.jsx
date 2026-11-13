import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Gauge, QrCode, DoorOpen, Droplets, Zap, Printer } from 'lucide-react';
import { useApp, useFmt, navigate, Modal, Field, Avatar, tenantPhoto, Empty, QR } from '../ui.jsx';
import { matchesQuery } from '../../shared/khmer.js';

export default function Rooms() {
  const { state, call, openMeter, openCustomerForm, base, print } = useApp();
  const { n, $ } = useFmt();
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [qr, setQr] = useState(null);
  const tenantIn = (id) => state.tenants.find((t) => t.roomId === id && t.status === 'active');
  const rooms = state.rooms.filter((r) => matchesQuery([r.id, r.building, tenantIn(r.id)?.nameKm], q));
  const vacant = state.rooms.filter((r) => !tenantIn(r.id)).length;

  return (
    <>
      <div className="page-head">
        <h1>បន្ទប់ <span className="h-count">{n(state.rooms.length)}</span></h1>
        <div className="head-actions">
          <div className="search-pill"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ស្វែងរកបន្ទប់…" aria-label="ស្វែងរកបន្ទប់" /></div>
          <button className="btn ghost" onClick={() => print(<StickerSheet rooms={state.rooms} base={base} name={state.settings.propertyName} />)}><Printer size={16} /> បោះពុម្ព QR ទ្វារ</button>
          <button className="btn primary" onClick={() => setEdit({ id: '', building: state.rooms.at(-1)?.building || '', floor: '', rent: '', water: 0, electric: 0, extras: [] })}><Plus size={16} /> បន្ថែមបន្ទប់</button>
        </div>
      </div>
      <p className="lunar-line">{n(state.rooms.length - vacant)} កំពុងជួល · {n(vacant)} ទំនេរ</p>
      <div className="room-grid">
        {rooms.map((r) => {
          const t = tenantIn(r.id);
          return (
            <div key={r.id} id={r.id} className={'card room-card ' + (t ? '' : 'vacant')}>
              <div className="room-head">
                <span className="room-no">{r.id}</span>
                <span className={'pill ' + (t ? 'ok' : 'muted')}><i />{t ? 'កំពុងជួល' : 'ទំនេរ'}</span>
              </div>
              <small className="muted">{r.building}{r.floor ? ` · ជាន់ ${n(r.floor)}` : ''}</small>
              <b className="room-rent">{$(r.rent)}<small>/ខែ</small></b>
              {t ? (
                <button className="room-tenant" onClick={() => navigate('/customers/' + t.id)}><Avatar name={t.nameKm} src={tenantPhoto(t)} size={30} /><span>{t.nameKm}<small>{n(t.phone)}</small></span></button>
              ) : (
                <button className="room-tenant add" onClick={() => openCustomerForm(null, { roomId: r.id })}><Plus size={16} /> បន្ថែមអ្នកជួល</button>
              )}
              <div className="room-meters"><span><Droplets size={13} /> {n(r.water)} m³</span><span><Zap size={13} /> {n(r.electric)} kWh</span></div>
              <div className="room-actions">
                <button className="icon-btn" onClick={() => openMeter(r.id)} title="កត់កុងទ័រ" aria-label="កត់កុងទ័រ"><Gauge size={16} /></button>
                <button className="icon-btn" onClick={() => setQr(r)} title="QR" aria-label="QR"><QrCode size={16} /></button>
                <button className="icon-btn" onClick={() => setEdit({ ...r, originalId: r.id })} title="កែប្រែ" aria-label="កែប្រែ"><Pencil size={16} /></button>
                <button className="icon-btn" onClick={() => window.confirm(`លុបបន្ទប់ ${r.id}?`) && call('DELETE', `/api/rooms/${encodeURIComponent(r.id)}`, undefined, 'បានលុបបន្ទប់')} title="លុប" aria-label="លុប"><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {!rooms.length && <Empty icon={DoorOpen} title="មិនទាន់មានបន្ទប់" />}
      {edit && <RoomForm room={edit} onClose={() => setEdit(null)} />}
      {qr && (
        <Modal title={`QR បន្ទប់ ${qr.id}`} sub="បិទលើទ្វារ — បុគ្គលិកស្កេនដើម្បីកត់កុងទ័រ ឬមើលព័ត៌មាន" onClose={() => setQr(null)}>
          <div className="center-col"><QR value={`${base}/scan/room/${encodeURIComponent(qr.id)}`} size={220} /><code className="muted">{`${base}/scan/room/${qr.id}`}</code>
            <button className="btn primary" onClick={() => print(<StickerSheet rooms={[qr]} base={base} name={state.settings.propertyName} />)}><Printer size={16} /> បោះពុម្ព</button></div>
        </Modal>
      )}
    </>
  );
}

export function StickerSheet({ rooms, base, name }) {
  return (
    <div className="print-sheet sticker-grid">
      {rooms.map((r) => (
        <div key={r.id} className="sticker">
          <QR value={`${base}/scan/room/${encodeURIComponent(r.id)}`} size={150} />
          <b>{r.id}</b><small>{name} · {r.building}</small>
        </div>
      ))}
    </div>
  );
}

function RoomForm({ room, onClose }) {
  const { call } = useApp();
  const [f, setF] = useState({ ...room, extras: room.extras || [] });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setExtra = (i, k, v) => set('extras', f.extras.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  async function submit(e) {
    e.preventDefault();
    const res = room.originalId
      ? await call('PUT', `/api/rooms/${encodeURIComponent(room.originalId)}`, f, 'បានរក្សាទុកបន្ទប់')
      : await call('POST', '/api/rooms', f, 'បានបន្ថែមបន្ទប់');
    if (res) onClose();
  }
  return (
    <Modal title={room.originalId ? `កែប្រែបន្ទប់ ${room.originalId}` : 'បន្ថែមបន្ទប់'} onClose={onClose}>
      <form onSubmit={submit} className="stack-form">
        <div className="form-grid">
          <Field label="លេខបន្ទប់ *"><input value={f.id} onChange={(e) => set('id', e.target.value)} disabled={!!room.originalId} required autoFocus /></Field>
          <Field label="អគារ"><input value={f.building} onChange={(e) => set('building', e.target.value)} placeholder="អគារ A" /></Field>
          <Field label="ជាន់"><input value={f.floor} onChange={(e) => set('floor', e.target.value)} /></Field>
          <Field label="ថ្លៃជួល ($/ខែ)"><input type="number" min="0" step="any" value={f.rent} onChange={(e) => set('rent', e.target.value)} required /></Field>
          <Field label="លេខកុងទ័រទឹកបច្ចុប្បន្ន (m³)"><input type="number" min="0" step="any" value={f.water} onChange={(e) => set('water', e.target.value)} /></Field>
          <Field label="លេខកុងទ័រភ្លើងបច្ចុប្បន្ន (kWh)"><input type="number" min="0" step="any" value={f.electric} onChange={(e) => set('electric', e.target.value)} /></Field>
        </div>
        <fieldset>
          <legend>ថ្លៃផ្សេងៗប្រចាំខែ (សំរាម ចំណតម៉ូតូ អ៊ីនធឺណិត…)</legend>
          {f.extras.map((x, i) => (
            <div key={i} className="extra-row">
              <input value={x.label} onChange={(e) => setExtra(i, 'label', e.target.value)} placeholder="ឈ្មោះ" aria-label="ឈ្មោះ" />
              <input type="number" min="0" step="any" value={x.amount} onChange={(e) => setExtra(i, 'amount', e.target.value)} placeholder="$" aria-label="ចំនួន" />
              <button type="button" className="icon-btn" onClick={() => set('extras', f.extras.filter((_, j) => j !== i))} aria-label="លុប"><Trash2 size={15} /></button>
            </div>
          ))}
          {f.extras.length < 6 && <button type="button" className="btn ghost sm" onClick={() => set('extras', [...f.extras, { label: '', amount: '' }])}><Plus size={14} /> បន្ថែម</button>}
        </fieldset>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>បោះបង់</button><button className="btn primary">រក្សាទុក</button></div>
      </form>
    </Modal>
  );
}
