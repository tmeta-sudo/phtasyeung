import React, { useRef, useState } from 'react';
import { DatabaseBackup, Download, Send, Upload, Lock, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { useApp, useFmt } from '../ui.jsx';
import { api, uploadFile } from '../api.js';
import { downloadBlob } from '../exportImage.js';

// Encrypted backups: "PYBK" + version + salt(16) + iv(12) + AES-256-GCM(zip); key = PBKDF2-SHA256(password, 250k).
const MAGIC = [0x50, 0x59, 0x42, 0x4b];
async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encrypt(bytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(password, salt), bytes));
  const out = new Uint8Array(5 + 16 + 12 + ct.length);
  out.set(MAGIC, 0); out[4] = 1; out.set(salt, 5); out.set(iv, 21); out.set(ct, 33);
  return out;
}
const isEncrypted = (b) => MAGIC.every((m, i) => b[i] === m);
async function decrypt(bytes, password) {
  const salt = bytes.slice(5, 21); const iv = bytes.slice(21, 33);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deriveKey(password, salt), bytes.slice(33)));
  } catch { throw new Error('ពាក្យសម្ងាត់មិនត្រឹមត្រូវ'); }
}

const ago = (iso) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? 'ថ្ងៃនេះ' : `${d} ថ្ងៃមុន`;
};

/** One-click backups: download to the device, or send to the owner's Telegram. */
function useScrollToHash() {
  React.useEffect(() => { if (window.location.hash === '#backup') setTimeout(() => document.getElementById('backup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }, []);
}

export default function BackupCard() {
  useScrollToHash();
  const { state, call, notify, setState } = useApp();
  const { n } = useFmt();
  const bk = state.settings.backup || {};
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [usePw, setUsePw] = useState(false);
  const [pw, setPw] = useState('');
  const fileRef = useRef();
  const lastDays = bk.lastAt ? (Date.now() - new Date(bk.lastAt)) / 86400000 : Infinity;
  const hasTelegram = state.settings.telegram.adminChats?.length > 0;

  async function download() {
    if (usePw && pw.length < 6) return notify('ពាក្យសម្ងាត់យ៉ាងហោចណាស់ ៦ តួ', true);
    setBusy('dl');
    try {
      setProgress('កំពុងរៀបចំទិន្នន័យ…');
      const [data, { zipSync, strToU8 }] = await Promise.all([api('GET', '/api/account/export'), import('fflate')]);
      const entries = { 'data.json': strToU8(JSON.stringify(data, null, 1)) };
      const docs = data.tenants.flatMap((t) => Object.entries(t.files || {}).map(([slot, m]) => ({ t, slot, m })));
      for (const [i, d] of docs.entries()) {
        setProgress(`ឯកសារ ${n(i + 1)}/${n(docs.length)}…`);
        const res = await fetch(`/api/tenants/${d.t.id}/files/${d.slot}`, { credentials: 'same-origin' });
        if (res.ok) entries[`files/${d.t.id}/${d.slot}.${d.m.ext}`] = new Uint8Array(await res.arrayBuffer());
      }
      entries['README.txt'] = strToU8(`ផ្ទះយើង — ការបម្រុងទុក\n${data.settings.propertyName}\n${data.exportedAt}\n`);
      setProgress('កំពុងបង្ហាប់…');
      let out = zipSync(entries, { level: 6 });
      if (usePw) { setProgress('កំពុងអ៊ិនគ្រីប…'); out = await encrypt(out, pw); }
      const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
      downloadBlob(new Blob([out], { type: 'application/octet-stream' }), `phteah-yeung-${date}.${usePw ? 'pybackup' : 'zip'}`);
      await call('POST', '/api/backup/downloaded', {});
      notify(`បានបម្រុងទុក ✅ (${out.length < 1048576 ? Math.max(1, Math.round(out.length / 1024)) + " KB" : (out.length / 1048576).toFixed(1) + " MB"})`);
    } catch (e) { notify(e.message, true); } finally { setBusy(''); setProgress(''); }
  }

  async function restore(file) {
    setBusy('restore');
    try {
      let bytes = new Uint8Array(await file.arrayBuffer());
      if (isEncrypted(bytes)) {
        const p = window.prompt('ការបម្រុងទុកនេះមានពាក្យសម្ងាត់។ សូមបញ្ចូលពាក្យសម្ងាត់៖');
        if (!p) return;
        setProgress('កំពុងដោះសោ…');
        bytes = await decrypt(bytes, p);
      }
      const { unzipSync, strFromU8 } = await import('fflate');
      let files = {};
      let data;
      if (bytes[0] === 0x7b) data = JSON.parse(strFromU8(bytes)); // plain JSON export
      else { files = unzipSync(bytes); data = JSON.parse(strFromU8(files['data.json'])); }
      const docs = data.tenants?.reduce((a, t) => a + Object.keys(t.files || {}).length, 0) || 0;
      const ok = window.confirm(`ស្តារពីការបម្រុងទុក «${data.settings?.propertyName}» (${String(data.exportedAt).slice(0, 10)})?\n\nបន្ទប់ ${data.rooms?.length || 0} · អតិថិជន ${data.tenants?.length || 0} · វិក្កយបត្រ ${data.invoices?.length || 0} · ឯកសារ ${docs}\n\n⚠️ ទិន្នន័យបច្ចុប្បន្ននឹងត្រូវជំនួស។`);
      if (!ok) return;
      setProgress('កំពុងស្តារទិន្នន័យ…');
      const r = await api('POST', '/api/backup/restore', { data });
      setState(r);
      const uploads = r.result.uploads || [];
      for (const [i, u] of uploads.entries()) {
        const f = files[`files/${u.tenantId}/${u.slot}.${u.ext}`];
        if (!f) continue;
        setProgress(`ឯកសារ ${n(i + 1)}/${n(uploads.length)}…`);
        const type = u.ext === 'pdf' ? 'application/pdf' : u.ext === 'png' ? 'image/png' : u.ext === 'webp' ? 'image/webp' : 'image/jpeg';
        await uploadFile(`/api/tenants/${u.tenantId}/files/${u.slot}`, new File([f], `${u.slot}.${u.ext}`, { type }));
      }
      setState(await api('POST', '/api/backup/restore/finish', {}));
      notify('បានស្តាររួចរាល់ ✅');
    } catch (e) { notify(e.message, true); } finally { setBusy(''); setProgress(''); }
  }

  return (
    <div className="card backup-card" id="backup">
      <h3 className="sec-title"><DatabaseBackup size={17} /> ការបម្រុងទុក</h3>
      <div className={'backup-status ' + (lastDays > 30 ? 'warn' : 'ok')}>
        {lastDays > 30 ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
        <span>{bk.lastAt ? `បម្រុងទុកចុងក្រោយ ${ago(bk.lastAt)}` : 'មិនទាន់មានការបម្រុងទុក'}{bk.telegramWeekly && hasTelegram ? ' · ស្វ័យប្រវត្តិទៅ Telegram រៀងរាល់សប្តាហ៍' : ''}</span>
      </div>
      <div className="backup-actions">
        <button className="backup-btn primary" onClick={download} disabled={!!busy}>
          {busy === 'dl' ? <Loader2 size={22} className="spin" /> : <Download size={22} />}
          <b>ទាញយកការបម្រុងទុក</b><small>ទិន្នន័យ + រូបអត្តសញ្ញាណប័ណ្ណ ទៅឧបករណ៍នេះ</small>
        </button>
        <button className="backup-btn" onClick={async () => { setBusy('tg'); await call('POST', '/api/backup/telegram', { includeFiles: !!bk.includeFiles }, 'បានផ្ញើការបម្រុងទុកទៅ Telegram ✅'); setBusy(''); }} disabled={!!busy || !hasTelegram} title={hasTelegram ? '' : 'ភ្ជាប់ Telegram ម្ចាស់ផ្ទះជាមុនសិន'}>
          {busy === 'tg' ? <Loader2 size={22} className="spin" /> : <Send size={22} />}
          <b>ផ្ញើទៅ Telegram ខ្ញុំ</b><small>{hasTelegram ? 'រក្សាទុកក្នុង chat ផ្ទាល់ខ្លួនជាមួយ bot' : 'ត្រូវភ្ជាប់ Telegram ម្ចាស់ផ្ទះ'}</small>
        </button>
      </div>
      <label className="switch-row small"><input type="checkbox" checked={usePw} onChange={(e) => setUsePw(e.target.checked)} />
        <span><b><Lock size={13} /> ការពារដោយពាក្យសម្ងាត់</b><small>អ៊ិនគ្រីបឯកសារទាញយក (AES-256) — កុំភ្លេចពាក្យសម្ងាត់!</small></span></label>
      {usePw && <input className="pw-input" type="password" autoComplete="new-password" placeholder="ពាក្យសម្ងាត់សម្រាប់ការបម្រុងទុក" value={pw} onChange={(e) => setPw(e.target.value)} />}
      <div className="toggle-row">
        <label className={'chip-toggle ' + (bk.telegramWeekly ? 'on' : '')}><input type="checkbox" checked={!!bk.telegramWeekly} onChange={(e) => call('PUT', '/api/settings', { backup: { ...bk, telegramWeekly: e.target.checked } })} />Telegram រៀងរាល់សប្តាហ៍</label>
        <label className={'chip-toggle ' + (bk.includeFiles ? 'on' : '')}><input type="checkbox" checked={!!bk.includeFiles} onChange={(e) => call('PUT', '/api/settings', { backup: { ...bk, includeFiles: e.target.checked } })} />រួមទាំងរូបអត្តសញ្ញាណប័ណ្ណក្នុង Telegram</label>
      </div>
      {progress && <p className="loc-status"><Loader2 size={14} className="spin" /> {progress}</p>}
      <button className="link-btn" onClick={() => fileRef.current.click()} disabled={!!busy}><Upload size={14} /> ស្តារពីឯកសារបម្រុងទុក…</button>
      <input ref={fileRef} type="file" accept=".zip,.pybackup,.json,application/zip,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restore(f); }} />
    </div>
  );
}
