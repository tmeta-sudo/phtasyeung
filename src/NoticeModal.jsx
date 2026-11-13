import React, { useMemo, useState } from 'react';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { useApp, useFmt, Modal } from './ui.jsx';
import { dateKm, nowInCambodia } from '../shared/khmer.js';

/** Send an announcement (water cut, cleaning day, new rule…) to all tenants, one building, or chosen rooms. */
export default function NoticeModal({ onClose }) {
  const { state, call } = useApp();
  const { n } = useFmt();
  const [text, setText] = useState('');
  const [type, setType] = useState('all');
  const [building, setBuilding] = useState('');
  const [rooms, setRooms] = useState([]);
  const occupied = useMemo(() => [...new Set(state.tenants.filter((t) => t.status === 'active' && t.roomId).map((t) => t.roomId))].sort(), [state.tenants]);
  const buildings = useMemo(() => [...new Set(state.rooms.map((r) => r.building).filter(Boolean))], [state.rooms]);
  const linked = (ids) => state.tenants.filter((t) => t.status === 'active' && ids.includes(t.roomId) && t.telegram?.chatId).length;
  const targetRooms = type === 'all' ? occupied : type === 'building' ? occupied.filter((r) => state.rooms.find((x) => x.id === r)?.building === building) : rooms;
  const templates = ['💧 កាត់ទឹកថ្ងៃស្អែក ពីម៉ោង ៨ ដល់ ១២ ថ្ងៃត្រង់។ សូមបម្រុងទឹកទុក។', '⚡ កាត់ភ្លើងដើម្បីជួសជុល ថ្ងៃ…', '🧹 ថ្ងៃអាទិត្យនេះ សម្អាតអគារ។ សូមកុំទុកអីវ៉ាន់នៅច្រករបៀង។', '🔔 សូមរំលឹកបង់ថ្លៃជួលមុនថ្ងៃទី ៥។ អរគុណ!'];

  async function send() {
    const target = type === 'all' ? { type } : type === 'building' ? { type, value: building } : { type, value: rooms };
    const r = await call('POST', '/api/notices', { text, target }, (res) => `📢 បានផ្ញើ ${n(res.result.sent)} នាក់${res.result.unlinked ? ` · ${n(res.result.unlinked)} នាក់មិនទាន់ភ្ជាប់ Telegram (ឃើញក្នុងគេហទំព័រ)` : ''}`);
    if (r) { setText(''); }
  }

  return (
    <Modal title="សេចក្តីជូនដំណឹងទៅអតិថិជន" sub="ផ្ញើតាម Telegram និងបង្ហាញក្នុងគេហទំព័រអតិថិជន" onClose={onClose}
      footer={<button className="btn primary block" disabled={!text.trim() || !targetRooms.length} onClick={send}><Send size={16} /> ផ្ញើទៅ {n(targetRooms.length)} បន្ទប់</button>}>
      <div className="notice-form">
        <div className="seg">
          <button type="button" className={type === 'all' ? 'on' : ''} onClick={() => setType('all')}>ទាំងអស់</button>
          {buildings.length > 0 && <button type="button" className={type === 'building' ? 'on' : ''} onClick={() => { setType('building'); setBuilding(building || buildings[0]); }}>តាមអគារ</button>}
          <button type="button" className={type === 'rooms' ? 'on' : ''} onClick={() => setType('rooms')}>ជ្រើសបន្ទប់</button>
        </div>
        {type === 'building' && <select value={building} onChange={(e) => setBuilding(e.target.value)}>{buildings.map((b) => <option key={b}>{b}</option>)}</select>}
        {type === 'rooms' && (
          <div className="room-chips">{occupied.map((r) => <button type="button" key={r} className={'chip-toggle ' + (rooms.includes(r) ? 'on' : '')} onClick={() => setRooms((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}>{r}</button>)}</div>
        )}
        <textarea rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="សរសេរសេចក្តីជូនដំណឹង…" />
        <div className="notice-templates">{templates.map((t) => <button type="button" key={t} onClick={() => setText(t)}>{t.slice(0, 28)}…</button>)}</div>
        <small className="muted">{n(linked(targetRooms))}/{n(targetRooms.length)} បន្ទប់បានភ្ជាប់ Telegram</small>
        {(state.notices || []).length > 0 && (
          <div className="notice-history">
            <b>បានផ្ញើថ្មីៗ</b>
            {state.notices.slice(0, 5).map((x) => (
              <div key={x.id} className="notice-item">
                <Megaphone size={15} />
                <span><span className="notice-text">{x.text}</span><small className="muted">{dateKm(nowInCambodia(new Date(x.at)).ymd).replace('ថ្ងៃទី', '')} · {n(x.sent)}/{n(x.rooms?.length || 0)} តាម Telegram</small></span>
                <button className="icon-btn" aria-label="លុប" onClick={() => call('DELETE', `/api/notices/${x.id}`)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
