import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shield, Users, Building2, ReceiptText, Send, HardDrive, RefreshCw, Megaphone, Lightbulb, Bug, History, Plus, Pencil, Trash2, Ban, CheckCircle2, Radio, Search, Wallet, Zap,
} from 'lucide-react';
import { useApp, useFmt, Modal, Field, Empty } from '../ui.jsx';
import { api } from '../api.js';
import { StatusTag, FB_STATUS, NEWS_KIND } from './Feedback.jsx';
import { usd } from '../../shared/khmer.js';

const TABS = [['overview', 'ទិដ្ឋភាពទូទៅ', Shield], ['landlords', 'ម្ចាស់ផ្ទះ', Users], ['news', 'ដំណឹង / មុខងារថ្មី', Megaphone], ['feedback', 'សំណើ & បញ្ហា', Lightbulb], ['audit', 'កំណត់ហេតុ', History]];
const bytes = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');
const ago = (d) => {
  if (!d) return 'មិនធ្លាប់';
  const m = (Date.now() - new Date(d)) / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} នាទីមុន`;
  if (m < 1440) return `${Math.round(m / 60)} ម៉ោងមុន`;
  return `${Math.round(m / 1440)} ថ្ងៃមុន`;
};
const who = (email) => (/@telegram\.local$/.test(email || '') ? '✈️ Telegram' : email);
const fmtDate = (d) => (d ? new Date(d).toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function Super() {
  const { state } = useApp();
  const [tab, setTab] = useState('overview');
  if (!state.account.super) return <Empty icon={Shield} title="សម្រាប់អ្នកគ្រប់គ្រងប្រព័ន្ធប៉ុណ្ណោះ" />;
  return (
    <>
      <div className="page-head"><h1><Shield size={28} className="h-icon" /> អ្នកគ្រប់គ្រងប្រព័ន្ធ</h1></div>
      <p className="lunar-line">🔒 អ្នកឃើញតែស្ថិតិសរុប និងព័ត៌មានគណនីម្ចាស់ផ្ទះ — មិនឃើញព័ត៌មានផ្ទាល់ខ្លួន ឬអត្តសញ្ញាណប័ណ្ណរបស់អតិថិជនទេ។</p>
      <div className="chips-row">{TABS.map(([k, l, I]) => <button key={k} className={'tab-chip ' + (tab === k ? 'active' : '')} onClick={() => setTab(k)}><I size={14} /> {l}</button>)}</div>
      {tab === 'overview' && <Overview onTab={setTab} />}
      {tab === 'landlords' && <Landlords />}
      {tab === 'news' && <NewsAdmin />}
      {tab === 'feedback' && <FeedbackAdmin />}
      {tab === 'audit' && <Audit />}
    </>
  );
}

function useLoad(url) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const load = useCallback(() => api('GET', url).then(setData).catch((e) => notify(e.message, true)), [url, notify]);
  useEffect(() => { load(); }, [load]);
  return [data, load];
}

function Overview({ onTab }) {
  const { n } = useFmt();
  const [s] = useLoad('/api/super/stats');
  if (!s) return <div className="boot small"><span className="spinner" /></div>;
  const open = (kind) => s.feedback.filter((f) => f.kind === kind && !['done', 'declined'].includes(f.status)).reduce((a, f) => a + f.n, 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  return (
    <>
      <div className="super-kpis">
        <Kpi icon={Users} label="ម្ចាស់ផ្ទះសរុប" value={n(s.landlords.total)} sub={`+${n(s.landlords.new7)} សប្តាហ៍នេះ · +${n(s.landlords.new30)} ៣០ថ្ងៃ`} tone="blue" />
        <Kpi icon={Zap} label="សកម្ម ៧ ថ្ងៃ" value={n(s.landlords.active7)} sub={`${n(pct(s.landlords.active7, s.landlords.total))}% · ៣០ថ្ងៃ: ${n(s.landlords.active30)}`} />
        <Kpi icon={Building2} label="បន្ទប់ / អតិថិជន" value={`${n(s.usage.rooms)} / ${n(s.usage.tenants)}`} sub={`${n(s.usage.tenantsOnTelegram)} អតិថិជនភ្ជាប់ Telegram`} />
        <Kpi icon={ReceiptText} label={`វិក្កយបត្រ ${s.month}`} value={usd(s.thisMonth.billed, true)} sub={`បានបង់ ${n(pct(s.thisMonth.paid, s.thisMonth.billed))}% · ${n(s.thisMonth.invoices)} វិក្កយបត្រ`} tone="dark" />
      </div>
      <div className="super-grid">
        <section className="card">
          <h3 className="sec-title"><Users size={17} /> ការចុះឈ្មោះ ៣០ ថ្ងៃ</h3>
          <SignupChart data={s.signups} />
        </section>
        <section className="card">
          <h3 className="sec-title"><CheckCircle2 size={17} /> ការប្រើប្រាស់មុខងារ</h3>
          {[[Wallet, 'កំណត់ KHQR', s.adoption.khqr], [Zap, 'បើកវិក្កយបត្រស្វ័យប្រវត្តិ', s.adoption.auto], [Send, 'ភ្ជាប់ Telegram ម្ចាស់ផ្ទះ', s.adoption.ownerTelegram], [Radio, 'ប្រើ bot ផ្ទាល់ខ្លួន', s.adoption.ownBot]].map(([I, l, v]) => (
            <div key={l} className="bar-row"><span><I size={14} /> {l}</span><div className="bar"><i style={{ width: pct(v, s.landlords.total) + '%' }} /></div><b>{n(v)}</b></div>
          ))}
          <div className="bar-row"><span><Send size={14} /> វិក្កយបត្រផ្ញើតាម Telegram (ខែនេះ)</span><div className="bar"><i style={{ width: pct(s.thisMonth.sent, s.thisMonth.invoices) + '%' }} /></div><b>{n(pct(s.thisMonth.sent, s.thisMonth.invoices))}%</b></div>
        </section>
        <section className="card">
          <h3 className="sec-title"><Lightbulb size={17} /> មតិកំពុងរង់ចាំ</h3>
          <div className="fb-counts">
            <button onClick={() => onTab('feedback')}><Lightbulb size={20} /><b>{n(open('feature'))}</b><small>សំណើមុខងារ</small></button>
            <button onClick={() => onTab('feedback')} className="issue"><Bug size={20} /><b>{n(open('issue'))}</b><small>បញ្ហា</small></button>
          </div>
        </section>
        <section className="card">
          <h3 className="sec-title"><HardDrive size={17} /> ទំហំផ្ទុក</h3>
          <div className="bar-row"><span>ឯកសារអតិថិជន ({n(s.storage.files)})</span><b>{bytes(s.storage.fileBytes)}</b></div>
          <div className="bar-row"><span>មូលដ្ឋានទិន្នន័យសរុប</span><b>{s.storage.dbBytes ? bytes(s.storage.dbBytes) : '—'}</b></div>
          <div className="bar"><i style={{ width: Math.min(100, (s.storage.dbBytes / 512e6) * 100) + '%' }} /></div>
          <small className="muted">ធៀបនឹង ០.៥ GB របស់ Neon Free</small>
          <div className="bar-row"><span>Platform bot</span><b>{s.runtime.platformBot ? '✅' : '⚠️ មិនទាន់កំណត់'}</b></div>
        </section>
      </div>
      <BotHealth />
      <section className="card">
        <h3 className="sec-title"><Users size={17} /> ម្ចាស់ផ្ទះថ្មីៗ</h3>
        <div className="rows">
          {s.recent.map((o) => (
            <div key={o.id} className="row static"><span><b>{o.name}</b><small className="muted">{who(o.email)} · {fmtDate(o.created_at)}</small></span><small className="muted">{n(o.rooms)} បន្ទប់ · {n(o.tenants)} អតិថិជន</small>{o.suspended && <span className="pill danger"><i />ផ្អាក</span>}</div>
          ))}
        </div>
      </section>
    </>
  );
}

function BotHealth() {
  const { notify } = useApp();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('GET', '/api/super/telegram').then(setD).catch((e) => setD({ error: e.message })), []);
  useEffect(() => { load(); }, [load]);
  async function fix() {
    setBusy(true);
    try {
      const r = await api('POST', '/api/super/telegram/fix');
      setD(r.diagnostics);
      notify(r.ok ? (r.previousUrl ? `បានផ្លាស់ webhook ពី ${r.previousUrl}` : 'បានកំណត់ webhook ឡើងវិញ') : r.reason, !r.ok);
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }
  if (!d) return null;
  const healthy = d.configured && !d.error && d.urlOk && !d.lastError;
  return (
    <section className={'card bot-health ' + (healthy ? 'ok' : 'bad')}>
      <h3 className="sec-title"><Send size={17} /> Telegram bot {d.username && <span className="muted">@{d.username}</span>}</h3>
      {!d.configured && <p className="form-warn">TELEGRAM_BOT_TOKEN មិនទាន់កំណត់ក្នុង Vercel។</p>}
      {d.error && <p className="form-error">Telegram: {d.error}</p>}
      {d.configured && !d.error && (
        <div className="bh-grid">
          <span>របៀប</span><b>{d.mode === 'webhook' ? 'Webhook' : 'Polling (local)'}</b>
          <span>Webhook</span><b className={d.urlOk ? 'ok-text' : 'danger-text'}>{d.url || 'មិនទាន់កំណត់'}</b>
          {!d.urlOk && <><span>គួរតែជា</span><b>{d.expectedUrl}</b></>}
          <span>Updates រង់ចាំ</span><b>{d.pending}</b>
          {d.lastError && <><span>កំហុសចុងក្រោយ</span><b className="danger-text">{d.lastError} <small className="muted">{fmtDate(d.lastErrorAt)}</small></b></>}
        </div>
      )}
      {d.url && !d.urlOk && <p className="tip">⚠️ Bot នេះកំពុងផ្ញើទៅកម្មវិធីផ្សេង។ បើ token ប្រើរួមជាមួយគម្រោងផ្សេង (ឧ. QRSafe) សូមបង្កើត bot ថ្មីសម្រាប់ផ្ទះយើង — bot មួយមាន webhook បានតែមួយ។</p>}
      <div className="row-btns">
        <button className="btn primary sm" onClick={fix} disabled={busy || !d.configured}><RefreshCw size={14} /> {busy ? '…' : 'ជួសជុល / កំណត់ webhook ឡើងវិញ'}</button>
        <button className="btn ghost sm" onClick={load}>ពិនិត្យម្តងទៀត</button>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = '' }) {
  return <div className={'card kpi ' + tone}><span className="kpi-icon"><Icon size={18} /></span><small>{label}</small><b>{value}</b><span className="kpi-sub">{sub}</span></div>;
}

function SignupChart({ data }) {
  const days = useMemo(() => {
    const out = [];
    const map = Object.fromEntries(data.map((d) => [d.day, d.n]));
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
      out.push({ day: d, n: map[d] || 0 });
    }
    return out;
  }, [data]);
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="signup-chart">
      <div className="cols">{days.map((d) => <i key={d.day} title={`${d.day}: ${d.n}`} style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }} className={d.n ? 'on' : ''} />)}</div>
      <div className="axis"><span>៣០ ថ្ងៃមុន</span><span>ថ្ងៃនេះ</span></div>
    </div>
  );
}

function Landlords() {
  const { notify } = useApp();
  const { n } = useFmt();
  const [q, setQ] = useState('');
  const [data, load] = useLoad('/api/super/landlords?q=' + encodeURIComponent(q));
  async function suspend(o) {
    const reason = o.suspended ? '' : window.prompt(`ផ្អាកគណនី «${o.name}»? ម្ចាស់ផ្ទះនឹងមិនអាចចូល ហើយ bot/វិក្កយបត្រស្វ័យប្រវត្តិនឹងឈប់។\n\nមូលហេតុ៖`);
    if (!o.suspended && reason === null) return;
    try { await api('POST', `/api/super/landlords/${o.id}/suspend`, { suspended: !o.suspended, reason }); notify(o.suspended ? 'បានបើកវិញ' : 'បានផ្អាក'); load(); } catch (e) { notify(e.message, true); }
  }
  return (
    <section className="card">
      <div className="search-pill grow mb"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ស្វែងរកឈ្មោះ ឬអ៊ីមែល…" aria-label="ស្វែងរក" /></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>ម្ចាស់ផ្ទះ</th><th>បន្ទប់</th><th>អតិថិជន</th><th>វិក្កយបត្រ</th><th>មុខងារ</th><th>ឯកសារ</th><th>សកម្មចុងក្រោយ</th><th /></tr></thead>
          <tbody>
            {data?.landlords.map((o) => (
              <tr key={o.id} className={o.suspended ? 'dim' : ''}>
                <td><b>{o.name}</b><small>{who(o.email)}{o.phone ? ` · ${o.phone}` : ''}</small><small>ចុះឈ្មោះ {fmtDate(o.created_at)}</small></td>
                <td>{n(o.rooms)}</td><td>{n(o.tenants)}</td><td>{n(o.invoices)}</td>
                <td className="feat">{o.khqr && <span title="KHQR">💳</span>}{o.auto && <span title="ស្វ័យប្រវត្តិ">⚡</span>}{o.owner_tg && <span title="Telegram">✈️</span>}</td>
                <td>{bytes(o.file_bytes)}</td>
                <td>{ago(o.last_active)}</td>
                <td><button className={'btn sm ' + (o.suspended ? 'primary' : 'ghost danger')} onClick={() => suspend(o)}>{o.suspended ? <><CheckCircle2 size={14} /> បើកវិញ</> : <><Ban size={14} /> ផ្អាក</>}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.landlords.length && <Empty icon={Users} title="រកមិនឃើញ" />}
    </section>
  );
}

function NewsAdmin() {
  const { notify } = useApp();
  const [data, load] = useLoad('/api/super/announcements');
  const [edit, setEdit] = useState(null);
  async function save(e) {
    e.preventDefault();
    try {
      await api(edit.id ? 'PUT' : 'POST', edit.id ? `/api/super/announcements/${edit.id}` : '/api/super/announcements', edit);
      notify(edit.published ? 'បានផ្សព្វផ្សាយ' : 'បានរក្សាទុកជាសេចក្តីព្រាង');
      setEdit(null);
      load();
    } catch (err) { notify(err.message, true); }
  }
  async function broadcast(a) {
    if (!window.confirm(`ផ្ញើ «${a.title}» ទៅ Telegram របស់ម្ចាស់ផ្ទះទាំងអស់?`)) return;
    try { const r = await api('POST', `/api/super/announcements/${a.id}/broadcast`, { again: !!a.broadcast_at }); notify(`បានផ្ញើទៅ ${r.sent} chat (${r.landlords} ម្ចាស់ផ្ទះ)`); load(); } catch (err) { notify(err.message, true); }
  }
  return (
    <>
      <div className="row-btns mb"><button className="btn primary" onClick={() => setEdit({ kind: 'feature', title: '', body: '', link: '', published: true })}><Plus size={16} /> ដំណឹងថ្មី</button></div>
      <section className="card">
        <div className="rows">
          {data?.items.map((a) => {
            const [label, Icon] = NEWS_KIND[a.kind] || NEWS_KIND.notice;
            return (
              <div key={a.id} className="row static">
                <span className={'news-kind k-' + a.kind}><Icon size={14} /> {label}</span>
                <span><b>{a.title}</b><small className="muted">{a.published ? `ផ្សព្វផ្សាយ ${fmtDate(a.published_at)}` : 'សេចក្តីព្រាង'}{a.broadcast_at ? ` · ✈️ ផ្ញើ Telegram ${fmtDate(a.broadcast_at)}` : ''}</small></span>
                {a.published && <button className="btn ghost sm" onClick={() => broadcast(a)}><Send size={14} /> Telegram</button>}
                <button className="icon-btn" onClick={() => setEdit({ ...a })} aria-label="កែ"><Pencil size={15} /></button>
                <button className="icon-btn" onClick={async () => { if (window.confirm('លុប?')) { await api('DELETE', `/api/super/announcements/${a.id}`); load(); } }} aria-label="លុប"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
        {data && !data.items.length && <Empty icon={Megaphone} title="មិនទាន់មានដំណឹង">ចែករំលែកមុខងារថ្មីៗទៅម្ចាស់ផ្ទះទាំងអស់។</Empty>}
      </section>
      {edit && (
        <Modal title={edit.id ? 'កែដំណឹង' : 'ដំណឹងថ្មី'} sub="បង្ហាញក្នុង «មានអ្វីថ្មី» របស់ម្ចាស់ផ្ទះទាំងអស់" onClose={() => setEdit(null)}>
          <form className="stack-form" onSubmit={save}>
            <div className="form-grid">
              <Field label="ប្រភេទ"><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(NEWS_KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="តំណ (ជម្រើស)" hint="ឧ. /telegram ឬ https://…"><input value={edit.link} onChange={(e) => setEdit({ ...edit, link: e.target.value })} /></Field>
              <Field label="ចំណងជើង" wide><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required maxLength={160} autoFocus /></Field>
              <Field label="ខ្លឹមសារ" wide><textarea rows={6} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} maxLength={5000} /></Field>
            </div>
            <label className="switch-row"><input type="checkbox" checked={edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} /><span><b>ផ្សព្វផ្សាយឥឡូវ</b><small>បិទ = រក្សាទុកជាសេចក្តីព្រាង</small></span></label>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setEdit(null)}>បោះបង់</button><button className="btn primary">រក្សាទុក</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

function FeedbackAdmin() {
  const { notify } = useApp();
  const { n } = useFmt();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [data, load] = useLoad(`/api/super/feedback?kind=${kind}&status=${status}`);
  const [edit, setEdit] = useState(null);
  async function save(e) {
    e.preventDefault();
    try { await api('PUT', `/api/super/feedback/${edit.id}`, edit); notify(edit.notify ? 'បានរក្សាទុក និងជូនដំណឹងម្ចាស់ផ្ទះ' : 'បានរក្សាទុក'); setEdit(null); load(); } catch (err) { notify(err.message, true); }
  }
  return (
    <>
      <div className="chips-row">
        {[['', 'ទាំងអស់'], ['feature', 'សំណើមុខងារ'], ['issue', 'បញ្ហា']].map(([k, l]) => <button key={k} className={'tab-chip ' + (kind === k ? 'active' : '')} onClick={() => setKind(k)}>{l}</button>)}
        <select className="month-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="ស្ថានភាព"><option value="">គ្រប់ស្ថានភាព</option>{Object.entries(FB_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <section className="card">
        <div className="rows">
          {data?.items.map((f) => (
            <button key={f.id} className="row fb-row" onClick={() => setEdit({ ...f, notify: true })}>
              <span className={'fb-kind ' + f.kind}>{f.kind === 'issue' ? <Bug size={16} /> : <Lightbulb size={16} />}</span>
              <span><b>{f.title}</b><small className="muted">{f.org_name || '—'} · {who(f.user_email)} · {fmtDate(f.created_at)}{f.kind === 'feature' ? ` · ▲ ${n(f.votes)}` : ''}</small>{f.body && <small className="clamp">{f.body}</small>}</span>
              <StatusTag status={f.status} />
            </button>
          ))}
        </div>
        {data && !data.items.length && <Empty icon={Lightbulb} title="គ្មានមតិ" />}
      </section>
      {edit && (
        <Modal title={edit.title} sub={`${edit.kind === 'issue' ? '🐞 បញ្ហា' : '💡 សំណើមុខងារ'} · ${edit.org_name || ''} · ${who(edit.user_email)}`} onClose={() => setEdit(null)}>
          <form className="stack-form" onSubmit={save}>
            {edit.body && <p className="notes card">{edit.body}</p>}
            {edit.kind === 'issue' && edit.context && <pre className="ctx">{JSON.stringify(edit.context, null, 1)}</pre>}
            <Field label="ស្ថានភាព"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(FB_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="ឆ្លើយតប (ម្ចាស់ផ្ទះនឹងឃើញ)"><textarea rows={4} value={edit.reply} onChange={(e) => setEdit({ ...edit, reply: e.target.value })} maxLength={3000} /></Field>
            <label className="switch-row"><input type="checkbox" checked={!!edit.notify} onChange={(e) => setEdit({ ...edit, notify: e.target.checked })} /><span><b>ជូនដំណឹងតាម Telegram</b><small>ផ្ញើស្ថានភាព និងចម្លើយទៅម្ចាស់ផ្ទះ</small></span></label>
            <div className="form-actions">
              <button type="button" className="btn ghost danger" onClick={async () => { if (window.confirm('លុប?')) { await api('DELETE', `/api/super/feedback/${edit.id}`); setEdit(null); load(); } }}><Trash2 size={15} /></button>
              <button className="btn primary">រក្សាទុក</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Audit() {
  const [data] = useLoad('/api/super/audit');
  return (
    <section className="card">
      <div className="rows">
        {data?.items.map((a) => <div key={a.id} className="row static"><span><b>{a.action}</b><small className="muted">{a.actor} · {a.target} {a.detail && `· ${a.detail}`}</small></span><small className="muted">{fmtDate(a.at)}</small></div>)}
      </div>
      {data && !data.items.length && <Empty icon={History} title="មិនទាន់មានកំណត់ហេតុ" />}
    </section>
  );
}
