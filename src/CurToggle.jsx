import React from 'react';

/** Small ៛ / $ switch for a price. value '' = follows the billing currency. */
export default function CurToggle({ value, billing, onChange, label = 'រូបិយប័ណ្ណ' }) {
  const v = value === 'USD' || value === 'KHR' ? value : (billing === 'KHR' ? 'KHR' : 'USD');
  return (
    <span className="cur-toggle" role="group" aria-label={label}>
      {[['KHR', <span className="riel">៛</span>], ['USD', '$']].map(([code, sign]) => (
        <button type="button" key={code} className={v === code ? 'on' : ''} aria-pressed={v === code}
          onClick={() => onChange(code === billing ? '' : code)}>{sign}</button>
      ))}
    </span>
  );
}
