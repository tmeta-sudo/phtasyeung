import React from 'react';
import { QR } from './ui.jsx';
import { usd, khr, num, monthKm, dateKm, lunarKm, usdInWords } from '../shared/khmer.js';

export const DEFAULT_DESIGN = {
  blocks: ['header', 'meta', 'items', 'totals', 'payment', 'address', 'note', 'footer'],
  hidden: [], accent: '#1f5bff', titleFont: 'Moul', size: 'a5', radius: 16, headerStyle: 'line',
  note: 'សូមបង់ប្រាក់មុនថ្ងៃផុតកំណត់។ សូមអរគុណ! 🙏', showLunar: true, showWords: true, showRiel: true,
};

export const BLOCK_LABELS = {
  header: 'ក្បាល (ឈ្មោះ និងចំណងជើង)', meta: 'ព័ត៌មានអតិថិជន / លេខ / ថ្ងៃ', items: 'តារាងថ្លៃ', totals: 'សរុប',
  payment: 'KHQR បង់ប្រាក់', address: 'អាសយដ្ឋាន និងផែនទី', note: 'កំណត់ចំណាំ', footer: 'បាតកថា (ថ្ងៃចន្ទគតិ)',
};

const mapsLink = (loc) => (Number.isFinite(loc?.lat) ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : '');

/**
 * Printable / exportable Khmer invoice. Layout comes from the landlord's design:
 * block order, hidden blocks, accent colour, title font, paper size and header style.
 */
export default function InvoiceDoc({ inv, property, khmer = true, design: d0, innerRef }) {
  const d = { ...DEFAULT_DESIGN, ...(d0 || {}) };
  const n = (v) => num(v, khmer);
  const hidden = new Set(d.hidden);
  const order = d.blocks.filter((b) => !hidden.has(b));
  const showPay = inv.khqr && inv.status !== 'paid';
  const map = mapsLink(property.location);
  const addr = property.addressText || property.address;

  const blocks = {
    header: (
      <header key="header" className={'ivd-header hs-' + d.headerStyle}>
        <div>
          <h1 style={{ fontFamily: `'${d.titleFont}', 'Kantumruy Pro', serif` }}>{inv.kind === 'movein' ? 'វិក្កយបត្រចូលស្នាក់នៅ' : 'វិក្កយបត្រ'}</h1>
          <p className="en">INVOICE · {inv.number}</p>
        </div>
        <div className="inv-prop">
          <b>{property.name}</b>
          {property.nameEn && <small>{property.nameEn}</small>}
          {property.phone && <small>☎ {n(property.phone)}</small>}
        </div>
      </header>
    ),
    meta: (
      <div key="meta" className="inv-meta">
        <div><span>អតិថិជន</span><b>{inv.name}</b></div>
        <div><span>បន្ទប់</span><b>{inv.roomId}</b></div>
        <div><span>សម្រាប់</span><b>{inv.kind === 'movein' ? 'ចូលស្នាក់នៅ' : monthKm(inv.month, khmer)}</b></div>
        <div><span>ថ្ងៃចេញ</span><b>{dateKm(inv.issuedAt, khmer)}</b></div>
        <div><span>ថ្ងៃផុតកំណត់</span><b>{dateKm(inv.dueDate, khmer)}</b></div>
        <div><span>ស្ថានភាព</span><b className={inv.status === 'paid' ? 'paid-t' : ''}>{inv.status === 'paid' ? (inv.paidVia === 'carried' ? 'ផ្ទេរទៅខែក្រោយ' : 'បានបង់ ✓') : inv.paid > 0 ? 'បង់ខ្លះ' : 'មិនទាន់បង់'}</b></div>
      </div>
    ),
    items: (
      <table key="items">
        <thead><tr><th>បរិយាយ</th><th>ចំនួន</th><th>តម្លៃឯកតា</th><th>សរុប</th></tr></thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i}>
              <td>{it.label}{it.from !== undefined && <small> ({n(it.from)} → {n(it.to)})</small>}{it.note && <small className="tier-note">{it.note}</small>}</td>
              <td>{n(it.qty)} {it.unit}</td>
              <td>{it.rate !== undefined ? usd(it.rate, khmer) : ''}</td>
              <td>{usd(it.amount, khmer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    totals: (
      <div key="totals" className="inv-totals">
        <div className="grand-row"><span>សរុប</span><b className="grand">{usd(inv.total, khmer)}</b></div>
        {d.showRiel && <div><span>ប្រហែលជារៀល (អត្រា {n(inv.rate)})</span><b>{khr(inv.totalKhr, khmer)}</b></div>}
        {d.showWords && <p className="words">ជាអក្សរ៖ {usdInWords(inv.total)}</p>}
        {inv.status !== 'paid' && inv.paid > 0 && <><div><span>បានបង់រួច</span><b>−{usd(inv.paid, khmer)}</b></div><div className="grand-row"><span>នៅសល់ត្រូវបង់</span><b className="grand">{usd(inv.balance, khmer)}</b></div></>}
        {inv.status === 'paid' && <div className="paid-stamp">បានបង់<small>PAID</small></div>}
      </div>
    ),
    payment: showPay ? (
      <div key="payment" className="ivd-pay">
        <div className="khqr-box">
          <div className="khqr-head">KHQR</div>
          <QR value={inv.khqr} size={d.size === 'receipt' ? 150 : 132} label="KHQR" />
          <small>ស្កេនបង់តាមធនាគារណាមួយ</small>
        </div>
        <div className="ivd-pay-text"><b>{usd(inv.total, khmer)}</b><small>ABA · ACLEDA · Wing · Bakong · …</small></div>
      </div>
    ) : null,
    address: addr || map ? (
      <div key="address" className="ivd-address">
        <div><span>📍 អាសយដ្ឋាន</span><p>{addr}</p></div>
        {map && <div className="ivd-map"><QR value={map} size={64} label="Google Maps" /><small>ផែនទី</small></div>}
      </div>
    ) : null,
    note: d.note ? <p key="note" className="ivd-note">{d.note}</p> : null,
    footer: (
      <footer key="footer">
        {d.showLunar && <span>{lunarKm(inv.issuedAt)}</span>}
        <span>{property.name}</span>
      </footer>
    ),
  };

  return (
    <article ref={innerRef} className={`invoice-doc sz-${d.size}`} style={{ '--ivd': d.accent, '--ivr': `${d.radius}px` }}>
      {order.map((b) => blocks[b])}
    </article>
  );
}

/** Property details for invoices, from settings (incl. map location and full Khmer address). */
export function invoiceProperty(s) {
  const L = s.location || {};
  const addressText = [L.houseNo && `ផ្ទះលេខ ${L.houseNo}`, L.street && `ផ្លូវ ${L.street}`, L.addressText || s.address].filter(Boolean).join(', ');
  return { name: s.propertyName, nameEn: s.propertyNameEn, phone: s.phone, address: s.address, addressText, location: L };
}
