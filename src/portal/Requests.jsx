import React, { useState } from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import { Send } from 'jiggicons-react';
import { api, compressImage } from '../api.js';
import { useT } from './i18n.js';

/** Tenant's repair requests and messages to the landlord: start one, follow it, reply. */
export default function Requests({ token, data, setData, notify, onBack }) {
  const t = useT();
  const [kind, setKind] = useState('');
  const [openId, setOpenId] = useState('');
  const list = data.tickets || [];
  const cur = list.find((x) => x.id === openId);
  const k = data.property.khmerNumerals;
  const when = (at) => `${t.date(at.slice(0, 10), k)} ${at.slice(11, 16)}`;

  return (
    <>
      <header className="pt-top"><button className="pt-round" onClick={cur || kind ? () => { setOpenId(''); setKind(''); } : onBack} aria-label={t('back')}><ArrowLeft size={18} /></button><b>{t('help')}</b><span /></header>
      {!cur && !kind && (
        <>
          <div className="pt-req-new">
            <button className="pt-black" onClick={() => setKind('maintenance')}>{t('newRepair')}</button>
            <button className="pt-ghost" onClick={() => setKind('message')}>{t('newMessage')}</button>
          </div>
          <div className="pt-list">
            {list.map((x) => {
              const last = x.messages.at(-1);
              return (
                <button key={x.id} className="pt-card pt-req" onClick={() => setOpenId(x.id)}>
                  <span><b>{t(`kind_${x.kind}`)} #{x.no}</b><small>{t(`st_${x.status}`)} · {when(x.updatedAt)}</small></span>
                  <small className="pt-req-last">{last?.from === 'owner' ? `↩️ ${t('landlord')}: ` : ''}{last?.text || '📷'}</small>
                </button>
              );
            })}
            {!list.length && <p className="pt-muted">{t('noRequests')}</p>}
          </div>
        </>
      )}
      {kind && <Compose token={token} kind={kind} setData={setData} notify={notify} onSent={() => setKind('')} />}
      {cur && (
        <div className="pt-thread">
          <div className="pt-req-head"><b>{t(`kind_${cur.kind}`)} #{cur.no}</b><span>{t(`st_${cur.status}`)}</span></div>
          {cur.messages.map((m, i) => (
            <div key={i} className={'pt-msg ' + (m.from === 'owner' ? 'owner' : 'me')}>
              {m.photo != null && <img src={`/api/portal/${token}/tickets/${cur.id}/photo/${m.photo}`} alt="" loading="lazy" />}
              {m.text && <p>{m.text}</p>}
              <small>{m.from === 'owner' ? t('landlord') : t('you')} · {when(m.at)}</small>
            </div>
          ))}
          <Compose token={token} kind={cur.kind} ticketId={cur.id} setData={setData} notify={notify} compact />
        </div>
      )}
    </>
  );
}

function Compose({ token, kind, ticketId, setData, notify, onSent, compact }) {
  const t = useT();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    if (!text.trim() && !photo) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set('kind', kind);
      body.set('text', text.trim());
      if (ticketId) body.set('ticketId', ticketId);
      if (photo) body.set('file', await compressImage(photo, 1600));
      setData(await api('POST', `/api/portal/${token}/tickets`, body));
      setText(''); setPhoto(null);
      notify(t('sent'));
      onSent?.();
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  }
  return (
    <form className={'pt-card pt-form' + (compact ? ' pt-compose' : '')} onSubmit={send}>
      {!compact && <b className="pt-card-title">{kind === 'maintenance' ? t('newRepair') : t('newMessage')}</b>}
      <textarea rows={compact ? 2 : 4} value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} placeholder={compact ? t('reply') : kind === 'maintenance' ? t('describe') : t('writeMessage')} />
      <div className="pt-compose-row">
        <label className={'pt-ghost pt-photo' + (photo ? ' on' : '')}><Camera size={15} /> {photo ? photo.name.slice(0, 18) : t('addPhoto')}<input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></label>
        <button className="pt-pink" disabled={busy || (!text.trim() && !photo)}><Send size={15} animate="click" sound /> {busy ? t('sending') : t('send')}</button>
      </div>
    </form>
  );
}
