import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from './api.js';

/** Second sign-in step: the 6-digit code from the authenticator app, or a one-time recovery code. */
export default function TwoFactorPrompt({ ticket, onDone, onCancel }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api('POST', '/api/auth/2fa', { ticket, code });
      if (r.recoveryLeft !== undefined) window.alert(`បានប្រើលេខកូដបម្រុង។ នៅសល់ ${r.recoveryLeft}។ សូមបង្កើតលេខកូដថ្មីនៅ ការកំណត់ → សុវត្ថិភាព។`);
      onDone();
    } catch (err) { setError(err.message); setCode(''); } finally { setBusy(false); }
  }
  const onChange = (v) => {
    const next = recovery ? v.slice(0, 12) : v.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (!recovery && next.length === 6 && !busy) setTimeout(() => document.getElementById('tf-submit')?.click(), 0);
  };
  return (
    <form className="login-form two-factor" onSubmit={submit}>
      <div className="tf-icon"><ShieldCheck size={34} /></div>
      <b>ការចូល ២ ជំហាន</b>
      <p className="muted">{recovery ? 'វាយលេខកូដបម្រុងមួយ (ឧ. k7q2-m9xd)។ លេខកូដនីមួយៗប្រើបានតែម្តង។' : 'បើកកម្មវិធីផ្ទៀងផ្ទាត់ (Google Authenticator, Microsoft Authenticator…) ហើយវាយលេខ ៦ ខ្ទង់។'}</p>
      <input value={code} onChange={(e) => onChange(e.target.value)} inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" placeholder={recovery ? 'xxxx-xxxx' : '••••••'} className={recovery ? '' : 'otp-input'} autoFocus required aria-label="លេខកូដ" />
      {error && <p className="form-error">{error}</p>}
      <button id="tf-submit" className="btn primary block" disabled={busy || code.length < 6}>{busy ? '…' : 'ផ្ទៀងផ្ទាត់'}</button>
      <button type="button" className="link-btn center" onClick={() => { setRecovery((v) => !v); setCode(''); setError(''); }}>{recovery ? 'ប្រើលេខពីកម្មវិធីវិញ' : 'បាត់ទូរស័ព្ទ? ប្រើលេខកូដបម្រុង'}</button>
      {onCancel && <button type="button" className="link-btn center" onClick={onCancel}>← ត្រឡប់ក្រោយ</button>}
    </form>
  );
}
