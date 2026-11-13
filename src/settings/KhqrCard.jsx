import React, { useRef, useState } from 'react';
import { Wallet, Upload, CheckCircle2, Building2, User, Zap, AlertTriangle } from 'lucide-react';
import { useApp, Field, QR } from '../ui.jsx';
import { decodeQrFromFile } from '../qrdecode.js';

const BANKS = { aba: 'ABA', abaa: 'ABA', aclb: 'ACLEDA', wing: 'Wing', cadi: 'Canadia', pcbb: 'Prince', ppcb: 'PPCBank', amrc: 'AMK', sthb: 'Sathapana', bkrt: 'Bakong', hlbk: 'Hong Leong', cimb: 'CIMB', ftcc: 'FTB', vtbk: 'Vattanac', mbbk: 'Maybank', cbkt: 'Chip Mong', aeon: 'AEON', jtrb: 'J Trust', cpbk: 'CP Bank' };
export const bankOf = (id = '') => BANKS[String(id).split('@')[1]?.toLowerCase()] || String(id).split('@')[1] || '';

/** Upload a picture of your bank's KHQR — no typing account ids. */
export default function KhqrCard() {
  const { state, call, notify } = useApp();
  const k = state.settings.khqr || {};
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ accountId: k.accountId || '', merchantName: k.merchantName || '', city: k.city || 'Phnom Penh' });
  const sample = state.invoices.find((i) => i.khqr)?.khqr;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const raw = await decodeQrFromFile(file);
      if (!raw) { notify('រកមិនឃើញ QR ក្នុងរូបភាពនេះ។ សូមថតរូបអេក្រង់ KHQR ពីកម្មវិធីធនាគារ។', true); return; }
      await call('PUT', '/api/settings', { khqr: { raw } }, 'បានរក្សាទុក KHQR ✅');
    } catch { notify('មិនអាចអានរូបភាពបាន', true); } finally { setBusy(false); }
  }

  return (
    <div className="card khqr-card">
      <h3 className="sec-title"><Wallet size={17} /> KHQR ទទួលប្រាក់</h3>
      {state.settings.khqrReady ? (
        <div className="khqr-current">
          <span className="kc-icon">{k.type === 'merchant' ? <Building2 size={20} /> : <User size={20} />}</span>
          <div>
            <b>{k.merchantName || '—'}</b>
            <small>{k.accountId} · {bankOf(k.accountId)} · {k.type === 'merchant' ? 'គណនីអាជីវកម្ម' : 'គណនីផ្ទាល់ខ្លួន'}</small>
            <small className="ok-text"><CheckCircle2 size={13} /> វិក្កយបត្រនីមួយៗនឹងមាន KHQR ជាមួយចំនួនទឹកប្រាក់ស្រាប់</small>
          </div>
          {sample && <QR value={sample} size={72} />}
        </div>
      ) : (
        <p className="muted">ថតរូបអេក្រង់ (screenshot) KHQR «ទទួលប្រាក់» ពីកម្មវិធីធនាគាររបស់អ្នក (ABA, ACLEDA, Wing…) ហើយផ្ទុកឡើងនៅទីនេះ — មិនចាំបាច់វាយលេខគណនីទេ។</p>
      )}
      <button type="button" className="khqr-drop" onClick={() => input.current.click()} disabled={busy}>
        <Upload size={22} />
        <b>{busy ? 'កំពុងអាន…' : state.settings.khqrReady ? 'ប្តូរ KHQR' : 'ផ្ទុករូប KHQR ឡើង'}</b>
        <small>រូបថត ឬ screenshot · អានក្នុងឧបករណ៍របស់អ្នក</small>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
      <div className={'bakong-box ' + (state.settings.bakong?.enabled ? 'on' : '')}>
        {state.settings.bakong?.error ? <AlertTriangle size={18} /> : <Zap size={18} />}
        <div>
          <b>{state.settings.bakong?.enabled ? 'បញ្ជាក់ការបង់ប្រាក់ស្វ័យប្រវត្តិ (Bakong) — បើក' : 'បញ្ជាក់ការបង់ប្រាក់ស្វ័យប្រវត្តិ — បិទ'}</b>
          <small>{state.settings.bakong?.error || (state.settings.bakong?.enabled ? 'ពេលអតិថិជនស្កេន KHQR បង់ វិក្កយបត្រនឹងសម្គាល់ថា «បានបង់» ដោយខ្លួនឯង ហើយផ្ញើបង្កាន់ដៃភ្លាមៗ។' : 'ត្រូវការ Bakong developer token (ឥតគិតថ្លៃ) ពីធនាគារជាតិ។')}</small>
        </div>
      </div>
      <details className="khqr-manual">
        <summary>{state.settings.khqr?.ownBakongToken ? 'Bakong token ផ្ទាល់ខ្លួន ✓' : 'ប្រើ Bakong token ផ្ទាល់ខ្លួន'}</summary>
        <form className="stack-form" onSubmit={(e) => { e.preventDefault(); call('PUT', '/api/settings', { bakongToken: new FormData(e.currentTarget).get('t') || '' }, 'បានរក្សាទុក'); e.currentTarget.reset(); }}>
          <p className="muted small">ចុះឈ្មោះឥតគិតថ្លៃនៅ <a href="https://api-bakong.nbc.gov.kh/register" target="_blank" rel="noreferrer">api-bakong.nbc.gov.kh</a> ហើយបិទភ្ជាប់ token (មានសុពលភាព ៩០ ថ្ងៃ)។</p>
          <input name="t" type="password" autoComplete="off" placeholder="eyJhbGciOi…" className="pw-input" />
          <div className="row-btns"><button className="btn ghost sm">រក្សាទុក</button>
            {state.settings.khqr?.ownBakongToken && <button type="button" className="btn ghost sm danger" onClick={() => call('PUT', '/api/settings', { bakongToken: '' }, 'បានដក token')}>ដកចេញ</button>}</div>
        </form>
      </details>
      <details className="khqr-manual">
        <summary>ឬបញ្ចូល Bakong ID ដោយដៃ</summary>
        <form className="stack-form" onSubmit={(e) => { e.preventDefault(); call('PUT', '/api/settings', { khqr: manual }, 'បានរក្សាទុក'); }}>
          <div className="form-grid">
            <Field label="Bakong account ID"><input value={manual.accountId} onChange={(e) => setManual({ ...manual, accountId: e.target.value })} placeholder="name@aclb" /></Field>
            <Field label="ឈ្មោះអ្នកទទួល (ឡាតាំង)"><input maxLength={25} value={manual.merchantName} onChange={(e) => setManual({ ...manual, merchantName: e.target.value })} /></Field>
            <Field label="ទីក្រុង"><input maxLength={15} value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} /></Field>
          </div>
          <button className="btn ghost sm">រក្សាទុក</button>
        </form>
      </details>
    </div>
  );
}
