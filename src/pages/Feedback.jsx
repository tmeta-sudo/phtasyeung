import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Bug, ChevronUp, Sparkles, Send, MessageSquareReply, Wrench, Megaphone, ExternalLink } from 'lucide-react';
import { useApp, useFmt, Field, Empty, navigate, usePath } from '../ui.jsx';
import { api } from '../api.js';

export const FB_STATUS = {
  new: ['ថ្មី', 'muted'], planned: ['គ្រោងនឹងធ្វើ', 'warn'], progress: ['កំពុងធ្វើ', 'warn'], done: ['រួចរាល់', 'ok'], declined: ['មិនធ្វើ', 'danger'],
};
export const NEWS_KIND = {
  feature: ['មុខងារថ្មី', Sparkles], improvement: ['កែលម្អ', Lightbulb], fix: ['ជួសជុល', Wrench], notice: ['ដំណឹង', Megaphone],
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'medium' }) : '');

export function StatusTag({ status }) {
  const [label, tone] = FB_STATUS[status] || FB_STATUS.new;
  return <span className={'pill ' + tone}><i />{label}</span>;
}

// ---------- What's new ----------

export function News() {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  useEffect(() => {
    api('GET', '/api/news').then((d) => { setData(d); if (d.unread) api('POST', '/api/news/seen').catch(() => {}); }).catch((e) => notify(e.message, true));
  }, [notify]);
  return (
    <>
      <div className="page-head"><h1>មានអ្វីថ្មី</h1><div className="head-actions"><button className="btn ghost" onClick={() => navigate('/feedback')}><Lightbulb size={16} /> ស្នើមុខងារ</button></div></div>
      <div className="news-list">
        {data?.items.map((n) => {
          const [label, Icon] = NEWS_KIND[n.kind] || NEWS_KIND.notice;
          return (
            <article key={n.id} className="card news-item">
              <div className="news-head"><span className={'news-kind k-' + n.kind}><Icon size={14} /> {label}</span><small className="muted">{fmtDate(n.published_at)}</small></div>
              <h3>{n.title}</h3>
              {n.body && <p className="news-body">{n.body}</p>}
              {n.link && (n.link.startsWith('/')
                ? <button className="link-btn" onClick={() => navigate(n.link)}>សាកល្បងឥឡូវ →</button>
                : <a className="link-btn" href={n.link} target="_blank" rel="noreferrer">អានបន្ថែម <ExternalLink size={13} /></a>)}
            </article>
          );
        })}
        {data && !data.items.length && <Empty icon={Sparkles} title="មិនទាន់មានដំណឹងថ្មី">មុខងារថ្មីៗនឹងបង្ហាញនៅទីនេះ។</Empty>}
      </div>
    </>
  );
}

/** Unread "what's new" count for the top bar. */
export function useNewsUnread(path) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (path === '/news') { setUnread(0); return; }
    api('GET', '/api/news').then((d) => setUnread(d.unread)).catch(() => {});
  }, [path]);
  return unread;
}

// ---------- Feature requests & issues ----------

export default function Feedback() {
  const { notify } = useApp();
  const { n } = useFmt();
  const path = usePath();
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'board');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(() => ({ kind: new URLSearchParams(location.search).get('kind') === 'issue' ? 'issue' : 'feature', title: '', body: '' }));
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('GET', '/api/feedback').then(setData).catch((e) => notify(e.message, true)), [notify]);
  useEffect(() => { load(); }, [load, path]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('POST', '/api/feedback', {
        ...form,
        context: { page: (() => { try { return sessionStorage.getItem('py-last-page') || ''; } catch { return ''; } })(), screen: `${innerWidth}x${innerHeight}`, lang: navigator.language, online: navigator.onLine, standalone: matchMedia('(display-mode: standalone)').matches },
      });
      notify(form.kind === 'issue' ? 'បានផ្ញើរបាយការណ៍ — អរគុណ! យើងនឹងពិនិត្យឆាប់ៗ' : 'បានផ្ញើសំណើ — អរគុណ!');
      setForm({ kind: form.kind, title: '', body: '' });
      setTab(form.kind === 'issue' ? 'mine' : 'board');
      load();
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  }

  async function vote(item) {
    try {
      const r = await api('POST', `/api/feedback/${item.id}/vote`);
      setData((d) => ({ ...d, board: d.board.map((x) => (x.id === item.id ? { ...x, voted: r.voted, votes: x.votes + (r.voted ? 1 : -1) } : x)) }));
    } catch (err) { notify(err.message, true); }
  }

  return (
    <>
      <div className="page-head"><h1>មតិ និងសំណើ</h1></div>
      <div className="chips-row">
        <button className={'tab-chip ' + (tab === 'board' ? 'active' : '')} onClick={() => setTab('board')}><Lightbulb size={14} /> សំណើមុខងារ</button>
        <button className={'tab-chip ' + (tab === 'new' ? 'active' : '')} onClick={() => setTab('new')}><Send size={14} /> ផ្ញើថ្មី</button>
        <button className={'tab-chip ' + (tab === 'mine' ? 'active' : '')} onClick={() => setTab('mine')}><Bug size={14} /> របស់ខ្ញុំ {data?.mine.length ? <em>{n(data.mine.length)}</em> : null}</button>
      </div>

      {tab === 'board' && (
        <section className="card">
          <p className="muted pad0">បោះឆ្នោតលើមុខងារដែលអ្នកចង់បាន — មុខងារដែលមានសំឡេងច្រើនជាងគេនឹងធ្វើមុន។</p>
          <div className="rows">
            {data?.board.map((f) => (
              <div key={f.id} className="row static fb-row">
                <button className={'vote ' + (f.voted ? 'on' : '')} onClick={() => vote(f)} aria-label="បោះឆ្នោត" aria-pressed={f.voted}><ChevronUp size={18} /><b>{n(f.votes)}</b></button>
                <span><b>{f.title}{f.mine && <em className="mine-tag">របស់ខ្ញុំ</em>}</b>{f.body && <small className="muted clamp">{f.body}</small>}
                  {f.reply && <small className="fb-reply"><MessageSquareReply size={13} /> {f.reply}</small>}</span>
                <StatusTag status={f.status} />
              </div>
            ))}
          </div>
          {data && !data.board.length && <Empty icon={Lightbulb} title="មិនទាន់មានសំណើ"><button className="btn primary sm" onClick={() => setTab('new')}>ស្នើមុខងារដំបូង</button></Empty>}
        </section>
      )}

      {tab === 'new' && (
        <form className="card stack-form fb-form" onSubmit={submit}>
          <div className="seg two">
            <button type="button" className={form.kind === 'feature' ? 'on' : ''} onClick={() => setForm({ ...form, kind: 'feature' })}><Lightbulb size={15} /> ស្នើមុខងារ</button>
            <button type="button" className={form.kind === 'issue' ? 'on' : ''} onClick={() => setForm({ ...form, kind: 'issue' })}><Bug size={15} /> រាយការណ៍បញ្ហា</button>
          </div>
          <Field label={form.kind === 'issue' ? 'បញ្ហាអ្វី?' : 'អ្នកចង់បានមុខងារអ្វី?'}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} required autoFocus
              placeholder={form.kind === 'issue' ? 'ឧ. មិនអាចផ្ញើវិក្កយបត្រទៅ Telegram' : 'ឧ. ផ្ញើវិក្កយបត្រជា PDF'} />
          </Field>
          <Field label={form.kind === 'issue' ? 'ពន្យល់លម្អិត — អ្នកបានធ្វើអ្វី? មានអ្វីកើតឡើង?' : 'ហេតុអ្វីវាមានប្រយោជន៍សម្រាប់អ្នក?'}>
            <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={4000} />
          </Field>
          {form.kind === 'issue' && <p className="tip">🔒 យើងភ្ជាប់តែព័ត៌មានបច្ចេកទេស (ប្រភេទឧបករណ៍ ទំហំអេក្រង់) — មិនមានព័ត៌មានអតិថិជនរបស់អ្នកទេ។</p>}
          {form.kind === 'feature' && <p className="tip">💡 សំណើរបស់អ្នកនឹងបង្ហាញជាសាធារណៈ (គ្មានឈ្មោះ) ដើម្បីឱ្យម្ចាស់ផ្ទះផ្សេងទៀតអាចបោះឆ្នោត។</p>}
          <div className="form-actions"><button className="btn primary" disabled={busy || !form.title.trim()}><Send size={15} /> ផ្ញើ</button></div>
        </form>
      )}

      {tab === 'mine' && (
        <section className="card">
          <div className="rows">
            {data?.mine.map((f) => (
              <div key={f.id} className="row static fb-row">
                <span className={'fb-kind ' + f.kind}>{f.kind === 'issue' ? <Bug size={16} /> : <Lightbulb size={16} />}</span>
                <span><b>{f.title}</b><small className="muted">{fmtDate(f.created_at)}{f.kind === 'feature' ? ` · ${n(f.votes)} សំឡេង` : ''}</small>
                  {f.reply && <small className="fb-reply"><MessageSquareReply size={13} /> {f.reply}</small>}</span>
                <StatusTag status={f.status} />
              </div>
            ))}
          </div>
          {data && !data.mine.length && <Empty icon={Send} title="អ្នកមិនទាន់បានផ្ញើអ្វីទេ" />}
        </section>
      )}
    </>
  );
}
