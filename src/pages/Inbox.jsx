import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Wrench, Send, Check, Loader, Inbox as InboxIcon, ArrowLeft, Megaphone } from 'lucide-react';
import NoticeModal from '../NoticeModal.jsx';
import { useApp, useFmt, Avatar, tenantPhoto, Empty, navigate } from '../ui.jsx';

const STATUS = { open: ['ថ្មី', 'warn'], progress: ['កំពុងដោះស្រាយ', 'muted'], done: ['រួចរាល់', 'ok'] };
const when = (iso) => new Date(iso).toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'short', timeStyle: 'short' });

/** Messages and maintenance reports that tenants sent through the Telegram bot. */
export default function Inbox() {
  const { state, call } = useApp();
  const { n } = useFmt();
  const [filter, setFilter] = useState('open');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [sel, setSel] = useState(() => new URLSearchParams(location.search).get('t') || '');
  const tickets = useMemo(() => [...(state.tickets || [])]
    .filter((t) => filter === 'all' || (filter === 'open' ? t.status !== 'done' : t.status === 'done'))
    .sort((a, b) => (b.unread || 0) - (a.unread || 0) || b.updatedAt.localeCompare(a.updatedAt)), [state.tickets, filter]);
  const current = state.tickets?.find((t) => t.id === sel);

  useEffect(() => { if (current?.unread) call('PUT', `/api/tickets/${current.id}`, { read: true }); }, [current?.id]); // eslint-disable-line

  return (
    <>
      <div className="page-head"><h1>សារពីអតិថិជន</h1>{state.account.role !== 'staff' && <button className="btn primary" onClick={() => setNoticeOpen(true)}><Megaphone size={16} /> ផ្ញើសេចក្តីជូនដំណឹង</button>}</div>
      {noticeOpen && <NoticeModal onClose={() => setNoticeOpen(false)} />}
      <p className="lunar-line">អតិថិជនផ្ញើតាម Telegram bot (🔧 ជួសជុល · 💬 សារ) — អ្នកឆ្លើយពីទីនេះ ឬពី Telegram ផ្ទាល់ (reply លើសារ)។</p>
      <div className={'inbox ' + (current ? 'has-sel' : '')}>
        <section className="card inbox-list">
          <div className="chips-row">
            {[['open', 'កំពុងបើក'], ['done', 'រួចរាល់'], ['all', 'ទាំងអស់']].map(([k, l]) => <button key={k} className={'tab-chip ' + (filter === k ? 'active' : '')} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <div className="rows">
            {tickets.map((t) => {
              const tenant = state.tenants.find((x) => x.id === t.tenantId);
              const last = t.messages.at(-1);
              return (
                <button key={t.id} className={'row ticket-row ' + (sel === t.id ? 'sel' : '')} onClick={() => setSel(t.id)}>
                  <Avatar name={t.name} src={tenantPhoto(tenant)} size={38} />
                  <span>
                    <b>{t.kind === 'maintenance' ? <Wrench size={13} /> : t.kind === 'inquiry' ? '🏠' : <MessageSquare size={13} />} {t.name} <small className="muted">· {t.roomId || '—'} · #{n(t.no)}</small></b>
                    <small className="muted clamp1">{last?.from === 'owner' ? '↩️ ' : ''}{last?.text || (last?.photo ? '📷 រូបភាព' : '')}</small>
                  </span>
                  {t.unread ? <em className="count">{n(t.unread)}</em> : <span className={'pill ' + STATUS[t.status][1]}><i />{STATUS[t.status][0]}</span>}
                </button>
              );
            })}
          </div>
          {!tickets.length && <Empty icon={InboxIcon} title="គ្មានសារ">សារពីអតិថិជននឹងបង្ហាញនៅទីនេះ។</Empty>}
        </section>
        {current ? <Thread t={current} onBack={() => setSel('')} /> : <section className="card inbox-empty"><Empty icon={MessageSquare} title="ជ្រើសរើសសារ" /></section>}
      </div>
    </>
  );
}

function Thread({ t, onBack }) {
  const { state, call, openCustomerForm } = useApp();
  const { n } = useFmt();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  const tenant = state.tenants.find((x) => x.id === t.tenantId);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [t.messages.length]);
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    if (await call('POST', `/api/tickets/${t.id}/reply`, { text }, 'បានផ្ញើតាម Telegram ✅')) setText('');
    setBusy(false);
  }
  return (
    <section className="card thread">
      <header className="thread-head">
        <button className="icon-btn back" onClick={onBack} aria-label="ត្រឡប់"><ArrowLeft size={17} /></button>
        <div><b>{t.kind === 'maintenance' ? '🔧 ការជួសជុល' : t.kind === 'inquiry' ? '🏠 អ្នកចង់ជួល' : '💬 សារ'} #{n(t.no)}</b><small className="muted"> · {t.name} · {t.roomId || '—'}</small></div>
        <div className="row-btns">
          {tenant && <button className="btn ghost sm" onClick={() => navigate('/customers/' + tenant.id)}>ប្រវត្តិរូប</button>}
          {t.kind === 'inquiry' && t.phone && <a className="btn primary sm" href={`tel:${t.phone.replace(/\s/g, '')}`}>📞 ហៅ</a>}
          {t.kind === 'inquiry' && <button className="btn ghost sm" onClick={() => openCustomerForm(null, { nameKm: t.name, phone: t.phone, roomId: t.roomId, status: 'prospect' })}>＋ អតិថិជន</button>}
          {t.status !== 'progress' && t.status !== 'done' && <button className="btn ghost sm" onClick={() => call('PUT', `/api/tickets/${t.id}`, { status: 'progress' })}><Loader size={14} /> កំពុងធ្វើ</button>}
          {t.status !== 'done'
            ? <button className="btn primary sm" onClick={() => call('PUT', `/api/tickets/${t.id}`, { status: 'done' }, 'បានបញ្ចប់ — អតិថិជនទទួលដំណឹង')}><Check size={14} /> រួចរាល់</button>
            : <button className="btn ghost sm" onClick={() => call('PUT', `/api/tickets/${t.id}`, { status: 'open' })}>បើកវិញ</button>}
        </div>
      </header>
      <div className="thread-msgs">
        {t.messages.map((m, i) => (
          <div key={i} className={'msg ' + m.from}>
            {m.photo && <a href={`/api/tickets/${t.id}/photo/${i}`} target="_blank" rel="noreferrer"><img src={`/api/tickets/${t.id}/photo/${i}`} alt="" loading="lazy" /></a>}
            {m.text && <p>{m.text}</p>}
            <small>{when(m.at)}{m.from === 'owner' ? ` · ${m.via === 'web' ? 'គេហទំព័រ' : 'Telegram'}` : ''}</small>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="thread-reply" onSubmit={send}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={tenant?.telegram?.chatId ? 'សរសេរចម្លើយ… (ផ្ញើតាម Telegram)' : t.kind === 'inquiry' ? 'ហៅទូរស័ព្ទ ឬផ្ញើសារទៅលេខខាងលើ' : 'អតិថិជនមិនទាន់ភ្ជាប់ Telegram'}
          disabled={!tenant?.telegram?.chatId} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }} />
        <button className="btn primary" disabled={busy || !text.trim()} aria-label="ផ្ញើ"><Send size={16} /></button>
      </form>
    </section>
  );
}
