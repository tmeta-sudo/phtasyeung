import React, { useState } from 'react';
import { Bot, Send, RefreshCw, Trash2, Zap, BellRing, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { useApp, useFmt, QR, Field, Avatar, tenantPhoto, navigate } from '../ui.jsx';

export default function TelegramPage() {
  const { state, call } = useApp();
  const { n } = useFmt();
  const s = state.settings;
  const bot = state.bot;
  const [token, setToken] = useState('');
  const [auto, setAuto] = useState(s.auto);
  const active = state.tenants.filter((t) => t.status === 'active');
  const linked = active.filter((t) => t.telegram?.chatId);
  const adminLink = bot.username ? `https://t.me/${bot.username}?start=admin-${s.telegram.adminLinkCode}` : '';
  const setA = (k, v) => setAuto((a) => ({ ...a, [k]: v }));

  return (
    <>
      <div className="page-head"><h1>Telegram & ស្វ័យប្រវត្តិ</h1></div>
      <div className="tg-grid">
        <section className="card">
          <h3 className="sec-title"><Bot size={17} /> ① Telegram Bot</h3>
          <div className={'bot-status ' + (bot.running ? 'on' : 'off')}>
            {bot.running ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>
              {bot.running ? <>@{bot.username} {bot.own ? '(bot ផ្ទាល់ខ្លួន)' : '(bot រួមរបស់ផ្ទះយើង)'} រួចរាល់</>
                : bot.error ? `មានបញ្ហា: ${bot.error}` : bot.configured ? 'កំពុងពិនិត្យ…' : 'មិនទាន់មាន bot'}
            </span>
            {bot.own && <button className="link-btn" onClick={() => call('POST', '/api/telegram/recheck', {}, 'បានពិនិត្យឡើងវិញ')} aria-label="ពិនិត្យឡើងវិញ"><RefreshCw size={14} /></button>}
          </div>
          {bot.platformAvailable && !bot.own && <p className="muted">អ្នកមិនចាំបាច់ធ្វើអ្វីទេ — វិក្កយបត្រនឹងផ្ញើតាម @{bot.username} ដោយបង្ហាញឈ្មោះ <b>{s.propertyName}</b>។</p>}
          <details className="own-bot" open={!bot.platformAvailable}>
            <summary>{bot.own ? 'Bot ផ្ទាល់ខ្លួន' : 'ប្រើ bot ផ្ទាល់ខ្លួនជាមួយឈ្មោះម៉ាករបស់អ្នក (ជម្រើស)'}</summary>
            <form className="stack-form" onSubmit={(e) => { e.preventDefault(); if (!bot.own || window.confirm('ការប្តូរ bot តម្រូវឱ្យអតិថិជន និងម្ចាស់ផ្ទះភ្ជាប់ Telegram ម្តងទៀត។ បន្ត?')) call('PUT', '/api/settings', { telegramToken: token }, 'បានរក្សាទុក Bot token').then((r) => r && setToken('')); }}>
              <ol className="steps">
                <li>បើក Telegram ហើយស្វែងរក <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a></li>
                <li>ផ្ញើ <code>/newbot</code> ហើយដាក់ឈ្មោះ</li>
                <li>ចម្លង token មកបិទភ្ជាប់ខាងក្រោម</li>
              </ol>
              <p className="tip">⚠️ ការប្តូរ bot នឹងផ្តាច់ការភ្ជាប់ Telegram ទាំងអស់ — អតិថិជនត្រូវស្កេន QR ម្តងទៀត។</p>
              <Field label={bot.own ? `Bot token (បច្ចុប្បន្ន ${s.telegram.tokenHint})` : 'Bot token'}>
                <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" />
              </Field>
              <div className="row-btns">
                <button className="btn primary" disabled={!token}><KeyRound size={15} /> រក្សាទុក</button>
                {bot.own && <button type="button" className="btn ghost danger" onClick={() => window.confirm('ត្រឡប់ទៅប្រើ bot រួម? អតិថិជនត្រូវភ្ជាប់ម្តងទៀត។') && call('PUT', '/api/settings', { telegramToken: '' }, 'បានដក bot')}>ដក bot ផ្ទាល់ខ្លួន</button>}
              </div>
            </form>
          </details>
        </section>

        <section className="card">
          <h3 className="sec-title"><Send size={17} /> ② ភ្ជាប់ Telegram ម្ចាស់ផ្ទះ</h3>
          <p className="muted">ស្កេន QR នេះដោយទូរស័ព្ទរបស់អ្នក ដើម្បីទទួលការជូនដំណឹងការបង់ប្រាក់ និងបញ្ជាក់ការបង់ពី Telegram ផ្ទាល់។ QR ប្រើបានតែម្តង។</p>
          <div className="center-col">
            <QR value={adminLink} size={150} />
            {adminLink && <a className="btn ghost sm" href={adminLink} target="_blank" rel="noreferrer">បើកក្នុង Telegram</a>}
          </div>
          <div className="rows">
            {s.telegram.adminChats.map((c) => (
              <div key={c.chatId} className="row static">
                <Avatar name={c.name} size={30} /><span><b>{c.name}</b><small className="muted">{c.username ? '@' + c.username : c.chatId}</small></span>
                <button className="icon-btn" onClick={() => window.confirm('ដកចេញ?') && call('DELETE', `/api/telegram/admins/${c.chatId}`, undefined, 'បានដកចេញ')} aria-label="ដកចេញ"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="row-btns">
            <button className="btn ghost sm" disabled={!s.telegram.adminChats.length || !bot.configured} onClick={() => call('POST', '/api/telegram/test', {}, 'បានផ្ញើសារសាកល្បង')}>ផ្ញើសារសាកល្បង</button>
            <button className="btn ghost sm" onClick={() => call('PUT', '/api/settings', { rotateAdminLink: true }, 'បានបង្កើត QR ថ្មី')}><RefreshCw size={14} /> QR ថ្មី</button>
          </div>
        </section>

        <section className="card auto-settings">
          <h3 className="sec-title"><Zap size={17} /> ③ វិក្កយបត្រស្វ័យប្រវត្តិ</h3>
          <label className="switch-row">
            <input type="checkbox" checked={auto.enabled} onChange={(e) => setA('enabled', e.target.checked)} />
            <span><b>បើកការបង្កើតវិក្កយបត្រស្វ័យប្រវត្តិ</b><small>រៀងរាល់ខែ ប្រព័ន្ធបង្កើតវិក្កយបត្រ (ថ្លៃជួល + ទឹក + ភ្លើង) ហើយផ្ញើ KHQR ទៅ Telegram អតិថិជននីមួយៗ</small></span>
          </label>
          <div className="form-grid">
            <Field label="ថ្ងៃទីនៃខែ"><input type="number" min="1" max="28" value={auto.day} onChange={(e) => setA('day', e.target.value)} /></Field>
            {state.runtime.serverless
              ? <Field label="ម៉ោង" hint="ដំណើរការរៀងរាល់ព្រឹក"><input value="ម៉ោង ៨ ព្រឹក" disabled /></Field>
              : <Field label="ម៉ោង (ម៉ោងកម្ពុជា)"><input type="number" min="0" max="23" value={auto.hour} onChange={(e) => setA('hour', e.target.value)} /></Field>}
            <Field label="រំលឹករៀងរាល់ (ថ្ងៃ)" hint="0 = មិនរំលឹក"><input type="number" min="0" max="30" value={auto.reminderDays} onChange={(e) => setA('reminderDays', e.target.value)} /></Field>
            <label className="switch-row small"><input type="checkbox" checked={auto.send} onChange={(e) => setA('send', e.target.checked)} /><span>ផ្ញើតាម Telegram ដោយស្វ័យប្រវត្តិ</span></label>
          </div>
          <p className="tip">💡 កត់កុងទ័រមុនថ្ងៃដែលបានកំណត់ ដើម្បីឱ្យវិក្កយបត្ររួមបញ្ចូលថ្លៃទឹក និងភ្លើង។</p>
          <div className="row-btns">
            <button className="btn primary" onClick={() => call('PUT', '/api/settings', { auto }, 'បានរក្សាទុក')}>រក្សាទុក</button>
            <button className="btn ghost" onClick={() => call('POST', '/api/auto/run', {}, (r) => `បានបង្កើត ${n(r.result.created)} · ផ្ញើ ${n(r.result.ok || 0)}`)}><Zap size={15} /> ដំណើរការឥឡូវ</button>
            <button className="btn ghost" disabled={!bot.configured} onClick={() => call('POST', '/api/auto/run', { what: 'reminders' }, (r) => `បានរំលឹក ${n(r.result.ok || 0)}`)}><BellRing size={15} /> រំលឹកឥឡូវ</button>
          </div>
          {s.auto.lastRunMonth && <small className="muted">ដំណើរការចុងក្រោយ: {s.auto.lastRunMonth}</small>}
        </section>

        <section className="card">
          <h3 className="sec-title"><Send size={17} /> អតិថិជនបានភ្ជាប់ {n(linked.length)}/{n(active.length)}</h3>
          <div className="rows">
            {active.map((t) => (
              <button key={t.id} className="row" onClick={() => navigate('/customers/' + t.id)}>
                <Avatar name={t.nameKm} src={tenantPhoto(t)} size={32} />
                <span><b>{t.nameKm}</b><small className="muted">{t.roomId} {t.telegram?.username ? '· @' + t.telegram.username : ''}</small></span>
                <span className={'pill ' + (t.telegram?.blocked ? 'danger' : t.telegram?.chatId ? 'ok' : 'muted')}><i />{t.telegram?.blocked ? 'បានបិទ bot' : t.telegram?.chatId ? 'បានភ្ជាប់' : 'មិនទាន់'}</span>
              </button>
            ))}
          </div>
          <p className="tip">អតិថិជនភ្ជាប់ដោយស្កេន QR Telegram នៅលើទំព័រប្រវត្តិរូប ឬប័ណ្ណស្វាគមន៍ដែលបានបោះពុម្ព។ ពួកគេអាចផ្ញើរូបបង្កាន់ដៃ ABA/ACLEDA/Wing មក bot ហើយអ្នកបញ្ជាក់ដោយចុចមួយដង។</p>
        </section>
      </div>
    </>
  );
}
