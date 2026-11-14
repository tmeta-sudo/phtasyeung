import React from 'react';
import { GENDERS, ID_TYPES, dateKm, kmDigits, MONTHS_KM, fmtMoney, moneyInWords } from '../../shared/khmer.js';
import { collectedOf, billedOf } from '../ui.jsx';

const labelOf = (list, v) => list.find((x) => x[0] === v)?.[1] || '';

/**
 * List of everyone staying at the property, to hand to the village chief or sangkat/commune police.
 * A plain, complete list — local authorities may also ask for their own form.
 */
export function ResidentList({ state }) {
  const st = state.settings;
  const k = st.khmerNumerals;
  const n = (v) => (k ? kmDigits(v ?? '') : String(v ?? ''));
  const people = state.tenants.filter((t) => t.status === 'active' && t.roomId).sort((a, b) => String(a.roomId).localeCompare(String(b.roomId), undefined, { numeric: true }));
  const addr = st.location?.addressText || st.address || '';
  return (
    <div className="printout">
      <p className="po-kingdom">ព្រះរាជាណាចក្រកម្ពុជា<br /><span>ជាតិ សាសនា ព្រះមហាក្សត្រ</span></p>
      <h1>បញ្ជីឈ្មោះអ្នកស្នាក់នៅ</h1>
      <p className="po-sub">{st.propertyName}{addr ? ` · ${addr}` : ''}<br />ម្ចាស់ផ្ទះ៖ {st.ownerName || '……………………'} · ទូរស័ព្ទ៖ {n(st.phone) || '……………'} · ចំនួន {n(people.length)} នាក់ · {dateKm(state.today.ymd, k)}</p>
      <table>
        <thead><tr><th>ល.រ</th><th>បន្ទប់</th><th>នាមត្រកូល និងនាម</th><th>ភេទ</th><th>ថ្ងៃខែឆ្នាំកំណើត</th><th>អត្តសញ្ញាណប័ណ្ណ / លិខិតឆ្លងដែន</th><th>មុខរបរ</th><th>ទូរស័ព្ទ</th><th>ថ្ងៃចូលនៅ</th></tr></thead>
        <tbody>
          {people.map((t, i) => (
            <tr key={t.id}>
              <td>{n(i + 1)}</td><td>{t.roomId}</td>
              <td>{t.nameKm}{t.nameEn ? <small>{t.nameEn}</small> : null}</td>
              <td>{labelOf(GENDERS, t.gender)}</td>
              <td>{t.dob ? dateKm(t.dob, k).replace('ថ្ងៃទី', '') : ''}</td>
              <td>{t.idNumber ? <>{n(t.idNumber)}<small>{labelOf(ID_TYPES, t.idType)}</small></> : ''}</td>
              <td>{t.occupation}</td><td>{n(t.phone)}</td>
              <td>{t.contract?.start ? dateKm(t.contract.start, k).replace('ថ្ងៃទី', '') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="po-signs"><div>បានឃើញ និងទទួលស្គាល់<br />មេភូមិ / ប៉ុស្តិ៍នគរបាលរដ្ឋបាល</div><div>ថ្ងៃទី ……… ខែ ……… ឆ្នាំ ………<br />ហត្ថលេខាម្ចាស់ផ្ទះ</div></div>
    </div>
  );
}

/** Rent received per month for one year — a record to give to whoever prepares the tax filing. */
export function IncomeSummary({ state, year }) {
  const st = state.settings;
  const k = st.khmerNumerals; const c = st.currency === 'KHR' ? 'KHR' : 'USD';
  const $ = (v) => fmtMoney(v, c, k);
  const n = (v) => (k ? kmDigits(v ?? '') : String(v ?? ''));
  const rows = MONTHS_KM.map((name, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const inv = state.invoices.filter((x) => x.month === m);
    const exp = (state.expenses || []).filter((e) => e.date.slice(0, 7) === m).reduce((a, e) => a + e.amount, 0);
    return { name, rooms: new Set(inv.map((x) => x.roomId)).size, billed: inv.reduce((a, x) => a + billedOf(x), 0), received: inv.reduce((a, x) => a + collectedOf(x), 0), exp };
  });
  const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
  return (
    <div className="printout">
      <h1>សង្ខេបចំណូលពីការជួល ឆ្នាំ {n(year)}</h1>
      <p className="po-sub">{st.propertyName}{st.address ? ` · ${st.address}` : ''}<br />ម្ចាស់៖ {st.ownerName || '……………………'} · រូបិយប័ណ្ណ៖ {c === 'KHR' ? 'រៀល (៛)' : 'ដុល្លារ ($)'} · អត្រា {n(st.exchangeRate)} ៛/$</p>
      <table>
        <thead><tr><th>ខែ</th><th>បន្ទប់មានវិក្កយបត្រ</th><th>ចេញវិក្កយបត្រ</th><th>បានទទួលជាក់ស្តែង</th><th>ចំណាយ</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{n(r.rooms)}</td><td>{$(r.billed)}</td><td>{$(r.received)}</td><td>{$(r.exp)}</td></tr>)}</tbody>
        <tfoot><tr><td>សរុប</td><td /><td>{$(sum('billed'))}</td><td>{$(sum('received'))}</td><td>{$(sum('exp'))}</td></tr></tfoot>
      </table>
      <p className="po-words">ចំណូលបានទទួលសរុប៖ <b>{$(sum('received'))}</b> ({moneyInWords(sum('received'), c)})</p>
      <p className="po-note">ឯកសារនេះជាកំណត់ត្រាដែលបង្កើតចេញពីកម្មវិធី «ផ្ទះយើង» សម្រាប់ជាឯកសារយោង។ វាមិនមែនជាលិខិតប្រកាសពន្ធទេ។</p>
      <div className="po-signs"><div /><div>ថ្ងៃទី ……… ខែ ……… ឆ្នាំ ………<br />ហត្ថលេខាម្ចាស់ផ្ទះ</div></div>
    </div>
  );
}
