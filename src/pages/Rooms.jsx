import React, { useState } from 'react';
import { curSymbol, getClientCurrency } from '../../shared/khmer.js';
import { uploadFile } from '../api.js';
import { FeaturePicker, FeatureIcons } from '../AddonsPicker.jsx';
import { Plus, Pencil, Trash2, Gauge, QrCode, DoorOpen, Droplets, Zap, Printer, Building2 } from 'lucide-react';
import BuildingWizard, { Building3D } from './BuildingWizard.jsx';
import { useApp, useFmt, navigate, Modal, Field, Avatar, tenantPhoto, Empty, QR } from '../ui.jsx';
import { matchesQuery } from '../../shared/khmer.js';

export default function Rooms() {
  const { state, call, openMeter, openCustomerForm, base, print } = useApp();
  const { n, $ } = useFmt();
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [qr, setQr] = useState(null);
  const [wizard, setWizard] = useState(false);
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
          <button className="btn ghost" onClick={() => setWizard(true)}><Building2 size={16} /> បង្កើតអគារ</button>
          <button className="btn primary" onClick={() => setEdit({ id: '', building: state.rooms.at(-1)?.building || '', floor: '', rent: '', water: 0, electric: 0, extras: [] })}><Plus size={16} /> បន្ថែមបន្ទប់</button>
        </div>
      </div>
      <p className="lunar-line">{n(state.rooms.length - vacant)} កំពុងជួល · {n(vacant)} ទំនេរ</p>
      {!state.rooms.length && (
        <button className="card empty-build" onClick={() => setWizard(true)}>
          <Building2 size={30} /><b>បង្កើតអគាររបស់អ្នកក្នុង ១ នាទី</b><span className="muted">ជ្រើសប្រភេទ ចំនួនជាន់ និងរបៀបដាក់លេខ — មើលជា 3D មុននឹងបង្កើត</span>
        </button>
      )}
      <BuildingViews tenantIn={tenantIn} onPick={(id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
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
              <FeatureIcons ids={r.features} />
              {state.tenants.filter((x) => x.roomId === r.id && x.status === 'active').map((x) => (
                <button key={x.id} className="room-tenant" onClick={() => navigate('/customers/' + x.id)}><Avatar name={x.nameKm || x.nameEn} src={tenantPhoto(x)} size={30} /><span>{x.nameKm || x.nameEn}<small>{n(x.phone)}</small></span></button>
              ))}
              {state.tenants.filter((x) => x.roomId === r.id && x.status === 'active').length < (r.capacity || 1) && (
                <button className="room-tenant add" onClick={() => openCustomerForm(null, { roomId: r.id })}><Plus size={16} /> {t ? `បន្ថែមអ្នករួមបន្ទប់ (${n(state.tenants.filter((x) => x.roomId === r.id && x.status === 'active').length)}/${n(r.capacity)})` : 'បន្ថែមអ្នកជួល'}</button>
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
      {wizard && <BuildingWizard onClose={() => setWizard(false)} />}
      {qr && (
        <Modal title={`QR បន្ទប់ ${qr.id}`} sub="បិទលើទ្វារ — បុគ្គលិកស្កេនដើម្បីកត់កុងទ័រ ឬមើលព័ត៌មាន" onClose={() => setQr(null)}>
          <div className="center-col"><QR value={`${base}/scan/room/${encodeURIComponent(qr.id)}`} size={220} /><code className="muted">{`${base}/scan/room/${qr.id}`}</code>
            <button className="btn primary" onClick={() => print(<StickerSheet rooms={[qr]} base={base} name={state.settings.propertyName} />)}><Printer size={16} /> បោះពុម្ព</button></div>
        </Modal>
      )}
    </>
  );
}

/** 3D occupancy view of each building created with the designer. */
function BuildingViews({ tenantIn, onPick }) {
  const { state } = useApp();
  const { n } = useFmt();
  const owed = new Set(state.invoices.filter((i) => i.status !== 'paid').map((i) => i.roomId));
  const views = (state.settings.buildings || []).map((b) => {
    const rooms = state.rooms.filter((r) => r.buildingId === b.id);
    const byFloor = new Map();
    for (const r of rooms) { const k = r.floor || '1'; byFloor.set(k, [...(byFloor.get(k) || []), r]); }
    const grid = [...byFloor.entries()].sort((a, c) => Number(c[0]) - Number(a[0]) || c[0].localeCompare(a[0]))
      .map(([, list]) => list.sort((a, c) => a.id.localeCompare(c.id, undefined, { numeric: true })).map((r) => ({ id: r.id, floor: r.floor })));
    return { b, grid, rooms };
  }).filter((v) => v.rooms.length);
  if (!views.length) return null;
  const status = (id) => (owed.has(id) ? 'due' : tenantIn(id) ? 'occ' : 'free');
  return (
    <div className="building-views">
      {views.map(({ b, grid, rooms }) => (
        <section key={b.id} className="card building-view">
          <div className="bv-head"><b>{b.name}</b><span className="muted">{n(rooms.filter((r) => tenantIn(r.id)).length)}/{n(rooms.length)} កំពុងជួល</span></div>
          <Building3D grid={grid} type={b.type} color={b.color} statusOf={status} onPick={(u) => onPick(u.id)} label={rooms.length <= 120} />
          <div className="legend"><span><i className="lg-occ" /> កំពុងជួល</span><span><i className="lg-due" /> មិនទាន់បង់</span><span><i className="lg-free" /> ទំនេរ</span></div>
        </section>
      ))}
    </div>
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
  const [f, setF] = useState({ ...room, extras: room.extras || [], features: room.features || [] });
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
          <Field label={`ថ្លៃជួល (${curSymbol(getClientCurrency())}/ខែ)`}><input type="number" min="0" step="any" value={f.rent} onChange={(e) => set('rent', e.target.value)} required /></Field>
          <Field label="លេខកុងទ័រទឹកបច្ចុប្បន្ន (m³)"><input type="number" min="0" step="any" value={f.water} onChange={(e) => set('water', e.target.value)} /></Field>
          <Field label="លេខកុងទ័រភ្លើងបច្ចុប្បន្ន (kWh)"><input type="number" min="0" step="any" value={f.electric} onChange={(e) => set('electric', e.target.value)} /></Field>
          <Field label="ចំនួនអ្នកស្នាក់នៅអតិបរមា" hint="១ = ជួលម្នាក់។ ច្រើនជាង ១ = ជួលរួមគ្នា (វិក្កយបត្រមួយ ផ្ញើទៅគ្រប់គ្នា)"><input type="number" min="1" max="20" inputMode="numeric" value={f.capacity ?? 1} onChange={(e) => set('capacity', e.target.value)} /></Field>
        </div>
        {room.originalId && <RoomPhotos roomId={room.originalId} />}
        <fieldset>
          <legend>គ្រឿងបរិក្ខារក្នុងបន្ទប់</legend>
          <FeaturePicker value={f.features} onChange={(v) => set('features', v)} />
        </fieldset>
        <fieldset>
          <legend>ថ្លៃផ្សេងៗប្រចាំខែសម្រាប់បន្ទប់នេះ</legend>
          <p className="muted small">ចំណតម៉ូតូ/ឡាន Wi-Fi… ធីកតាមអតិថិជនម្នាក់ៗវិញ (សេវាបន្ថែម)។</p>
          {f.extras.map((x, i) => (
            <div key={i} className="extra-row">
              <input value={x.label} onChange={(e) => setExtra(i, 'label', e.target.value)} placeholder="ឈ្មោះ" aria-label="ឈ្មោះ" />
              <input type="number" min="0" step="any" value={x.amount} onChange={(e) => setExtra(i, 'amount', e.target.value)} placeholder={curSymbol(getClientCurrency())} aria-label="ចំនួន" />
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

/** Photos of a room (shown on the public vacant-rooms page). */
function RoomPhotos({ roomId }) {
  const { state, call, setState, notify } = useApp();
  const room = state.rooms.find((r) => r.id === roomId);
  const [busy, setBusy] = useState(false);
  const photos = room?.photos || [];
  async function add(files) {
    setBusy(true);
    try { for (const f of [...files].slice(0, 8 - photos.length)) setState(await uploadFile(`/api/rooms/${encodeURIComponent(roomId)}/photos`, f)); } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }
  return (
    <fieldset>
      <legend>រូបបន្ទប់ (សម្រាប់ទំព័របន្ទប់ទំនេរ)</legend>
      <div className="room-photos">
        {photos.map((p) => (
          <span key={p.id} className="rp">
            <img src={`/api/rooms/${encodeURIComponent(roomId)}/photos/${p.id}`} alt="" />
            <button type="button" aria-label="លុប" onClick={() => call('DELETE', `/api/rooms/${encodeURIComponent(roomId)}/photos/${p.id}`)}>×</button>
          </span>
        ))}
        {photos.length < 8 && <label className="rp add">{busy ? '…' : '＋ រូប'}<input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} /></label>}
      </div>
    </fieldset>
  );
}
