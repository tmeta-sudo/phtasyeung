import React, { useState } from 'react';
import { Building2, Droplets, Wallet, Globe, Lock, DatabaseZap, Languages, Download, Trash2, UserRound, Send, Palette, Unlink, FileText } from 'lucide-react';
import TelegramLogin from '../TelegramLogin.jsx';
import { ThemePicker } from '../theme.jsx';
import KhqrCard from '../settings/KhqrCard.jsx';
import LocationCard from '../settings/LocationCard.jsx';
import { PLACEHOLDERS } from '../contract.js';
import StorageCard from '../settings/StorageCard.jsx';
import BackupCard from '../settings/BackupCard.jsx';
import NotifyCard from '../settings/NotifyCard.jsx';
import TeamCard from '../settings/TeamCard.jsx';
import { useApp, useFmt, Field, QR } from '../ui.jsx';
import { api } from '../api.js';
import { usdInWords, khr, toRiel, kmDigits, lunarKm } from '../../shared/khmer.js';

export default function SettingsPage() {
  const { state, call, notify, reload } = useApp();
  const { $ } = useFmt();
  const [f, setF] = useState(() => ({ ...state.settings, khqr: { ...state.settings.khqr }, contract: { ...state.settings.contract } }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [pw, setPw] = useState({ current: '', next: '' });
  const [linking, setLinking] = useState(false);
  const acct = state.account;
  const role = acct.role || 'owner';
  const isOwner = role === 'owner';
  const recovered = new URLSearchParams(location.search).has('recovered');
  const needCurrent = acct.hasPassword && !acct.canReset;
  const save = (e, part) => { e?.preventDefault(); call('PUT', '/api/settings', part, 'បានរក្សាទុកការកំណត់'); };
  let legacy = null;
  try { legacy = JSON.parse(localStorage.getItem('rental-v2') || 'null'); } catch { /* ignore */ }

  return (
    <>
      <div className="page-head"><h1>ការកំណត់</h1></div>
      <div className="settings-grid">
        {isOwner && (<>
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
        </>)}

        {role !== 'staff' && (<>
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
        </>)}

        {isOwner && (<>
        <LocationCard />

        <KhqrCard />

        <form className="card wide-card" onSubmit={(e) => save(e, { ownerName: f.ownerName, contract: f.contract })}>
          <h3 className="sec-title"><FileText size={17} /> គំរូកិច្ចសន្យា</h3>
          <div className="form-grid three">
            <Field label="ឈ្មោះម្ចាស់ផ្ទះ (ក្នុងកិច្ចសន្យា)"><input value={f.ownerName || ''} onChange={(e) => set('ownerName', e.target.value)} /></Field>
            <Field label="ប្រាក់កក់ (ខែ)"><input type="number" min="0" max="12" value={f.contract?.depositMonths ?? 1} onChange={(e) => set('contract', { ...f.contract, depositMonths: e.target.value })} /></Field>
            <Field label="បង់មុន (ខែ)"><input type="number" min="0" max="12" value={f.contract?.prepaidMonths ?? 1} onChange={(e) => set('contract', { ...f.contract, prepaidMonths: e.target.value })} /></Field>
          </div>
          <Field label="អត្ថបទគំរូ"><textarea rows={10} className="contract-text" value={f.contract?.template || ''} onChange={(e) => set('contract', { ...f.contract, template: e.target.value })} /></Field>
          <div className="ph-list">{PLACEHOLDERS.map(([k, l]) => <button type="button" key={k} onClick={() => set('contract', { ...f.contract, template: (f.contract?.template || '') + `{{${k}}}` })} title="បញ្ចូល">{`{{${k}}}`}<small>{l}</small></button>)}</div>
          <button className="btn primary">រក្សាទុក</button>
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
        </>)}

        <form className={'card ' + (recovered ? 'highlight' : '')} id="password" onSubmit={async (e) => { e.preventDefault(); try { await api('POST', '/api/auth/password', pw); setPw({ current: '', next: '' }); notify('បានរក្សាទុកពាក្យសម្ងាត់'); reload(); } catch (err) { notify(err.message, true); } }}>
          <h3 className="sec-title"><Lock size={17} /> ពាក្យសម្ងាត់</h3>
          {recovered && <p className="form-warn">🔑 អ្នកបានចូលតាមតំណស្តារគណនី។ សូមកំណត់ពាក្យសម្ងាត់ថ្មីខាងក្រោម (មិនត្រូវការពាក្យសម្ងាត់ចាស់)។</p>}
          {!acct.hasPassword && <p className="muted">គណនីនេះចូលតាម Telegram។ អ្នកអាចកំណត់ពាក្យសម្ងាត់បន្ថែម (ជម្រើស)។</p>}
          <div className="form-grid">
            {needCurrent && <Field label="ពាក្យសម្ងាត់បច្ចុប្បន្ន"><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>}
            <Field label="ពាក្យសម្ងាត់ថ្មី (≥ ៨ តួ)"><input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
          </div>
          <button className="btn primary">{acct.hasPassword ? 'ប្តូរ' : 'កំណត់'}</button>
        </form>

        {acct.platformLogin && (
          <div className="card">
            <h3 className="sec-title"><Send size={17} /> ចូល និងស្តារគណនីតាម Telegram</h3>
            {acct.telegram ? (
              <>
                <div className="bot-status on"><Send size={16} /><span>បានភ្ជាប់ជាមួយ Telegram <b>{acct.telegram.name}</b></span></div>
                <p className="muted">អ្នកអាចចូលដោយចុច «ចូលតាម Telegram» ឬផ្ញើ <code>/recover</code> ទៅ bot ពេលភ្លេចពាក្យសម្ងាត់។</p>
                {acct.hasPassword && <button className="btn ghost sm" onClick={async () => { if (window.confirm('ផ្តាច់ Telegram ពីការចូលគណនី?')) { try { await api('POST', '/api/auth/telegram/unlink'); reload(); notify('បានផ្តាច់'); } catch (err) { notify(err.message, true); } } }}><Unlink size={14} /> ផ្តាច់</button>}
              </>
            ) : linking ? (
              <TelegramLogin mode="link" onDone={() => { setLinking(false); reload(); notify('បានភ្ជាប់ Telegram'); }} onCancel={() => setLinking(false)} />
            ) : (
              <>
                <p className="muted">ភ្ជាប់ Telegram ដើម្បីចូលគណនីដោយចុចតែម្តង និងស្តារគណនីបានភ្លាមៗពេលភ្លេចពាក្យសម្ងាត់។</p>
                <button className="btn tg" onClick={() => setLinking(true)}><Send size={16} /> ភ្ជាប់ Telegram</button>
              </>
            )}
          </div>
        )}

        <div className="card">
          <h3 className="sec-title"><Palette size={17} /> រូបរាង</h3>
          <ThemePicker />
          <p className="muted small">«តាមប្រព័ន្ធ» ប្តូរពន្លឺ/ងងឹតតាមការកំណត់ទូរស័ព្ទ ឬកុំព្យូទ័ររបស់អ្នក។</p>
        </div>

        <NotifyCard />
        {isOwner && (<>
        <TeamCard />
        <BackupCard />

        <StorageCard />

        <div className="card">
          <h3 className="sec-title"><UserRound size={17} /> គណនី</h3>
          <p className="muted">ចូលដោយ <b>{acct.email || (acct.telegram ? `Telegram · ${acct.telegram.name}` : '—')}</b>។ ទិន្នន័យទាំងអស់ជារបស់អ្នក — អាចនាំចេញ ឬលុបបានគ្រប់ពេល។</p>
          <div className="row-btns"><a className="btn ghost" href="/api/account/export" download><Download size={15} /> នាំចេញទិន្នន័យ (JSON)</a></div>
        </div>

        <form className="card danger-zone" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const password = fd.get('password');
          const confirm = fd.get('confirm');
          if (!window.confirm('លុបគណនី និងទិន្នន័យទាំងអស់ (បន្ទប់ អតិថិជន រូបអត្តសញ្ញាណប័ណ្ណ វិក្កយបត្រ) ជាអចិន្ត្រៃយ៍? មិនអាចយកមកវិញបានទេ។')) return;
          try { await api('POST', '/api/account/delete', { password, confirm }); location.href = '/'; } catch (err) { notify(err.message, true); }
        }}>
          <h3 className="sec-title"><Trash2 size={17} /> លុបគណនី</h3>
          <p className="muted">លុបទិន្នន័យទាំងអស់របស់អ្នកពីម៉ាស៊ីនមេជាអចិន្ត្រៃយ៍។ សូមនាំចេញទិន្នន័យជាមុនសិន។</p>
          {acct.hasPassword
            ? <Field label="បញ្ជាក់ដោយពាក្យសម្ងាត់"><input name="password" type="password" autoComplete="current-password" required /></Field>
            : <Field label={`វាយឈ្មោះ «${state.settings.propertyName}» ដើម្បីបញ្ជាក់`}><input name="confirm" required autoComplete="off" /></Field>}
          <button className="btn ghost danger">លុបគណនីជាអចិន្ត្រៃយ៍</button>
        </form>

        {legacy?.rooms?.length > 0 && (
          <div className="card">
            <h3 className="sec-title"><DatabaseZap size={17} /> នាំចូលទិន្នន័យពីកំណែចាស់</h3>
            <p className="muted">រកឃើញ {legacy.rooms.length} បន្ទប់ និង {legacy.invoices?.length || 0} វិក្កយបត្រ ដែលរក្សាទុកក្នុង browser នេះដោយកំណែមុន។</p>
            <button className="btn primary" onClick={() => call('POST', '/api/import-legacy', legacy, (r) => `បាននាំចូល ${r.result.rooms} បន្ទប់ · ${r.result.tenants} អតិថិជន · ${r.result.invoices} វិក្កយបត្រ`)}>នាំចូល</button>
          </div>
        )}
        </>)}
      </div>
    </>
  );
}
