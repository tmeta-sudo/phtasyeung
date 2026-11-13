import React, { useMemo, useState } from 'react';
import { billedOf, collectedOf } from '../ui.jsx';
import { ChevronRight, CalendarDays, CheckCircle2, Sparkles, Send, ScanLine, FileText, Bot } from 'lucide-react';
import { useApp, useFmt, navigate, Avatar, tenantPhoto } from '../ui.jsx';
import { greetingKm, dateKm, nowInCambodia, lunarKm, monthKm, holidaysBetween, MONTHS_KM, toRiel, khr } from '../../shared/khmer.js';

const ppHour = (iso) => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const ppDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date(iso));
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

export default function Home() {
  const { state, openInvoice, openScanner, call } = useApp();
  // Quietly ask Bakong about unpaid KHQRs when the dashboard opens (at most every 2 minutes).
  React.useEffect(() => {
    if (!state.settings.bakong?.enabled || !state.invoices.some((i) => i.status !== 'paid')) return;
    try { if (Date.now() - +(sessionStorage.getItem('py-bakong-check') || 0) < 120000) return; sessionStorage.setItem('py-bakong-check', String(Date.now())); } catch { /* ignore */ }
    call('POST', '/api/invoices/check-payments', {}, (r) => (r.result.paid ? `🤖 Bakong: បានទទួលប្រាក់ ${r.result.paid} វិក្កយបត្រ` : null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { n, $, k } = useFmt();
  const { today, settings } = state;
  const ym = today.ym;

  const d = useMemo(() => {
    const active = state.tenants.filter((t) => t.status === 'active');
    const occupied = state.rooms.filter((r) => active.some((t) => t.roomId === r.id)).length;
    const inv = state.invoices.filter((i) => i.month === ym);
    const billed = inv.reduce((s, i) => s + billedOf(i), 0);
    const paid = inv.filter((i) => i.status === 'paid');
    const paidAmt = Math.min(billed, inv.reduce((s, i) => s + collectedOf(i), 0));
    const sent = inv.filter((i) => i.sentAt).length;
    // cumulative collection by day of month
    const daysInMonth = new Date(today.year, today.month, 0).getDate();
    const byDay = Array(daysInMonth + 1).fill(0);
    for (const i of paid) {
      const day = i.paidAt && ppDate(i.paidAt).startsWith(ym) ? +ppDate(i.paidAt).slice(8, 10) : 1;
      byDay[day] += i.total;
    }
    let run = 0;
    const curve = byDay.map((v) => (run += v));
    // last 24h activity
    const since = Date.now() - 86400000;
    const recent = state.events.filter((e) => new Date(e.at).getTime() >= since);
    const hours = Array.from({ length: 24 }, () => []);
    for (const e of recent) {
      const ago = Math.floor((Date.now() - new Date(e.at).getTime()) / 3600000);
      hours[23 - Math.min(23, ago)].push(e);
    }
    // payment clock (last 120 days)
    const clock = Array(24).fill(0);
    const recentPaid = state.invoices.filter((i) => i.paidAt && Date.now() - new Date(i.paidAt) < 120 * 86400000);
    for (const i of recentPaid) clock[ppHour(i.paidAt)] += 1;
    const viaBot = recentPaid.filter((i) => i.paidVia === 'telegram' || i.claims?.length).length;
    // renewals
    const renewals = active
      .filter((t) => t.contract?.end && daysBetween(today.ymd, t.contract.end) <= 60 && daysBetween(today.ymd, t.contract.end) >= -30)
      .map((t) => ({ t, days: daysBetween(today.ymd, t.contract.end) }))
      .sort((a, b) => a.days - b.days);
    // needs you
    const needs = [];
    for (const i of state.invoices.filter((x) => x.status === 'claimed')) needs.push({ key: i.id, name: i.name, sub: `${i.roomId} · ${$(i.total)} · ${i.claims?.at(-1)?.source === 'portal' ? 'គេហទំព័រ' : 'Telegram'}`, pill: 'បញ្ជាក់', tone: 'blue', photo: tenantPhoto(state.tenants.find((t) => t.id === i.tenantId)), go: () => openInvoice(i.id) });
    for (const i of state.invoices.filter((x) => x.overdue && x.status === 'unpaid').slice(0, 4)) needs.push({ key: 'o' + i.id, name: i.name, sub: `ហួសកំណត់ · ${i.roomId} · ${$(i.total)}`, pill: 'រំលឹក', tone: 'dark', go: () => openInvoice(i.id) });
    for (const t of active.filter((x) => !x.files?.idFront).slice(0, 4)) needs.push({ key: 'id' + t.id, name: t.nameKm || t.nameEn, sub: `ខ្វះរូបអត្តសញ្ញាណប័ណ្ណ · ${t.roomId || '—'}`, pill: 'ពិនិត្យ', tone: 'light', photo: tenantPhoto(t), go: () => navigate('/customers/' + t.id) });
    {
      const bk = state.settings.backup || {};
      const last = Math.max(+new Date(bk.lastAt || 0) || 0, +new Date(bk.lastTelegramAt || 0) || 0);
      if (state.account.role === 'owner' && state.tenants.length && Date.now() - last > 30 * 86400000) needs.push({ key: 'backup', name: 'បម្រុងទុកទិន្នន័យ', sub: last ? `ចុងក្រោយ ${dateKm(nowInCambodia(new Date(last)).ymd, k).replace('ថ្ងៃទី', '')}` : 'មិនទាន់ធ្លាប់បម្រុងទុក · ចុចម្តងគត់', pill: 'បម្រុង', tone: 'blue', go: () => navigate('/settings#backup') });
    }
    for (const t of active.filter((x) => !x.telegram?.chatId).slice(0, 3)) needs.push({ key: 'tg' + t.id, name: t.nameKm || t.nameEn, sub: `មិនទាន់ភ្ជាប់ Telegram · ${t.roomId || '—'}`, pill: 'ភ្ជាប់', tone: 'light', photo: tenantPhoto(t), go: () => navigate('/customers/' + t.id) });
    const unsent = inv.filter((i) => !i.sentAt && i.status !== 'paid');
    const roomsWithoutInvoice = active.filter((t) => t.roomId && !inv.some((i) => i.roomId === t.roomId));
    const metersMissing = active.filter((t) => t.roomId && !state.meters.some((m) => m.roomId === t.roomId && m.month === ym));
    return { active, occupied, inv, billed, paid, paidAmt, sent, curve, daysInMonth, recent, hours, clock, viaBot, recentPaid, renewals, needs, unsent, roomsWithoutInvoice, metersMissing };
  }, [state, ym, today, $, openInvoice]);

  const occPct = state.rooms.length ? Math.round((d.occupied / state.rooms.length) * 100) : 0;
  const collectedPct = d.billed ? Math.round((d.paidAmt / d.billed) * 100) : 0;
  const sentPct = d.inv.length ? Math.round((d.sent / d.inv.length) * 100) : 0;
  const holidays = holidaysBetween(today.ymd, `${today.year + (today.month === 12 ? 1 : 0)}-${String((today.month % 12) + 1).padStart(2, '0')}-31`).slice(0, 3);
  const nextAuto = settings.auto.enabled
    ? (settings.auto.lastRunMonth === ym ? `ថ្ងៃទី${n(settings.auto.day)} ${MONTHS_KM[today.month % 12]}` : `ថ្ងៃទី${n(settings.auto.day)} ${MONTHS_KM[today.month - 1]}`) + ` ម៉ោង ${n(settings.auto.hour)}:០០`
    : 'បិទ';

  return (
    <>
      <div className="page-head">
        <h1 className="greeting">{greetingKm(today.hour)}, ម្ចាស់ផ្ទះ</h1>
        <div className="head-actions">
          <button className="btn ghost hide-m" onClick={openScanner}><ScanLine size={16} /> ស្កេន QR</button>
          <span className="btn ghost static" title={lunarKm(today.ymd)}><CalendarDays size={16} /> {dateKm(today.ymd, k).replace('ថ្ងៃទី', '')}</span>
          {d.needs.length > 0 && <button className="btn primary" onClick={() => document.querySelector('.needs-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <CheckCircle2 size={16} /> ពិនិត្យ {n(d.needs.length)} ការងារ
          </button>}
        </div>
      </div>
      <p className="lunar-line">{lunarKm(today.ymd)}{holidays.length > 0 && <> · <b>{holidays[0].nameKm}</b> {dateKm(holidays[0].date, k).replace('ថ្ងៃទី', '')}</>}</p>

      {(!state.rooms.length || !state.tenants.length || !settings.khqrReady || !settings.telegram.adminChats.length) && (
        <div className="onboard">
          {[
            [!!state.rooms.length, 'បន្ថែមបន្ទប់', 'បញ្ចូលបន្ទប់ និងថ្លៃជួល', '/rooms'],
            [!!state.tenants.length, 'បន្ថែមអតិថិជន', 'ព័ត៌មាន និងរូបអត្តសញ្ញាណប័ណ្ណ', '/customers'],
            [settings.khqrReady, 'កំណត់ KHQR', 'Bakong ID ដើម្បីទទួលប្រាក់', '/settings'],
            [!!settings.telegram.adminChats.length, 'ភ្ជាប់ Telegram', 'ស្កេន QR ម្ចាស់ផ្ទះ ដើម្បីទទួលការជូនដំណឹង', '/telegram'],
          ].map(([done, title, sub, to], i) => (
            <button key={title} className={'onboard-step ' + (done ? 'done' : '')} onClick={() => navigate(to)}>
              <span className="num">{done ? '✓' : n(i + 1)}</span><b>{title}</b><small>{sub}</small>
            </button>
          ))}
        </div>
      )}
      <div className="dash">
        {/* Property */}
        <section className="card photo-card" style={{ backgroundImage: settings.coverUrl ? `url("${settings.coverUrl}")` : undefined }}>
          <span className="chip white"><i className="dot-blue" /> ជួលបាន {n(occPct)}%</span>
          <div className="photo-bottom">
            <span className="chip glass"><Bot size={14} /> {state.bot.running ? `@${state.bot.username} កំពុងតាមដាន` : 'Telegram bot មិនទាន់ដំណើរការ'}</span>
            <button className="glass-card" onClick={() => navigate('/rooms')}>
              <span><b>{settings.propertyName}</b><small>{n(state.rooms.length)} បន្ទប់{settings.address ? ` · ${settings.address}` : ''}</small></span>
              <i className="round-dark"><ChevronRight size={18} /></i>
            </button>
          </div>
        </section>

        {/* Activity dot matrix */}
        <section className="card activity-card">
          <div className="activity-main">
            <div className="big-stat">
              <span className="sq-icon"><Sparkles size={18} /></span>
              <b>{n(d.recent.length)}</b>
              <span className="chip white sm">{n(d.recent.filter((e) => e.kind === 'auto').length)} ស្វ័យប្រវត្តិ</span>
            </div>
            <p className="muted">សកម្មភាពក្នុង ២៤ ម៉ោងចុងក្រោយ</p>
            <DotMatrix hours={d.hours} />
            <div className="legend">
              <span><i className="lg-auto" /> ស្វ័យប្រវត្តិ</span>
              <span><i className="lg-tenant" /> អតិថិជន</span>
              <span><i className="lg-admin" /> ម្ចាស់ផ្ទះ</span>
            </div>
          </div>
          <div className="blue-card">
            <div className="blue-top"><span className="sq-icon light"><CheckCircle2 size={18} /></span><span className="chip white sm">{monthKm(ym, k).replace(/ ឆ្នាំ.*/, '')}</span></div>
            <b className="blue-pct">{n(collectedPct)}%</b>
            <p>បានប្រមូលប្រាក់ខែនេះ</p>
            <div className="inner-white">
              <div className="iw-top"><Send size={15} /><span className="chip gray sm">{n(d.sent)} នៃ {n(d.inv.length)}</span></div>
              <b>{n(sentPct)}%</b>
              <small>ផ្ញើតាម Telegram</small>
            </div>
          </div>
        </section>

        {/* Needs you */}
        <section className="card needs-card">
          <p className="muted">កំពុងរង់ចាំអ្នក</p>
          <div className="needs-head"><h2>ត្រូវការអ្នក</h2><span className="chip white sm"><i className="dot-blue" /> {n(d.needs.length)}</span></div>
          <div className="needs-list">
            {d.needs.slice(0, 6).map((x) => (
              <button key={x.key} className="need" onClick={x.go}>
                <Avatar name={x.name} src={x.photo} size={38} />
                <span><b>{x.name}</b><small>{x.sub}</small></span>
                <em className={'need-pill ' + x.tone}><i />{x.pill}</em>
              </button>
            ))}
            {!d.needs.length && <p className="muted pad">🎉 គ្មានអ្វីត្រូវធ្វើទេ</p>}
          </div>
          <AutoCard d={d} nextAuto={nextAuto} />
        </section>

        {/* Rent collected */}
        <section className="card rent-card">
          <p className="muted">ប្រាក់ជួលបានប្រមូលខែនេះ</p>
          <div className="rent-top"><b className="money-big">{$(d.paidAmt)}</b><span className="chip white sm">{n(d.paid.length)}/{n(d.inv.length)}</span></div>
          <StepChart curve={d.curve} total={d.billed} days={d.daysInMonth} today={today.day} />
          <p className="muted foot"><FileText size={13} /> នៅសល់ {$(d.billed - d.paidAmt)} ({khr(toRiel(d.billed - d.paidAmt, settings.exchangeRate), k)})</p>
        </section>

        {/* Payment clock */}
        <section className="card clock-card">
          <div className="card-title"><div><p className="muted">{n(d.recentPaid.length)} ការបង់ក្នុង ១២០ ថ្ងៃ</p><h3>ម៉ោងបង់ប្រាក់</h3></div><button className="round-light" onClick={() => navigate('/invoices')} aria-label="មើល"><ChevronRight size={17} /></button></div>
          <Clock clock={d.clock} pct={d.recentPaid.length ? Math.round((d.viaBot / d.recentPaid.length) * 100) : 0} n={n} />
          <ul className="mini-legend">
            <li><i className="lg-tenant" /> តាម Telegram / គេហទំព័រ<b>{n(d.viaBot)}</b></li>
            <li><i className="lg-auto" /> កត់ត្រាដោយម្ចាស់ផ្ទះ<b>{n(d.recentPaid.length - d.viaBot)}</b></li>
            <li><i className="lg-admin" /> ហួសកំណត់ពេលនេះ<b>{n(state.invoices.filter((i) => i.overdue).length)}</b></li>
          </ul>
        </section>

        {/* Renewals */}
        <section className="card renew-card">
          <div className="card-title"><div><p className="muted">៦០ ថ្ងៃខាងមុខ</p><h3>កិច្ចសន្យាជិតផុត</h3></div><button className="round-light" onClick={() => navigate('/customers?filter=expiring')} aria-label="មើល"><ChevronRight size={17} /></button></div>
          <div className="renew-tiles">
            {d.renewals.slice(0, 2).map(({ t }) => (
              <button key={t.id} className="renew-tile" onClick={() => navigate('/customers/' + t.id)} style={tenantPhoto(t) ? { backgroundImage: `url("${tenantPhoto(t)}")` } : undefined}>
                {!tenantPhoto(t) && <Avatar name={t.nameKm} size={44} />}
                <span className="chip white sm">{t.roomId} · {n(daysBetween(today.ymd, t.contract.end))}ថ្ងៃ</span>
              </button>
            ))}
            <button className="renew-tile dark" onClick={() => navigate('/customers?filter=expiring')}><FileText size={20} /><span>មើលទាំងអស់</span></button>
          </div>
          <div className="lollipop-head"><b>{n(d.renewals.length)} កិច្ចសន្យា</b><span className="muted">{n(d.renewals.filter((r) => r.days < 0).length)} ផុតហើយ</span></div>
          <Lollipops items={d.renewals} />
          <div className="legend"><span><i className="lg-auto" /> លើសពី ៣០ ថ្ងៃ</span><span><i className="lg-tenant" /> ក្រោម ៣០ ថ្ងៃ</span></div>
        </section>
      </div>
    </>
  );

  function AutoCard({ d: data, nextAuto: next }) {
    const steps = [
      { label: 'កត់កុងទ័រ', value: `${n(data.metersMissing.length)} ខ្វះ`, tone: data.metersMissing.length ? 'white' : 'ghost', go: () => navigate('/meters') },
      { label: 'បង្កើតវិក្កយបត្រ', value: `${n(data.roomsWithoutInvoice.length)} បន្ទប់`, tone: 'blue', go: () => navigate('/invoices') },
      { label: 'ផ្ញើ Telegram', value: `${n(data.unsent.length)} មិនទាន់ផ្ញើ`, tone: 'ghost', go: () => navigate('/telegram') },
    ];
    const todo = data.roomsWithoutInvoice.length + data.unsent.length;
    return (
      <div className="auto-card">
        <p>ស្វ័យប្រវត្តិ · {next}</p>
        {steps.map((s) => <button key={s.label} className={'auto-pill ' + s.tone} onClick={s.go}><span>{s.label}</span><b>{s.value}</b></button>)}
        <div className="auto-foot">
          <div className="auto-icons">
            <button className="round-white" onClick={() => navigate('/telegram')} aria-label="Telegram"><Bot size={17} /></button>
            <button className="round-blue" disabled={!todo} aria-label="ដំណើរការឥឡូវ" title="បង្កើត និងផ្ញើឥឡូវ"
              onClick={() => call('POST', '/api/auto/run', {}, (r) => `បានបង្កើត ${n(r.result.created)} · ផ្ញើ ${n(r.result.ok || 0)}`)}><Send size={16} /></button>
          </div>
          <div className="auto-total"><small>{todo ? 'ដំណើរការឥឡូវ' : 'រួចរាល់'}</small><b>{$(data.billed - data.paidAmt)}</b></div>
        </div>
      </div>
    );
  }
}

function DotMatrix({ hours }) {
  const [tip, setTip] = useState(null);
  const ROWS = 5;
  return (
    <div className="dots-wrap">
      <div className="dots" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
        {hours.map((evs, c) => Array.from({ length: ROWS }, (_, r) => {
          const e = evs[ROWS - 1 - r];
          const cls = e ? 'd-' + e.kind : 'd-empty';
          return <i key={c + '-' + r} className={cls} style={{ gridColumn: c + 1, gridRow: r + 1 }} onMouseEnter={() => e && setTip({ e, c })} onMouseLeave={() => setTip(null)} />;
        }))}
      </div>
      {tip && <div className="dot-tip" style={{ left: `${(tip.c / 24) * 100}%` }}><b>{new Date(tip.e.at).toLocaleTimeString('km-KH', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit' })}</b> {tip.e.text}</div>}
      <div className="dots-axis"><span>២៤ម៉ោងមុន</span><span>១២ម៉ោងមុន</span><span>ឥឡូវ</span></div>
    </div>
  );
}

function StepChart({ curve, total, days, today }) {
  const W = 300; const H = 120;
  const max = Math.max(total, curve.at(-1), 1);
  const x = (day) => ((day - 1) / Math.max(1, days - 1)) * W;
  const y = (v) => H - (v / max) * H;
  let dPath = `M0 ${H}`;
  for (let day = 1; day <= Math.min(today, days); day++) dPath += ` H${x(day)} V${y(curve[day])}`;
  const lastX = x(Math.min(today, days));
  const lastV = curve[Math.min(today, days)];
  const pct = total ? Math.round((lastV / total) * 100) : 0;
  return (
    <div className="stepchart">
      <svg viewBox={`-2 -8 ${W + 4} ${H + 16}`} preserveAspectRatio="none" aria-label="ក្រាហ្វប្រាក់ជួល">
        <line x1="0" x2={W} y1={y(max)} y2={y(max)} className="grid" />
        <line x1="0" x2={W} y1={y(max / 2)} y2={y(max / 2)} className="grid" />
        <path d={`${dPath} V${H} Z`} className="area" />
        <path d={dPath} className="line" />
        <line x1={lastX} x2={lastX} y1={y(lastV)} y2={H} className="guide" />
        <circle cx={lastX} cy={y(lastV)} r="5" className="pt" />
      </svg>
      <span className="step-tip" style={{ left: `${Math.min(70, (lastX / W) * 100)}%` }}>{pct}%</span>
      <div className="axis"><span>1</span><span>{Math.ceil(days / 2)}</span><span>{days}</span></div>
    </div>
  );
}

function Clock({ clock, pct, n }) {
  const max = Math.max(1, ...clock);
  const dots = [];
  for (let h = 0; h < 24; h++) {
    for (let j = 0; j < 2; j++) {
      const a = ((h + j / 2) / 24) * Math.PI * 2 - Math.PI / 2;
      const r = 70;
      const level = clock[h] / max;
      const cls = clock[h] === 0 ? 'c0' : level > 0.66 ? 'c3' : level > 0.33 ? 'c2' : 'c1';
      dots.push(<circle key={h + '-' + j} cx={90 + Math.cos(a) * r} cy={90 + Math.sin(a) * r} r={j ? 3.2 : 4.4} className={cls} />);
    }
  }
  return (
    <div className="clock">
      <svg viewBox="0 0 180 180" aria-label="ម៉ោងបង់ប្រាក់">
        <circle cx="90" cy="90" r="82" className="clock-ring" />
        {dots}
        <text x="90" y="88" textAnchor="middle" className="clock-pct">{n(pct)}%</text>
        <text x="90" y="106" textAnchor="middle" className="clock-sub">តាមឌីជីថល</text>
        <text x="90" y="10" textAnchor="middle" className="clock-lbl">00:00</text>
        <text x="90" y="178" textAnchor="middle" className="clock-lbl">12:00</text>
        <text x="174" y="93" textAnchor="end" className="clock-lbl">6</text>
        <text x="6" y="93" className="clock-lbl">18</text>
      </svg>
    </div>
  );
}

function Lollipops({ items }) {
  const shown = items.slice(0, 10);
  return (
    <div className="lollipops">
      {shown.map(({ t, days }) => (
        <button key={t.id} className={'lolli ' + (days < 30 ? 'soon' : '')} style={{ '--h': `${Math.max(12, 100 - Math.max(0, days) * 1.4)}%` }} title={`${t.nameKm} · ${days} ថ្ងៃ`} onClick={() => navigate('/customers/' + t.id)}><i /></button>
      ))}
      {!shown.length && <p className="muted">គ្មានកិច្ចសន្យាជិតផុតទេ</p>}
      <div className="axis"><span>ថ្ងៃនេះ</span><span>៣០ថ្ងៃ</span><span>៦០ថ្ងៃ</span></div>
    </div>
  );
}
