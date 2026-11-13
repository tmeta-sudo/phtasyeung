import React, { useState } from 'react';
import { Building2, Droplets, Wallet, Globe, Lock, DatabaseZap, Languages } from 'lucide-react';
import { useApp, useFmt, Field, QR } from '../ui.jsx';
import { api } from '../api.js';
import { usdInWords, khr, toRiel, kmDigits, lunarKm } from '../../shared/khmer.js';

export default function SettingsPage() {
  const { state, call, notify } = useApp();
  const { $ } = useFmt();
  const [f, setF] = useState(() => ({ ...state.settings, khqr: { ...state.settings.khqr } }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [pw, setPw] = useState({ current: '', next: '' });
  const save = (e, part) => { e?.preventDefault(); call('PUT', '/api/settings', part, 'បានរក្សាទុកការកំណត់'); };
  let legacy = null;
  try { legacy = JSON.parse(localStorage.getItem('rental-v2') || 'null'); } catch { /* ignore */ }

  return (
    <>
      <div className="page-head"><h1>ការកំណត់</h1></div>
      <div className="settings-grid">
        <form className="card" onSubmit={(e) => save(e, { propertyName: f.propertyName, propertyNameEn: f.propertyNameEn, address: f.address, phone: f.phone, coverUrl: f.coverUrl })}>
          <h3 className="sec-title"><Building2 size={17} /> អចលនទ្រព្យ</h3>
          <div className="form-grid">
            <Field label="ឈ្មោះ (ខ្មែរ)"><input value={f.propertyName} onChange={(e) => set('propertyName', e.target.value)} /></Field>
            <Field label="ឈ្មោះ (ឡាតាំង)" hint="ប្រើក្នុង KHQR"><input value={f.propertyNameEn} onChange={(e) => set('propertyNameEn', e.target.value)} /></Field>
            <Field label="អាសយដ្ឋាន" wide><input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label="ទូរស័ព្ទ"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="តំណរូបភាពគម្រប (https://…)"><input value={f.coverUrl} onChange={(e) => set('coverUrl', e.target.value)} /></Field>
          </div>
          <button className="btn primary">រក្សាទុក</button>
        </form>

        <form className="card" onSubmit={(e) => save(e, { waterRate: f.waterRate, electricRate: f.electricRate, exchangeRate: f.exchangeRate, dueDays: f.dueDays })}>
          <h3 className="sec-title"><Droplets size={17} /> តម្លៃ និងអត្រាប្តូរប្រាក់</h3>
          <div className="form-grid">
            <Field label="ថ្លៃទឹក ($ / m³)"><input type="number" min="0" step="0.01" value={f.waterRate} onChange={(e) => set('waterRate', e.target.value)} /></Field>
            <Field label="ថ្លៃភ្លើង ($ / kWh)"><input type="number" min="0" step="0.01" value={f.electricRate} onChange={(e) => set('electricRate', e.target.value)} /></Field>
            <Field label="អត្រាប្តូរប្រាក់ (៛ / $)" hint={`$100 = ${khr(toRiel(100, f.exchangeRate))}`}><input type="number" min="1" value={f.exchangeRate} onChange={(e) => set('exchangeRate', e.target.value)} /></Field>
            <Field label="ថ្ងៃផុតកំណត់បង់ (ថ្ងៃក្រោយចេញវិក្កយបត្រ)"><input type="number" min="0" max="60" value={f.dueDays} onChange={(e) => set('dueDays', e.target.value)} /></Field>
          </div>
          <button className="btn primary">រក្សាទុក</button>
        </form>

        <form className="card" onSubmit={(e) => save(e, { khqr: f.khqr })}>
          <h3 className="sec-title"><Wallet size={17} /> KHQR (Bakong)</h3>
          <p className="muted">ដាក់ Bakong account ID របស់អ្នក (ឧ. <code>yourname@aclb</code>, <code>yourname@abaa</code>, <code>yourname@wing</code>)។ វិក្កយបត្រនីមួយៗនឹងមាន KHQR ជាមួយចំនួនទឹកប្រាក់ និងលេខវិក្កយបត្រស្រាប់ — អតិថិជនស្កេនបង់តាមកម្មវិធីធនាគារណាមួយ។</p>
          <div className="form-grid">
            <Field label="Bakong account ID"><input value={f.khqr.accountId} onChange={(e) => set('khqr', { ...f.khqr, accountId: e.target.value })} placeholder="name@aclb" /></Field>
            <Field label="ឈ្មោះអ្នកទទួល (ឡាតាំង)"><input maxLength={25} value={f.khqr.merchantName} onChange={(e) => set('khqr', { ...f.khqr, merchantName: e.target.value })} placeholder="SOK DARA" /></Field>
            <Field label="ទីក្រុង"><input maxLength={15} value={f.khqr.city} onChange={(e) => set('khqr', { ...f.khqr, city: e.target.value })} /></Field>
          </div>
          <div className="row-btns">
            <button className="btn primary">រក្សាទុក</button>
            {state.settings.khqrReady && state.invoices.find((i) => i.khqr) && <QR value={state.invoices.find((i) => i.khqr).khqr} size={84} />}
          </div>
        </form>

        <form className="card" onSubmit={(e) => save(e, { publicUrl: f.publicUrl, khmerNumerals: f.khmerNumerals })}>
          <h3 className="sec-title"><Languages size={17} /> ភាសា និងអាសយដ្ឋានគេហទំព័រ</h3>
          <label className="switch-row"><input type="checkbox" checked={!!f.khmerNumerals} onChange={(e) => set('khmerNumerals', e.target.checked)} />
            <span><b>បង្ហាញលេខខ្មែរ ({kmDigits('0123456789')})</b><small>ឧទាហរណ៍: {$(1250.5)} · {usdInWords(1250.5)}</small></span></label>
          <p className="muted small">ថ្ងៃនេះ: {lunarKm(state.today.ymd)}</p>
          <Field label={<><Globe size={14} /> អាសយដ្ឋានសាធារណៈ (Public URL)</>} hint="ឧ. https://rent.example.com — ប្រើក្នុង QR និងតំណ Telegram។ ទុកទំនេរ = ប្រើអាសយដ្ឋានបច្ចុប្បន្ន។">
            <input value={f.publicUrl} onChange={(e) => set('publicUrl', e.target.value)} placeholder={location.origin} />
          </Field>
          <button className="btn primary">រក្សាទុក</button>
        </form>

        {!state.settings.passwordFromEnv && (
          <form className="card" onSubmit={async (e) => { e.preventDefault(); try { await api('POST', '/api/auth/password', pw); setPw({ current: '', next: '' }); notify('បានប្តូរពាក្យសម្ងាត់'); } catch (err) { notify(err.message, true); } }}>
            <h3 className="sec-title"><Lock size={17} /> ពាក្យសម្ងាត់</h3>
            <div className="form-grid">
              <Field label="ពាក្យសម្ងាត់បច្ចុប្បន្ន"><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
              <Field label="ពាក្យសម្ងាត់ថ្មី (≥ ៨ តួ)"><input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            </div>
            <button className="btn primary">ប្តូរ</button>
          </form>
        )}

        {legacy?.rooms?.length > 0 && (
          <div className="card">
            <h3 className="sec-title"><DatabaseZap size={17} /> នាំចូលទិន្នន័យពីកំណែចាស់</h3>
            <p className="muted">រកឃើញ {legacy.rooms.length} បន្ទប់ និង {legacy.invoices?.length || 0} វិក្កយបត្រ ដែលរក្សាទុកក្នុង browser នេះដោយកំណែមុន។</p>
            <button className="btn primary" onClick={() => call('POST', '/api/import-legacy', legacy, (r) => `បាននាំចូល ${r.result.rooms} បន្ទប់ · ${r.result.tenants} អតិថិជន · ${r.result.invoices} វិក្កយបត្រ`)}>នាំចូល</button>
          </div>
        )}
      </div>
    </>
  );
}
