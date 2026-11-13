import React from 'react';
import { WifiOff, RefreshCw, Download, Share, X } from 'lucide-react';
import { useInstallState } from './pwa.js';

/** Offline notice, "new version" prompt and install invitation. */
export default function PwaBar({ appName = 'ផ្ទះយើង', className = '' }) {
  const p = useInstallState();
  if (!p.online) return <div className={'pwa-bar offline ' + className}><WifiOff size={16} /> គ្មានអ៊ីនធឺណិត — កំពុងបង្ហាញទិន្នន័យចុងក្រោយ។ ការកែប្រែនឹងមិនរក្សាទុករហូតដល់មានអ៊ីនធឺណិតវិញ។</div>;
  if (p.updateReady) {
    return (
      <div className={'pwa-bar update ' + className}>
        <RefreshCw size={16} /> <span>មានកំណែថ្មីរបស់ {appName}</span>
        <button onClick={p.applyUpdate}>ធ្វើបច្ចុប្បន្នភាព</button>
      </div>
    );
  }
  if (!p.showInstall || p.standalone) return null;
  return (
    <div className={'pwa-bar install ' + className}>
      <img src={className.includes('portal') ? '/icons/portal-192.png' : '/icons/icon-192.png'} alt="" width="36" height="36" />
      {p.canInstall ? (
        <>
          <span><b>ដំឡើង {appName}</b><small>បើកលឿន ដូចកម្មវិធីលើទូរស័ព្ទ</small></span>
          <button onClick={p.install}><Download size={15} /> ដំឡើង</button>
        </>
      ) : (
        <span><b>ដំឡើងលើ iPhone</b><small>ចុច <Share size={13} /> (Share) រួចជ្រើស «Add to Home Screen»</small></span>
      )}
      <button className="pwa-x" onClick={p.dismiss} aria-label="បិទ"><X size={15} /></button>
    </div>
  );
}
