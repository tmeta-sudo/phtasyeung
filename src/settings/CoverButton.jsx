import React, { useRef, useState } from 'react';
import { useApp } from '../ui.jsx';
import { uploadFile } from '../api.js';

/** Pick a photo from the phone (camera or gallery) and make it the property's cover picture. */
export function CoverButton({ className = 'btn ghost sm', children }) {
  const { setState, notify } = useApp();
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { setState(await uploadFile('/api/settings/cover', file)); notify('បានប្តូររូបគម្រប ✅'); } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  }
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current.click()} disabled={busy}>{busy ? <span className="spinner sm" /> : children}</button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
    </>
  );
}
