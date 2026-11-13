import React, { useEffect, useState } from 'react';
import { HardDrive, Cloud, Database, ShieldCheck, Unplug, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useApp } from '../ui.jsx';
import { api } from '../api.js';

const bytes = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
const LABEL = { db: 'ម៉ាស៊ីនមេ (Postgres)', r2: 'Cloudflare R2', gdrive: 'Google Drive របស់អ្នក' };

/** Where this landlord's ID cards and photos are kept. */
export default function StorageCard() {
  const { notify, reload } = useApp();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState('');
  const load = () => api('GET', '/api/storage').then(setS).catch(() => {});
  useEffect(() => {
    load();
    const q = new URLSearchParams(location.search).get('storage');
    if (q === 'connected') notify('បានភ្ជាប់ Google Drive ✅ — កំពុងផ្ទេរឯកសារ…');
    if (q === 'error') notify('មិនអាចភ្ជាប់ Google Drive បានទេ។ សូមព្យាយាមម្តងទៀត។', true);
    if (q === 'connected') setTimeout(() => migrate('/api/storage/migrate'), 400);
  }, []); // eslint-disable-line

  async function migrate(url) {
    setBusy('move');
    try {
      for (let i = 0; i < 200; i++) {
        const r = await api('POST', url);
        if (!r.remaining) break;
      }
      notify('បានផ្ទេរឯកសាររួចរាល់ ✅');
    } catch (e) { notify(e.message, true); } finally { setBusy(''); load(); reload(); }
  }

  if (!s) return null;
  const total = s.summary.reduce((a, x) => a + x.files, 0);
  const pending = s.summary.filter((x) => x.backend !== (s.mode === 'gdrive' ? 'gdrive' : s.platform === 'r2' ? 'r2' : 'db')).reduce((a, x) => a + x.files, 0);
  return (
    <div className="card storage-card">
      <h3 className="sec-title"><HardDrive size={17} /> ទីផ្ទុកឯកសារ (អត្តសញ្ញាណប័ណ្ណ រូបថត)</h3>
      <div className="storage-opts">
        <div className={'st-opt ' + (s.mode !== 'gdrive' ? 'on' : '')}>
          <Database size={20} /><b>ផ្ទះយើង</b><small>{s.platform === 'r2' ? 'Cloudflare R2 · អ៊ិនគ្រីប' : 'Postgres · ឯកជន'}</small>
        </div>
        <div className={'st-opt ' + (s.mode === 'gdrive' ? 'on' : '')}>
          <Cloud size={20} /><b>Google Drive របស់អ្នក</b><small>{s.gdrive?.email || 'ឯកសារនៅក្នុង Drive ផ្ទាល់ខ្លួនរបស់អ្នក'}</small>
        </div>
      </div>
      <p className="muted small"><ShieldCheck size={13} /> {total} ឯកសារ · {s.summary.map((x) => `${LABEL[x.backend]} ${x.files} (${bytes(x.bytes)})`).join(' · ') || 'មិនទាន់មានឯកសារ'}</p>
      {s.mode === 'gdrive' ? (
        <>
          <p className="tip">📁 ឯកសារត្រូវបានរក្សាទុកក្នុងថត «ផ្ទះយើង» នៃ Google Drive របស់អ្នក។ ផ្ទះយើងអាចមើលឃើញតែឯកសារដែលខ្លួនបង្កើតប៉ុណ្ណោះ។ ទិន្នន័យបម្រុងទុក (backup) ត្រូវបានរក្សាទុកក្នុង Drive រៀងរាល់ថ្ងៃ{s.gdrive?.lastBackupAt ? ` · ចុងក្រោយ ${new Date(s.gdrive.lastBackupAt).toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}` : ''}។</p>
          <div className="row-btns">
            {pending > 0 && <button className="btn primary sm" disabled={!!busy} onClick={() => migrate('/api/storage/migrate')}><RefreshCw size={14} /> ផ្ទេរ {pending} ឯកសារទៅ Drive</button>}
            <button className="btn ghost sm" disabled={!!busy} onClick={async () => { setBusy('backup'); try { await api('POST', '/api/storage/backup'); notify('បានបម្រុងទុកទៅ Drive ✅'); load(); } catch (e) { notify(e.message, true); } finally { setBusy(''); } }}><CheckCircle2 size={14} /> បម្រុងទុកឥឡូវ</button>
            <button className="btn ghost sm danger" disabled={!!busy} onClick={() => window.confirm('ឈប់ប្រើ Google Drive? ឯកសារនឹងត្រូវចម្លងត្រឡប់មកម៉ាស៊ីនមេវិញ។') && migrate('/api/storage/disconnect')}><Unplug size={14} /> ផ្តាច់</button>
          </div>
        </>
      ) : s.googleAvailable ? (
        <button className="btn ghost" disabled={!!busy} onClick={async () => { try { const r = await api('GET', '/api/storage/google/start'); location.href = r.url; } catch (e) { notify(e.message, true); } }}>
          <Cloud size={16} /> ភ្ជាប់ Google Drive របស់ខ្ញុំ
        </button>
      ) : (
        <p className="muted small">ការរក្សាទុកក្នុង Google Drive ផ្ទាល់ខ្លួននឹងមានឆាប់ៗ។</p>
      )}
      {busy === 'move' && <p className="loc-status"><RefreshCw size={14} className="spin" /> កំពុងផ្ទេរឯកសារ… សូមកុំបិទទំព័រ</p>}
    </div>
  );
}
