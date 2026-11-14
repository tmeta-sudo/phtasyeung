import React, { useMemo, useRef, useState } from 'react';
import { FileText, Printer, Image as ImageIcon, RefreshCw, ReceiptText, Ban, Check } from 'lucide-react';
import { useApp, useFmt, Modal, Field, usePumi, addressText } from '../ui.jsx';
import { contractValues, fillTemplate } from '../contract.js';
import { useAddressText } from '../settings/LocationCard.jsx';
import { nodeToPng, shareBlob } from '../exportImage.js';
import { ContractDoc } from '../ContractDoc.jsx';
import SignaturePad from '../SignaturePad.jsx';

export { ContractDoc };

export default function ContractModal({ tenant, onClose }) {
  const { state, call, print, notify, openInvoice } = useApp();
  const { $, n } = useFmt();
  const pumi = usePumi();
  const s = state.settings;
  const room = state.rooms.find((r) => r.id === tenant.roomId);
  const propertyAddress = useAddressText(s.location);
  const [required, setRequired] = useState(tenant.lease?.required !== false);
  const [dep, setDep] = useState(tenant.lease?.depositMonths ?? s.contract?.depositMonths ?? 1);
  const [pre, setPre] = useState(tenant.lease?.prepaidMonths ?? s.contract?.prepaidMonths ?? 1);
  const fresh = useMemo(() => fillTemplate(s.contract?.template, contractValues({
    tenant, room, settings: s, lease: { depositMonths: dep, prepaidMonths: pre }, addressOf: (a) => addressText(a, pumi), propertyAddress,
  })), [tenant, room, s, dep, pre, pumi, propertyAddress]);
  const [text, setText] = useState(tenant.lease?.text || '');
  const [edited, setEdited] = useState(!!tenant.lease?.text);
  const shown = edited ? text : fresh;
  const docRef = useRef();
  const rent = Number(room?.rent) || 0;
  const L = tenant.lease || {};
  const sigs = {
    owner: s.contract?.ownerSignature ? `/api/settings/signature?v=${s.contract.ownerSignature.id}` : '',
    tenant: L.signature ? `/api/tenants/${tenant.id}/signature?v=${encodeURIComponent(L.signature.at)}` : '',
    tenantName: L.signature?.name, tenantAt: L.signature?.at,
  };
  const [ownerSig, setOwnerSig] = useState('');
  const [drawOwner, setDrawOwner] = useState(false);

  async function save(extra = {}) {
    return call('PUT', `/api/tenants/${tenant.id}/contract`, { required, depositMonths: dep, prepaidMonths: pre, text: required ? shown : '', ...extra }, required ? 'បានរក្សាទុកកិច្ចសន្យា' : 'បានកំណត់ថាមិនត្រូវការកិច្ចសន្យា');
  }
  async function moveIn() {
    await save();
    const r = await call('POST', `/api/tenants/${tenant.id}/movein-invoice`, {}, 'បានបង្កើតវិក្កយបត្រចូលស្នាក់នៅ');
    if (r?.result?.invoiceId) { onClose(); openInvoice(r.result.invoiceId); }
  }
  async function png() {
    const blob = await nodeToPng(docRef.current, { pixelRatio: 2 });
    const how = await shareBlob(blob, `contract-${tenant.roomId || tenant.id}.png`, 'កិច្ចសន្យាជួល');
    if (how === 'downloaded') notify('បានទាញយក PNG');
  }

  return (
    <Modal title="កិច្ចសន្យាជួល" sub={`${tenant.nameKm || tenant.nameEn} · ${tenant.roomId || '—'}`} onClose={onClose} wide>
      <div className="seg two contract-choice">
        <button type="button" className={required ? 'on' : ''} onClick={() => setRequired(true)}><FileText size={15} /> ធ្វើកិច្ចសន្យា</button>
        <button type="button" className={!required ? 'on' : ''} onClick={() => setRequired(false)}><Ban size={15} /> មិនត្រូវការ</button>
      </div>
      {required ? (
        <div className="contract-grid">
          <div className="stack-form">
            <div className="form-grid">
              <Field label="ប្រាក់កក់ (ខែ)" hint={$(rent * dep)}><input type="number" min="0" max="12" value={dep} onChange={(e) => setDep(Math.max(0, +e.target.value || 0))} /></Field>
              <Field label="បង់មុន (ខែ)" hint={$(rent * pre)}><input type="number" min="0" max="12" value={pre} onChange={(e) => setPre(Math.max(0, +e.target.value || 0))} /></Field>
            </div>
            <div className="movein-box"><span>សរុបពេលចូលស្នាក់នៅ</span><b>{$(rent * (dep + pre))}</b><small>({n(dep)} ខែកក់ + {n(pre)} ខែបង់មុន · {$(rent)}/ខែ)</small></div>
            <Field label="អត្ថបទកិច្ចសន្យា (កែប្រែបាន)">
              <textarea rows={14} className="contract-text" value={shown} onChange={(e) => { setText(e.target.value); setEdited(true); }} />
            </Field>
            {edited && <button type="button" className="link-btn" onClick={() => { setEdited(false); setText(''); }}><RefreshCw size={13} /> បង្កើតឡើងវិញពីគំរូ (ប្រើព័ត៌មានថ្មី)</button>}
            {(!tenant.idNumber || !room) && <p className="form-warn">⚠️ ខ្វះព័ត៌មាន៖ {[!tenant.idNumber && 'លេខអត្តសញ្ញាណប័ណ្ណ', !room && 'បន្ទប់'].filter(Boolean).join(' · ')} — បំពេញក្នុងប្រវត្តិរូបអតិថិជន</p>}
          </div>
          <div className={'sig-status ' + (L.signature && !L.signature.outdated ? 'ok' : '')}>
            ✍️ {L.signature ? (L.signature.outdated ? 'កិច្ចសន្យាបានកែប្រែក្រោយពេលចុះហត្ថលេខា — អតិថិជនត្រូវចុះម្តងទៀត' : `អតិថិជនបានចុះហត្ថលេខា ${new Date(L.signature.at).toLocaleDateString('en-GB')}`) : 'អតិថិជនអាចចុះហត្ថលេខាលើទូរស័ព្ទ នៅគេហទំព័ររបស់គាត់ (📄 កិច្ចសន្យា)'}
            {!s.contract?.ownerSignature && !drawOwner && <button type="button" className="btn ghost sm" onClick={() => setDrawOwner(true)}>ហត្ថលេខាម្ចាស់ផ្ទះ</button>}
          </div>
          {drawOwner && (
            <div className="stack-form">
              <small className="muted">ចុះហត្ថលេខាម្តងគត់ — ប្រើលើកិច្ចសន្យាទាំងអស់។</small>
              <SignaturePad onChange={setOwnerSig} height={150} />
              <div className="row-btns"><button type="button" className="btn ghost sm" onClick={() => setDrawOwner(false)}>បោះបង់</button>
                <button type="button" className="btn primary sm" disabled={!ownerSig} onClick={async () => { if (await call('POST', '/api/settings/signature', { signature: ownerSig }, 'បានរក្សាទុកហត្ថលេខា')) setDrawOwner(false); }}>រក្សាទុក</button></div>
            </div>
          )}
          <div className="contract-preview"><ContractDoc text={shown} property={s.propertyName} innerRef={docRef} signatures={sigs} /></div>
        </div>
      ) : (
        <p className="muted pad">មិនអីទេ — អតិថិជននេះនឹងមិនមានកិច្ចសន្យាជាលាយលក្ខណ៍អក្សរទេ។ អ្នកនៅតែអាចបង្កើតវិក្កយបត្រប្រាក់កក់ និងបង់មុនបាន។</p>
      )}
      <div className="modal-actions">
        {required && <button className="btn ghost" onClick={() => print(<ContractDoc text={shown} property={s.propertyName} signatures={sigs} />)}><Printer size={15} /> បោះពុម្ព</button>}
        {required && <button className="btn ghost" onClick={png}><ImageIcon size={15} /> PNG</button>}
        {room && (dep + pre > 0) && <button className="btn ghost" onClick={moveIn}><ReceiptText size={15} /> វិក្កយបត្រចូលស្នាក់នៅ</button>}
        <button className="btn primary" onClick={async () => { if (await save()) onClose(); }}><Check size={15} /> រក្សាទុក</button>
      </div>
    </Modal>
  );
}
