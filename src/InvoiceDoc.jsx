import React from 'react';
import { QR } from './ui.jsx';
import { usd, khr, num, monthKm, dateKm, lunarKm, usdInWords } from '../shared/khmer.js';

/** Printable Khmer invoice (A5). Used by the admin app and the customer portal. */
export default function InvoiceDoc({ inv, property, khmer = true }) {
  const n = (v) => num(v, khmer);
  return (
    <article className="invoice-doc">
      <header>
        <div>
          <h1 className="moul">វិក្កយបត្រ</h1>
          <p className="en">INVOICE</p>
        </div>
        <div className="inv-prop">
          <b>{property.name}</b>
          {property.nameEn && <small>{property.nameEn}</small>}
          {property.address && <small>{property.address}</small>}
          {property.phone && <small>☎ {n(property.phone)}</small>}
        </div>
      </header>
      <div className="inv-meta">
        <div><span>អតិថិជន</span><b>{inv.name}</b></div>
        <div><span>បន្ទប់</span><b>{inv.roomId}</b></div>
        <div><span>លេខវិក្កយបត្រ</span><b>{inv.number}</b></div>
        <div><span>សម្រាប់</span><b>{monthKm(inv.month, khmer)}</b></div>
        <div><span>ថ្ងៃចេញ</span><b>{dateKm(inv.issuedAt, khmer)}</b></div>
        <div><span>ថ្ងៃផុតកំណត់</span><b>{dateKm(inv.dueDate, khmer)}</b></div>
      </div>
      <table>
        <thead><tr><th>បរិយាយ</th><th>ចំនួន</th><th>តម្លៃឯកតា</th><th>សរុប</th></tr></thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i}>
              <td>{it.label}{it.from !== undefined && <small> ({n(it.from)} → {n(it.to)})</small>}</td>
              <td>{n(it.qty)} {it.unit}</td>
              <td>{it.rate !== undefined ? usd(it.rate, khmer) : ''}</td>
              <td>{usd(it.amount, khmer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="inv-bottom">
        <div className="inv-pay">
          {inv.khqr && inv.status !== 'paid' ? (
            <div className="khqr-box">
              <div className="khqr-head">KHQR</div>
              <QR value={inv.khqr} size={132} label="KHQR" />
              <small>ស្កេនបង់តាមធនាគារណាមួយ</small>
            </div>
          ) : inv.status === 'paid' ? <div className="paid-stamp">បានបង់<small>PAID</small></div> : null}
        </div>
        <div className="inv-totals">
          <div><span>សរុប (USD)</span><b className="grand">{usd(inv.total, khmer)}</b></div>
          <div><span>ប្រហែលជារៀល (អត្រា {n(inv.rate)})</span><b>{khr(inv.totalKhr, khmer)}</b></div>
          <p className="words">ជាអក្សរ៖ {usdInWords(inv.total)}</p>
        </div>
      </div>
      <footer>
        <span>{lunarKm(inv.issuedAt)}</span>
        <span>សូមអរគុណ! 🙏</span>
      </footer>
    </article>
  );
}
