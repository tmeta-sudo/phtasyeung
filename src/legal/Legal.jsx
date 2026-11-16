import React, { useEffect } from 'react';
import '../listing/listing.css';

const UPDATED = '16 November 2026';
const REPO = 'https://github.com/tmeta-sudo/phtasyeung';

/** Public privacy policy and terms (Khmer first, English below). Linked from Google's consent screen. */
export default function Legal({ page }) {
  const privacy = page === 'privacy';
  useEffect(() => { document.title = (privacy ? 'គោលការណ៍ឯកជនភាព' : 'លក្ខខណ្ឌប្រើប្រាស់') + ' · ផ្ទះយើង'; }, [privacy]);
  return (
    <div className="legal">
      <header className="legal-top">
        <a href="/" className="legal-brand"><img src="/icons/icon-192.png" alt="" width="36" height="36" /><b>ផ្ទះយើង</b></a>
        <nav><a href="/privacy" className={privacy ? 'on' : ''}>ឯកជនភាព</a><a href="/terms" className={privacy ? '' : 'on'}>លក្ខខណ្ឌ</a></nav>
      </header>
      <main className="legal-body">{privacy ? <Privacy /> : <Terms />}</main>
      <footer className="legal-foot">ផ្ទះយើង · Phteah Yeung · <a href="/">ទំព័រដើម</a> · <a href={REPO} target="_blank" rel="noreferrer">GitHub</a></footer>
    </div>
  );
}

function Privacy() {
  return (
    <>
      <h1>គោលការណ៍ឯកជនភាព</h1>
      <p className="legal-date">ធ្វើបច្ចុប្បន្នភាព៖ {UPDATED}</p>
      <p>ផ្ទះយើង ជាកម្មវិធីឥតគិតថ្លៃសម្រាប់ម្ចាស់ផ្ទះជួលគ្រប់គ្រងបន្ទប់ អតិថិជន វិក្កយបត្រ និងការបង់ប្រាក់។ ទំព័រនេះពន្យល់ថាយើងរក្សាទុកអ្វី ហេតុអ្វី និងសិទ្ធិរបស់អ្នក។</p>
      <h2>ទិន្នន័យដែលយើងរក្សាទុក</h2>
      <ul>
        <li><b>គណនីម្ចាស់ផ្ទះ៖</b> អ៊ីមែល ពាក្យសម្ងាត់ (រក្សាទុកជាសញ្ញាកូដ scrypt មិនអាចអានវិញបាន) ឬគណនី Telegram ដែលបានភ្ជាប់ Passkey និង 2FA។</li>
        <li><b>ទិន្នន័យដែលម្ចាស់ផ្ទះបញ្ចូល៖</b> បន្ទប់ អតិថិជន (ឈ្មោះ ទូរស័ព្ទ អត្តសញ្ញាណប័ណ្ណ កិច្ចសន្យា) លេខកុងទ័រ វិក្កយបត្រ ការបង់ប្រាក់ និងចំណាយ។</li>
        <li><b>ឯកសារ៖</b> រូបអត្តសញ្ញាណប័ណ្ណ រូបកុងទ័រ បង្កាន់ដៃធនាគារ និងហត្ថលេខា — ឯកសារឯកជន មានតែម្ចាស់ផ្ទះនោះ (និងអតិថិជនពាក់ព័ន្ធ) មើលបាន។</li>
        <li><b>ព័ត៌មានបច្ចេកទេស៖</b> ឧបករណ៍ និងផ្នែកខ្លះនៃអាសយដ្ឋាន IP សម្រាប់បញ្ជីឧបករណ៍ដែលបានចូល និងការការពារការចូលខុសច្បាប់។</li>
      </ul>
      <h2>របៀបដែលយើងប្រើ</h2>
      <p>ដើម្បីដំណើរការកម្មវិធីប៉ុណ្ណោះ៖ បង្កើតវិក្កយបត្រ ផ្ញើតាម Telegram បញ្ជាក់ការបង់ប្រាក់ KHQR បម្រុងទុក និងការពារគណនី។ យើង <b>មិនលក់</b> ទិន្នន័យ មិនប្រើសម្រាប់ផ្សាយពាណិជ្ជកម្ម ហើយមិនចែករំលែកជាមួយអ្នកដទៃ លើកលែងតែសេវាខាងក្រោមដែលម្ចាស់ផ្ទះជ្រើសរើសប្រើ។ ការអានអត្តសញ្ញាណប័ណ្ណ (OCR) ដំណើរការលើឧបករណ៍របស់អ្នក — រូបមិនត្រូវបានផ្ញើទៅសេវា OCR ណាមួយទេ។</p>
      <h2>Google Drive</h2>
      <p>បើម្ចាស់ផ្ទះចុច «ភ្ជាប់ Google Drive» កម្មវិធីសុំសិទ្ធិ <code>drive.file</code> ប៉ុណ្ណោះ៖ វាអាចបង្កើត និងកែតែឯកសារដែលខ្លួនបង្កើត (ឯកសារបម្រុងទុកក្នុងថត «ផ្ទះយើង») ហើយ <b>មិនអាចមើលឯកសារផ្សេងទៀត</b> ក្នុង Drive របស់អ្នកបានទេ។ យើងប្រើអ៊ីមែល Google ដើម្បីបង្ហាញថាគណនីណាដែលបានភ្ជាប់។ ផ្តាច់បានគ្រប់ពេលក្នុងកម្មវិធី (យើងដកសិទ្ធិពី Google ផងដែរ) ឬនៅ myaccount.google.com។</p>
      <h2>សេវាដែលយើងប្រើ</h2>
      <p>Vercel (ម៉ាស៊ីនមេ) · Neon (មូលដ្ឋានទិន្នន័យ) · Telegram (សារ ពេលម្ចាស់ផ្ទះបើក) · NBC Bakong (បញ្ជាក់ការបង់ KHQR) · Google Drive និង Cloudflare R2 (ពេលម្ចាស់ផ្ទះជ្រើសរើស) · OpenStreetMap / Google Maps (ផែនទី)។</p>
      <h2>សុវត្ថិភាព និងរយៈពេលរក្សាទុក</h2>
      <p>ការភ្ជាប់ HTTPS សម្ងាត់ (token, 2FA) ត្រូវបានអ៊ិនគ្រីប AES-256។ ទិន្នន័យត្រូវបានរក្សាទុករហូតដល់ម្ចាស់ផ្ទះលុប។ ម្ចាស់ផ្ទះអាចនាំចេញ ឬលុបគណនី និងទិន្នន័យទាំងអស់បានគ្រប់ពេល (ការកំណត់ → គណនី)។ ព័ត៌មានលម្អិត៖ <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">SECURITY.md</a>។</p>
      <h2>អតិថិជន (អ្នកជួល)</h2>
      <p>ម្ចាស់ផ្ទះជាអ្នកទទួលខុសត្រូវលើព័ត៌មានអតិថិជនដែលខ្លួនបញ្ចូល។ អតិថិជនដែលចង់មើល កែ ឬលុបព័ត៌មានរបស់ខ្លួន សូមទាក់ទងម្ចាស់ផ្ទះ ឬយើង។</p>
      <h2>ទំនាក់ទំនង</h2>
      <p>ក្នុងកម្មវិធី៖ ម៉ឺនុយ → «មតិ និងសំណើ» · ឬ <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">GitHub</a>។</p>

      <hr />
      <h1 lang="en">Privacy Policy (English)</h1>
      <div lang="en">
        <p className="legal-date">Last updated: {UPDATED}</p>
        <p>Phteah Yeung (ផ្ទះយើង) is a free app that helps landlords in Cambodia manage rooms, tenants, invoices and payments.</p>
        <h2>What we store</h2>
        <ul>
          <li><b>Landlord accounts:</b> e-mail, password (stored only as a scrypt hash) or linked Telegram account, passkeys and two-factor settings.</li>
          <li><b>Data landlords enter:</b> rooms, tenants (names, phone numbers, ID cards, contracts), meter readings, invoices, payments and expenses.</li>
          <li><b>Files:</b> ID-card photos, meter photos, bank slips and signatures. These are private: only the landlord concerned (and the tenant it belongs to) can open them.</li>
          <li><b>Technical data:</b> device type and a shortened IP address, to show signed-in devices and protect accounts.</li>
        </ul>
        <h2>How we use it</h2>
        <p>Only to run the service: creating and sending invoices, confirming KHQR payments, backups and account security. We do <b>not</b> sell data, use it for advertising, or share it with third parties other than the service providers listed below that a landlord chooses to use. ID-card reading (OCR) runs on the user's device; photos are not sent to any OCR service.</p>
        <h2>Google user data</h2>
        <p>If a landlord connects Google Drive, the app requests the <code>drive.file</code> scope and the account e-mail. It can only create and update files it created itself (backup files in a "ផ្ទះយើង" folder) and <b>cannot read any other file</b> in the user's Drive. The e-mail is shown so the landlord knows which account is connected. Google data is used only to save the landlord's own backups, is not shared with anyone, and is not used for advertising or to train AI models. Disconnecting in the app revokes the access at Google; it can also be removed at myaccount.google.com.</p>
        <p><b>Phteah Yeung's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</b></p>
        <h2>Service providers</h2>
        <p>Vercel (hosting), Neon (database), Telegram (messages, when enabled), NBC Bakong (KHQR payment confirmation), Google Drive and Cloudflare R2 (when chosen), OpenStreetMap and Google Maps (maps).</p>
        <h2>Security and retention</h2>
        <p>All connections use HTTPS; tokens and two-factor secrets are encrypted with AES-256. Data is kept until the landlord deletes it. Landlords can export or delete their account and all data at any time (Settings → Account). Details: <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">SECURITY.md</a>.</p>
        <h2>Tenants</h2>
        <p>Landlords are responsible for the tenant information they enter. Tenants who want to see, correct or remove their information can ask their landlord or contact us.</p>
        <h2>Contact</h2>
        <p>In the app: menu → "មតិ និងសំណើ" (Feedback), or open an issue on <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">GitHub</a>.</p>
      </div>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1>លក្ខខណ្ឌប្រើប្រាស់</h1>
      <p className="legal-date">ធ្វើបច្ចុប្បន្នភាព៖ {UPDATED}</p>
      <ul>
        <li>ផ្ទះយើង ឥតគិតថ្លៃ ហើយផ្តល់ «ដូចដែលមាន» ដោយគ្មានការធានា។ យើងព្យាយាមឲ្យដំណើរការល្អ ប៉ុន្តែសូមបម្រុងទុកទិន្នន័យជាប្រចាំ។</li>
        <li>ម្ចាស់ផ្ទះជាម្ចាស់ទិន្នន័យរបស់ខ្លួន ហើយទទួលខុសត្រូវក្នុងការប្រមូល និងប្រើព័ត៌មានអតិថិជនស្របច្បាប់កម្ពុជា។</li>
        <li>ហាមប្រើសម្រាប់ការបោកប្រាស់ ទំព័របន្ទប់ទំនេរក្លែងក្លាយ ឬការរំលោភ។ យើងអាចលាក់ទំព័រ ឬផ្អាកគណនីដែលរំលោភ។</li>
        <li>វិក្កយបត្រ បញ្ជីអ្នកស្នាក់នៅ និងសង្ខេបចំណូល ជាកំណត់ត្រាទូទៅ មិនមែនជាដំបូន្មានផ្លូវច្បាប់ ឬពន្ធទេ។</li>
        <li>KHQR និង Bakong ជារបស់ធនាគារជាតិនៃកម្ពុជា។ យើងមិនកាន់ប្រាក់របស់អ្នកទេ — ប្រាក់ទៅគណនីធនាគាររបស់ម្ចាស់ផ្ទះផ្ទាល់។</li>
        <li>កូដប្រភពជាអាជ្ញាប័ណ្ណ GNU AGPL-3.0។ ឈ្មោះ និងនិមិត្តសញ្ញា «ផ្ទះយើង» មិនរួមបញ្ចូលក្នុងអាជ្ញាប័ណ្ណ។</li>
      </ul>
      <hr />
      <h1 lang="en">Terms of Use (English)</h1>
      <ul lang="en">
        <li>Phteah Yeung is free and provided "as is", without warranty. We work to keep it reliable, but please keep regular backups.</li>
        <li>Landlords own their data and are responsible for collecting and using tenants' information lawfully under Cambodian law.</li>
        <li>Do not use the service for fraud, fake listings or abuse. We may hide listings or suspend accounts that do.</li>
        <li>Invoices, resident lists and income summaries are general records, not legal or tax advice.</li>
        <li>KHQR and Bakong belong to the National Bank of Cambodia. We never hold your money; payments go straight to the landlord's own bank account.</li>
        <li>The source code is licensed under the GNU AGPL-3.0. The "ផ្ទះយើង" name and logo are not covered by that licence.</li>
      </ul>
      <p lang="en">Privacy: see the <a href="/privacy">Privacy Policy</a>. Last updated: {UPDATED}.</p>
    </>
  );
}
