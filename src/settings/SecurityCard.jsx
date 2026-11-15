import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, MonitorSmartphone, LogOut, Copy, Download } from 'lucide-react';
import { useApp, QR, Modal } from '../ui.jsx';
import { api } from '../api.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Two-step sign-in (authenticator app + recovery codes) and the list of signed-in devices. */
export default function SecurityCard() {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, url }
  const [codes, setCodes] = useState(null); // recovery codes, shown once
  const [ask, setAsk] = useState(null); // 'disable' | 'recovery'
  const load = useCallback(() => api('GET', '/api/account/security').then(setData).catch((e) => notify(e.message, true)), [notify]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <section className="card"><h3 className="sec-title"><ShieldCheck size={17} /> សុវត្ថិភាព</h3><span className="spinner" /></section>;

  const start = async () => { try { setSetup(await api('POST', '/api/account/2fa/setup', {})); } catch (e) { notify(e.message, true); } };
  const signOutOthers = async () => {
    if (!window.confirm('ចេញពីឧបករណ៍ផ្សេងទាំងអស់ (រក្សាតែឧបករណ៍នេះ)?')) return;
    try { const r = await api('POST', '/api/account/sessions/others', {}); notify(`បានចេញពី ${r.removed} ឧបករណ៍`); load(); } catch (e) { notify(e.message, true); }
  };
  const signOut = async (id) => { try { await api('DELETE', `/api/account/sessions/${id}`); load(); } catch (e) { notify(e.message, true); } };
  const others = data.sessions.filter((s) => !s.current).length;

  return (
    <section className="card security-card" id="security">
      <h3 className="sec-title"><ShieldCheck size={17} /> សុវត្ថិភាពគណនី</h3>

      <div className={'sec-status ' + (data.twoFactor ? 'on' : 'off')}>
        {data.twoFactor ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
        <span>
          <b>ការចូល ២ ជំហាន (2FA): {data.twoFactor ? 'បើក' : 'បិទ'}</b>
          <small>{data.twoFactor ? `ក្រៅពីពាក្យសម្ងាត់ ត្រូវការលេខ ៦ ខ្ទង់ពីទូរស័ព្ទរបស់អ្នក។ លេខកូដបម្រុងនៅសល់ ${data.recoveryLeft}។` : 'បើកដើម្បីការពារ៖ ទោះគេដឹងពាក្យសម្ងាត់ ក៏ចូលមិនបានដែរ បើគ្មានទូរស័ព្ទរបស់អ្នក។'}</small>
        </span>
      </div>
      <div className="row-btns">
        {data.twoFactor ? (
          <>
            <button className="btn ghost sm" onClick={() => setAsk('recovery')}>🔑 លេខកូដបម្រុងថ្មី</button>
            <button className="btn ghost sm" onClick={() => setAsk('disable')}>បិទ 2FA</button>
          </>
        ) : <button className="btn primary" onClick={start}><ShieldCheck size={16} /> បើក 2FA</button>}
      </div>

      <h4 className="sec-sub"><MonitorSmartphone size={15} /> ឧបករណ៍ដែលកំពុងចូល ({data.sessions.length})</h4>
      <div className="rows devices">
        {data.sessions.map((s) => (
          <div key={s.id} className="row device-row">
            <span><b>{s.device}{s.current && <em className="chip sm"> ឧបករណ៍នេះ</em>}{s.mfa && ' 🛡️'}</b><small className="muted">{s.ip} · ចូល {when(s.createdAt)} · ប្រើចុងក្រោយ {when(s.lastSeen)}</small></span>
            {!s.current && <button className="icon-btn" onClick={() => signOut(s.id)} aria-label="ចេញ"><LogOut size={15} /></button>}
          </div>
        ))}
      </div>
      {others > 0 && <button className="btn ghost sm" onClick={signOutOthers}><LogOut size={14} /> ចេញពីឧបករណ៍ផ្សេងទាំងអស់</button>}
      <p className="tip">🔔 ពេលមានការចូលពីឧបករណ៍ថ្មី អ្នកនឹងទទួលដំណឹងតាម Telegram និងទូរស័ព្ទ។</p>

      {setup && <EnableModal setup={setup} onClose={() => setSetup(null)} onEnabled={(c) => { setSetup(null); setCodes(c); load(); }} />}
      {ask && <CodeModal what={ask} onClose={() => setAsk(null)} onDone={(r) => { setAsk(null); if (r?.recoveryCodes) setCodes(r.recoveryCodes); else notify('បានបិទ 2FA'); load(); }} />}
      {codes && <RecoveryCodes codes={codes} onClose={() => setCodes(null)} />}
    </section>
  );
}

function EnableModal({ setup, onClose, onEnabled }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api('POST', '/api/account/2fa/enable', { code }); onEnabled(r.recoveryCodes); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="បើកការចូល ២ ជំហាន" onClose={onClose}>
      <form className="stack-form tf-setup" onSubmit={submit}>
        <ol className="tf-steps">
          <li>ដំឡើងកម្មវិធី <b>Google Authenticator</b> ឬ <b>Microsoft Authenticator</b> (ឥតគិតថ្លៃ)។</li>
          <li>ក្នុងកម្មវិធី ចុច ＋ → ស្កេន QR នេះ។ (នៅលើទូរស័ព្ទតែមួយ? ចុច «ចម្លងកូដ» ហើយបិទភ្ជាប់)</li>
        </ol>
        <div className="tf-qr"><QR value={setup.url} size={180} label="2FA QR" /></div>
        <div className="tf-secret"><code>{setup.secret.match(/.{1,4}/g).join(' ')}</code><button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(setup.secret)}><Copy size={14} /> ចម្លងកូដ</button></div>
        <ol className="tf-steps" start={3}><li>វាយលេខ ៦ ខ្ទង់ដែលកម្មវិធីបង្ហាញ៖</li></ol>
        <input className="otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" required autoFocus aria-label="លេខកូដ" />
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>បោះបង់</button><button className="btn primary" disabled={busy || code.length !== 6}>{busy ? '…' : 'បើក'}</button></div>
      </form>
    </Modal>
  );
}

function CodeModal({ what, onClose, onDone }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr('');
    try { onDone(await api('POST', `/api/account/2fa/${what}`, { code })); } catch (x) { setErr(x.message); }
  }
  return (
    <Modal title={what === 'disable' ? 'បិទ 2FA' : 'លេខកូដបម្រុងថ្មី'} onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <p className="muted">{what === 'disable' ? 'វាយលេខ ៦ ខ្ទង់ពីកម្មវិធី ឬលេខកូដបម្រុង ដើម្បីបញ្ជាក់ថាជាអ្នក។' : 'វាយលេខ ៦ ខ្ទង់ពីកម្មវិធី។ លេខកូដបម្រុងចាស់នឹងលែងប្រើបាន។'}</p>
        <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 12))} autoComplete="one-time-code" placeholder="123456" required autoFocus aria-label="លេខកូដ" />
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>បោះបង់</button><button className={'btn ' + (what === 'disable' ? 'danger' : 'primary')}>បញ្ជាក់</button></div>
      </form>
    </Modal>
  );
}

function RecoveryCodes({ codes, onClose }) {
  const text = `ផ្ទះយើង — លេខកូដបម្រុង 2FA\n(លេខនីមួយៗប្រើបានតែម្តង)\n\n${codes.join('\n')}\n`;
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'phteah-yeung-recovery-codes.txt'; a.click();
  };
  return (
    <Modal title="✅ បានបើក — រក្សាទុកលេខកូដបម្រុង" onClose={onClose}>
      <p className="form-warn">បើបាត់ទូរស័ព្ទ លេខទាំងនេះជាវិធីតែមួយគត់ដើម្បីចូលគណនី។ ថតរូប ឬសរសេរទុកកន្លែងសុវត្ថិភាព។ យើងនឹងមិនបង្ហាញម្តងទៀតទេ។</p>
      <div className="recovery-grid">{codes.map((c) => <code key={c}>{c}</code>)}</div>
      <div className="form-actions">
        <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(text)}><Copy size={15} /> ចម្លង</button>
        <button className="btn ghost" onClick={download}><Download size={15} /> ទាញយក</button>
        <button className="btn primary" onClick={onClose}>ខ្ញុំបានរក្សាទុកហើយ</button>
      </div>
    </Modal>
  );
}
