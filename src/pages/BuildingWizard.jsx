import React, { useMemo, useRef, useState } from 'react';
import { Building2, Home, Rows3, Warehouse, ArrowLeft, ArrowRight, Sparkles, Check, RotateCcw } from 'lucide-react';
import { useApp, useFmt, Modal, Field } from '../ui.jsx';

export const TYPES = [
  ['apartment', 'អាផាតមិន / អគារច្រើនជាន់', 'បន្ទប់ជាច្រើនក្នុងជាន់នីមួយៗ', Building2],
  ['row', 'បន្ទប់ជួលជាជួរ', 'បន្ទប់ជាប់គ្នាមួយជាន់ ឬពីរជាន់', Rows3],
  ['flat', 'ផ្ទះល្វែង', 'ផ្ទះល្វែងច្រើនខ្នងជាប់គ្នា (ជួលទាំងខ្នង ឬម្តងមួយជាន់)', Warehouse],
  ['house', 'ផ្ទះមួយខ្នង', 'ផ្ទះតែមួយ មានបន្ទប់ជួលខាងក្នុង', Home],
];

const SCHEMES = [
  ['hundreds', '101, 102 … 201', (f, i) => `${f}${String(i).padStart(2, '0')}`],
  ['prefixHundreds', 'A-101, A-102 …', (f, i, p) => `${p}-${f}${String(i).padStart(2, '0')}`],
  ['floorLetter', '1A, 1B … 2A', (f, i) => `${f}${String.fromCharCode(64 + i)}`],
  ['letterFloor', 'A1, A2 … B1', (f, i) => `${String.fromCharCode(64 + f + 1)}${i}`],
  ['sequential', '1, 2, 3 …', (f, i, p, n) => `${p ? `${p}-` : ''}${n}`],
];
const FLAT_SCHEMES = [
  ['flatFloor', 'L1-1, L1-2 … (ខ្នង-ជាន់)', (u, f) => `L${u}-${f}`],
  ['flatWhole', 'ល្វែង 1, 2, 3 … (ជួលទាំងខ្នង)', (u) => `L${u}`],
  ['prefixFlat', 'A1, A2 … (អក្សរ + លេខខ្នង)', (u, f, p) => `${p}${u}${f > 1 ? `-${f}` : ''}`],
];

/** Builds the grid of units: rows = floors (top first), cols = units on that floor. */
export function planRooms(cfg) {
  const floors = [];
  const ground = cfg.groundIsZero ? 0 : 1;
  if (cfg.type === 'flat') {
    const [, , fmt] = FLAT_SCHEMES.find(([k]) => k === cfg.scheme) || FLAT_SCHEMES[0];
    const whole = cfg.scheme === 'flatWhole';
    const levels = whole ? 1 : cfg.floors;
    for (let f = levels; f >= 1; f--) {
      const row = [];
      for (let u = 1; u <= cfg.perFloor; u++) row.push({ id: fmt(u, f, cfg.prefix || 'A'), floor: whole ? '' : String(f), unit: u });
      floors.push(row);
    }
    return floors;
  }
  const [, , fmt] = SCHEMES.find(([k]) => k === cfg.scheme) || SCHEMES[0];
  const levels = cfg.type === 'house' ? 1 : cfg.floors;
  let n = 0;
  const all = [];
  for (let f = 0; f < levels; f++) {
    const row = [];
    for (let i = 1; i <= cfg.perFloor; i++) { n += 1; row.push({ id: fmt(f + ground, i, cfg.prefix || 'A', n), floor: String(f + ground), unit: i }); }
    all.push(row);
  }
  return all.reverse();
}

/** CSS-3D building: drag to rotate; tap a unit to toggle it. */
export function Building3D({ grid, type = 'apartment', color = '#1f5bff', excluded = new Set(), onToggle, statusOf, label = true, onPick }) {
  const [rot, setRot] = useState(-28);
  const drag = useRef(null);
  const cols = Math.max(1, ...grid.map((r) => r.length));
  const unitW = Math.max(26, Math.min(64, 520 / cols));
  const floorH = Math.max(26, Math.min(54, 300 / Math.max(1, grid.length)));
  const depth = type === 'flat' ? unitW * 1.6 : Math.max(60, unitW * 1.8);
  const W = cols * unitW;
  const H = grid.length * floorH;
  return (
    <div className="b3d-stage"
      onPointerDown={(e) => { drag.current = { x: e.clientX, r: rot }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { if (drag.current) setRot(Math.max(-75, Math.min(75, drag.current.r + (e.clientX - drag.current.x) * 0.4))); }}
      onPointerUp={() => { drag.current = null; }}
      style={{ '--accent': color }}>
      <div className="b3d-scene" style={{ transform: `rotateX(-14deg) rotateY(${rot}deg)`, width: W, height: H + 16 }}>
        {/* roof */}
        <div className="b3d-face roof" style={{ width: W, height: depth, transform: `translateY(${-depth / 2}px) rotateX(90deg) translateZ(${0}px)` }} />
        {/* front with units */}
        <div className="b3d-face front" style={{ width: W, height: H, transform: `translateZ(${depth / 2}px)` }}>
          {grid.map((row, r) => (
            <div key={r} className="b3d-floor" style={{ height: floorH }}>
              {row.map((u) => {
                const off = excluded.has(u.id);
                const st = statusOf?.(u.id);
                return (
                  <button key={u.id} type="button" className={`b3d-unit ${off ? 'off' : ''} ${st ? 'st-' + st : ''} ${type === 'flat' ? 'flat' : ''}`} style={{ width: unitW }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => (onPick ? onPick(u) : onToggle?.(u.id))} title={u.id}>
                    <i />{label && <span>{u.id}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {/* side */}
        <div className="b3d-face side" style={{ width: depth, height: H, transform: `translateX(${W - depth / 2}px) rotateY(90deg)` }}>
          {grid.map((_, r) => <div key={r} className="b3d-side-floor" style={{ height: floorH }} />)}
        </div>
        <div className="b3d-face side left" style={{ width: depth, height: H, transform: `translateX(${-depth / 2}px) rotateY(-90deg)` }} />
        {/* ground shadow */}
        <div className="b3d-shadow" style={{ width: W + 60, height: depth + 60, transform: `translate(-30px, ${H - depth / 2 - 30}px) rotateX(90deg)` }} />
      </div>
      <div className="b3d-hint"><RotateCcw size={13} /> អូសដើម្បីបង្វិល</div>
    </div>
  );
}

export default function BuildingWizard({ onClose }) {
  const { state, call } = useApp();
  const { n, $ } = useFmt();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState({
    type: 'apartment', name: `អគារ ${String.fromCharCode(65 + (state.settings.buildings?.length || 0))}`, floors: 4, perFloor: 5,
    scheme: 'prefixHundreds', prefix: String.fromCharCode(65 + (state.settings.buildings?.length || 0)), groundIsZero: false,
    rent: 120, topDelta: 0, color: '#1f5bff',
  });
  const [excluded, setExcluded] = useState(new Set());
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const grid = useMemo(() => planRooms(cfg), [cfg]);
  const existing = new Set(state.rooms.map((r) => r.id));
  const rooms = useMemo(() => grid.slice().reverse().flatMap((row, fi) => row.filter((u) => !excluded.has(u.id)).map((u) => ({
    id: u.id, floor: u.floor, rent: Math.max(0, +cfg.rent + (+cfg.topDelta || 0) * fi), water: 0, electric: 0,
  }))), [grid, excluded, cfg.rent, cfg.topDelta]);
  const dupes = rooms.filter((r) => existing.has(r.id)).length;
  const toggle = (id) => setExcluded((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  async function create() {
    const r = await call('POST', '/api/rooms/bulk', {
      building: { name: cfg.name, type: cfg.type, floors: cfg.type === 'house' ? 1 : cfg.floors, perFloor: cfg.perFloor, scheme: cfg.scheme, color: cfg.color },
      rooms,
    }, (res) => `បានបង្កើត ${n(res.result.added)} បន្ទប់${res.result.skipped ? ` · រំលង ${n(res.result.skipped)} (មានរួចហើយ)` : ''}`);
    if (r) onClose();
  }

  const isFlat = cfg.type === 'flat';
  const schemes = isFlat ? FLAT_SCHEMES : SCHEMES;
  return (
    <Modal title="បង្កើតអគារ និងបន្ទប់" sub={['១. ប្រភេទ', '២. ទំហំ និងលេខបន្ទប់', '៣. តម្លៃ និងពិនិត្យ'][step]} onClose={onClose} wide>
      <div className="wizard">
        <div className="wizard-preview">
          <Building3D grid={grid} type={cfg.type} color={cfg.color} excluded={excluded} onToggle={toggle} label={grid.flat().length <= 120} />
          <p className="muted small center">{n(rooms.length)} បន្ទប់ · ចុចលើបន្ទប់ដើម្បីដកចេញ (ឧ. ជណ្តើរ ឬបន្ទប់ម្ចាស់ផ្ទះ)</p>
        </div>
        <div className="wizard-form">
          {step === 0 && (
            <div className="type-grid">
              {TYPES.map(([k, l, d, Icon]) => (
                <button key={k} type="button" className={'type-card ' + (cfg.type === k ? 'on' : '')}
                  onClick={() => setCfg((c) => ({ ...c, type: k, scheme: k === 'flat' ? 'flatFloor' : c.scheme.startsWith('flat') ? 'prefixHundreds' : c.scheme, floors: k === 'row' ? 1 : k === 'house' ? 1 : k === 'flat' ? 3 : c.floors, perFloor: k === 'flat' ? 4 : k === 'house' ? 4 : c.perFloor }))}>
                  <Icon size={24} /><b>{l}</b><small>{d}</small>
                </button>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="stack-form">
              <div className="form-grid">
                <Field label="ឈ្មោះអគារ"><input value={cfg.name} onChange={(e) => set('name', e.target.value)} /></Field>
                <Field label="ពណ៌"><input type="color" value={cfg.color} onChange={(e) => set('color', e.target.value)} /></Field>
                {cfg.type !== 'house' && <Field label={isFlat ? 'ចំនួនជាន់ក្នុងមួយខ្នង' : 'ចំនួនជាន់'}><Stepper value={cfg.floors} min={1} max={isFlat ? 8 : 30} onChange={(v) => set('floors', v)} /></Field>}
                <Field label={isFlat ? 'ចំនួនខ្នង (ល្វែង)' : cfg.type === 'house' ? 'ចំនួនបន្ទប់' : 'បន្ទប់ក្នុងមួយជាន់'}><Stepper value={cfg.perFloor} min={1} max={isFlat ? 20 : 40} onChange={(v) => set('perFloor', v)} /></Field>
              </div>
              <b className="small-title">របៀបដាក់លេខបន្ទប់</b>
              <div className="scheme-list">
                {schemes.map(([k, l]) => (
                  <label key={k} className={'scheme ' + (cfg.scheme === k ? 'on' : '')}>
                    <input type="radio" name="scheme" checked={cfg.scheme === k} onChange={() => set('scheme', k)} /> {l}
                  </label>
                ))}
              </div>
              <div className="form-grid">
                {['prefixHundreds', 'sequential', 'prefixFlat'].includes(cfg.scheme) && <Field label="អក្សរនាំមុខ"><input value={cfg.prefix} maxLength={4} onChange={(e) => set('prefix', e.target.value.toUpperCase())} /></Field>}
                {!isFlat && cfg.type !== 'house' && <label className="switch-row small"><input type="checkbox" checked={cfg.groundIsZero} onChange={(e) => set('groundIsZero', e.target.checked)} /><span>ជាន់ផ្ទាល់ដី = ជាន់ ០</span></label>}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="stack-form">
              <div className="form-grid">
                <Field label="ថ្លៃជួលមូលដ្ឋាន ($/ខែ)"><input type="number" min="0" value={cfg.rent} onChange={(e) => set('rent', e.target.value)} /></Field>
                {!isFlat && cfg.floors > 1 && <Field label="បូក/ដក តាមជាន់នីមួយៗ ($)" hint="ឧ. -5 = ជាន់ខ្ពស់ថោកជាង"><input type="number" value={cfg.topDelta} onChange={(e) => set('topDelta', e.target.value)} /></Field>}
              </div>
              <div className="room-chips">
                {rooms.slice(0, 80).map((r) => <span key={r.id} className={existing.has(r.id) ? 'dupe' : ''}>{r.id}<small>{$(r.rent)}</small></span>)}
                {rooms.length > 80 && <span>+{n(rooms.length - 80)}</span>}
              </div>
              {dupes > 0 && <p className="form-warn">⚠️ {n(dupes)} លេខបន្ទប់មានរួចហើយ ហើយនឹងត្រូវរំលង។</p>}
            </div>
          )}
          <div className="form-actions">
            {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> ថយក្រោយ</button>}
            {step < 2 && <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>បន្ទាប់ <ArrowRight size={15} /></button>}
            {step === 2 && <button type="button" className="btn primary" onClick={create} disabled={!rooms.length}><Sparkles size={15} /> បង្កើត {n(rooms.length)} បន្ទប់</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Stepper({ value, min, max, onChange }) {
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(+v || min)));
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clamp(value - 1))} aria-label="ដក">−</button>
      <input type="number" inputMode="numeric" value={value} min={min} max={max} onChange={(e) => onChange(clamp(e.target.value))} />
      <button type="button" onClick={() => onChange(clamp(value + 1))} aria-label="បូក">+</button>
    </div>
  );
}

export { Check };
