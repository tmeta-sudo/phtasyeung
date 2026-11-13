import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import { useApp, useFmt, Empty } from '../ui.jsx';
import { kmDigits } from '../../shared/khmer.js';

const MONTHS_KM = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
};

/**
 * Grouped/single bar chart in SVG: thin bars with 4px rounded tops anchored to the baseline,
 * recessive grid, hover tooltip per month. `series` = [{ key, label, cls }].
 */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Bars({ data, series, fmt, label, height = 220 }) {
  const [hover, setHover] = useState(null);
  const [ref, measured] = useWidth();
  const W = Math.max(280, measured || 640); const H = height; const L = 52; const B = 26; const T = 10;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key] || 0))));
  const step = (W - L - 8) / data.length;
  const bw = Math.max(3, Math.min(16, (step - 8) / series.length - 2));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const bar = (x, v) => {
    const top = y(v); const h = H - B - top;
    if (h <= 0.5) return null;
    const r = Math.min(4, h, bw / 2);
    return `M${x},${H - B}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${H - B}Z`;
  };
  return (
    <div className="viz-wrap" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="viz">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} className="viz-grid" /><text x={L - 8} y={y(t) + 4} className="viz-axis" textAnchor="end">{fmt(t, true)}</text></g>)}
        {data.map((d, i) => {
          const x0 = L + i * step + (step - bw * series.length - 2 * (series.length - 1)) / 2;
          return (
            <g key={d.m}>
              {series.map((s, j) => { const p = bar(x0 + j * (bw + 2), d[s.key] || 0); return p && <path key={s.key} d={p} className={'viz-bar ' + s.cls + (hover != null && hover !== i ? ' dim' : '')} />; })}
              <text x={L + i * step + step / 2} y={H - 8} className="viz-axis" textAnchor="middle">{step < 34 ? kmDigits(String(i + 1)) : MONTHS_KM[i].slice(0, 3)}</text>
              <rect x={L + i * step} y={T} width={step} height={H - T - B + 20} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="viz-tip" style={{ left: `${((L + hover * step + step / 2) / W) * 100}%` }}>
          <b>{MONTHS_KM[hover]}</b>
          {series.map((s) => <span key={s.key}><i className={'viz-key ' + s.cls} />{s.label}<em>{fmt(data[hover][s.key] || 0)}</em></span>)}
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const { state, print } = useApp();
  const { $, n } = useFmt();
  const years = useMemo(() => [...new Set([state.today.ym.slice(0, 4), ...state.invoices.map((i) => i.month.slice(0, 4))])].sort().reverse(), [state]);
  const [year, setYear] = useState(years[0]);

  const r = useMemo(() => {
    const months = MONTHS_KM.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const rows = months.map((m) => {
      const inv = state.invoices.filter((i) => i.month === m);
      const billed = inv.reduce((a, i) => a + (+i.total || 0), 0);
      const collected = inv.filter((i) => i.status === 'paid').reduce((a, i) => a + (+i.total || 0), 0);
      const mt = state.meters.filter((x) => x.month === m);
      return {
        m, billed, collected, outstanding: billed - collected, rooms: new Set(inv.map((i) => i.roomId)).size,
        water: mt.reduce((a, x) => a + Math.max(0, x.water - x.oldWater), 0),
        electric: mt.reduce((a, x) => a + Math.max(0, x.electric - x.oldElectric), 0),
      };
    });
    const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
    const owed = new Map();
    for (const i of state.invoices) {
      if (i.status === 'paid') continue;
      const cur = owed.get(i.tenantId) || { name: i.name, room: i.roomId, count: 0, amount: 0, oldest: i.month };
      cur.count += 1; cur.amount += +i.total || 0; if (i.month < cur.oldest) cur.oldest = i.month;
      owed.set(i.tenantId, cur);
    }
    const occupied = state.tenants.filter((t) => t.status === 'active' && t.roomId).length;
    return {
      rows, billed: sum('billed'), collected: sum('collected'), outstanding: sum('outstanding'),
      owed: [...owed.values()].sort((a, b) => b.amount - a.amount), occupied, rooms: state.rooms.length,
      hasUtility: rows.some((x) => x.water || x.electric),
    };
  }, [state, year]);

  const rate = r.billed ? Math.round((r.collected / r.billed) * 100) : 0;
  const money = (v, short) => (short && v >= 1000 ? `$${n(Math.round(v / 100) / 10)}k` : $(v));
  const ym = (m) => `${MONTHS_KM[+m.slice(5) - 1]} ${kmDigits(m.slice(0, 4))}`;

  function exportCsv() {
    downloadCsv(`report-${year}.csv`, [
      ['ខែ', 'ចេញវិក្កយបត្រ (USD)', 'បានប្រមូល (USD)', 'នៅជំពាក់ (USD)', 'បន្ទប់មានវិក្កយបត្រ', 'ទឹក (m³)', 'ភ្លើង (kWh)'],
      ...r.rows.map((x) => [x.m, x.billed.toFixed(2), x.collected.toFixed(2), x.outstanding.toFixed(2), x.rooms, x.water, x.electric]),
      ['សរុប', r.billed.toFixed(2), r.collected.toFixed(2), r.outstanding.toFixed(2), '', '', ''],
      [], ['អតិថិជនជំពាក់', 'បន្ទប់', 'ចំនួនវិក្កយបត្រ', 'សរុប (USD)', 'តាំងពីខែ'],
      ...r.owed.map((o) => [o.name, o.room, o.count, o.amount.toFixed(2), o.oldest]),
    ]);
  }

  const MonthTable = () => (
    <table className="tbl report-tbl">
      <thead><tr><th>ខែ</th><th>ចេញវិក្កយបត្រ</th><th>បានប្រមូល</th><th>នៅជំពាក់</th><th>បន្ទប់</th>{r.hasUtility && <><th>ទឹក m³</th><th>ភ្លើង kWh</th></>}</tr></thead>
      <tbody>{r.rows.filter((x) => x.billed || x.water || x.electric).map((x) => (
        <tr key={x.m}><td>{ym(x.m)}</td><td>{$(x.billed)}</td><td>{$(x.collected)}</td><td className={x.outstanding > 0 ? 'warn-text' : ''}>{$(x.outstanding)}</td><td>{n(x.rooms)}</td>{r.hasUtility && <><td>{n(x.water)}</td><td>{n(x.electric)}</td></>}</tr>
      ))}</tbody>
      <tfoot><tr><td>សរុប</td><td>{$(r.billed)}</td><td>{$(r.collected)}</td><td>{$(r.outstanding)}</td><td /> {r.hasUtility && <><td /><td /></>}</tr></tfoot>
    </table>
  );

  return (
    <>
      <div className="page-head">
        <h1>របាយការណ៍</h1>
        <div className="row-btns">
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="ឆ្នាំ">{years.map((y) => <option key={y} value={y}>{kmDigits(y)}</option>)}</select>
          <button className="btn ghost" onClick={exportCsv}><Download size={16} /> Excel</button>
          <button className="btn ghost" onClick={() => print(<div className="report-print"><h2>{state.settings.propertyName} — របាយការណ៍ឆ្នាំ {kmDigits(year)}</h2><MonthTable /></div>)}><Printer size={16} /> បោះពុម្ព</button>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="card stat"><small>ចេញវិក្កយបត្រ {kmDigits(year)}</small><b>{$(r.billed)}</b></div>
        <div className="card stat"><small>បានប្រមូល</small><b>{$(r.collected)}</b><span className="muted small">{n(rate)}% នៃវិក្កយបត្រ</span></div>
        <div className="card stat"><small>នៅជំពាក់ (គ្រប់ឆ្នាំ)</small><b>{$(r.owed.reduce((a, o) => a + o.amount, 0))}</b><span className="muted small">{n(r.owed.length)} នាក់</span></div>
        <div className="card stat"><small>អត្រាជួល (ឥឡូវ)</small><b>{n(r.rooms ? Math.round((r.occupied / r.rooms) * 100) : 0)}%</b><span className="muted small">{n(r.occupied)}/{n(r.rooms)} បន្ទប់</span></div>
      </div>

      {!r.billed && !r.hasUtility ? <Empty icon={BarChart3} title="មិនទាន់មានទិន្នន័យសម្រាប់ឆ្នាំនេះ">ចេញវិក្កយបត្រ ឬកត់កុងទ័រ ហើយរបាយការណ៍នឹងបង្ហាញនៅទីនេះ។</Empty> : (
        <div className="report-grid">
          <section className="card wide-card">
            <div className="viz-head"><h3 className="sec-title">ចំណូលប្រចាំខែ</h3>
              <div className="viz-legend"><span><i className="viz-key s1" />ចេញវិក្កយបត្រ</span><span><i className="viz-key s2" />បានប្រមូល</span></div></div>
            <Bars data={r.rows} series={[{ key: 'billed', label: 'ចេញវិក្កយបត្រ', cls: 's1' }, { key: 'collected', label: 'បានប្រមូល', cls: 's2' }]} fmt={money} label="ចំណូលប្រចាំខែ" />
          </section>
          {r.hasUtility && (
            <>
              <section className="card"><h3 className="sec-title">ការប្រើប្រាស់ទឹក (m³)</h3><Bars data={r.rows} series={[{ key: 'water', label: 'ទឹក', cls: 's1' }]} fmt={(v) => n(Math.round(v))} label="ការប្រើប្រាស់ទឹក" height={180} /></section>
              <section className="card"><h3 className="sec-title">ការប្រើប្រាស់ភ្លើង (kWh)</h3><Bars data={r.rows} series={[{ key: 'electric', label: 'ភ្លើង', cls: 's1' }]} fmt={(v) => n(Math.round(v))} label="ការប្រើប្រាស់ភ្លើង" height={180} /></section>
            </>
          )}
          <section className="card wide-card"><h3 className="sec-title">តារាងប្រចាំខែ</h3><div className="tbl-scroll"><MonthTable /></div></section>
        </div>
      )}

      <section className="card report-owed">
        <h3 className="sec-title">អតិថិជនដែលនៅជំពាក់</h3>
        {r.owed.length ? (
          <div className="tbl-scroll"><table className="tbl">
            <thead><tr><th>អតិថិជន</th><th>បន្ទប់</th><th>វិក្កយបត្រ</th><th>តាំងពី</th><th>សរុប</th></tr></thead>
            <tbody>{r.owed.map((o) => <tr key={o.name + o.room}><td>{o.name}</td><td>{o.room}</td><td>{n(o.count)}</td><td>{ym(o.oldest)}</td><td><b>{$(o.amount)}</b></td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted">🎉 គ្មាននរណាជំពាក់ទេ</p>}
      </section>
    </>
  );
}
