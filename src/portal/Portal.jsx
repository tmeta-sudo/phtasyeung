import React, { useCallback, useEffect, useState } from 'react';
import { Home, ReceiptText, UserRound, Send, ArrowLeft, Bell, Droplets, Zap, CalendarDays, IdCard, Upload, Check, ChevronRight, ShieldCheck, Download, MapPin, FileText } from 'lucide-react';
import { ContractDoc } from '../ContractDoc.jsx';
import { api, uploadFile } from '../api.js';
import { QR, Toast, Field, AddressPicker, StatusPill, Modal } from '../ui.jsx';
import InvoiceDoc from '../InvoiceDoc.jsx';
import { usd, num, monthKm, dateKm, greetingKm, nowInCambodia, khr, GENDERS, ID_TYPES, usdInWords } from '../../shared/khmer.js';
import './portal.css';
import MeterSubmit from './MeterSubmit.jsx';
import SignaturePad from '../SignaturePad.jsx';
import PwaBar from '../PwaBar.jsx';
import { useAppIdentity } from '../pwa.js';
import { ThemeToggle } from '../theme.jsx';

export default function Portal({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [pay, setPay] = useState(null);
  const [showLease, setShowLease] = useState(false);
  // While the KHQR is on screen, ask the server (→ Bakong) every 5 s whether it was paid.
  useEffect(() => {
    if (!pay || pay.status === 'paid' || !data?.autoConfirm) return undefined;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop || Date.now() - started > 15 * 60000) return;
      try {
        const r = await api('GET', `/api/portal/${token}/invoices/${pay.id}/status`);
        if (r.status === 'paid') { await load(); setPay((p) => (p ? { ...p, status: 'paid' } : p)); notify('✅ បានទទួលការបង់ប្រាក់ — សូមអរគុណ!'); return; }
      } catch { /* keep trying */ }
      setTimeout(tick, document.visibilityState === 'visible' ? 5000 : 15000);
    };
    const t = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(t); };
  }, [pay?.id, pay?.status, data?.autoConfirm]); // eslint-disable-line react-hooks/exhaustive-deps
  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem('py-portal-intro'); } catch { return false; } });
  const notify = useCallback((text, err = false) => { setToast({ text, error: err }); setTimeout(() => setToast(null), 3500); }, []);
  const load = useCallback(() => api('GET', `/api/portal/${token}`).then(setData).catch((e) => setError(e.message)), [token]);
  // Installing from here gives the customer their own app that opens straight to this page.
  useAppIdentity({ manifest: `/api/portal/${token}/manifest.webmanifest`, appleIcon: '/icons/portal-apple-touch-icon.png', title: data ? `${data.property.name} · ${data.room?.id || ''}` : undefined });
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (error) return <div className="pt-shell"><div className="pt-error"><ShieldCheck size={36} /><b>{error}</b><p>សូមសុំតំណ ឬ QR ថ្មីពីម្ចាស់ផ្ទះ។</p></div></div>;
  if (!data) return <div className="boot"><span className="spinner" /></div>;

  const k = data.property.khmerNumerals;
  const n = (v) => num(v, k);
  const $ = (v) => usd(v, k);
  const open = data.invoices.filter((i) => i.status !== 'paid');
  const owed = open.reduce((s, i) => s + i.total, 0);
  const p = data.profile;
  const cover = data.property.coverUrl ? { backgroundImage: `url("${data.property.coverUrl}")` } : undefined;

  if (intro) {
    return (
      <div className="pt-shell">
        <div className="pt-splash" style={cover}>
          <div className="pt-splash-text">
            <h1>ជួល បង់ប្រាក់<br />និងគ្រប់គ្រងយ៉ាងងាយ</h1>
            <p>មើលវិក្កយបត្រ បង់តាម KHQR និងកែប្រែព័ត៌មានរបស់អ្នក នៅ{data.property.name}។</p>
            <div className="pt-dots"><i className="on" /><i /><i /></div>
            <button className="pt-start" onClick={() => { setIntro(false); try { localStorage.setItem('py-portal-intro', '1'); } catch { /* ignore */ } }}>ចាប់ផ្តើម</button>
          </div>
        </div>
      </div>
    );
  }

  async function claim(inv) {
    try { setData(await api('POST', `/api/portal/${token}/invoices/${inv.id}/claim`)); notify('បានជូនដំណឹងម្ចាស់ផ្ទះ ✅'); setPay(null); } catch (e) { notify(e.message, true); }
  }

  return (
    <div className="pt-shell">
      <div className="pt-screen">
        {tab === 'home' && (
          <>
            <header className="pt-top">
              <div><b>{greetingKm(nowInCambodia().hour)}, {p.nameKm || p.nameEn}</b><small>📍 {data.property.name}{data.room ? ` · បន្ទប់ ${data.room.id}` : ''}</small></div>
              <span className="pt-top-actions"><ThemeToggle className="pt-round" /><button className="pt-round" onClick={() => setTab('bills')} aria-label="វិក្កយបត្រ"><Bell size={18} />{open.length > 0 && <i />}</button></span>
            </header>
            <PwaBar appName={data.property.name} className="portal" />
            <h1 className="pt-title">គ្រប់គ្រង<b>ផ្ទះជួល</b><br /><b>របស់អ្នក</b>យ៉ាងងាយ</h1>
            <div className="pt-chips">
              <button className="active" onClick={() => setTab('home')}><span><Home size={15} /></span>ទំព័រដើម</button>
              <button onClick={() => setTab('bills')}><span><ReceiptText size={15} /></span>វិក្កយបត្រ</button>
              <button onClick={() => setTab('me')}><span><UserRound size={15} /></span>ខ្ញុំ</button>
            </div>
            {data.notices?.length > 0 && (
              <div className="pt-notices">{data.notices.map((x) => <div key={x.id} className="pt-notice"><span>📢</span><p>{x.text}<small>{dateKm(nowInCambodia(new Date(x.at)).ymd, k).replace('ថ្ងៃទី', '')}</small></p></div>)}</div>
            )}
            <div className="pt-section-head"><b>បន្ទប់របស់ខ្ញុំ</b>{data.room && <small>{data.room.building}</small>}</div>
            <div className="pt-hero" style={cover}>
              <div className="pt-hero-in">
                <small>📍 {data.property.address || data.property.name}</small>
                <h2>{data.room ? `បន្ទប់ ${data.room.id}` : data.property.name}</h2>
                <div className="pt-glass-row">
                  {data.room && <span className="pt-glass">{$(data.room.rent)}<small>/ខែ</small></span>}
                  <span className="pt-glass">{owed ? `ជំពាក់ ${$(owed)}` : '✓ គ្មានជំពាក់'}</span>
                </div>
                {open[0]
                  ? <button className="pt-glass-btn" onClick={() => setPay(open[0])}>បង់វិក្កយបត្រ {monthKm(open[0].month, k).replace(/ ឆ្នាំ.*/, '')}<i><ChevronRight size={16} /></i></button>
                  : <button className="pt-glass-btn" onClick={() => setTab('bills')}>មើលវិក្កយបត្រ<i><ChevronRight size={16} /></i></button>}
              </div>
            </div>
            {!data.telegram.linked && data.telegram.link && (
              <a className="pt-card pt-tg" href={data.telegram.link} target="_blank" rel="noreferrer">
                <span className="pt-tg-icon"><Send size={18} /></span>
                <span><b>ភ្ជាប់ Telegram</b><small>ទទួលវិក្កយបត្រ និង KHQR ដោយស្វ័យប្រវត្តិរៀងរាល់ខែ</small></span>
                <ChevronRight size={18} />
              </a>
            )}
            {!p.files?.idFront && (
              <button className="pt-card pt-tg warn" onClick={() => setTab('me')}>
                <span className="pt-tg-icon"><IdCard size={18} /></span>
                <span><b>ផ្ញើរូបអត្តសញ្ញាណប័ណ្ណ</b><small>ម្ចាស់ផ្ទះត្រូវការសម្រាប់កិច្ចសន្យា</small></span>
                <ChevronRight size={18} />
              </button>
            )}
            {(data.location?.addressText || Number.isFinite(data.location?.lat)) && (
              <a className="pt-card pt-tg" href={Number.isFinite(data.location?.lat) ? `https://maps.google.com/?q=${data.location.lat},${data.location.lng}` : undefined} target="_blank" rel="noreferrer">
                <span className="pt-tg-icon map"><MapPin size={18} /></span>
                <span><b>ទីតាំងផ្ទះ</b><small>{data.location.addressText || 'មើលលើផែនទី'}</small></span>
                <ChevronRight size={18} />
              </a>
            )}
            {data.lease && (
              <button className="pt-card pt-tg" onClick={() => setShowLease(true)}>
                <span className="pt-tg-icon lease"><FileText size={18} /></span>
                <span><b>កិច្ចសន្យាជួល</b><small>ប្រាក់កក់ {n(data.lease.depositMonths)} ខែ · បង់មុន {n(data.lease.prepaidMonths)} ខែ</small></span>
                <ChevronRight size={18} />
              </button>
            )}
            <MeterSubmit token={token} data={data} onDone={load} notify={notify} />
            {data.meters[0] && (
              <div className="pt-card">
                <b>ការប្រើប្រាស់ {monthKm(data.meters[0].month, k)}</b>
                <div className="pt-usage">
                  <span><Droplets size={18} /><b>{n(data.meters[0].water - data.meters[0].oldWater)}</b><small>m³ ទឹក</small></span>
                  <span><Zap size={18} /><b>{n(data.meters[0].electric - data.meters[0].oldElectric)}</b><small>kWh ភ្លើង</small></span>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'bills' && (
          <>
            <header className="pt-top"><button className="pt-round" onClick={() => setTab('home')} aria-label="ត្រឡប់"><ArrowLeft size={18} /></button><b>វិក្កយបត្រ</b><span /></header>
            <div className="pt-list">
              {data.invoices.map((i) => (
                <button key={i.id} className="pt-card pt-bill" onClick={() => setPay(i)}>
                  <span className="pt-bill-ic"><ReceiptText size={18} /></span>
                  <span><b>{monthKm(i.month, k)}</b><small>{i.number} · ផុត {dateKm(i.dueDate, k).replace('ថ្ងៃទី', '')}</small></span>
                  <span className="pt-bill-r"><b>{$(i.total)}</b><StatusPill inv={i} /></span>
                </button>
              ))}
              {!data.invoices.length && <p className="pt-muted">មិនទាន់មានវិក្កយបត្រ</p>}
            </div>
          </>
        )}

        {tab === 'me' && <Profile token={token} data={data} setData={setData} notify={notify} onBack={() => setTab('home')} />}
      </div>

      {pay && (
        <div className="pt-sheet-wrap" onClick={(e) => e.target === e.currentTarget && setPay(null)}>
          <div className="pt-sheet">
            <header className="pt-top"><button className="pt-round" onClick={() => setPay(null)} aria-label="បិទ"><ArrowLeft size={18} /></button><b>{monthKm(pay.month, k)}</b><span /></header>
            <div className="pt-pay-card">
              <small>{pay.number}</small>
              <b className="pt-amount">{$(pay.status !== 'paid' && pay.paid > 0 ? pay.balance : pay.total)}</b>
              {pay.status !== 'paid' && pay.paid > 0 && <small>បានបង់ {$(pay.paid)} នៃ {$(pay.total)}</small>}
              <small>{khr(pay.totalKhr, k)} · {usdInWords(pay.total)}</small>
              {pay.khqr && pay.status !== 'paid' && data.autoConfirm && <p className="pt-auto"><span className="dot-pulse" /> រង់ចាំការបង់ប្រាក់ — នឹងបញ្ជាក់ដោយស្វ័យប្រវត្តិ</p>}
              {pay.khqr && pay.status !== 'paid' && <div className="pt-khqr"><span>KHQR</span><QR value={pay.khqr} size={210} label="KHQR" /><small>ថតរូបអេក្រង់ ឬស្កេនដោយកម្មវិធីធនាគារ ABA, ACLEDA, Wing, Bakong…</small></div>}
            </div>
            <div className="pt-items">
              {pay.items.map((it, i) => <div key={i}><span>{it.label}{it.from !== undefined ? ` (${n(it.qty)} ${it.unit})` : ''}</span><b>{$(it.amount)}</b></div>)}
            </div>
            <details className="pt-details"><summary>មើលវិក្កយបត្រពេញ</summary><InvoiceDoc inv={pay} property={{ ...data.property, addressText: data.location?.addressText, location: data.location }} khmer={k} design={data.invoiceDesign} /><button className="pt-ghost" onClick={() => window.print()}><Download size={15} /> រក្សាទុក / បោះពុម្ព</button></details>
            <div className="pt-bottom-bar">
              <div><b>{$(pay.status !== 'paid' && pay.paid > 0 ? pay.balance : pay.total)}</b><small>ផុត {dateKm(pay.dueDate, k).replace('ថ្ងៃទី', '')}</small></div>
              {pay.status === 'unpaid' && <button className="pt-pink" onClick={() => claim(pay)}>ខ្ញុំបានបង់ប្រាក់</button>}
              {pay.status === 'claimed' && <span className="pt-wait">⏳ រង់ចាំបញ្ជាក់</span>}
              {pay.status === 'paid' && <span className="pt-done"><Check size={16} /> បានបង់</span>}
            </div>
          </div>
        </div>
      )}

      <nav className="pt-nav">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}><Home size={18} /><span>ទំព័រដើម</span></button>
        <button className={tab === 'bills' ? 'on' : ''} onClick={() => setTab('bills')}><ReceiptText size={18} /><span>វិក្កយបត្រ</span></button>
        {data.telegram.link && <a href={data.telegram.link} target="_blank" rel="noreferrer"><Send size={18} /><span>Telegram</span></a>}
        <button className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}><UserRound size={18} /><span>ខ្ញុំ</span></button>
      </nav>
      {showLease && data.lease && <LeaseModal token={token} data={data} onClose={() => setShowLease(false)} onSigned={(d) => { setData(d); notify('✍️ បានចុះហត្ថលេខា — អរគុណ!'); }} notify={notify} />}
      <Toast toast={toast} />
    </div>
  );
}

function Profile({ token, data, setData, notify, onBack }) {
  const p = data.profile;
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(p)));
  const [busy, setBusy] = useState('');
  const [view, setView] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setIn = (o, k, v) => setF((x) => ({ ...x, [o]: { ...x[o], [k]: v } }));
  const fileUrl = (slot) => (p.files?.[slot] ? `/api/portal/${token}/files/${slot}?v=${p.files[slot].id}` : '');

  async function save(e) {
    e.preventDefault();
    setBusy('save');
    try { setData(await api('PUT', `/api/portal/${token}/profile`, f)); notify('បានរក្សាទុក ✅'); } catch (err) { notify(err.message, true); } finally { setBusy(''); }
  }
  async function up(slot, file) {
    if (!file) return;
    setBusy(slot);
    try { setData(await uploadFile(`/api/portal/${token}/files/${slot}`, file)); notify('បានផ្ញើរូបភាព ✅'); } catch (err) { notify(err.message, true); } finally { setBusy(''); }
  }

  return (
    <>
      <header className="pt-top"><button className="pt-round" onClick={onBack} aria-label="ត្រឡប់"><ArrowLeft size={18} /></button><b>ព័ត៌មានរបស់ខ្ញុំ</b><span /></header>
      <div className="pt-me-head">
        <label className="pt-avatar">
          {fileUrl('photo') ? <img src={fileUrl('photo')} alt="" /> : <UserRound size={34} />}
          <input type="file" accept="image/*" capture="user" hidden onChange={(e) => up('photo', e.target.files[0])} />
          <em>{busy === 'photo' ? '…' : 'ប្តូរ'}</em>
        </label>
        <b>{p.nameKm || p.nameEn}</b>
        <small>{data.room ? `បន្ទប់ ${data.room.id}` : ''}{p.contract?.end ? ` · កិច្ចសន្យាដល់ ${dateKm(p.contract.end, data.property.khmerNumerals)}` : ''}</small>
      </div>

      <div className="pt-card">
        <b className="pt-card-title"><IdCard size={16} /> អត្តសញ្ញាណប័ណ្ណ</b>
        <div className="pt-ids">
          {['idFront', 'idBack'].map((slot) => (
            <label key={slot} className={'pt-id ' + (fileUrl(slot) ? 'has' : '')}>
              {fileUrl(slot) ? <img src={fileUrl(slot)} alt="" onClick={(e) => { e.preventDefault(); setView(fileUrl(slot)); }} /> : <span><Upload size={18} />{busy === slot ? 'កំពុងផ្ញើ…' : slot === 'idFront' ? 'ខាងមុខ' : 'ខាងក្រោយ'}</span>}
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => up(slot, e.target.files[0])} />
              {fileUrl(slot) && <em>ប្តូរ</em>}
            </label>
          ))}
        </div>
        <small className="pt-muted"><ShieldCheck size={13} /> រូបភាពរបស់អ្នកមើលឃើញតែដោយអ្នក និងម្ចាស់ផ្ទះប៉ុណ្ណោះ។</small>
      </div>

      <form className="pt-card pt-form" onSubmit={save}>
        <b className="pt-card-title"><UserRound size={16} /> ព័ត៌មានផ្ទាល់ខ្លួន</b>
        <Field label="ឈ្មោះ (ខ្មែរ)"><input value={f.nameKm} onChange={(e) => set('nameKm', e.target.value)} /></Field>
        <Field label="ឈ្មោះ (ឡាតាំង)"><input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
        <Field label="ភេទ"><select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option>{GENDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label={<><CalendarDays size={13} /> ថ្ងៃខែឆ្នាំកំណើត</>}><input type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label="ទូរស័ព្ទ"><input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="ទូរស័ព្ទទី ២"><input type="tel" inputMode="tel" value={f.phone2} onChange={(e) => set('phone2', e.target.value)} /></Field>
        <Field label="អ៊ីមែល"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="មុខរបរ"><input value={f.occupation} onChange={(e) => set('occupation', e.target.value)} /></Field>
        <Field label="កន្លែងធ្វើការ / សាលា"><input value={f.workplace} onChange={(e) => set('workplace', e.target.value)} /></Field>
        <b className="pt-card-title">ឯកសារអត្តសញ្ញាណ</b>
        <Field label="ប្រភេទ"><select value={f.idType} onChange={(e) => set('idType', e.target.value)}>{ID_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="លេខ"><input value={f.idNumber} onChange={(e) => set('idNumber', e.target.value)} /></Field>
        <Field label="ថ្ងៃផុតកំណត់"><input type="date" value={f.idExpiry} onChange={(e) => set('idExpiry', e.target.value)} /></Field>
        <b className="pt-card-title">អាសយដ្ឋានអចិន្ត្រៃយ៍</b>
        <AddressPicker value={f.address} onChange={(v) => set('address', v)} />
        <b className="pt-card-title">ទំនាក់ទំនងបន្ទាន់</b>
        <Field label="ឈ្មោះ"><input value={f.emergency?.name || ''} onChange={(e) => setIn('emergency', 'name', e.target.value)} /></Field>
        <Field label="ត្រូវជា"><input value={f.emergency?.relation || ''} onChange={(e) => setIn('emergency', 'relation', e.target.value)} /></Field>
        <Field label="ទូរស័ព្ទ"><input type="tel" value={f.emergency?.phone || ''} onChange={(e) => setIn('emergency', 'phone', e.target.value)} /></Field>
        <button className="pt-black" disabled={busy === 'save'}>{busy === 'save' ? 'កំពុងរក្សាទុក…' : 'រក្សាទុក'}</button>
      </form>
      {view && <Modal title="អត្តសញ្ញាណប័ណ្ណ" onClose={() => setView('')}><img className="viewer-img" src={view} alt="" /></Modal>}
    </>
  );
}

function LeaseModal({ token, data, onClose, onSigned, notify }) {
  const L = data.lease;
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const signed = L.signed && !L.signed.outdated;
  const signatures = { owner: L.ownerSigned ? `/api/portal/${token}/signature/owner` : '', tenant: L.signed ? `/api/portal/${token}/signature/tenant?v=${encodeURIComponent(L.signed.at)}` : '', tenantName: L.signed?.name, tenantAt: L.signed?.at };
  async function sign() {
    setBusy(true);
    try { onSigned(await api('POST', `/api/portal/${token}/sign`, { signature: sig })); } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }
  return (
    <Modal title="កិច្ចសន្យាជួល" onClose={onClose} wide>
      <ContractDoc text={L.text} property={data.property.name} signatures={signatures} />
      {signed ? <p className="pt-signed">✅ បានចុះហត្ថលេខា</p> : (
        <div className="pt-sign">
          <b>{L.signed?.outdated ? 'កិច្ចសន្យាត្រូវបានកែប្រែ — សូមចុះហត្ថលេខាម្តងទៀត' : 'ចុះហត្ថលេខាលើកិច្ចសន្យា'}</b>
          <small>ខ្ញុំបានអាន និងយល់ព្រមតាមលក្ខខណ្ឌខាងលើ។</small>
          <SignaturePad onChange={setSig} />
          <button className="pt-pink" disabled={!sig || busy} onClick={sign}>{busy ? '…' : '✍️ ចុះហត្ថលេខា'}</button>
        </div>
      )}
      <button className="pt-ghost" onClick={() => window.print()}><Download size={15} /> រក្សាទុក PDF / បោះពុម្ព</button>
    </Modal>
  );
}
