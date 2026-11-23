import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Home, ReceiptText, UserRound, Send, ArrowLeft, Bell, Droplets, Zap, CalendarDays, IdCard, Upload, Check, ChevronRight, ShieldCheck, Download, MapPin, FileText, Wrench, Languages } from 'lucide-react';
import { ContractDoc } from '../ContractDoc.jsx';
import { api, uploadFile, compressImage } from '../api.js';
import { QR, Toast, Field, AddressPicker, Modal, STATUS, invStatus } from '../ui.jsx';
import InvoiceDoc from '../InvoiceDoc.jsx';
import { num, nowInCambodia, GENDERS, ID_TYPES, fmtMoney, fmtAlt, moneyInWords, setClientCurrency, setNumeralsSource } from '../../shared/khmer.js';
import Requests from './Requests.jsx';
import { LANGS, makeT, savedLang, saveLang, TCtx, useT } from './i18n.js';
import './portal.css';
import MeterSubmit from './MeterSubmit.jsx';
import { inTelegram } from './telegram.js';
import SignaturePad from '../SignaturePad.jsx';
import PwaBar from '../PwaBar.jsx';
import { useAppIdentity } from '../pwa.js';
import { ThemeToggle } from '../theme.jsx';

export default function Portal({ token }) {
  inTelegram(); // remember Telegram's launch data before anything changes the URL
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [pay, setPay] = useState(null);
  const [showLease, setShowLease] = useState(false);
  const [lang, setLang] = useState(savedLang);
  const t = useMemo(() => makeT(lang), [lang]);
  const changeLang = (v) => { setLang(v); saveLang(v); };
  // While the KHQR is on screen, ask the server (→ Bakong) every 5 s whether it was paid.
  useEffect(() => {
    if (!pay || pay.status === 'paid' || !data?.autoConfirm) return undefined;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop || Date.now() - started > 15 * 60000) return;
      try {
        const r = await api('GET', `/api/portal/${token}/invoices/${pay.id}/status`);
        if (r.status === 'paid') { await load(); setPay((p) => (p ? { ...p, status: 'paid' } : p)); notify(t('paidThanks')); return; }
      } catch { /* keep trying */ }
      setTimeout(tick, document.visibilityState === 'visible' ? 5000 : 15000);
    };
    const timer = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(timer); };
  }, [pay?.id, pay?.status, data?.autoConfirm]); // eslint-disable-line react-hooks/exhaustive-deps
  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem('py-portal-intro'); } catch { return false; } });
  const notify = useCallback((text, err = false) => { setToast({ text, error: err }); setTimeout(() => setToast(null), 3500); }, []);
  const load = useCallback(() => api('GET', `/api/portal/${token}`).then(setData).catch((e) => setError(e.message)), [token]);
  // Installing from here gives the customer their own app that opens straight to this page.
  useAppIdentity({ manifest: `/api/portal/${token}/manifest.webmanifest`, appleIcon: '/icons/portal-apple-touch-icon.png', title: data ? `${data.property.name} · ${data.room?.id || ''}` : undefined });
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (error) return <div className="pt-shell"><div className="pt-error"><ShieldCheck size={36} /><b>{error}</b><p>{t('badLink')}</p></div></div>;
  if (!data) return <div className="boot"><span className="spinner" /></div>;

  const k = data.property.khmerNumerals;
  const n = (v) => num(v, k);
  const cur = data.property.currency === 'KHR' ? 'KHR' : 'USD';
  setClientCurrency(cur);
  setNumeralsSource(data.property.khmerNumerals === true);
  const $ = (v) => fmtMoney(v, cur, k);
  const open = data.invoices.filter((i) => i.status !== 'paid');
  const owed = open.reduce((s, i) => s + i.total, 0);
  const p = data.profile;
  const cover = data.property.coverUrl ? { backgroundImage: `url("${data.property.coverUrl}")` } : undefined;

  if (intro) {
    return (
      <div className="pt-shell">
        <div className="pt-splash" style={cover}>
          <div className="pt-splash-text">
            <LangPicker lang={lang} onChange={changeLang} />
            <h1 style={{ whiteSpace: 'pre-line' }}>{t('splashTitle')}</h1>
            <p>{t('splashText', { p: data.property.name })}</p>
            <div className="pt-dots"><i className="on" /><i /><i /></div>
            <button className="pt-start" onClick={() => { setIntro(false); try { localStorage.setItem('py-portal-intro', '1'); } catch { /* ignore */ } }}>{t('start')}</button>
          </div>
        </div>
      </div>
    );
  }

  async function claim(inv, slipFile) {
    try {
      let body;
      if (slipFile) { body = new FormData(); body.set('file', await compressImage(slipFile, 1600)); }
      setData(await api('POST', `/api/portal/${token}/invoices/${inv.id}/claim`, body));
      notify(slipFile ? t('slipSent') : t('ownerTold')); setPay(null);
    } catch (e) { notify(e.message, true); }
  }

  const openReq = (data.tickets || []).filter((x) => x.status !== 'done').length;
  return (
    <TCtx.Provider value={t}>
    <div className="pt-shell" lang={lang}>
      <div className="pt-screen">
        {tab === 'home' && (
          <>
            <header className="pt-top">
              <div><b>{t.greeting(nowInCambodia().hour)}, {lang === 'km' ? p.nameKm || p.nameEn : p.nameEn || p.nameKm}</b><small>📍 {data.property.name}{data.room ? ` · ${t('room', { r: data.room.id })}` : ''}</small></div>
              <span className="pt-top-actions"><ThemeToggle className="pt-round" /><button className="pt-round" onClick={() => setTab('bills')} aria-label={t('bills')}><Bell size={18} />{open.length > 0 && <i />}</button></span>
            </header>
            {!inTelegram() && <PwaBar appName={data.property.name} className="portal" />}
            <h1 className="pt-title" dangerouslySetInnerHTML={{ __html: t('heroTitle') }} />
            <div className="pt-chips">
              <button className="active" onClick={() => setTab('home')}><span><Home size={15} /></span>{t('home')}</button>
              <button onClick={() => setTab('bills')}><span><ReceiptText size={15} /></span>{t('bills')}</button>
              <button onClick={() => setTab('help')}><span><Wrench size={15} /></span>{t('help')}</button>
              <button onClick={() => setTab('me')}><span><UserRound size={15} /></span>{t('me')}</button>
            </div>
            {data.notices?.length > 0 && (
              <div className="pt-notices">{data.notices.map((x) => <div key={x.id} className="pt-notice"><span>📢</span><p>{x.text}<small>{t.date(nowInCambodia(new Date(x.at)).ymd, k)}</small></p></div>)}</div>
            )}
            <div className="pt-section-head"><b>{t('myRoom')}</b>{data.room && <small>{data.room.building}</small>}</div>
            <div className="pt-hero" style={cover}>
              <div className="pt-hero-in">
                <small>📍 {data.property.address || data.property.name}</small>
                <h2>{data.room ? t('room', { r: data.room.id }) : data.property.name}</h2>
                <div className="pt-glass-row">
                  {data.room && <span className="pt-glass">{$(data.room.rent)}<small>{t('perMonth')}</small></span>}
                  <span className="pt-glass">{owed ? t('owe', { a: $(owed) }) : t('noOwe')}</span>
                </div>
                {data.roommates?.length > 0 && <small className="pt-mates">{t('roommates', { n: data.roommates.map((x) => x.name).join(', ') })}{owed ? t('share', { a: $(owed / (data.roommates.length + 1)) }) : ''}</small>}
                {open[0]
                  ? <button className="pt-glass-btn" onClick={() => setPay(open[0])}>{t('payBill', { m: t.monthShort(open[0].month, k) })}<i><ChevronRight size={16} /></i></button>
                  : <button className="pt-glass-btn" onClick={() => setTab('bills')}>{t('seeBills')}<i><ChevronRight size={16} /></i></button>}
              </div>
            </div>
            {!data.telegram.linked && data.telegram.link && (
              <a className="pt-card pt-tg" href={data.telegram.link} target="_blank" rel="noreferrer">
                <span className="pt-tg-icon"><Send size={18} /></span>
                <span><b>{t('linkTg')}</b><small>{t('linkTgSub')}</small></span>
                <ChevronRight size={18} />
              </a>
            )}
            {!p.files?.idFront && (
              <button className="pt-card pt-tg warn" onClick={() => setTab('me')}>
                <span className="pt-tg-icon"><IdCard size={18} /></span>
                <span><b>{t('sendId')}</b><small>{t('sendIdSub')}</small></span>
                <ChevronRight size={18} />
              </button>
            )}
            {(data.location?.addressText || Number.isFinite(data.location?.lat)) && (
              <a className="pt-card pt-tg" href={Number.isFinite(data.location?.lat) ? `https://maps.google.com/?q=${data.location.lat},${data.location.lng}` : undefined} target="_blank" rel="noreferrer">
                <span className="pt-tg-icon map"><MapPin size={18} /></span>
                <span><b>{t('location')}</b><small>{data.location.addressText || t('onMap')}</small></span>
                <ChevronRight size={18} />
              </a>
            )}
            {data.lease && (
              <button className="pt-card pt-tg" onClick={() => setShowLease(true)}>
                <span className="pt-tg-icon lease"><FileText size={18} /></span>
                <span><b>{t('lease')}</b><small>{t('leaseSub', { d: n(data.lease.depositMonths), p: n(data.lease.prepaidMonths) })}</small></span>
                <ChevronRight size={18} />
              </button>
            )}
            <button className="pt-card pt-tg" onClick={() => setTab('help')}>
              <span className="pt-tg-icon"><Wrench size={18} /></span>
              <span><b>{t('helpCard')}</b><small>{openReq ? t('openCount', { n: n(openReq) }) : t('helpCardSub')}</small></span>
              <ChevronRight size={18} />
            </button>
            <MeterSubmit token={token} data={data} onDone={load} notify={notify} />
            {data.meters[0] && (
              <div className="pt-card">
                <b>{t('usage', { m: t.month(data.meters[0].month, k) })}</b>
                <div className="pt-usage">
                  <span><Droplets size={18} /><b>{n(data.meters[0].water - data.meters[0].oldWater)}</b><small>{t('water')}</small></span>
                  <span><Zap size={18} /><b>{n(data.meters[0].electric - data.meters[0].oldElectric)}</b><small>{t('power')}</small></span>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'bills' && (
          <>
            <header className="pt-top"><button className="pt-round" onClick={() => setTab('home')} aria-label={t('back')}><ArrowLeft size={18} /></button><b>{t('bills')}</b><span /></header>
            <div className="pt-list">
              {data.invoices.map((i) => (
                <button key={i.id} className="pt-card pt-bill" onClick={() => setPay(i)}>
                  <span className="pt-bill-ic"><ReceiptText size={18} /></span>
                  <span><b>{t.month(i.month, k)}</b><small>{i.number} · {t('due', { d: t.date(i.dueDate, k) })}</small></span>
                  <span className="pt-bill-r"><b>{$(i.total)}</b><Pill inv={i} /></span>
                </button>
              ))}
              {!data.invoices.length && <p className="pt-muted">{t('noBills')}</p>}
            </div>
          </>
        )}

        {tab === 'help' && <Requests token={token} data={data} setData={setData} notify={notify} onBack={() => setTab('home')} />}

        {tab === 'me' && <Profile token={token} data={data} setData={setData} notify={notify} onBack={() => setTab('home')} lang={lang} onLang={changeLang} />}
      </div>

      {pay && (
        <div className="pt-sheet-wrap" onClick={(e) => e.target === e.currentTarget && setPay(null)}>
          <div className="pt-sheet">
            <header className="pt-top"><button className="pt-round" onClick={() => setPay(null)} aria-label={t('close')}><ArrowLeft size={18} /></button><b>{t.month(pay.month, k)}</b><span /></header>
            <div className="pt-pay-card">
              <small>{pay.number}</small>
              <b className="pt-amount">{$(pay.status !== 'paid' && pay.paid > 0 ? pay.balance : pay.total)}</b>
              {pay.status !== 'paid' && pay.paid > 0 && <small>{t('paidOf', { a: $(pay.paid), b: $(pay.total) })}</small>}
              <small>≈ {fmtAlt(pay.total, cur, pay.rate, k)} · {moneyInWords(pay.total, cur)}</small>
              {pay.khqr && pay.status !== 'paid' && data.autoConfirm && <p className="pt-auto"><span className="dot-pulse" /> {t('waitingPay')}</p>}
              {pay.khqr && pay.status !== 'paid' && <div className="pt-khqr"><span>KHQR</span><QR value={pay.khqr} size={210} label="KHQR" /><small>{t('khqrHint')}</small></div>}
            </div>
            <div className="pt-items">
              {pay.items.map((it, i) => <div key={i}><span>{it.label}{it.from !== undefined ? ` (${n(it.qty)} ${it.unit})` : ''}</span><b>{$(it.amount)}</b></div>)}
            </div>
            <details className="pt-details"><summary>{t('fullInvoice')}</summary><InvoiceDoc inv={pay} property={{ ...data.property, addressText: data.location?.addressText, location: data.location }} khmer={k} design={data.invoiceDesign} /><button className="pt-ghost" onClick={() => window.print()}><Download size={15} /> {t('print')}</button></details>
            <div className="pt-bottom-bar">
              <div><b>{$(pay.status !== 'paid' && pay.paid > 0 ? pay.balance : pay.total)}</b><small>{pay.dueDate2 ? t('halfDue', { a: t.dayMonth(pay.dueDate, k), b: t.dayMonth(pay.dueDate2, k) }) : t('due', { d: t.date(pay.dueDate, k) })}</small></div>
              {pay.status === 'unpaid' && (
                <span className="pt-claim">
                  <label className="pt-slip" title={t('attachSlip')}>📎<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && claim(pay, e.target.files[0])} /></label>
                  <button className="pt-pink" onClick={() => claim(pay)}>{t('iPaid')}</button>
                </span>
              )}
              {pay.status === 'claimed' && <span className="pt-wait">{t('waitConfirm')}</span>}
              {pay.status === 'paid' && <span className="pt-done"><Check size={16} /> {t('paid')}</span>}
            </div>
          </div>
        </div>
      )}

      <nav className="pt-nav">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}><Home size={18} /><span>{t('home')}</span></button>
        <button className={tab === 'bills' ? 'on' : ''} onClick={() => setTab('bills')}><ReceiptText size={18} /><span>{t('bills')}</span></button>
        <button className={tab === 'help' ? 'on' : ''} onClick={() => setTab('help')}><Wrench size={18} /><span>{t('help')}</span></button>
        {data.telegram.link && <a href={data.telegram.link} target="_blank" rel="noreferrer"><Send size={18} /><span>Telegram</span></a>}
        <button className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}><UserRound size={18} /><span>{t('me')}</span></button>
      </nav>
      {showLease && data.lease && <LeaseModal token={token} data={data} onClose={() => setShowLease(false)} onSigned={(d) => { setData(d); notify(t('signedThanks')); }} notify={notify} />}
      <Toast toast={toast} />
    </div>
    </TCtx.Provider>
  );
}

function Pill({ inv }) {
  const t = useT();
  const st = invStatus(inv);
  const [, tone] = STATUS[st] || STATUS.unpaid;
  return <span className={'pill ' + tone}><i />{t(`inv_${STATUS[st] ? st : 'unpaid'}`)}</span>;
}

function LangPicker({ lang, onChange }) {
  return (
    <div className="pt-langs" role="group" aria-label="Language">
      <Languages size={15} />
      {LANGS.map(([k, l]) => <button key={k} type="button" className={k === lang ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

function Profile({ token, data, setData, notify, onBack, lang, onLang }) {
  const t = useT();
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
    try { setData(await api('PUT', `/api/portal/${token}/profile`, f)); notify(t('saved')); } catch (err) { notify(err.message, true); } finally { setBusy(''); }
  }
  async function up(slot, file) {
    if (!file) return;
    setBusy(slot);
    try { setData(await uploadFile(`/api/portal/${token}/files/${slot}`, file)); notify(t('photoSent')); } catch (err) { notify(err.message, true); } finally { setBusy(''); }
  }

  return (
    <>
      <header className="pt-top"><button className="pt-round" onClick={onBack} aria-label={t('back')}><ArrowLeft size={18} /></button><b>{t('myInfo')}</b><span /></header>
      <div className="pt-card"><b className="pt-card-title"><Languages size={16} /> {t('language')}</b><LangPicker lang={lang} onChange={onLang} /></div>
      <div className="pt-me-head">
        <label className="pt-avatar">
          {fileUrl('photo') ? <img src={fileUrl('photo')} alt="" /> : <UserRound size={34} />}
          <input type="file" accept="image/*" capture="user" hidden onChange={(e) => up('photo', e.target.files[0])} />
          <em>{busy === 'photo' ? '…' : t('change')}</em>
        </label>
        <b>{p.nameKm || p.nameEn}</b>
        <small>{data.room ? t('room', { r: data.room.id }) : ''}{p.contract?.end ? t('contractUntil', { d: t.date(p.contract.end, data.property.khmerNumerals) }) : ''}</small>
      </div>

      <div className="pt-card">
        <b className="pt-card-title"><IdCard size={16} /> {t('idCard')}</b>
        <div className="pt-ids">
          {['idFront', 'idBack'].map((slot) => (
            <label key={slot} className={'pt-id ' + (fileUrl(slot) ? 'has' : '')}>
              {fileUrl(slot) ? <img src={fileUrl(slot)} alt="" onClick={(e) => { e.preventDefault(); setView(fileUrl(slot)); }} /> : <span><Upload size={18} />{busy === slot ? t('sending') : slot === 'idFront' ? t('front') : t('backSide')}</span>}
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => up(slot, e.target.files[0])} />
              {fileUrl(slot) && <em>{t('change')}</em>}
            </label>
          ))}
        </div>
        <small className="pt-muted"><ShieldCheck size={13} /> {t('privatePhotos')}</small>
      </div>

      <form className="pt-card pt-form" onSubmit={save}>
        <b className="pt-card-title"><UserRound size={16} /> {t('personal')}</b>
        <Field label={t('nameKm')}><input value={f.nameKm} onChange={(e) => set('nameKm', e.target.value)} /></Field>
        <Field label={t('nameEn')}><input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
        <Field label={t('gender')}><select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option>{GENDERS.map(([k]) => <option key={k} value={k}>{t(`g_${k}`)}</option>)}</select></Field>
        <Field label={<><CalendarDays size={13} /> {t('dob')}</>}><input type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label={t('phone')}><input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label={t('phone2')}><input type="tel" inputMode="tel" value={f.phone2} onChange={(e) => set('phone2', e.target.value)} /></Field>
        <Field label={t('email')}><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label={t('job')}><input value={f.occupation} onChange={(e) => set('occupation', e.target.value)} /></Field>
        <Field label={t('workplace')}><input value={f.workplace} onChange={(e) => set('workplace', e.target.value)} /></Field>
        <b className="pt-card-title">{t('idDoc')}</b>
        <Field label={t('idType')}><select value={f.idType} onChange={(e) => set('idType', e.target.value)}>{ID_TYPES.map(([k]) => <option key={k} value={k}>{t(`id_${k}`)}</option>)}</select></Field>
        <Field label={t('idNumber')}><input value={f.idNumber} onChange={(e) => set('idNumber', e.target.value)} /></Field>
        <Field label={t('idExpiry')}><input type="date" value={f.idExpiry} onChange={(e) => set('idExpiry', e.target.value)} /></Field>
        <b className="pt-card-title">{t('homeAddress')}</b>
        <AddressPicker value={f.address} onChange={(v) => set('address', v)} />
        <b className="pt-card-title">{t('emergency')}</b>
        <Field label={t('name')}><input value={f.emergency?.name || ''} onChange={(e) => setIn('emergency', 'name', e.target.value)} /></Field>
        <Field label={t('relation')}><input value={f.emergency?.relation || ''} onChange={(e) => setIn('emergency', 'relation', e.target.value)} /></Field>
        <Field label={t('phone')}><input type="tel" value={f.emergency?.phone || ''} onChange={(e) => setIn('emergency', 'phone', e.target.value)} /></Field>
        <button className="pt-black" disabled={busy === 'save'}>{busy === 'save' ? t('saving') : t('save')}</button>
      </form>
      {view && <Modal title={t('idCard')} onClose={() => setView('')}><img className="viewer-img" src={view} alt="" /></Modal>}
    </>
  );
}

function LeaseModal({ token, data, onClose, onSigned, notify }) {
  const t = useT();
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
    <Modal title={t('lease')} onClose={onClose} wide>
      {t.lang !== 'km' && <p className="pt-muted">{t('khmerContract')}</p>}
      <ContractDoc text={L.text} property={data.property.name} signatures={signatures} />
      {signed ? <p className="pt-signed">{t('signed')}</p> : (
        <div className="pt-sign">
          <b>{L.signed?.outdated ? t('signAgain') : t('signTitle')}</b>
          <small>{t('agree')}</small>
          <SignaturePad onChange={setSig} />
          <button className="pt-pink" disabled={!sig || busy} onClick={sign}>{busy ? '…' : t('sign')}</button>
        </div>
      )}
      <button className="pt-ghost" onClick={() => window.print()}><Download size={15} /> {t('savePdf')}</button>
    </Modal>
  );
}
