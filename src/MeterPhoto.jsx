import React, { useRef, useState } from 'react';
import { Camera, Loader2, Check } from 'lucide-react';
import { compressImage } from './api.js';
import { useFmt } from './ui.jsx';

/**
 * 📷 next to a meter input: take a photo, read the number on the device, suggest values.
 * onPick(value) fills the input; onPhoto(file) keeps the photo to upload as proof after saving.
 */
export default function MeterPhoto({ previous, onPick, onPhoto, has }) {
  const { n } = useFmt();
  const ref = useRef();
  const [busy, setBusy] = useState(0);
  const [cands, setCands] = useState(null);
  async function onFile(f) {
    if (!f) return;
    const small = await compressImage(f, 1600).catch(() => f);
    onPhoto?.(small);
    setBusy(0.01); setCands(null);
    try {
      const { readMeterPhoto } = await import('./ocr/meter.js');
      setCands(await readMeterPhoto(small, { previous, onProgress: (p) => setBusy(Math.max(0.01, p)) }));
    } catch { setCands([]); } finally { setBusy(0); }
  }
  return (
    <span className="meter-photo">
      <button type="button" className={'icon-btn cam ' + (has ? 'has' : '')} onClick={() => ref.current.click()} aria-label="ថតកុងទ័រ" title="ថតរូបកុងទ័រ — អានលេខដោយស្វ័យប្រវត្តិ">
        {busy ? <Loader2 size={15} className="spin" /> : has ? <Check size={15} /> : <Camera size={15} />}
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {busy > 0 && <small className="mp-status">កំពុងអាន… {Math.round(busy * 100)}%</small>}
      {cands && (
        <span className="mp-cands">
          {cands.length ? cands.map((c) => <button type="button" key={c.value} onClick={() => { onPick(c.value); setCands(null); }}>{n(c.value)}</button>)
            : <small className="muted">អានមិនច្បាស់ — សូមវាយលេខ (រូបនៅតែរក្សាទុក)</small>}
        </span>
      )}
    </span>
  );
}
