import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, Camera, ImageUp, DoorOpen, UserRound, ReceiptText, Gauge, Send, Check, Printer, QrCode, Wallet } from 'lucide-react';
import { useApp, useFmt, Modal, QR, Avatar, tenantPhoto, StatusPill, navigate } from '../ui.jsx';
import { StickerSheet } from './Rooms.jsx';

/** Minimal EMVCo TLV reader (KHQR is EMVCo). */
function tlv(s) {
  const out = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = +s.slice(i + 2, i + 4);
    if (Number.isNaN(len)) break;
    out[tag] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

/** Turn any scanned text into something actionable in this app. */
export function resolveScan(text, state) {
  const t = String(text || '').trim();
  const room = t.match(/\/scan\/room\/([^/?#]+)/);
  if (room) return { kind: 'room', room: state.rooms.find((r) => r.id === decodeURIComponent(room[1])) };
  const inv = t.match(/\/scan\/invoice\/([\w-]+)/);
  if (inv) return { kind: 'invoice', invoice: state.invoices.find((i) => i.id === inv[1]) };
  const cust = t.match(/\/scan\/customer\/([\w-]+)/);
  if (cust) return { kind: 'customer', tenant: state.tenants.find((x) => x.id === cust[1]) };
  const portal = t.match(/\/p\/([\w-]{10,})/);
  if (portal) return { kind: 'customer', tenant: state.tenants.find((x) => x.portalToken === portal[1]) };
  const tg = t.match(/t\.me\/[\w]+\?start=([\w-]+)/);
  if (tg) return { kind: 'customer', tenant: state.tenants.find((x) => x.linkCode === tg[1]) };
  if (t.startsWith('000201')) {
    const root = tlv(t);
    const bill = root['62'] ? tlv(root['62'])['01'] : '';
    const account = (root['29'] && tlv(root['29'])['00']) || (root['30'] && tlv(root['30'])['00']) || '';
    return { kind: 'khqr', bill, account, amount: root['54'], currency: root['53'] === '116' ? 'KHR' : 'USD', invoice: state.invoices.find((i) => i.number === bill) };
  }
  return { kind: 'text', text: t };
}

export function ScannerModal({ initialText, onClose }) {
  const { state } = useApp();
  const [text, setText] = useState(initialText || '');
  return (
    <Modal title="ស្កេន QR" sub="QR ទ្វារបន្ទប់ · QR អតិថិជន · KHQR · វិក្កយបត្រ" onClose={onClose} wide>
      {text ? <ScanResult result={resolveScan(text, state)} onAgain={() => setText('')} onDone={onClose} /> : <Scanner onResult={setText} />}
    </Modal>
  );
}

function Scanner({ onResult }) {
  const video = useRef();
  const canvas = useRef();
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  useEffect(() => {
    let stream; let raf; let stopped = false;
    const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    let jsQR = null;
    if (!detector) import('jsqr').then((m) => { jsQR = m.default; });
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.current.srcObject = stream;
        await video.current.play();
        loop();
      } catch {
        setErr('មិនអាចបើកកាមេរ៉ាបាន។ សូមអនុញ្ញាតកាមេរ៉ា ឬជ្រើសរូបភាព QR ខាងក្រោម។');
      }
    }
    async function loop() {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) return onResult(codes[0].rawValue);
          } else if (jsQR) {
            const c = canvas.current;
            c.width = v.videoWidth; c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(v, 0, 0);
            const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            if (code?.data) return onResult(code.data);
          }
        } catch { /* keep scanning */ }
      }
      raf = setTimeout(loop, 180);
    }
    start();
    return () => { stopped = true; clearTimeout(raf); stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [onResult]);

  async function fromImage(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const bmp = await createImageBitmap(f);
    const c = canvas.current;
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    c.width = bmp.width * scale; c.height = bmp.height * scale;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const { default: jsQR } = await import('jsqr');
    const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (code?.data) onResult(code.data); else setErr('រកមិនឃើញ QR ក្នុងរូបភាពនេះទេ');
  }

  return (
    <div className="scanner">
      <div className="viewfinder">
        <video ref={video} playsInline muted />
        <span className="vf-frame" />
        {!err && <span className="vf-hint"><Camera size={15} /> តម្រង់ QR ចូលក្នុងប្រអប់</span>}
      </div>
      <canvas ref={canvas} hidden />
      {err && <p className="form-warn">{err}</p>}
      <div className="scan-alt">
        <label className="btn ghost"><ImageUp size={16} /> ជ្រើសរូបភាព QR<input type="file" accept="image/*" hidden onChange={fromImage} /></label>
        <form onSubmit={(e) => { e.preventDefault(); manual && onResult(manual); }} className="manual">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="ឬបិទភ្ជាប់អត្ថបទ QR / លេខវិក្កយបត្រ" aria-label="អត្ថបទ QR" />
          <button className="btn primary">ពិនិត្យ</button>
        </form>
      </div>
    </div>
  );
}

function ScanResult({ result, onAgain, onDone }) {
  const { state, call, openMeter, openInvoice } = useApp();
  const { n, $ } = useFmt();
  const r = result.kind === 'text' ? resolveScan(result.text, state) : result;
  const byNumber = r.kind === 'text' && state.invoices.find((i) => i.number.toLowerCase() === r.text.toLowerCase());
  const inv = r.invoice || byNumber;
  const go = (fn) => { onDone(); fn(); };

  let body;
  if (r.kind === 'room' && r.room) {
    const t = state.tenants.find((x) => x.roomId === r.room.id && x.status === 'active');
    const open = state.invoices.filter((i) => i.roomId === r.room.id && i.status !== 'paid');
    body = (
      <>
        <div className="scan-head"><span className="sq-icon"><DoorOpen size={18} /></span><div><b>បន្ទប់ {r.room.id}</b><small>{r.room.building} · {$(r.room.rent)}/ខែ · {t ? t.nameKm : 'ទំនេរ'}</small></div></div>
        <div className="scan-actions">
          <button className="action-tile" onClick={() => go(() => openMeter(r.room.id))}><Gauge size={20} /> កត់កុងទ័រ<small>ទឹក {n(r.room.water)} · ភ្លើង {n(r.room.electric)}</small></button>
          {t && <button className="action-tile" onClick={() => go(() => navigate('/customers/' + t.id))}><UserRound size={20} /> អតិថិជន<small>{t.nameKm}</small></button>}
          {open[0] && <button className="action-tile" onClick={() => go(() => openInvoice(open[0].id))}><ReceiptText size={20} /> វិក្កយបត្រមិនទាន់បង់<small>{$(open.reduce((s, i) => s + i.total, 0))}</small></button>}
        </div>
      </>
    );
  } else if (r.kind === 'customer' && r.tenant) {
    body = (
      <>
        <div className="scan-head"><Avatar name={r.tenant.nameKm} src={tenantPhoto(r.tenant)} size={44} /><div><b>{r.tenant.nameKm}</b><small>{r.tenant.roomId || '—'} · {n(r.tenant.phone)}</small></div></div>
        <div className="scan-actions"><button className="action-tile" onClick={() => go(() => navigate('/customers/' + r.tenant.id))}><UserRound size={20} /> បើកប្រវត្តិរូប</button></div>
      </>
    );
  } else if (inv) {
    body = (
      <>
        <div className="scan-head"><span className="sq-icon"><ReceiptText size={18} /></span><div><b>{inv.number}</b><small>{inv.roomId} · {inv.name} · {$(inv.total)}</small></div><StatusPill inv={inv} /></div>
        {r.kind === 'khqr' && <p className="muted">KHQR → {r.account} · {r.amount} {r.currency}</p>}
        <div className="scan-actions">
          {inv.status !== 'paid' && <button className="action-tile primary" onClick={() => call('PUT', `/api/invoices/${inv.id}`, { status: 'paid' }, `បានទទួល ${$(inv.total)}`)}><Check size={20} /> សម្គាល់ថាបានបង់</button>}
          {inv.status !== 'paid' && state.bot.running && <button className="action-tile" onClick={() => call('POST', `/api/invoices/${inv.id}/send`, { reminder: true }, 'បានផ្ញើការរំលឹក')}><Send size={20} /> ផ្ញើរំលឹក</button>}
          <button className="action-tile" onClick={() => go(() => openInvoice(inv.id))}><ReceiptText size={20} /> មើលវិក្កយបត្រ</button>
        </div>
      </>
    );
  } else if (r.kind === 'khqr') {
    body = <div className="scan-head"><span className="sq-icon"><Wallet size={18} /></span><div><b>KHQR</b><small>{r.account} · {r.amount || '—'} {r.currency} · {r.bill || 'គ្មានលេខវិក្កយបត្រ'}</small></div></div>;
  } else {
    body = <div className="scan-head"><span className="sq-icon"><QrCode size={18} /></span><div><b>មិនស្គាល់ QR នេះ</b><small className="break">{r.text || result.text}</small></div></div>;
  }
  return (
    <div className="scan-result">
      {body}
      <button className="btn ghost" onClick={onAgain}><ScanLine size={16} /> ស្កេនម្តងទៀត</button>
    </div>
  );
}

export default function QrCenter() {
  const { state, openScanner, base, print } = useApp();
  const { n } = useFmt();
  const active = state.tenants.filter((t) => t.status === 'active');
  const bot = state.bot.username;
  const sample = state.invoices.find((i) => i.khqr);
  return (
    <>
      <div className="page-head">
        <h1>មជ្ឈមណ្ឌល QR</h1>
        <div className="head-actions"><button className="btn primary" onClick={openScanner}><ScanLine size={16} /> ស្កេនឥឡូវ</button></div>
      </div>
      <div className="qr-hub">
        <button className="card hub-tile big" onClick={openScanner}>
          <span className="hub-scan"><ScanLine size={42} /></span>
          <b>ស្កេនដើម្បីគ្រប់គ្រង</b>
          <p>ស្កេន QR ទ្វារ → កត់កុងទ័រ · ស្កេន KHQR ឬវិក្កយបត្រ → សម្គាល់បានបង់ · ស្កេន QR អតិថិជន → បើកប្រវត្តិរូប</p>
        </button>
        <div className="card hub-tile">
          <DoorOpen size={22} /><b>QR ទ្វារបន្ទប់</b><p>{n(state.rooms.length)} បន្ទប់ · បិទលើទ្វារ ឬកុងទ័រ</p>
          <button className="btn ghost sm" onClick={() => print(<StickerSheet rooms={state.rooms} base={base} name={state.settings.propertyName} />)}><Printer size={14} /> បោះពុម្ពទាំងអស់</button>
        </div>
        <div className="card hub-tile">
          <Send size={22} /><b>QR ភ្ជាប់ Telegram</b><p>{n(active.filter((t) => t.telegram?.chatId).length)}/{n(active.length)} អតិថិជនបានភ្ជាប់</p>
          <button className="btn ghost sm" disabled={!bot} onClick={() => print(
            <div className="print-sheet sticker-grid">{active.map((t) => <div className="sticker" key={t.id}><QR value={`https://t.me/${bot}?start=${t.linkCode}`} size={150} /><b>{t.roomId} · {t.nameKm}</b><small>ស្កេនដើម្បីទទួលវិក្កយបត្រតាម Telegram</small></div>)}</div>,
          )}><Printer size={14} /> បោះពុម្ព</button>
        </div>
        <div className="card hub-tile">
          <Wallet size={22} /><b>KHQR បង់ប្រាក់</b>
          <p>{state.settings.khqrReady ? `${state.settings.khqr.accountId} — QR ផ្ទាល់លើវិក្កយបត្រនីមួយៗ` : 'មិនទាន់កំណត់ Bakong ID'}</p>
          {sample ? <QR value={sample.khqr} size={96} /> : <button className="btn ghost sm" onClick={() => navigate('/settings')}>កំណត់ឥឡូវ</button>}
        </div>
      </div>
      <section className="card">
        <h3 className="sec-title"><UserRound size={17} /> QR អតិថិជន</h3>
        <div className="qr-list">
          {active.map((t) => (
            <div key={t.id} className="qr-item">
              <QR value={`${base}/p/${t.portalToken}`} size={88} />
              <div><b>{t.nameKm}</b><small className="muted">{t.roomId} · គណនីអតិថិជន</small>
                <span className={'mini ' + (t.telegram?.chatId ? 'ok' : 'muted')}><Send size={12} /> {t.telegram?.chatId ? 'Telegram ✓' : 'មិនទាន់ភ្ជាប់'}</span>
                <button className="link-btn" onClick={() => navigate('/customers/' + t.id)}>បើក →</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
