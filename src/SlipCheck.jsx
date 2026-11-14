import React, { useState } from 'react';
import { ScanSearch, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useApp, useFmt } from './ui.jsx';
import { api } from './api.js';
import { fmtMoney } from '../shared/khmer.js';

/**
 * Next to a payment claim that has a bank screenshot: read the amount and transaction number on this
 * device, compare with what is owed, and let the owner confirm with one tap.
 */
export default function SlipCheck({ inv, claim }) {
  const { state, call, setState, notify } = useApp();
  const { $, c, k } = useFmt();
  const [busy, setBusy] = useState(0);
  const slip = claim.slip;
  const url = `/api/invoices/${inv.id}/claims/${claim.id}/photo`;
  const balance = inv.balance ?? inv.total;

  async function read() {
    setBusy(0.01);
    try {
      const blob = await (await fetch(url, { credentials: 'same-origin' })).blob();
      const [{ readSlip }, { matchSlip }] = await Promise.all([import('./ocr/slip.js'), import('./ocr/slipParse.js')]);
      const parsed = await readSlip(blob, { onProgress: (p) => setBusy(Math.max(0.01, p)) });
      const m = matchSlip(parsed, { balance, currency: c, rate: state.settings.exchangeRate });
      setState(await api('POST', `/api/invoices/${inv.id}/claims/${claim.id}/slip`, { ...m, ref: parsed.ref, bank: parsed.bank }));
    } catch (e) { notify(e.message, true); } finally { setBusy(0); }
  }

  const paidText = slip?.paid ? fmtMoney(slip.paid, slip.currency, k) : '';
  return (
    <div className="slip-check">
      <a href={url} target="_blank" rel="noreferrer" className="slip-thumb"><img src={url} alt="បង្កាន់ដៃ" loading="lazy" /></a>
      <div className="slip-body">
        {!slip && !busy && <button className="btn ghost sm" onClick={read}><ScanSearch size={15} /> អានបង្កាន់ដៃ</button>}
        {busy > 0 && <span className="muted small"><Loader2 size={14} className="spin" /> កំពុងអាន… {Math.round(busy * 100)}%</span>}
        {slip && !busy && (
          <>
            {slip.status === 'match' && <b className="slip-ok"><Check size={15} /> ចំនួនត្រូវ៖ {paidText}</b>}
            {slip.status === 'partial' && <b className="slip-warn"><AlertTriangle size={15} /> បង់តែ {paidText} (នៅខ្វះ {$(balance - slip.amount)})</b>}
            {slip.status === 'mismatch' && <b className="slip-warn"><AlertTriangle size={15} /> ចំនួនមិនត្រូវ៖ {paidText} ≠ {$(balance)}</b>}
            {slip.status === 'unreadable' && <b className="muted">អានមិនច្បាស់ — សូមមើលរូប</b>}
            <small className="muted">{[slip.bank, slip.ref && `លេខប្រតិបត្តិការ ${slip.ref}`].filter(Boolean).join(' · ')}</small>
            {slip.duplicateOf && <small className="slip-dup">⚠️ លេខប្រតិបត្តិការនេះធ្លាប់ប្រើរួចលើ {slip.duplicateOf}</small>}
            <span className="row-btns">
              {slip.status === 'match' && !slip.duplicateOf && <button className="btn primary sm" onClick={() => call('POST', `/api/invoices/${inv.id}/payments`, { amount: balance, via: 'bank', ref: slip.ref, note: slip.bank }, `បានទទួល ${$(balance)} ✅`)}><Check size={14} /> បញ្ជាក់</button>}
              {slip.status === 'partial' && !slip.duplicateOf && <button className="btn primary sm" onClick={() => call('POST', `/api/invoices/${inv.id}/payments`, { amount: slip.amount, via: 'bank', ref: slip.ref, note: slip.bank }, `បានកត់ ${$(slip.amount)}`)}>កត់ {$(slip.amount)}</button>}
              <button className="btn ghost sm" onClick={read}>អានម្តងទៀត</button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
