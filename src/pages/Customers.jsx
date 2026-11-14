import React, { useMemo, useRef, useState } from 'react';
import { AddonsPicker, FeatureIcons, addonsTotal } from '../AddonsPicker.jsx';
import {
  ScanText, Plus, Phone, Send, IdCard, Pencil, Trash2, ArrowLeft, Upload, Link2, RefreshCw, MapPin, HeartPulse, FileText, Unlink, ExternalLink, UserRound, Printer,
  DoorOpen,
} from 'lucide-react';
import { useApp, useFmt, navigate, Modal, Field, Avatar, tenantPhoto, Empty, QR, AddressPicker, addressText, usePumi, useVillageName, StatusPill } from '../ui.jsx';
import { uploadFile } from '../api.js';
import ContractModal from './ContractModal.jsx';
import MoveOutModal, { DepositCard } from './MoveOut.jsx';
import { lazy, Suspense } from 'react';

const IdScanner = lazy(() => import('../ocr/IdScanner.jsx'));
import { matchesQuery, dateKm, GENDERS, ID_TYPES, labelOf, normalizePhone, isKhmerName, monthKm, money, curSymbol, getClientCurrency } from '../../shared/khmer.js';

const FILTERS = [
  ['active', 'កំពុងជួល'], ['all', 'ទាំងអស់'], ['noid', 'ខ្វះអត្តសញ្ញាណប័ណ្ណ'], ['notg', 'មិនទាន់ភ្ជាប់ Telegram'],
  ['expiring', 'កិច្ចសន្យាជិតផុត'], ['prospect', 'អ្នកចាប់អារម្មណ៍'], ['former', 'អតីតអ្នកជួល'],
];
const daysTo = (ymd, today) => Math.round((new Date(ymd + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
const fileUrl = (t, slot) => (t.files?.[slot] ? `/api/tenants/${t.id}/files/${slot}?v=${t.files[slot].id}` : '');

export default function Customers() {
  const { state, openCustomerForm } = useApp();
  const { n, $ } = useFmt();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(() => new URLSearchParams(location.search).get('filter') || 'active');
  const today = state.today.ymd;
  const due = (t) => state.invoices.filter((i) => i.tenantId === t.id && i.status !== 'paid').reduce((s, i) => s + i.total, 0);

  const list = useMemo(() => state.tenants.filter((t) => {
    if (!matchesQuery([t.nameKm, t.nameEn, t.phone, t.phone2, t.roomId, t.idNumber, t.occupation], q)) return false;
    if (filter === 'all') return true;
    if (filter === 'active') return t.status === 'active';
    if (filter === 'former' || filter === 'prospect') return t.status === filter;
    if (filter === 'noid') return t.status === 'active' && !t.files?.idFront;
    if (filter === 'notg') return t.status === 'active' && !t.telegram?.chatId;
    if (filter === 'expiring') return t.status === 'active' && t.contract?.end && daysTo(t.contract.end, today) <= 60;
    return true;
  }).sort((a, b) => (a.roomId || 'zz').localeCompare(b.roomId || 'zz')), [state.tenants, q, filter, today]);

  return (
    <>
      <div className="page-head">
        <h1>អតិថិជន <span className="h-count">{n(state.tenants.filter((t) => t.status === 'active').length)}</span></h1>
        <div className="head-actions">
          <div className="search-pill"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ឈ្មោះ ទូរស័ព្ទ លេខអត្តសញ្ញាណប័ណ្ណ…" aria-label="ស្វែងរកអតិថិជន" /></div>
          <button className="btn primary" onClick={() => openCustomerForm(null)}><Plus size={16} /> បន្ថែមអតិថិជន</button>
        </div>
      </div>
      <div className="chips-row">
        {FILTERS.map(([k, label]) => <button key={k} className={'tab-chip ' + (filter === k ? 'active' : '')} onClick={() => setFilter(k)}>{label}</button>)}
      </div>
      <div className="cust-grid">
        {list.map((t) => {
          const owed = due(t);
          return (
            <button key={t.id} className="card cust-card" onClick={() => navigate('/customers/' + t.id)}>
              <div className="cust-top">
                <Avatar name={t.nameKm || t.nameEn} src={tenantPhoto(t)} size={52} />
                <span className="room-tag">{t.roomId || '—'}</span>
              </div>
              <b className="cust-name">{t.nameKm || t.nameEn}</b>
              <small className="muted">{t.nameEn && t.nameKm ? t.nameEn : ' '}</small>
              <div className="cust-meta"><Phone size={13} /> {t.phone ? n(t.phone) : '—'}</div>
              <div className="cust-badges">
                <span className={'mini ' + (t.files?.idFront ? 'ok' : 'warn')}><IdCard size={13} /> {t.files?.idFront ? 'មានអត្តសញ្ញាណ' : 'ខ្វះ ID'}</span>
                <span className={'mini ' + (t.telegram?.chatId ? 'ok' : 'muted')}><Send size={13} /> {t.telegram?.chatId ? 'Telegram' : 'មិនទាន់ភ្ជាប់'}</span>
              </div>
              <div className="cust-foot">
                <span>{owed ? <b className="owed">{$(owed)} ជំពាក់</b> : <span className="muted">គ្មានជំពាក់</span>}</span>
                {t.contract?.end && <small className="muted">ដល់ {dateKm(t.contract.end, false).replace('ថ្ងៃទី', '')}</small>}
              </div>
            </button>
          );
        })}
      </div>
      {!list.length && <Empty icon={UserRound} title="មិនមានអតិថិជន">សាកល្បងប្តូរការច្រោះ ឬបន្ថែមអតិថិជនថ្មី។</Empty>}
    </>
  );
}

// ---------- detail ----------

export function CustomerDetail({ id }) {
  const { state, call, openCustomerForm, openInvoice, base, print } = useApp();
  const { n, $, k } = useFmt();
  const pumi = usePumi();
  const t = state.tenants.find((x) => x.id === id);
  const village = useVillageName(t?.address?.villageId);
  const [viewer, setViewer] = useState('');
  const [contract, setContract] = useState(() => new URLSearchParams(location.search).has('contract'));
  const [moving, setMoving] = useState(false);
  if (!t) return <Empty icon={UserRound} title="រកមិនឃើញអតិថិជន"><button className="btn ghost" onClick={() => navigate('/customers')}>ត្រឡប់ក្រោយ</button></Empty>;

  const room = state.rooms.find((r) => r.id === t.roomId);
  const invoices = state.invoices.filter((i) => i.tenantId === t.id).sort((a, b) => b.month.localeCompare(a.month));
  const owed = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + (i.balance ?? i.total), 0);
  const portal = `${base}/p/${t.portalToken}`;
  const tgLink = state.bot.username ? `https://t.me/${state.bot.username}?start=${t.linkCode}` : '';
  const addr = [addressText({ ...t.address, communeId: '', districtId: '', provinceId: '' }), village, addressText({ ...t.address, detail: '' }, pumi)].filter(Boolean).join(', ');

  const remove = () => {
    if (window.confirm(`លុបអតិថិជន ${t.nameKm}? រូបអត្តសញ្ញាណប័ណ្ណនឹងត្រូវលុបផងដែរ។ វិក្កយបត្រនៅរក្សាទុក។`)) {
      call('DELETE', `/api/tenants/${t.id}`, undefined, 'បានលុបអតិថិជន').then((r) => r && navigate('/customers'));
    }
  };
  const latestOpen = invoices.find((i) => i.status !== 'paid');

  return (
    <>
      <div className="page-head">
        <button className="btn ghost" onClick={() => navigate('/customers')}><ArrowLeft size={16} /> អតិថិជនទាំងអស់</button>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => print(<WelcomeSheet t={t} portal={portal} tgLink={tgLink} property={state.settings.propertyName} />)}><Printer size={16} /> បោះពុម្ពប័ណ្ណស្វាគមន៍</button>
          <button className="btn ghost danger" onClick={remove}><Trash2 size={16} /> លុប</button>
          {t.status === 'active' && t.roomId && <button className="btn ghost" onClick={() => setMoving(true)}><DoorOpen size={16} /> ចាកចេញ</button>}
          <button className="btn ghost" onClick={() => setContract(true)}><FileText size={16} /> {t.lease?.required === false ? 'គ្មានកិច្ចសន្យា' : t.lease?.text ? 'កិច្ចសន្យា' : 'បង្កើតកិច្ចសន្យា'}</button>
          <button className="btn primary" onClick={() => openCustomerForm(t)}><Pencil size={16} /> កែប្រែព័ត៌មាន</button>
        </div>
      </div>
      <div className="detail">
        <aside className="card profile-card">
          <Avatar name={t.nameKm || t.nameEn} src={tenantPhoto(t)} size={96} />
          <h2>{t.nameKm || t.nameEn}</h2>
          {t.nameEn && t.nameKm && <p className="muted">{t.nameEn}</p>}
          <div className="profile-chips">
            <span className="chip gray sm">{{ active: 'កំពុងជួល', former: 'អតីតអ្នកជួល', prospect: 'អ្នកចាប់អារម្មណ៍' }[t.status]}</span>
            {t.roomId && <span className="chip dark sm">បន្ទប់ {t.roomId}</span>}
          </div>
          <div className="profile-actions">
            {t.phone && <a className="round-light" href={`tel:${t.phone.replace(/\s/g, '')}`} aria-label="ហៅទូរស័ព្ទ"><Phone size={17} /></a>}
            {t.telegram?.username && <a className="round-light" href={`https://t.me/${t.telegram.username}`} target="_blank" rel="noreferrer" aria-label="Telegram"><Send size={17} /></a>}
            <a className="round-light" href={portal} target="_blank" rel="noreferrer" aria-label="គេហទំព័រអតិថិជន"><ExternalLink size={17} /></a>
          </div>
          <div className="owed-box"><small>ប្រាក់ជំពាក់</small><b>{$(owed)}</b>
            {latestOpen && <button className="btn primary sm" disabled={!t.telegram?.chatId || !state.bot.running} onClick={() => call('POST', `/api/invoices/${latestOpen.id}/send`, { reminder: !!latestOpen.sentAt }, 'បានផ្ញើតាម Telegram')}><Send size={14} /> ផ្ញើ</button>}
          </div>
          <div className="qr-pair">
            <div><QR value={tgLink} size={112} label="Telegram QR" /><small>{t.telegram?.chatId ? '✅ បានភ្ជាប់ Telegram' : 'ស្កេនដើម្បីភ្ជាប់ Telegram'}</small></div>
            <div><QR value={portal} size={112} label="Portal QR" /><small>គណនីអតិថិជន</small></div>
          </div>
          <div className="link-actions">
            {t.telegram?.chatId
              ? <button className="btn ghost sm" onClick={() => window.confirm('ផ្តាច់ Telegram?') && call('POST', `/api/tenants/${t.id}/unlink-telegram`, {}, 'បានផ្តាច់')}><Unlink size={14} /> ផ្តាច់ Telegram {t.telegram.username ? '@' + t.telegram.username : ''}</button>
              : !state.bot.running && <small className="muted">សូមដំឡើង Telegram bot នៅទំព័រ Telegram</small>}
            <button className="btn ghost sm" onClick={() => window.confirm('បង្កើតតំណថ្មី? តំណ/QR ចាស់នឹងលែងប្រើបាន។') && call('POST', `/api/tenants/${t.id}/rotate`, { what: 'portal' }, 'បានបង្កើតតំណថ្មី')}><RefreshCw size={14} /> ប្តូរតំណគណនី</button>
            <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(portal); }}><Link2 size={14} /> ចម្លងតំណ</button>
          </div>
        </aside>

        <div className="detail-main">
          <section className="card">
            <h3 className="sec-title"><UserRound size={17} /> ព័ត៌មានផ្ទាល់ខ្លួន</h3>
            <dl className="info-grid">
              <Info label="ភេទ" value={labelOf(GENDERS, t.gender)} />
              <Info label="ថ្ងៃខែឆ្នាំកំណើត" value={dateKm(t.dob, k)} />
              <Info label="ទូរស័ព្ទ" value={[t.phone, t.phone2].filter(Boolean).map(n).join(' · ')} />
              <Info label="អ៊ីមែល" value={t.email} />
              <Info label="មុខរបរ" value={t.occupation} />
              <Info label="កន្លែងធ្វើការ" value={t.workplace} />
              <Info label="អាសយដ្ឋានអចិន្ត្រៃយ៍" value={addr} wide icon={MapPin} />
            </dl>
          </section>

          <section className="card">
            <h3 className="sec-title"><IdCard size={17} /> អត្តសញ្ញាណប័ណ្ណ</h3>
            <dl className="info-grid">
              <Info label="ប្រភេទ" value={labelOf(ID_TYPES, t.idType)} />
              <Info label="លេខ" value={t.idNumber && n(t.idNumber)} />
              <Info label="ថ្ងៃចេញ" value={dateKm(t.idIssued, k)} />
              <Info label="ថ្ងៃផុតកំណត់" value={dateKm(t.idExpiry, k)} warn={t.idExpiry && t.idExpiry < state.today.ymd ? 'ផុតកំណត់' : ''} />
            </dl>
            <div className="id-images">
              {['idFront', 'idBack'].map((slot) => <DocSlot key={slot} t={t} slot={slot} label={slot === 'idFront' ? 'ផ្នែកខាងមុខ' : 'ផ្នែកខាងក្រោយ'} onView={setViewer} />)}
              <DocSlot t={t} slot="photo" label="រូបថតអតិថិជន" onView={setViewer} />
              <DocSlot t={t} slot="contract" label="កិច្ចសន្យា (រូប/PDF)" onView={setViewer} accept="image/*,application/pdf" />
            </div>
            <p className="privacy-note">🔒 ឯកសារទាំងនេះរក្សាទុកដោយឯកជន មានតែម្ចាស់ផ្ទះ និងអតិថិជនផ្ទាល់ដែលអាចមើលបាន។</p>
          </section>

          <div className="two-col">
            <section className="card">
              <h3 className="sec-title"><HeartPulse size={17} /> ទំនាក់ទំនងបន្ទាន់</h3>
              <dl className="info-grid one">
                <Info label="ឈ្មោះ" value={t.emergency?.name} />
                <Info label="ត្រូវជា" value={t.emergency?.relation} />
                <Info label="ទូរស័ព្ទ" value={t.emergency?.phone && n(t.emergency.phone)} />
              </dl>
            </section>
            <section className="card">
              <h3 className="sec-title"><FileText size={17} /> កិច្ចសន្យា</h3>
              <dl className="info-grid one">
                <Info label="បន្ទប់" value={room ? `${room.id} · ${room.building} · ${$(room.rent)}/ខែ` : '—'} />
                <Info label="រយៈពេល" value={t.contract?.start ? `${dateKm(t.contract.start, k)} — ${dateKm(t.contract.end, k) || '…'}` : ''} />
                <Info label="ប្រាក់កក់" value={t.contract?.deposit ? $(t.contract.deposit) : ''} />
                <Info label="ថ្ងៃបង់ប្រាក់" value={t.pay?.day ? `ថ្ងៃទី ${n(t.pay.day)}${t.pay.day2 ? ` និង ${n(t.pay.day2)} (២ លើក)` : ''} រៀងរាល់ខែ` : ''} />
                <Info label="សេវាបន្ថែម" value={(t.addons || []).map((x) => { const a = state.settings.addons?.find((y) => y.id === x.id); return a ? `${a.icon} ${a.label}${x.qty > 1 ? ` ×${n(x.qty)}` : ''}` : ''; }).filter(Boolean).join(' · ')} />
                {room?.features?.length > 0 && <Info label="បរិក្ខារ" value={<FeatureIcons ids={room.features} labels />} wide />}
              </dl>
            </section>
          </div>

          <DepositCard t={t} />

          {t.notes && <section className="card"><h3 className="sec-title">កំណត់ចំណាំ</h3><p className="notes">{t.notes}</p></section>}

          <section className="card">
            <h3 className="sec-title"><FileText size={17} /> ប្រវត្តិវិក្កយបត្រ</h3>
            <div className="rows">
              {invoices.map((i) => (
                <button key={i.id} className="row" onClick={() => openInvoice(i.id)}>
                  <span><b>{monthKm(i.month, k)}</b><small className="muted">{i.number}{i.sentAt ? ' · ✈️ បានផ្ញើ' : ''}</small></span>
                  <b>{$(i.total)}</b>
                  <StatusPill inv={i} />
                </button>
              ))}
              {!invoices.length && <p className="muted">មិនទាន់មានវិក្កយបត្រ</p>}
            </div>
          </section>
        </div>
      </div>
      {moving && <MoveOutModal t={t} onClose={() => setMoving(false)} />}
      {contract && <ContractModal tenant={t} onClose={() => { setContract(false); if (location.search) history.replaceState({}, '', location.pathname); }} />}
      {viewer && <Modal title="មើលឯកសារ" onClose={() => setViewer('')} wide><img className="viewer-img" src={viewer} alt="" /></Modal>}
    </>
  );
}

function Info({ label, value, wide, icon: Icon, warn }) {
  return (
    <div className={'info ' + (wide ? 'wide' : '')}>
      <dt>{label}</dt>
      <dd>{Icon && value && <Icon size={14} />} {value || <span className="muted">—</span>} {warn && <em className="pill danger"><i />{warn}</em>}</dd>
    </div>
  );
}

function DocSlot({ t, slot, label, onView, accept = 'image/*' }) {
  const { call, setState, notify } = useApp();
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const url = fileUrl(t, slot);
  const isPdf = t.files?.[slot]?.type === 'application/pdf';
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { setState(await uploadFile(`/api/tenants/${t.id}/files/${slot}`, f)); notify('បានរក្សាទុកឯកសារ'); } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  }
  return (
    <div className="doc-slot">
      <div className={'doc-thumb ' + (url ? 'has' : '')} onClick={() => url && (isPdf ? window.open(url, '_blank') : onView(url))}>
        {url && !isPdf && <img src={url} alt={label} />}
        {url && isPdf && <span className="pdf">PDF</span>}
        {!url && <span className="doc-empty"><Upload size={20} />{busy ? 'កំពុងផ្ទុក…' : 'បញ្ចូលរូប'}</span>}
      </div>
      <div className="doc-foot">
        <small>{label}</small>
        <span>
          <button className="link-btn" onClick={() => input.current.click()} disabled={busy}>{url ? 'ប្តូរ' : 'ជ្រើសរើស'}</button>
          {url && <button className="link-btn danger" onClick={() => window.confirm('លុបឯកសារនេះ?') && call('DELETE', `/api/tenants/${t.id}/files/${slot}`, undefined, 'បានលុប')}>លុប</button>}
        </span>
      </div>
      <input ref={input} type="file" accept={accept} capture={slot === 'photo' ? 'user' : 'environment'} hidden onChange={onFile} />
    </div>
  );
}

function WelcomeSheet({ t, portal, tgLink, property }) {
  return (
    <div className="print-sheet welcome-sheet">
      <h1 className="moul">{property}</h1>
      <p>សូមស្វាគមន៍ <b>{t.nameKm}</b> · បន្ទប់ <b>{t.roomId}</b></p>
      <div className="welcome-qrs">
        {tgLink && <div><QR value={tgLink} size={220} /><b>① ភ្ជាប់ Telegram</b><small>ទទួលវិក្កយបត្រ និង KHQR ដោយស្វ័យប្រវត្តិរៀងរាល់ខែ</small></div>}
        <div><QR value={portal} size={220} /><b>② គណនីរបស់ខ្ញុំ</b><small>មើលវិក្កយបត្រ បង់ប្រាក់ និងកែប្រែព័ត៌មានផ្ទាល់ខ្លួន</small></div>
      </div>
      <p className="small">សូមរក្សាទុកសន្លឹកនេះឱ្យមានសុវត្ថិភាព — QR ទាំងនេះជារបស់អ្នកតែម្នាក់គត់។</p>
    </div>
  );
}

// ---------- form ----------

const blank = {
  nameKm: '', nameEn: '', gender: '', dob: '', phone: '', phone2: '', email: '', occupation: '', workplace: '',
  idType: 'national_id', idNumber: '', idIssued: '', idExpiry: '',
  address: { provinceId: '', districtId: '', communeId: '', villageId: '', detail: '' },
  emergency: { name: '', relation: '', phone: '' },
  roomId: '', status: 'active', contract: { start: '', end: '', deposit: '' }, notes: '',
};

export function CustomerForm({ tenant, preset, onClose }) {
  const { state, call, setState, notify } = useApp();
  const [f, setF] = useState(() => ({ ...blank, ...(tenant || {}), ...(preset || {}) }));
  const [pending, setPending] = useState({});
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setIn = (o, k, v) => setF((x) => ({ ...x, [o]: { ...x[o], [k]: v } }));
  // A room is "full" when it already has as many tenants as its capacity (1 unless it is a shared room).
  const livingIn = (id) => state.tenants.filter((x) => x.status === 'active' && x.id !== tenant?.id && x.roomId === id).length;
  const occupied = { has: (id) => livingIn(id) >= (state.rooms.find((r) => r.id === id)?.capacity || 1) };

  const warnings = [];
  if (f.nameKm && !isKhmerName(f.nameKm)) warnings.push('ឈ្មោះខ្មែរគួរសរសេរជាអក្សរខ្មែរ');
  if (f.phone && !normalizePhone(f.phone)) warnings.push('លេខទូរស័ព្ទមិនត្រឹមត្រូវ');
  // Same phone or ID card as someone already on file (e.g. a former tenant coming back): show their history.
  const { $ } = useFmt();
  const idKey = (v) => String(v || '').replace(/[\s-]/g, '').toUpperCase();
  const phoneKey = (v) => normalizePhone(v) || '';
  const twins = state.tenants.filter((x) => x.id !== tenant?.id && (
    (phoneKey(f.phone) && [phoneKey(x.phone), phoneKey(x.phone2)].includes(phoneKey(f.phone)))
    || (idKey(f.idNumber).length >= 6 && idKey(x.idNumber) === idKey(f.idNumber))));
  const owedBy = (x) => state.invoices.filter((i) => i.status !== 'paid' && (i.tenantId === x.id || i.tenantIds?.includes(x.id))).reduce((a, i) => a + (i.balance ?? i.total), 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const before = new Set(state.tenants.map((x) => x.id));
    const res = await call(tenant ? 'PUT' : 'POST', tenant ? `/api/tenants/${tenant.id}` : '/api/tenants', f);
    if (!res) { setBusy(false); return; }
    const id = tenant?.id || res.tenants.find((x) => !before.has(x.id))?.id;
    try {
      for (const [slot, file] of Object.entries(pending)) setState(await uploadFile(`/api/tenants/${id}/files/${slot}`, file));
    } catch (err) { notify(err.message, true); }
    notify('បានរក្សាទុកអតិថិជន');
    setBusy(false);
    onClose();
    if (!tenant && id) navigate(`/customers/${id}?contract=1`);
  }

  return (
    <Modal title={tenant ? 'កែប្រែព័ត៌មានអតិថិជន' : 'បន្ថែមអតិថិជនថ្មី'} sub="ព័ត៌មានផ្ទាល់ខ្លួន អត្តសញ្ញាណប័ណ្ណ និងកិច្ចសន្យា" onClose={onClose} wide>
      <form onSubmit={submit} className="stack-form">
        <fieldset>
          <legend>ព័ត៌មានផ្ទាល់ខ្លួន</legend>
          <div className="form-grid">
            <Field label="ឈ្មោះ (ខ្មែរ) *"><input value={f.nameKm} onChange={(e) => set('nameKm', e.target.value)} placeholder="សុខ ស្រីនាង" autoFocus /></Field>
            <Field label="ឈ្មោះ (ឡាតាំង)"><input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} placeholder="SOK SREYNEANG" /></Field>
            <Field label="ភេទ"><select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option>{GENDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="ថ្ងៃខែឆ្នាំកំណើត"><input type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
            <Field label="ទូរស័ព្ទ" hint="ឧ. 012 345 678 ឬ +855…"><input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} onBlur={(e) => normalizePhone(e.target.value) && set('phone', normalizePhone(e.target.value))} /></Field>
            <Field label="ទូរស័ព្ទទី ២"><input type="tel" inputMode="tel" value={f.phone2} onChange={(e) => set('phone2', e.target.value)} /></Field>
            <Field label="អ៊ីមែល"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="មុខរបរ"><input value={f.occupation} onChange={(e) => set('occupation', e.target.value)} placeholder="និស្សិត បុគ្គលិក…" /></Field>
            <Field label="កន្លែងធ្វើការ / សាលា" wide><input value={f.workplace} onChange={(e) => set('workplace', e.target.value)} /></Field>
          </div>
        </fieldset>
        <fieldset>
          <legend>អត្តសញ្ញាណប័ណ្ណ</legend>
          <button type="button" className="ocr-cta" onClick={() => setScan(true)}>
            <ScanText size={20} /><span><b>ស្កេនអត្តសញ្ញាណប័ណ្ណ</b><small>ថតរូប → បំពេញឈ្មោះ លេខ ថ្ងៃខែឆ្នាំកំណើតដោយស្វ័យប្រវត្តិ (Chakkhu OCR)</small></span>
          </button>
          <div className="form-grid">
            <Field label="ប្រភេទឯកសារ"><select value={f.idType} onChange={(e) => set('idType', e.target.value)}>{ID_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="លេខ"><input value={f.idNumber} onChange={(e) => set('idNumber', e.target.value)} placeholder="0xxxxxxxx" /></Field>
            <Field label="ថ្ងៃចេញ"><input type="date" value={f.idIssued} onChange={(e) => set('idIssued', e.target.value)} /></Field>
            <Field label="ថ្ងៃផុតកំណត់"><input type="date" value={f.idExpiry} onChange={(e) => set('idExpiry', e.target.value)} /></Field>
            {['idFront', 'idBack', 'photo'].map((slot) => (
              <Field key={slot} label={{ idFront: 'រូបខាងមុខ', idBack: 'រូបខាងក្រោយ', photo: 'រូបថតអតិថិជន' }[slot]} hint={tenant?.files?.[slot] && !pending[slot] ? '✅ មានរួចហើយ — ជ្រើសដើម្បីប្តូរ' : pending[slot]?.name}>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => setPending((p) => ({ ...p, [slot]: e.target.files[0] }))} />
              </Field>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>អាសយដ្ឋានអចិន្ត្រៃយ៍</legend>
          <div className="form-grid"><AddressPicker value={f.address} onChange={(v) => set('address', v)} /></div>
        </fieldset>
        <fieldset>
          <legend>ទំនាក់ទំនងបន្ទាន់</legend>
          <div className="form-grid three">
            <Field label="ឈ្មោះ"><input value={f.emergency.name} onChange={(e) => setIn('emergency', 'name', e.target.value)} /></Field>
            <Field label="ត្រូវជា"><input value={f.emergency.relation} onChange={(e) => setIn('emergency', 'relation', e.target.value)} placeholder="ឪពុក ម្តាយ បងប្អូន…" /></Field>
            <Field label="ទូរស័ព្ទ"><input type="tel" value={f.emergency.phone} onChange={(e) => setIn('emergency', 'phone', e.target.value)} /></Field>
          </div>
        </fieldset>
        <fieldset>
          <legend>បន្ទប់ និងកិច្ចសន្យា</legend>
          <div className="form-grid">
            <Field label="ស្ថានភាព"><select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">កំពុងជួល</option><option value="prospect">អ្នកចាប់អារម្មណ៍</option><option value="former">អតីតអ្នកជួល</option></select></Field>
            <Field label="បន្ទប់"><select value={f.roomId} onChange={(e) => set('roomId', e.target.value)}><option value="">— គ្មាន —</option>{state.rooms.map((r) => <option key={r.id} value={r.id} disabled={occupied.has(r.id)}>{r.id} · {r.building}{occupied.has(r.id) ? ' (ពេញ)' : livingIn(r.id) ? ` (រួមបន្ទប់ ${livingIn(r.id)}/${r.capacity})` : ''}</option>)}</select></Field>
            <Field label="ថ្ងៃចាប់ផ្តើម"><input type="date" value={f.contract.start} onChange={(e) => setIn('contract', 'start', e.target.value)} /></Field>
            <Field label="ថ្ងៃផុតកំណត់"><input type="date" value={f.contract.end} onChange={(e) => setIn('contract', 'end', e.target.value)} /></Field>
            <Field label={`ប្រាក់កក់ (${curSymbol(getClientCurrency())})`}><input type="number" min="0" step="any" value={f.contract.deposit} onChange={(e) => setIn('contract', 'deposit', e.target.value)} /></Field>
            <Field label="ថ្ងៃបង់ប្រាក់រៀងរាល់ខែ (ថ្ងៃបើកប្រាក់ខែ)" hint="ទុកទំនេរ = តាមការកំណត់ទូទៅ។ រំលឹកចាប់ពីថ្ងៃនេះ មិនមែនមុនទេ។">
              <select value={f.pay?.day || ''} onChange={(e) => set('pay', { ...(f.pay || {}), day: e.target.value ? +e.target.value : null, day2: e.target.value ? f.pay?.day2 || null : null })}>
                <option value="">— តាមទូទៅ —</option>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>ថ្ងៃទី {i + 1}</option>)}
              </select>
            </Field>
            {f.pay?.day && (
              <Field label="បង់ជា ២ លើក? ថ្ងៃទី ២" hint="សម្រាប់អ្នកបើកប្រាក់ខែ ២ ដង — បង់ពាក់កណ្តាលម្តង">
                <select value={f.pay?.day2 || ''} onChange={(e) => set('pay', { ...f.pay, day2: e.target.value ? +e.target.value : null })}>
                  <option value="">— បង់ម្តង —</option>{Array.from({ length: 31 }, (_, i) => i + 1).filter((d) => d !== f.pay.day).map((d) => <option key={d} value={d}>ថ្ងៃទី {d}</option>)}
                </select>
              </Field>
            )}
            <Field label="កំណត់ចំណាំ (ម្ចាស់ផ្ទះមើលឃើញតែម្នាក់ឯង)" wide><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
        </fieldset>
        <fieldset>
          <legend>សេវាបន្ថែម (ធីកអ្វីដែលអតិថិជនប្រើ)</legend>
          {(() => { const r = state.rooms.find((x) => x.id === f.roomId); return r?.features?.length ? <p className="small">បន្ទប់ {r.id}: <FeatureIcons ids={r.features} labels /></p> : null; })()}
          <AddonsPicker catalog={state.settings.addons} value={f.addons || []} onChange={(v) => set('addons', v)} />
          {(() => {
            const r = state.rooms.find((x) => x.id === f.roomId);
            const rent = +r?.rent || 0;
            const extras = (r?.extras || []).reduce((a, x) => a + (+x.amount || 0), 0);
            const add = addonsTotal(state.settings.addons, f.addons || []);
            return r ? <div className="month-est"><span>ប្រហែលប្រចាំខែ (មិនរាប់ទឹកភ្លើង)</span><b>{money(rent + extras + add)}</b><small>ថ្លៃជួល {money(rent)}{extras ? ` + ផ្សេងៗ ${money(extras)}` : ''}{add ? ` + សេវា ${money(add)}` : ''}</small></div> : null;
          })()}
        </fieldset>
        {scan && (
          <Suspense fallback={null}>
            <IdScanner initial={{ front: pending.idFront, back: pending.idBack }} onClose={() => setScan(false)}
              onApply={(fields, files) => {
                setF((x) => ({
                  ...x,
                  ...Object.fromEntries(['nameKm', 'nameEn', 'idNumber', 'gender', 'dob', 'idIssued', 'idExpiry'].filter((k) => fields[k]).map((k) => [k, fields[k]])),
                  idType: 'national_id',
                  address: fields.addressDetail && !x.address?.detail ? { ...x.address, detail: fields.addressDetail } : x.address,
                }));
                setPending((p) => ({ ...p, ...(files.front ? { idFront: files.front } : {}), ...(files.back ? { idBack: files.back } : {}) }));
              }} />
          </Suspense>
        )}
        {warnings.map((w) => <p key={w} className="form-warn">⚠️ {w}</p>)}
        {twins.map((x) => {
          const owed = Math.max(owedBy(x), x.moveOut?.owes || 0);
          return (
            <p key={x.id} className={'form-twin' + (owed > 0 ? ' owes' : '')}>
              👤 មានក្នុងបញ្ជីរួចហើយ៖ <b>{x.nameKm || x.nameEn}</b>{x.roomId ? ` · ${x.roomId}` : ''} · {x.status === 'active' ? 'កំពុងជួល' : x.status === 'former' ? `ធ្លាប់ជួល${x.moveOut?.date ? ` (ចេញ ${dateKm(x.moveOut.date)})` : ''}` : 'អ្នកចាប់អារម្មណ៍'}
              {owed > 0 && <> · <b>នៅជំពាក់ {$(owed)}</b></>}
              {' '}<a href={`/customers/${x.id}`} onClick={(e) => { e.preventDefault(); onClose(); navigate('/customers/' + x.id); }}>មើល →</a>
            </p>
          );
        })}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>បោះបង់</button>
          <button className="btn primary" disabled={busy || (!f.nameKm && !f.nameEn)}>{busy ? 'កំពុងរក្សាទុក…' : 'រក្សាទុក'}</button>
        </div>
      </form>
    </Modal>
  );
}
