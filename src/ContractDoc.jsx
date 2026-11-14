import React from 'react';

/** Printable lease page (also used for PNG export). */
export function ContractDoc({ text, property, innerRef, signatures }) {
  const [title, ...rest] = String(text || '').split('\n');
  const sig = signatures || {};
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh' }) : '');
  return (
    <article className="contract-doc" ref={innerRef}>
      <p className="kingdom moul">ព្រះរាជាណាចក្រកម្ពុជា<br /><span>ជាតិ សាសនា ព្រះមហាក្សត្រ</span></p>
      <div className="tacteing">❀❀❀</div>
      <h1 className="moul">{title}</h1>
      <div className="contract-body">{rest.join('\n').trim()}</div>
      {signatures && (
        <div className="contract-signs">
          <div><span>ម្ចាស់ផ្ទះ</span>{sig.owner ? <img src={sig.owner} alt="ហត្ថលេខាម្ចាស់ផ្ទះ" /> : <i />}</div>
          <div><span>អ្នកជួល</span>{sig.tenant ? <img src={sig.tenant} alt="ហត្ថលេខាអ្នកជួល" /> : <i />}{sig.tenantName && <small>{sig.tenantName}{sig.tenantAt ? ` · ${when(sig.tenantAt)}` : ''}</small>}</div>
        </div>
      )}
      <footer>{property}</footer>
    </article>
  );
}

