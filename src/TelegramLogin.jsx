import React, { useEffect, useRef, useState } from 'react';
import { Send, CheckCircle2, XCircle, RefreshCw, Copy } from 'lucide-react';
import { api } from './api.js';
import { QR } from './ui.jsx';

const isMobile = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Sign in / sign up / link via the platform Telegram bot.
 * mode: 'login' | 'signup' | 'link'. onDone() is called once the bot approves.
 */
export default function TelegramLogin({ mode = 'login', extra = {}, onDone, onCancel }) {
  const [flow, setFlow] = useState(null); // { token, link }
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState('');
  const timer = useRef();

  async function start() {
    setError('');
    setStatus('starting');
    try {
      const f = await api('POST', '/api/auth/telegram/start', { mode, ...extra });
      setFlow(f);
      setStatus('pending');
      if (isMobile()) window.location.href = f.link; // jump straight into Telegram
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }

  useEffect(() => { start(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status !== 'pending' || !flow) return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const r = await api('GET', `/api/auth/telegram/poll?token=${encodeURIComponent(flow.token)}`);
        if (!alive) return;
        if (r.status === 'ok') { setStatus('ok'); setTimeout(onDone, 600); return; }
        if (r.status !== 'pending') { setStatus(r.status); return; }
      } catch { /* keep polling */ }
      timer.current = setTimeout(poll, document.visibilityState === 'visible' ? 1800 : 4000);
    };
    poll();
    const onVis = () => { if (document.visibilityState === 'visible') { clearTimeout(timer.current); poll(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearTimeout(timer.current); document.removeEventListener('visibilitychange', onVis); };
  }, [status, flow, onDone]);

  const messages = {
    denied: ['បានបដិសេធក្នុង Telegram', XCircle],
    expired: ['សំណើផុតកំណត់', XCircle],
    'no-account': ['Telegram នេះមិនទាន់ភ្ជាប់គណនីណាមួយ — សូមបង្កើតគណនីតាម Telegram', XCircle],
  };

  return (
    <div className="tg-login">
      {status === 'ok' && <div className="tg-state ok"><CheckCircle2 size={40} /><b>{mode === 'link' ? 'បានភ្ជាប់!' : 'បានចូល!'}</b></div>}
      {(status === 'pending' || status === 'starting') && flow && (
        <>
          <ol className="tg-steps">
            <li>{isMobile() ? 'បើក Telegram' : 'ស្កេន QR ដោយកាមេរ៉ាទូរស័ព្ទ ឬចុចប៊ូតុងខាងក្រោម'}</li>
            <li>ចុច <b>Start</b> ក្នុង bot @{flow.bot}</li>
            <li>ចុច <b>✅ អនុញ្ញាត</b> — ទំព័រនេះនឹងបន្តដោយស្វ័យប្រវត្តិ</li>
          </ol>
          {!isMobile() && <div className="tg-qr"><QR value={flow.link} size={180} label="Telegram login QR" /></div>}
          <a className="btn tg block" href={flow.link} target="_blank" rel="noreferrer"><Send size={17} /> បើក Telegram</a>
          <p className="tg-wait"><span className="dot-pulse" /> កំពុងរង់ចាំការអនុញ្ញាតពី Telegram…</p>
          <details className="tg-fallback">
            <summary>Bot មិនឆ្លើយតប? ផ្ញើលេខកូដនេះទៅ @{flow.bot}</summary>
            <div className="tg-code">
              <code>{flow.code}</code>
              <button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(flow.code)}><Copy size={14} /> ចម្លង</button>
            </div>
          </details>
        </>
      )}
      {status === 'starting' && !flow && <div className="boot small"><span className="spinner" /></div>}
      {(messages[status] || status === 'error') && (
        <div className="tg-state bad">
          {React.createElement((messages[status] || [, XCircle])[1], { size: 36 })}
          <b>{error || messages[status][0]}</b>
          <button className="btn ghost" onClick={start}><RefreshCw size={15} /> ព្យាយាមម្តងទៀត</button>
        </div>
      )}
      {onCancel && status !== 'ok' && <button type="button" className="link-btn center" onClick={onCancel}>← ត្រឡប់ក្រោយ</button>}
    </div>
  );
}

/** /auth/magic?t=… — one-time recovery link from the bot. */
export function MagicLogin() {
  const [error, setError] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('t') || '';
    history.replaceState({}, '', '/auth/magic'); // keep the token out of history
    api('POST', '/api/auth/magic', { token })
      .then(() => { location.replace('/settings?recovered=1'); })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="boot">
      <div className="tg-state">
        {error ? <><XCircle size={36} /><b>{error}</b><a className="btn primary" href="/">ទៅទំព័រចូល</a></> : <><span className="spinner" /><b>កំពុងចូលគណនី…</b></>}
      </div>
    </div>
  );
}
