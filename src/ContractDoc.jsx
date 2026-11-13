import React from 'react';

/** Printable lease page (also used for PNG export). */
export function ContractDoc({ text, property, innerRef }) {
  const [title, ...rest] = String(text || '').split('\n');
  return (
    <article className="contract-doc" ref={innerRef}>
      <p className="kingdom moul">ព្រះរាជាណាចក្រកម្ពុជា<br /><span>ជាតិ សាសនា ព្រះមហាក្សត្រ</span></p>
      <div className="tacteing">❀❀❀</div>
      <h1 className="moul">{title}</h1>
      <div className="contract-body">{rest.join('\n').trim()}</div>
      <footer>{property}</footer>
    </article>
  );
}

