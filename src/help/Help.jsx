import React, { useMemo, useState } from 'react';
import { Search, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { navigate } from '../ui.jsx';
import { matchesQuery, kmDigits } from '../../shared/khmer.js';
import { CATEGORIES, GUIDES } from './guides.js';

/** Help center: every guide in Khmer, searchable, with a button that takes you to the right screen. */
export default function Help() {
  const params = new URLSearchParams(location.search);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(params.get('g') || '');
  const g = GUIDES.find((x) => x.id === open);
  const results = useMemo(() => (q.trim() ? GUIDES.filter((x) => matchesQuery([x.title, x.intro, ...(x.steps || []), ...(x.auto || []), ...(x.tips || [])], q)) : null), [q]);
  const show = (id) => { setOpen(id); history.replaceState({}, '', id ? `/help?g=${id}` : '/help'); window.scrollTo(0, 0); };

  if (g) {
    const i = GUIDES.indexOf(g);
    const next = GUIDES[i + 1];
    return (
      <div className="help">
        <button className="btn ghost sm" onClick={() => show('')}><ArrowLeft size={15} /> ការណែនាំទាំងអស់</button>
        <article className="card guide">
          <h1><span>{g.icon}</span> {g.title}</h1>
          {g.intro && <p className="guide-intro">{g.intro}</p>}
          <ol className="guide-steps">{g.steps.map((s, k) => <li key={k}><span>{kmDigits(k + 1)}</span><p>{s}</p></li>)}</ol>
          {g.auto?.length > 0 && (
            <div className="guide-auto"><b><Sparkles size={15} /> ស្វ័យប្រវត្តិ</b>{g.auto.map((a, k) => <p key={k}>✓ {a}</p>)}</div>
          )}
          {g.tips?.length > 0 && <div className="guide-tips">{g.tips.map((t, k) => <p key={k}>💡 {t}</p>)}</div>}
          <div className="row-btns">
            {g.go && <button className="btn primary" onClick={() => navigate(g.go)}>ទៅធ្វើឥឡូវ <ArrowRight size={15} /></button>}
            {next && <button className="btn ghost" onClick={() => show(next.id)}>បន្ទាប់៖ {next.icon} {next.title}</button>}
          </div>
        </article>
      </div>
    );
  }
  return (
    <div className="help">
      <div className="page-head"><h1>ជំនួយ និងការណែនាំ</h1></div>
      <label className="help-search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ស្វែងរក… ឧ. កុងទ័រ, KHQR, ប្រាក់កក់" /></label>
      {results ? (
        <div className="guide-grid">
          {results.map((x) => <GuideCard key={x.id} g={x} onOpen={show} />)}
          {!results.length && <p className="muted">រកមិនឃើញ — សាកពាក្យផ្សេង ឬផ្ញើសំណួរនៅ «មតិ និងសំណើ»។</p>}
        </div>
      ) : CATEGORIES.map(([cat, label]) => (
        <section key={cat} className="help-cat">
          <h2>{label}</h2>
          <div className="guide-grid">{GUIDES.filter((x) => x.cat === cat).map((x) => <GuideCard key={x.id} g={x} onOpen={show} />)}</div>
        </section>
      ))}
    </div>
  );
}

function GuideCard({ g, onOpen }) {
  return (
    <button className="card guide-card" onClick={() => onOpen(g.id)}>
      <span className="gc-icon">{g.icon}</span>
      <span><b>{g.title}</b><small>{kmDigits(g.steps.length)} ជំហាន{g.auto?.length ? ' · មានស្វ័យប្រវត្តិ' : ''}</small></span>
    </button>
  );
}
