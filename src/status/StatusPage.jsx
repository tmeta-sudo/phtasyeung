import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import '../portal/portal.css';

const L = {
  km: {
    title: 'ស្ថានភាពប្រព័ន្ធ', allOk: 'ប្រព័ន្ធដំណើរការធម្មតា', someBad: 'មានបញ្ហាខ្លះ', updated: 'ពិនិត្យចុងក្រោយ',
    app: 'កម្មវិធី និងគេហទំព័រ', database: 'មូលដ្ឋានទិន្នន័យ', telegram: 'Telegram bot', daily: 'វិក្កយបត្រ និងការរំលឹកស្វ័យប្រវត្តិ',
    ok: 'ដំណើរការ', bad: 'មានបញ្ហា', unknown: 'មិនទាន់ដឹង', lastRun: 'ដំណើរការចុងក្រោយ', refresh: 'ពិនិត្យម្តងទៀត', back: '← ទៅទំព័រដើម',
    privacy: 'ទំព័រនេះមិនបង្ហាញទិន្នន័យម្ចាស់ផ្ទះ ឬអ្នកជួលទេ។',
  },
  en: {
    title: 'System status', allOk: 'All systems working', someBad: 'Some problems', updated: 'Last checked',
    app: 'App and website', database: 'Database', telegram: 'Telegram bot', daily: 'Automatic invoices and reminders',
    ok: 'Working', bad: 'Problem', unknown: 'Not known yet', lastRun: 'last run', refresh: 'Check again', back: '← Home',
    privacy: 'This page shows no landlord or tenant data.',
  },
};

/** /status — public: is the app up, its database, Telegram, and the daily jobs. */
export default function StatusPage() {
  const [lang, setLang] = useState('km');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const t = L[lang];
  const load = () => fetch('/api/status').then((r) => r.json()).then((d) => { setData(d); setError(false); }).catch(() => setError(true));
  useEffect(() => { load(); const i = setInterval(load, 60000); return () => clearInterval(i); }, []);
  const fmt = (iso) => new Date(iso).toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'medium', timeStyle: 'short' });
  const down = error || (data && !data.ok);
  const Icon = (ok) => (ok === true ? <CheckCircle2 size={18} color="#12804f" /> : ok === false ? <XCircle size={18} color="#c0392b" /> : <AlertTriangle size={18} color="#b7791f" />);
  return (
    <div className="pt-shell" lang={lang}>
      <div className="pt-screen rec">
        <div className="pt-langs">{[['km', 'ខ្មែរ'], ['en', 'English']].map(([k, l]) => <button key={k} className={k === lang ? 'on' : ''} onClick={() => setLang(k)}>{l}</button>)}</div>
        <div className="pt-card rec-head">
          <h1>{t.title}</h1>
          {data || error ? <b className={'rec-score ' + (down ? 'low' : 'good')}>{down ? t.someBad : t.allOk}</b> : <span className="spinner" />}
          {data && <small>{t.updated}: {fmt(data.time)}</small>}
        </div>
        {data?.note && <div className={'pt-card status-note ' + data.note.level}><b>{data.note.level === 'down' ? '⛔' : data.note.level === 'warn' ? '⚠️' : 'ℹ️'} {data.note.text}</b><small>{fmt(data.note.at)}</small></div>}
        <div className="pt-card">
          {(data?.checks || [{ id: 'app', ok: !error ? null : false }]).map((c) => (
            <div key={c.id} className="status-row">
              {Icon(c.ok)}
              <span><b>{t[c.id]}</b>{c.id === 'daily' && c.at && <small>{t.lastRun}: {fmt(c.at)}</small>}</span>
              <em>{c.ok === true ? t.ok : c.ok === false ? t.bad : t.unknown}</em>
            </div>
          ))}
        </div>
        <button className="pt-ghost" onClick={load}><RefreshCw size={15} /> {t.refresh}</button>
        <p className="pt-muted">{t.privacy} <a href="/">{t.back}</a></p>
      </div>
    </div>
  );
}
