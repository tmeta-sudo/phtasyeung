import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { fmtMoney } from '../../shared/khmer.js';
import { LANGS, makeT, savedLang, saveLang } from './i18n.js';
import './portal.css';

/** Public page for a rental record: /r/:token. */
export default function RecordPage({ token }) {
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState(() => {
    const s = savedLang();
    if (s !== 'km') return s;
    const nav = (navigator.language || '').slice(0, 2);
    return nav === 'zh' ? 'zh' : nav === 'km' ? 'km' : 'en'; // the reader is often a landlord elsewhere
  });
  const t = useMemo(() => makeT(lang), [lang]);
  useEffect(() => { api('GET', `/api/r/${token}`).then(setRec).catch(() => setError('gone')); }, [token]);

  if (error) return <div className="pt-shell"><div className="pt-error"><ShieldCheck size={36} /><b>{t('r_gone')}</b></div></div>;
  if (!rec) return <div className="boot"><span className="spinner" /></div>;
  const $ = (v) => fmtMoney(v, rec.currency, false);
  const paid = rec.onTime + rec.late;
  const pct = paid ? Math.round((rec.onTime / paid) * 100) : null;
  const property = lang === 'km' ? rec.property : rec.propertyEn || rec.property;
  const name = lang === 'km' ? rec.tenantKm || rec.tenant : rec.tenant || rec.tenantKm;
  return (
    <div className="pt-shell" lang={lang}>
      <div className="pt-screen rec">
        <div className="pt-langs">{LANGS.map(([k, l]) => <button key={k} className={k === lang ? 'on' : ''} onClick={() => { setLang(k); saveLang(k); }}>{l}</button>)}</div>
        <div className="pt-card rec-head">
          <BadgeCheck size={30} />
          <h1>{t('r_title')}</h1>
          <small>{t('r_issuedBy', { p: property, d: t.date(rec.issuedAt.slice(0, 10)) })}</small>
          {pct != null && <b className={'rec-score ' + (pct >= 90 ? 'good' : pct >= 70 ? 'ok' : 'low')}>{t('r_score', { p: pct })}</b>}
        </div>
        <div className="pt-card">
          <dl className="rec-dl">
            <dt>{t('r_tenant')}</dt><dd>{name}</dd>
            <dt>{t('r_where')}</dt><dd>{property}{rec.area ? ` · ${rec.area}` : ''}</dd>
            <dt>{t('r_period')}</dt><dd>{rec.from ? t.date(rec.from) : '—'} → {rec.to ? t.date(rec.to) : t('r_now')}</dd>
            <dt>{t('r_bills')}</dt><dd>{rec.bills}</dd>
            <dt>{t('r_onTime')}</dt><dd>{rec.onTime}</dd>
            <dt>{t('r_late')}</dt><dd>{rec.late}</dd>
            {rec.unpaid > 0 && <><dt>{t('r_unpaid')}</dt><dd>{rec.unpaid}</dd></>}
            <dt> </dt><dd><b className={rec.owed > 0 ? 'warn-text' : ''}>{rec.owed > 0 ? t('r_owes', { a: $(rec.owed) }) : `✓ ${t('r_nothingOwed')}`}</b></dd>
            {rec.deposit && <><dt>{t('r_deposit')}</dt><dd>{rec.deposit.full ? t('r_depositFull', { a: $(rec.deposit.returned) }) : t('r_depositPart', { a: $(rec.deposit.returned), b: $(rec.deposit.held - rec.deposit.returned) })}</dd></>}
          </dl>
          {rec.note && <blockquote className="rec-note"><small>{t('r_note')}</small>{rec.note}</blockquote>}
        </div>
        <p className="pt-muted"><ShieldCheck size={13} /> {t('r_how')}</p>
      </div>
    </div>
  );
}
