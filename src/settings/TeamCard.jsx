import React, { useEffect, useState } from 'react';
import { UsersRound, UserPlus, Copy, Trash2, Send, Link2 } from 'lucide-react';
import { useApp } from '../ui.jsx';
import { api } from '../api.js';

export const ROLE_KM = { owner: 'ម្ចាស់ផ្ទះ', manager: 'អ្នកគ្រប់គ្រង', staff: 'បុគ្គលិក' };
const ROLE_HELP = {
  manager: 'គ្រប់គ្រងអតិថិជន បន្ទប់ វិក្កយបត្រ កុងទ័រ និងសារ — មិនអាចកែ KHQR, Telegram bot, ការបម្រុងទុក ឬក្រុមការងារ',
  staff: 'កត់កុងទ័រ ឆ្លើយសារជួសជុល និងការងារ — មិនឃើញលុយ ឬរូបអត្តសញ្ញាណប័ណ្ណ',
};

/** Owner-only: invite managers/staff with a one-time link, change roles, remove people. */
export default function TeamCard() {
  const { notify, state } = useApp();
  const [team, setTeam] = useState(null);
  const [role, setRole] = useState('staff');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const base = (state.settings.publicUrl || location.origin).replace(/\/+$/, '');

  const run = async (fn) => { try { setTeam(await fn()); } catch (e) { notify(e.message, true); } };
  useEffect(() => { run(() => api('GET', '/api/team')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(e) {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/team/invites', { role, name });
      setTeam(r); setName('');
      const url = `${base}/join/${r.token}`;
      setLink(url);
      try { await navigator.clipboard.writeText(url); notify('បានចម្លងតំណអញ្ជើញ — ផ្ញើទៅគាត់តាម Telegram'); } catch { /* shown below */ }
    } catch (err) { notify(err.message, true); }
  }

  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`អញ្ជើញចូលរួមគ្រប់គ្រង ${state.settings.propertyName} លើ ផ្ទះយើង`)}`;

  return (
    <div className="card team-card">
      <h3 className="sec-title"><UsersRound size={17} /> ក្រុមការងារ</h3>
      <p className="muted small">អញ្ជើញអ្នកគ្រប់គ្រង ឬបុគ្គលិក។ ម្នាក់ៗមានគណនីផ្ទាល់ខ្លួន ហើយឃើញតែអ្វីដែលពួកគេត្រូវការ។</p>
      {team && (
        <ul className="team-list">
          {team.members.map((m) => (
            <li key={m.id}>
              <span className="team-avatar">{(m.email || m.telegram || '?')[0].toUpperCase()}</span>
              <span className="team-who"><b>{m.email || m.telegram || '—'}{m.you ? ' (អ្នក)' : ''}</b><small>{ROLE_KM[m.role]}</small></span>
              {!m.you && (
                <>
                  <select value={m.role} onChange={(e) => window.confirm(`ប្តូរតួនាទីទៅ «${ROLE_KM[e.target.value]}»?`) && run(() => api('PUT', `/api/team/${m.id}`, { role: e.target.value }))} aria-label="តួនាទី">
                    {Object.entries(ROLE_KM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button className="icon-btn" title="ដកចេញ" onClick={() => window.confirm('ដកសមាជិកនេះចេញពីក្រុម?') && run(() => api('DELETE', `/api/team/${m.id}`))}><Trash2 size={15} /></button>
                </>
              )}
            </li>
          ))}
          {team.invites.map((i) => (
            <li key={i.id} className="pending">
              <span className="team-avatar"><Link2 size={14} /></span>
              <span className="team-who"><b>{i.name || 'ការអញ្ជើញ'}</b><small>{ROLE_KM[i.role]} · រង់ចាំ · ផុតកំណត់ {new Date(i.expires).toLocaleDateString('km-KH')}</small></span>
              <button className="icon-btn" title="លុបការអញ្ជើញ" onClick={() => run(() => api('DELETE', `/api/team/invites/${i.id}`))}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="team-invite" onSubmit={invite}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ឈ្មោះ (ឧ. បងសុខា)" maxLength={60} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="staff">{ROLE_KM.staff}</option>
          <option value="manager">{ROLE_KM.manager}</option>
        </select>
        <button className="btn primary"><UserPlus size={15} /> អញ្ជើញ</button>
      </form>
      <p className="muted small">{ROLE_HELP[role]}</p>
      {link && (
        <div className="invite-link">
          <code>{link}</code>
          <div className="row-btns">
            <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(link).then(() => notify('បានចម្លង'))}><Copy size={14} /> ចម្លង</button>
            <a className="btn tg sm" href={share} target="_blank" rel="noreferrer"><Send size={14} /> ផ្ញើតាម Telegram</a>
          </div>
          <small className="muted">ប្រើបានតែម្តង · ៧ ថ្ងៃ</small>
        </div>
      )}
    </div>
  );
}
