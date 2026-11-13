import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, QrCode, IdCard, ScanLine, CalendarDays, Smartphone, Moon, ShieldCheck, ArrowRight, Check, Sparkles, Zap, ReceiptText,
  Droplets, Bolt, ChevronDown, Wallet, Bell, Lock, Languages, Building2, Users, Code,
} from 'lucide-react';
import { QR, navigate } from '../ui.jsx';
import { ThemeToggle } from '../theme.jsx';
import { usd, khr, toRiel, usdInWords, num, lunarKm, monthKm, nowInCambodia } from '../../shared/khmer.js';
import './landing.css';

/** Fades/slides children in as they scroll into view. */
function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useRef();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ '--d': `${delay}ms` }} {...rest}>{children}</Tag>;
}

const go = (path) => () => navigate(path);

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    document.title = 'ផ្ទះយើង — វិក្កយបត្រផ្ទះជួលស្វ័យប្រវត្តិតាម Telegram និង KHQR';
    return () => window.removeEventListener('scroll', on);
  }, []);
  const jump = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /><span className="grid" /></div>

      <header className={'lp-nav ' + (scrolled ? 'solid' : '')}>
        <a className="lp-brand" href="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <img src="/icons/icon-192.png" alt="" width="34" height="34" /> <b>ផ្ទះយើង</b>
        </a>
        <nav className="lp-links" aria-label="ម៉ឺនុយ">
          <a href="#features" onClick={jump('features')}>មុខងារ</a>
          <a href="#how" onClick={jump('how')}>របៀបប្រើ</a>
          <a href="#try" onClick={jump('try')}>សាកល្បង</a>
          <a href="#faq" onClick={jump('faq')}>សំណួរ</a>
        </nav>
        <div className="lp-nav-right">
          <ThemeToggle />
          <button className="lp-btn ghost hide-sm" onClick={go('/login')}>ចូល</button>
          <button className="lp-btn primary" onClick={go('/signup')}>ចាប់ផ្តើម <ArrowRight size={16} /></button>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <Reveal className="lp-eyebrow"><Sparkles size={14} /> ឥតគិតថ្លៃ · សម្រាប់ម្ចាស់ផ្ទះជួលខ្មែរ</Reveal>
          <Reveal as="h1" delay={80}>
            ផ្ទះជួលរបស់អ្នក<br />
            <span className="grad">ប្រមូលលុយដោយខ្លួនឯង។</span>
          </Reveal>
          <Reveal as="p" className="lp-lead" delay={160}>
            វិក្កយបត្រប្រចាំខែបង្កើត និងផ្ញើទៅ Telegram អតិថិជនដោយស្វ័យប្រវត្តិ ជាមួយ KHQR ដែលបង់បានតាមធនាគារគ្រប់ប្រភេទ។
            អ្នកគ្រាន់តែចុច «បញ្ជាក់» ពេលលុយចូល។
          </Reveal>
          <Reveal className="lp-cta" delay={240}>
            <button className="lp-btn primary lg" onClick={go('/signup')}>បង្កើតគណនីឥតគិតថ្លៃ <ArrowRight size={18} /></button>
            <button className="lp-btn tg lg" onClick={go('/login?telegram=1')}><Send size={18} /> ចូលតាម Telegram</button>
          </Reveal>
          <Reveal className="lp-hero-points" delay={320}>
            <span><Check size={15} /> មិនត្រូវការកាតឥណទាន</span>
            <span><Check size={15} /> ប្រើលើទូរស័ព្ទបាន</span>
            <span><Check size={15} /> ភាសាខ្មែរពេញលេញ</span>
          </Reveal>
        </div>
        <HeroVisual />
      </section>

      {/* ---------- built with ---------- */}
      <Reveal as="section" className="lp-strip">
        <p>បង្កើតឡើងលើបច្ចេកវិទ្យាដែលអ្នកស្គាល់ និងទុកចិត្ត</p>
        <div className="lp-logos">
          <span><QrCode size={18} /> KHQR · Bakong</span>
          <span><Send size={18} /> Telegram</span>
          <span><Languages size={18} /> Khmer NLP · Seanghay Yath</span>
          <span><CalendarDays size={18} /> ចន្ទគតិ · Chhankitek</span>
          <span><ShieldCheck size={18} /> Postgres · Neon</span>
        </div>
      </Reveal>

      {/* ---------- features (bento) ---------- */}
      <section className="lp-section" id="features">
        <Reveal className="lp-head">
          <span className="lp-kicker">មុខងារ</span>
          <h2>អ្វីៗទាំងអស់ដែលផ្ទះជួលត្រូវការ<br /><span className="muted-h">ក្នុងកម្មវិធីតែមួយ។</span></h2>
        </Reveal>
        <div className="bento">
          <Reveal className="tile t-telegram span-2" delay={0}>
            <div className="tile-copy">
              <span className="tile-icon tg"><Send size={20} /></span>
              <h3>វិក្កយបត្រស្វ័យប្រវត្តិតាម Telegram</h3>
              <p>រៀងរាល់ខែ ប្រព័ន្ធគណនាថ្លៃជួល ទឹក ភ្លើង ហើយផ្ញើវិក្កយបត្រ + KHQR ទៅអតិថិជនម្នាក់ៗ។ រំលឹកដោយស្វ័យប្រវត្តិរហូតដល់បង់។</p>
            </div>
            <div className="mini-chat" aria-hidden="true">
              <div className="mc-in">🧾 វិក្កយបត្រខែវិច្ឆិកា · A-101 <b>$186.00</b></div>
              <div className="mc-out">📷 រូបបង្កាន់ដៃ ABA</div>
              <div className="mc-in ok">✅ បានទទួលការបង់ប្រាក់ — សូមអរគុណ!</div>
            </div>
          </Reveal>
          <Reveal className="tile t-khqr" delay={80}>
            <span className="tile-icon red"><Wallet size={20} /></span>
            <h3>KHQR គ្រប់ធនាគារ</h3>
            <p>QR មានចំនួនទឹកប្រាក់ និងលេខវិក្កយបត្រស្រាប់ — ABA, ACLEDA, Wing, Bakong…</p>
            <div className="khqr-chip"><span>KHQR</span><QR value="https://phteahyeung.app/demo" size={78} /></div>
          </Reveal>
          <Reveal className="tile t-id" delay={120}>
            <span className="tile-icon pink"><IdCard size={20} /></span>
            <h3>ប្រវត្តិរូបអតិថិជនពេញលេញ</h3>
            <p>ព័ត៌មានផ្ទាល់ខ្លួន អត្តសញ្ញាណប័ណ្ណមុខ/ក្រោយ អាសយដ្ឋានដល់ភូមិ ទំនាក់ទំនងបន្ទាន់ — រក្សាទុកដោយឯកជន។</p>
          </Reveal>
          <Reveal className="tile t-qr" delay={160}>
            <span className="tile-icon blue"><ScanLine size={20} /></span>
            <h3>គ្រប់គ្រងដោយ QR</h3>
            <p>ស្កេន QR ទ្វារបន្ទប់ → កត់កុងទ័រ។ ស្កេន KHQR → សម្គាល់ថាបានបង់។</p>
          </Reveal>
          <Reveal className="tile t-khmer" delay={200}>
            <span className="tile-icon gold"><CalendarDays size={20} /></span>
            <h3>ខ្មែរពិតៗ</h3>
            <p>លេខខ្មែរ ចំនួនទឹកប្រាក់ជាអក្សរ ថ្ងៃចន្ទគតិ និងថ្ងៃបុណ្យជាតិ។</p>
            <div className="khmer-demo">{usdInWords(186)}</div>
          </Reveal>
          <Reveal className="tile t-portal span-2" delay={240}>
            <div className="tile-copy">
              <span className="tile-icon dark"><Smartphone size={20} /></span>
              <h3>កម្មវិធីសម្រាប់អតិថិជនរបស់អ្នក</h3>
              <p>អតិថិជនម្នាក់ៗមានតំណ/QR ផ្ទាល់ខ្លួន៖ មើលវិក្កយបត្រ បង់ KHQR ផ្ញើរូបអត្តសញ្ញាណប័ណ្ណ និងកែប្រែព័ត៌មាន — ដំឡើងលើអេក្រង់ទូរស័ព្ទបាន ដូចកម្មវិធីពិត។</p>
            </div>
            <div className="mini-phone" aria-hidden="true">
              <div className="mp-hero"><small>📍 ភ្នំពេញ</small><b>បន្ទប់ A-101</b><span>$150<small>/ខែ</small></span></div>
              <div className="mp-pay">ខ្ញុំបានបង់ប្រាក់</div>
            </div>
          </Reveal>
          <Reveal className="tile t-small" delay={0}><Zap size={18} /><b>រហ័ស និងប្រើក្រៅបណ្តាញ</b><span>PWA ដំឡើងបាន</span></Reveal>
          <Reveal className="tile t-small" delay={60}><Moon size={18} /><b>Dark mode</b><span>ស្រួលភ្នែកពេលយប់</span></Reveal>
          <Reveal className="tile t-small" delay={120}><Lock size={18} /><b>សុវត្ថិភាព</b><span>ចូលតាម Telegram · ទិន្នន័យឯកជន</span></Reveal>
          <Reveal className="tile t-small" delay={180}><Bell size={18} /><b>ជូនដំណឹងភ្លាមៗ</b><span>ពេលអតិថិជនបង់ប្រាក់</span></Reveal>
        </div>
      </section>

      {/* ---------- how ---------- */}
      <section className="lp-section" id="how">
        <Reveal className="lp-head">
          <span className="lp-kicker">របៀបប្រើ</span>
          <h2>ចាប់ផ្តើមក្នុង ៥ នាទី។</h2>
        </Reveal>
        <ol className="steps3">
          {[
            [Building2, 'បន្ថែមបន្ទប់ និងអតិថិជន', 'បញ្ចូលថ្លៃជួល និងព័ត៌មានអតិថិជន ឬនាំចូលពីទិន្នន័យចាស់។'],
            [Send, 'អតិថិជនស្កេន QR Telegram', 'ពួកគេភ្ជាប់ Telegram ក្នុងមួយវិនាទី — មិនចាំបាច់ដំឡើងអ្វីទេ។'],
            [ReceiptText, 'វិក្កយបត្រផ្ញើខ្លួនឯង', 'រៀងរាល់ខែ វិក្កយបត្រ + KHQR ផ្ញើទៅ។ អ្នកគ្រាន់តែបញ្ជាក់ពេលលុយចូល។'],
          ].map(([Icon, t, d], i) => (
            <Reveal as="li" key={t} delay={i * 120}>
              <span className="step-num">{num(i + 1)}</span>
              <span className="step-icon"><Icon size={22} /></span>
              <h3>{t}</h3>
              <p>{d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- try it ---------- */}
      <section className="lp-section" id="try">
        <Reveal className="lp-head">
          <span className="lp-kicker">សាកល្បងផ្ទាល់</span>
          <h2>គណនាវិក្កយបត្រជាភាសាខ្មែរ<br /><span className="muted-h">ដូចដែលអតិថិជនរបស់អ្នកនឹងទទួល។</span></h2>
        </Reveal>
        <Reveal><Playground /></Reveal>
      </section>

      {/* ---------- pricing ---------- */}
      <section className="lp-section" id="pricing">
        <Reveal className="price-card">
          <div className="price-left">
            <span className="lp-kicker">តម្លៃ</span>
            <h2>ឥតគិតថ្លៃ។ <span className="muted-h">សម្រាប់ម្ចាស់ផ្ទះជួលខ្មែរ។</span></h2>
            <p>គ្មានកាតឥណទាន គ្មានការកំណត់ពេល។ ទិន្នន័យជារបស់អ្នក — នាំចេញ ឬលុបបានគ្រប់ពេល។</p>
            <button className="lp-btn primary lg" onClick={go('/signup')}>ចាប់ផ្តើមឥឡូវ <ArrowRight size={18} /></button>
          </div>
          <ul className="price-list">
            {['បន្ទប់ និងអតិថិជនមិនកំណត់', 'វិក្កយបត្រស្វ័យប្រវត្តិ + រំលឹក', 'KHQR លើវិក្កយបត្រនីមួយៗ', 'Telegram bot ឥតគិតថ្លៃ ឬ bot ផ្ទាល់ខ្លួន', 'កម្មវិធីអតិថិជន (PWA)', 'នាំចេញ Excel និងបោះពុម្ព', 'QR ទ្វារ និងស្កេនកុងទ័រ', 'ភាសាខ្មែរ និង Dark mode'].map((t) => <li key={t}><Check size={16} /> {t}</li>)}
          </ul>
        </Reveal>
      </section>

      {/* ---------- faq ---------- */}
      <section className="lp-section narrow" id="faq">
        <Reveal className="lp-head"><span className="lp-kicker">សំណួរញឹកញាប់</span><h2>មានចម្ងល់?</h2></Reveal>
        <div className="faq">
          {[
            ['ពិតជាឥតគិតថ្លៃមែនទេ?', 'បាទ/ចាស។ ផ្ទះយើងឥតគិតថ្លៃសម្រាប់ម្ចាស់ផ្ទះជួល។ អ្នកមិនចាំបាច់ផ្តល់កាតឥណទានទេ។'],
            ['អតិថិជនត្រូវដំឡើងកម្មវិធីអ្វីទេ?', 'មិនត្រូវទេ។ ពួកគេទទួលវិក្កយបត្រក្នុង Telegram ដែលពួកគេមានស្រាប់ ហើយអាចបើកគណនីអតិថិជនក្នុង browser (ឬដំឡើងលើអេក្រង់ទូរស័ព្ទបើចង់)។'],
            ['KHQR ដំណើរការជាមួយធនាគារណាខ្លះ?', 'KHQR ជាស្តង់ដារជាតិរបស់ធនាគារជាតិនៃកម្ពុជា (Bakong) — ស្កេនបានដោយ ABA, ACLEDA, Wing, Canadia, Prince និងកម្មវិធីធនាគារជាច្រើនទៀត។ លុយចូលគណនី Bakong របស់អ្នកផ្ទាល់។'],
            ['ទិន្នន័យ និងរូបអត្តសញ្ញាណប័ណ្ណមានសុវត្ថិភាពទេ?', 'ឯកសាររក្សាទុកដោយឯកជន មិនមានតំណសាធារណៈ — មានតែអ្នក និងអតិថិជនផ្ទាល់ប៉ុណ្ណោះដែលមើលឃើញ។ ពាក្យសម្ងាត់ត្រូវបានអ៊ិនគ្រីប ហើយអ្នកអាចនាំចេញ ឬលុបទិន្នន័យទាំងអស់បានគ្រប់ពេល។'],
            ['ភ្លេចពាក្យសម្ងាត់ ធ្វើយ៉ាងម៉េច?', 'ផ្ញើ /recover ទៅ bot Telegram របស់យើង — អ្នកនឹងទទួលតំណចូលគណនីភ្លាមៗ។ ឬចូលដោយចុច «ចូលតាម Telegram» ដោយមិនចាំបាច់មានពាក្យសម្ងាត់។'],
            ['អាចប្រើលើទូរស័ព្ទបានទេ?', 'បាន។ ផ្ទះយើងរចនាសម្រាប់ទូរស័ព្ទជាមុន ហើយអាចដំឡើងលើអេក្រង់ដើមដូចកម្មវិធីធម្មតា។'],
          ].map(([qq, a], i) => <FaqItem key={qq} q={qq} a={a} defaultOpen={i === 0} />)}
        </div>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="lp-section">
        <Reveal className="final-cta">
          <div className="fc-glow" aria-hidden="true" />
          <h2>ឈប់ដើរប្រមូលលុយផ្ទះជួល។</h2>
          <p>ឱ្យផ្ទះយើងធ្វើការជំនួសអ្នក — រៀងរាល់ខែ ដោយស្វ័យប្រវត្តិ។</p>
          <div className="lp-cta center">
            <button className="lp-btn white lg" onClick={go('/signup')}>បង្កើតគណនីឥតគិតថ្លៃ <ArrowRight size={18} /></button>
            <button className="lp-btn tg lg" onClick={go('/login?telegram=1')}><Send size={18} /> ចូលតាម Telegram</button>
          </div>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-brand"><img src="/icons/icon-192.png" alt="" width="28" height="28" /> <b>ផ្ទះយើង</b></div>
        <p>ធ្វើឡើងដោយក្តីស្រឡាញ់ សម្រាប់ម្ចាស់ផ្ទះជួលខ្មែរ 🇰🇭</p>
        <nav>
          <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>ចូលគណនី</a>
          <a href="#faq" onClick={jump('faq')}>សំណួរ</a>
          <a href="https://github.com/tmeta-sudo/phtasyeung" target="_blank" rel="noreferrer"><Code size={14} /> GitHub</a>
        </nav>
        <small>© {nowInCambodia().year} ផ្ទះយើង · ឥតគិតថ្លៃ · {lunarKm(nowInCambodia().ymd)}</small>
      </footer>
    </div>
  );
}

function FaqItem({ q, a, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={'faq-item ' + (open ? 'open' : '')}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}><span>{q}</span><ChevronDown size={18} /></button>
      <div className="faq-a"><p>{a}</p></div>
    </div>
  );
}

/** Animated phone with a Telegram invoice conversation + floating dashboard cards. */
function HeroVisual() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setStep(3); return undefined; }
    const t = setInterval(() => setStep((s) => (s + 1) % 5), 1700);
    return () => clearInterval(t);
  }, []);
  const ym = nowInCambodia().ym;
  return (
    <div className="lp-hero-visual" aria-label="ឧទាហរណ៍វិក្កយបត្រក្នុង Telegram">
      <div className="float-card fc-1">
        <span className="fc-label">បានប្រមូលខែនេះ</span>
        <b>៩៦%</b>
        <div className="fc-bars">{[40, 62, 55, 78, 70, 92, 96].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
      </div>
      <div className="phone">
        <div className="phone-notch" />
        <div className="tg-head"><img src="/icons/icon-192.png" alt="" width="34" height="34" /><div><b>ផ្ទះយើង</b><small>bot</small></div></div>
        <div className="tg-body">
          <div className="bubble in pic">
            <div className="b-qr"><span>KHQR</span><QR value="https://phteahyeung.app/demo-invoice" size={120} /></div>
            <div className="b-text">
              <b>🧾 វិក្កយបត្រប្រចាំខែ</b>
              <span>{monthKm(ym)} · បន្ទប់ A-101</span>
              <span><Droplets size={12} /> ទឹក ១២ m³ · <Bolt size={12} /> ភ្លើង ១២០ kWh</span>
              <b className="b-total">សរុប $186.00</b>
            </div>
            <div className="b-btn">✅ ខ្ញុំបានបង់ប្រាក់</div>
          </div>
          <div className={'bubble out ' + (step >= 1 ? 'show' : '')}>📷 បង្កាន់ដៃ ABA</div>
          <div className={'bubble in ' + (step >= 2 ? 'show' : '')}>📨 បានទទួល — ម្ចាស់ផ្ទះនឹងបញ្ជាក់ឆាប់ៗ</div>
          <div className={'bubble in ok ' + (step >= 3 ? 'show' : '')}>✅ <b>បានទទួលការបង់ប្រាក់</b> · សូមអរគុណ! 🙏</div>
        </div>
      </div>
      <div className={'float-card fc-2 ' + (step >= 3 ? 'pop' : '')}>
        <span className="fc-dot" />
        <div><b>សុខ ស្រីនាង បានបង់</b><small>A-101 · $186.00 · តាម KHQR</small></div>
      </div>
      <div className="float-card fc-3">
        <IdCard size={18} />
        <div><b>អត្តសញ្ញាណប័ណ្ណ</b><small>មុខ ✓ · ក្រោយ ✓</small></div>
      </div>
      <div className="float-card fc-4"><Users size={16} /> <b>២៤</b> អតិថិជន</div>
    </div>
  );
}

/** Live invoice calculator powered by the same Khmer engine the app uses. */
function Playground() {
  const [v, setV] = useState({ rent: 150, waterUsed: 12, electricUsed: 120, waterRate: 0.5, electricRate: 0.25, rate: 4100, khmer: true });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : Math.max(0, Number(e.target.value) || 0) });
  const calc = useMemo(() => {
    const water = v.waterUsed * v.waterRate;
    const electric = v.electricUsed * v.electricRate;
    const total = Math.round((v.rent + water + electric) * 100) / 100;
    return { water, electric, total, riel: toRiel(total, v.rate) };
  }, [v]);
  const k = v.khmer;
  const today = nowInCambodia();
  return (
    <div className="playground">
      <div className="pg-inputs">
        <label><span>ថ្លៃជួល ($)</span><input type="number" min="0" value={v.rent} onChange={set('rent')} /></label>
        <label><span><Droplets size={14} /> ទឹកប្រើ (m³)</span><input type="number" min="0" value={v.waterUsed} onChange={set('waterUsed')} /></label>
        <label><span><Bolt size={14} /> ភ្លើងប្រើ (kWh)</span><input type="number" min="0" value={v.electricUsed} onChange={set('electricUsed')} /></label>
        <label><span>តម្លៃទឹក ($/m³)</span><input type="number" min="0" step="0.05" value={v.waterRate} onChange={set('waterRate')} /></label>
        <label><span>តម្លៃភ្លើង ($/kWh)</span><input type="number" min="0" step="0.01" value={v.electricRate} onChange={set('electricRate')} /></label>
        <label><span>អត្រាប្តូរ (៛/$)</span><input type="number" min="1" value={v.rate} onChange={set('rate')} /></label>
        <label className="pg-switch"><input type="checkbox" checked={v.khmer} onChange={set('khmer')} /><span>លេខខ្មែរ</span></label>
      </div>
      <article className="pg-invoice">
        <header><div><h3 className="moul">វិក្កយបត្រ</h3><small>{monthKm(today.ym, k)}</small></div><span className="pg-room">A-101</span></header>
        <div className="pg-lines">
          <div><span>ថ្លៃជួលបន្ទប់</span><b>{usd(v.rent, k)}</b></div>
          <div><span>ថ្លៃទឹក ({num(v.waterUsed, k)} m³)</span><b>{usd(calc.water, k)}</b></div>
          <div><span>ថ្លៃភ្លើង ({num(v.electricUsed, k)} kWh)</span><b>{usd(calc.electric, k)}</b></div>
        </div>
        <div className="pg-total"><span>សរុប</span><b>{usd(calc.total, k)}</b></div>
        <div className="pg-riel">{khr(calc.riel, k)}</div>
        <p className="pg-words">{usdInWords(calc.total)}</p>
        <footer><QR value={`demo:${calc.total}`} size={64} /><small>{lunarKm(today.ymd)}</small></footer>
      </article>
    </div>
  );
}
