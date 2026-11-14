import React, { useState } from 'react';
import { Gauge, Send, Phone, BellRing, Check, ChevronRight } from 'lucide-react';
import { useApp, useFmt, navigate, billedOf, collectedOf } from '../ui.jsx';
import { greetingKm, monthKm, dateKm } from '../../shared/khmer.js';

export const simpleMode = {
  get: () => { try { return localStorage.getItem('py-simple') === '1'; } catch { return false; } },
  set: (on) => { try { if (on) localStorage.setItem('py-simple', '1'); else localStorage.removeItem('py-simple'); } catch { /* ignore */ } },
};

/**
 * Simple mode: everything a landlord does in a month on one screen, with big buttons and big text.
 * 1) read meters  2) send bills  3) see who has not paid  4) see what came in.
 */
export default function SimpleHome({ onFull }) {
  const { state, call, openInvoice } = useApp();
  const { $, n, k } = useFmt();
  const [showAll, setShowAll] = useState(false);
  const ym = state.today.ym;
  const active = state.tenants.filter((t) => t.status === 'active' && t.roomId);
  const rooms = [...new Set(active.map((t) => t.roomId))];
  const metersLeft = rooms.filter((id) => !state.meters.some((m) => m.roomId === id && m.month === ym)).length;
  const inv = state.invoices.filter((i) => i.month === ym);
  const noInvoice = rooms.filter((id) => !inv.some((i) => i.roomId === id)).length;
  const unsent = inv.filter((i) => !i.sentAt && i.status !== 'paid').length;
  const claimed = state.invoices.filter((i) => i.status === 'claimed');
  const unpaid = state.invoices.filter((i) => i.status === 'unpaid').sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueDate.localeCompare(b.dueDate));
  const billed = inv.reduce((a, i) => a + billedOf(i), 0);
  const got = Math.min(billed, inv.reduce((a, i) => a + collectedOf(i), 0));
  const phoneOf = (i) => state.tenants.find((t) => t.id === i.tenantId)?.phone;
  const canSend = (i) => state.bot.running && state.tenants.some((t) => (i.tenantIds || [i.tenantId]).includes(t.id) && t.telegram?.chatId);
  const sendAll = () => {
    if (!window.confirm(noInvoice ? `បង្កើតវិក្កយបត្រ ${noInvoice} បន្ទប់ ហើយផ្ញើតាម Telegram?` : `ផ្ញើវិក្កយបត្រ ${unsent} តាម Telegram?`)) return;
    if (noInvoice) call('POST', '/api/invoices/generate', { send: true }, (r) => `បានបង្កើត ${r.result.created} · ផ្ញើ ${r.result.sent?.ok ?? 0}`);
    else call('POST', '/api/invoices/send-month', { month: ym }, 'បានផ្ញើ ✅');
  };

  return (
    <div className="simple-home">
      <h1>{greetingKm(state.today.hour)}!</h1>
      <p className="sh-date">{dateKm(state.today.ymd, k)} · {state.settings.propertyName}</p>

      <div className="sh-money">
        <small>បានទទួល {monthKm(ym, k).replace(/ ឆ្នាំ.*/, '')}</small>
        <b>{$(got)}</b>
        <span>ពី {$(billed)} · នៅសល់ <em>{$(Math.max(0, billed - got))}</em></span>
        <div className="sh-bar"><i style={{ width: `${billed ? Math.round((got / billed) * 100) : 0}%` }} /></div>
      </div>

      {claimed.length > 0 && (
        <section className="sh-block warn">
          <h2>💸 អតិថិជនប្រាប់ថាបានបង់ ({n(claimed.length)})</h2>
          {claimed.map((i) => (
            <div key={i.id} className="sh-row">
              <button className="sh-who" onClick={() => openInvoice(i.id)}><b>បន្ទប់ {i.roomId}</b><span>{i.name} · {$(i.balance ?? i.total)}</span></button>
              <button className="sh-act ok" onClick={() => call('PUT', `/api/invoices/${i.id}`, { status: 'paid' }, `បានទទួល ${$(i.balance ?? i.total)} ✅`)}><Check size={22} /> បានទទួល</button>
            </div>
          ))}
        </section>
      )}

      <div className="sh-tiles">
        <button className="sh-tile" onClick={() => navigate('/meters')}>
          <span className="sh-ico"><Gauge size={30} /></span>
          <b>កត់កុងទ័រ</b>
          <small>{metersLeft ? `នៅសល់ ${n(metersLeft)} បន្ទប់` : '✓ កត់រួចអស់ហើយ'}</small>
        </button>
        <button className="sh-tile" onClick={sendAll} disabled={!noInvoice && !unsent}>
          <span className="sh-ico blue"><Send size={30} /></span>
          <b>ផ្ញើវិក្កយបត្រ</b>
          <small>{noInvoice ? `${n(noInvoice)} បន្ទប់មិនទាន់មាន` : unsent ? `${n(unsent)} មិនទាន់ផ្ញើ` : '✓ ផ្ញើរួចអស់ហើយ'}</small>
        </button>
      </div>

      <section className="sh-block">
        <h2>⏳ មិនទាន់បង់ ({n(unpaid.length)})</h2>
        {!unpaid.length && <p className="sh-empty">🎉 គ្រប់គ្នាបានបង់រួចហើយ</p>}
        {(showAll ? unpaid : unpaid.slice(0, 6)).map((i) => (
          <div key={i.id} className={'sh-row ' + (i.overdue ? 'late' : '')}>
            <button className="sh-who" onClick={() => openInvoice(i.id)}><b>បន្ទប់ {i.roomId}</b><span>{i.name}</span><em>{$(i.balance ?? i.total)}{i.overdue ? ' · ហួសកំណត់' : ''}</em></button>
            {phoneOf(i) && <a className="sh-act" href={`tel:${phoneOf(i).replace(/\s/g, '')}`} aria-label="ហៅទូរស័ព្ទ"><Phone size={22} /></a>}
            <button className="sh-act" disabled={!canSend(i)} aria-label="រំលឹក" onClick={() => call('POST', `/api/invoices/${i.id}/send`, { reminder: !!i.sentAt }, 'បានរំលឹក 🔔')}><BellRing size={22} /></button>
            <button className="sh-act ok" aria-label="បានបង់" onClick={() => window.confirm(`បន្ទប់ ${i.roomId} បានបង់ ${$(i.balance ?? i.total)}?`) && call('PUT', `/api/invoices/${i.id}`, { status: 'paid' }, 'បានទទួល ✅')}><Check size={22} /></button>
          </div>
        ))}
        {unpaid.length > 6 && !showAll && <button className="sh-more" onClick={() => setShowAll(true)}>មើលទាំងអស់ ({n(unpaid.length)}) <ChevronRight size={18} /></button>}
      </section>

      <button className="sh-full" onClick={onFull}>ប្តូរទៅរបៀបពេញលេញ</button>
    </div>
  );
}
