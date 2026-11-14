import React, { useState } from 'react';
import { Gauge, Droplets, Zap, Trash2, Check } from 'lucide-react';
import { useApp, useFmt, Modal, Field, Empty } from '../ui.jsx';
import { monthKm } from '../../shared/khmer.js';
import MeterPhoto from '../MeterPhoto.jsx';
import { api, uploadFile } from '../api.js';

export default function Meters() {
  const { state, call } = useApp();
  const { n, k } = useFmt();
  const [month, setMonth] = useState(state.today.ym);
  const [rows, setRows] = useState({});
  const tenantIn = (id) => state.tenants.find((t) => t.roomId === id && t.status === 'active');
  const done = (id) => state.meters.find((m) => m.roomId === id && m.month === month);
  const groups = state.settings.sharedMeters || [];
  const sharedKind = (id, kind) => groups.find((g) => g.kind === kind && g.rooms.includes(id));
  const sharedDone = (g) => (state.sharedReadings || []).find((x) => x.groupId === g.id && x.month === month);
  const [gv, setGv] = useState({});

  const { setState } = useApp();
  const role = state.account?.role || 'owner';
  async function saveRow(r) {
    const v = rows[r.id] || {};
    const res = await call('POST', '/api/meters', { roomId: r.id, month, water: sharedKind(r.id, 'water') ? '' : v.water, electric: sharedKind(r.id, 'electric') ? '' : v.electric }, `បានកត់ ${r.id}`);
    if (!res) return;
    setRows((x) => ({ ...x, [r.id]: undefined }));
    // Upload the meter photos as proof (after the reading exists).
    const m = res.meters.find((x) => x.roomId === r.id && x.month === month);
    for (const kind of ['water', 'electric']) {
      if (m && v['photo_' + kind]) { try { setState(await uploadFile(`/api/meters/${m.id}/photo/${kind}`, v['photo_' + kind])); } catch { /* reading saved anyway */ } }
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>កត់កុងទ័រ</h1>
        <div className="head-actions"><input className="month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="ខែ" /></div>
      </div>
      {role !== 'staff' && (
        <label className="switch-row small auto-approve"><input type="checkbox" checked={!!state.settings.autoApproveReadings} onChange={(e) => call('PUT', '/api/settings', { autoApproveReadings: e.target.checked })} />
          <span><b>ទទួលយកលេខពីអតិថិជនដោយស្វ័យប្រវត្តិ</b><small>បើការប្រើប្រាស់ធម្មតា (ប្រៀបធៀបនឹង ៣ ខែមុន)។ ប្លែកពេក → រង់ចាំអ្នកពិនិត្យ។</small></span></label>
      )}
      {(state.meterSubmissions || []).length > 0 && (
        <section className="card from-tenants">
          <h3 className="sec-title">📟 លេខពីអតិថិជន ({n(state.meterSubmissions.length)})</h3>
          {state.meterSubmissions.map((x) => (
            <div key={x.id} className="sub-row">
              <span><b>{x.roomId} · {x.name}</b><small className="muted">💧 {n(x.oldWater)} → <b>{n(x.water)}</b> (+{n(x.water - x.oldWater)}) · ⚡ {n(x.oldElectric)} → <b>{n(x.electric)}</b> (+{n(x.electric - x.oldElectric)}) · {x.source === 'telegram' ? 'Telegram' : 'គេហទំព័រ'}</small>
                {Object.keys(x.photos || {}).map((kind) => <a key={kind} className="mp-thumb" href={`/api/meter-submissions/${x.id}/photo/${kind}`} target="_blank" rel="noreferrer">📷 {kind === 'water' ? 'ទឹក' : 'ភ្លើង'}</a>)}
              </span>
              <span className="row-btns">
                <button className="btn ghost sm" onClick={() => call('POST', `/api/meter-submissions/${x.id}/reject`, {}, 'បានបដិសេធ')}>✖</button>
                <button className="btn primary sm" onClick={() => call('POST', `/api/meter-submissions/${x.id}/approve`, {}, `បានកត់ ${x.roomId}`)}><Check size={14} /> ទទួលយក</button>
              </span>
            </div>
          ))}
        </section>
      )}
      <p className="lunar-line">{monthKm(month, k)} · កត់រួច {n(state.rooms.filter((r) => done(r.id)).length)}/{n(state.rooms.length)} · វាយលេខថ្មី ហើយចុច Enter</p>
      <section className="card">
        <div className="meter-table">
          <div className="mt-head"><span>បន្ទប់</span><span><Droplets size={14} /> ទឹក (m³)</span><span><Zap size={14} /> ភ្លើង (kWh)</span><span /></div>
          {state.rooms.map((r) => {
            const m = done(r.id);
            const v = rows[r.id] || {};
            const set = (key, val) => setRows((x) => ({ ...x, [r.id]: { ...v, [key]: val } }));
            return (
              <form key={r.id} className={'mt-row ' + (m ? 'done' : '')} onSubmit={(e) => { e.preventDefault(); saveRow(r); }}>
                <span><b>{r.id}</b><small className="muted">{tenantIn(r.id)?.nameKm || 'ទំនេរ'}</small></span>
                {m ? (
                  <>
                    <span>{n(m.oldWater)} → <b>{n(m.water)}</b> <small className="muted">(+{n(m.water - m.oldWater)})</small>{m.photos?.water && <a className="mp-thumb" href={`/api/meters/${m.id}/photo/water`} target="_blank" rel="noreferrer">📷</a>}</span>
                    <span>{n(m.oldElectric)} → <b>{n(m.electric)}</b> <small className="muted">(+{n(m.electric - m.oldElectric)})</small>{m.photos?.electric && <a className="mp-thumb" href={`/api/meters/${m.id}/photo/electric`} target="_blank" rel="noreferrer">📷</a>}</span>
                    <button type="button" className="icon-btn" onClick={() => window.confirm('លុបកំណត់ត្រានេះ?') && call('DELETE', `/api/meters/${m.id}`, undefined, 'បានលុប')} aria-label="លុប"><Trash2 size={15} /></button>
                  </>
                ) : (
                  <>
                    {sharedKind(r.id, 'water') ? <span className="mt-shared">💧 កុងទ័ររួម {sharedKind(r.id, 'water').name}</span>
                      : <span className="mt-input"><small>ចាស់ {n(r.water)} <MeterPhoto previous={r.water} has={!!v.photo_water} onPick={(x) => set('water', x)} onPhoto={(f) => set('photo_water', f)} /></small><input type="number" inputMode="decimal" min={r.water} step="any" value={v.water ?? ''} onChange={(e) => set('water', e.target.value)} required aria-label={`ទឹក ${r.id}`} /></span>}
                    {sharedKind(r.id, 'electric') ? <span className="mt-shared">⚡ កុងទ័ររួម {sharedKind(r.id, 'electric').name}</span>
                      : <span className="mt-input"><small>ចាស់ {n(r.electric)} <MeterPhoto previous={r.electric} has={!!v.photo_electric} onPick={(x) => set('electric', x)} onPhoto={(f) => set('photo_electric', f)} /></small><input type="number" inputMode="decimal" min={r.electric} step="any" value={v.electric ?? ''} onChange={(e) => set('electric', e.target.value)} required aria-label={`ភ្លើង ${r.id}`} /></span>}
                    <button className="icon-btn primary" aria-label="រក្សាទុក"><Check size={16} /></button>
                  </>
                )}
              </form>
            );
          })}
        </div>
        {!state.rooms.length && <Empty icon={Gauge} title="មិនទាន់មានបន្ទប់" />}
      </section>
      {groups.length > 0 && (
        <section className="card">
          <h3 className="sec-title">កុងទ័ររួម</h3>
          <div className="meter-table">
            {groups.map((g) => {
              const d = sharedDone(g);
              return (
                <form key={g.id} className={'mt-row ' + (d ? 'done' : '')} onSubmit={async (e) => { e.preventDefault(); if (await call('POST', '/api/meters/shared', { groupId: g.id, month, value: gv[g.id] }, `បានកត់ ${g.name}`)) setGv((x) => ({ ...x, [g.id]: '' })); }}>
                  <span><b>{g.kind === 'water' ? '💧' : '⚡'} {g.name}</b><small className="muted">{g.rooms.join(', ')}</small></span>
                  {d ? (
                    <>
                      <span>{n(d.old)} → <b>{n(d.value)}</b> <small className="muted">(+{n(d.value - d.old)})</small></span>
                      <span />
                      <button type="button" className="icon-btn" onClick={() => window.confirm('លុបកំណត់ត្រានេះ?') && call('DELETE', `/api/meters/shared/${d.id}`, undefined, 'បានលុប')} aria-label="លុប"><Trash2 size={15} /></button>
                    </>
                  ) : (
                    <>
                      <span className="mt-input"><small>ចាស់ {n(g.reading)}</small><input type="number" inputMode="decimal" min={g.reading} step="any" value={gv[g.id] ?? ''} onChange={(e) => setGv((x) => ({ ...x, [g.id]: e.target.value }))} required aria-label={g.name} /></span>
                      <span />
                      <button className="icon-btn primary" aria-label="រក្សាទុក"><Check size={16} /></button>
                    </>
                  )}
                </form>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

export function MeterModal({ roomId, onClose }) {
  const { state, call } = useApp();
  const { n } = useFmt();
  const [f, setF] = useState({ roomId: roomId || state.rooms[0]?.id || '', month: state.today.ym, water: '', electric: '' });
  const room = state.rooms.find((r) => r.id === f.roomId);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    if (await call('POST', '/api/meters', f, 'បានរក្សាទុកលេខកុងទ័រ')) onClose();
  }
  return (
    <Modal title="កត់លេខកុងទ័រ" sub={room ? `បន្ទប់ ${room.id}` : ''} onClose={onClose}>
      <form onSubmit={submit} className="stack-form">
        <div className="form-grid">
          <Field label="បន្ទប់"><select value={f.roomId} onChange={(e) => set('roomId', e.target.value)}>{state.rooms.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}</select></Field>
          <Field label="ខែ"><input type="month" value={f.month} onChange={(e) => set('month', e.target.value)} required /></Field>
          <Field label={`ទឹកថ្មី (ចាស់ ${n(room?.water ?? 0)} m³)`} hint={f.water !== '' ? `ប្រើ ${n(Math.max(0, f.water - (room?.water || 0)))} m³` : ''}>
            <input type="number" inputMode="decimal" min={room?.water} step="any" value={f.water} onChange={(e) => set('water', e.target.value)} required autoFocus />
          </Field>
          <Field label={`ភ្លើងថ្មី (ចាស់ ${n(room?.electric ?? 0)} kWh)`} hint={f.electric !== '' ? `ប្រើ ${n(Math.max(0, f.electric - (room?.electric || 0)))} kWh` : ''}>
            <input type="number" inputMode="decimal" min={room?.electric} step="any" value={f.electric} onChange={(e) => set('electric', e.target.value)} required />
          </Field>
        </div>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>បោះបង់</button><button className="btn primary">រក្សាទុក</button></div>
      </form>
    </Modal>
  );
}
