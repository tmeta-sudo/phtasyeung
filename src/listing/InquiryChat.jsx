import React, { useEffect, useRef, useState } from 'react';
import { Send, Check, MessageCircle } from 'lucide-react';
import { api } from '../api.js';
import './listing.css';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Temporary chat with a landlord for someone asking about a room (/q/<token>).
 * No account needed; it closes when either side ends it and is deleted automatically afterwards.
 */
export default function InquiryChat({ token }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => {
    document.title = 'ជជែកជាមួយម្ចាស់ផ្ទះ · ផ្ទះយើង';
    let live = true;
    const load = () => api('GET', `/api/q/${token}`).then((x) => { if (live) { setD(x); setError(''); } }).catch((e) => live && setError(e.message));
    load();
    const id = setInterval(() => document.visibilityState === 'visible' && load(), 5000);
    return () => { live = false; clearInterval(id); };
  }, [token]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [d?.messages?.length]);

  async function send(body) {
    setBusy(true);
    try { setD({ ...d, ...(await api('POST', `/api/q/${token}`, body)) }); setText(''); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  if (error && !d) return <div className="qchat"><div className="qchat-closed"><b>{error}</b><a className="ls-btn primary" href="/map">រកបន្ទប់ផ្សេងទៀត</a></div></div>;
  if (!d) return <div className="boot"><span className="spinner" /></div>;
  const closed = d.status === 'done';
  return (
    <div className="qchat">
      <header className="qchat-top">
        <span className="qchat-avatar">🏠</span>
        <span><b>{d.property}</b><small>{d.roomId ? `បន្ទប់ ${d.roomId} · ` : ''}{closed ? 'បានបញ្ចប់' : 'ជជែកបណ្តោះអាសន្ន'}</small></span>
        {d.telegramLink && !closed && <a className="qchat-tg" href={d.telegramLink} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Telegram</a>}
      </header>
      <main className="qchat-msgs">
        <p className="qchat-note">🔒 ការសន្ទនានេះនឹងលុបដោយស្វ័យប្រវត្តិ ៧ ថ្ងៃក្រោយបញ្ចប់។ កុំបង់ប្រាក់កក់ មុនពេលមើលបន្ទប់ផ្ទាល់។</p>
        {d.messages.map((m, i) => (
          <div key={i} className={'qmsg ' + (m.from === 'me' ? 'me' : 'them')}>
            <p>{m.text}</p><small>{m.from === 'me' ? 'អ្នក' : d.property} · {when(m.at)}</small>
          </div>
        ))}
        {!d.messages.some((m) => m.from === 'owner') && !closed && <p className="qchat-wait">⏳ ម្ចាស់ផ្ទះនឹងឆ្លើយឆាប់ៗ — ទំព័រនេះធ្វើបច្ចុប្បន្នភាពដោយខ្លួនឯង។ {d.telegramLink ? 'ឬចុច Telegram ខាងលើ ដើម្បីទទួលចម្លើយក្នុង Telegram។' : 'រក្សាទុកតំណនេះ ដើម្បីត្រឡប់មកវិញ។'}</p>}
        <div ref={end} />
      </main>
      {closed ? (
        <div className="qchat-closed"><Check size={28} /><b>ការសន្ទនាបានបញ្ចប់</b><a className="ls-btn light" href="/map">មើលបន្ទប់ផ្សេងទៀតលើផែនទី</a></div>
      ) : (
        <footer className="qchat-input">
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="សរសេរសំណួរ…" maxLength={2000}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send({ text }); } }} />
            <button className="ls-btn primary" disabled={busy || !text.trim()} aria-label="ផ្ញើ"><Send size={17} /></button>
          </form>
          <button type="button" className="qchat-done" disabled={busy} onClick={() => window.confirm('បញ្ចប់ការសន្ទនា? ម្ចាស់ផ្ទះនឹងទទួលដំណឹង។') && send({ done: true })}>✓ ខ្ញុំបានព័ត៌មានគ្រប់ហើយ — បញ្ចប់</button>
          {error && <small className="ls-err">{error}</small>}
        </footer>
      )}
    </div>
  );
}
