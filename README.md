# ផ្ទះយើង — Phteah Yeung

Khmer-first rental management: rooms, customers with full profiles and ID cards, meter readings, **automatic monthly invoices sent to each customer's Telegram with a KHQR payment code**, QR-code controls, and a mobile self-service portal for customers.

## What's inside

| Area | What it does |
| --- | --- |
| **Telegram auto-invoice** | On the day and hour you choose (Phnom Penh time) it creates invoices for every occupied room (rent + water + electricity + extra charges) and sends each one to the customer's Telegram as a KHQR image with a Khmer summary. Reminders are sent every *N* days until the invoice is paid. |
| **Payment confirmation** | The customer taps **«ខ្ញុំបានបង់ប្រាក់»** or sends a photo of their ABA/ACLEDA/Wing receipt to the bot. You get the claim, with the photo, in your own Telegram and confirm with one tap. The customer then receives a receipt. |
| **KHQR** | Uses NBC Bakong's KHQR standard. Every invoice gets a QR code with the amount and invoice number already filled in, which any Cambodian banking app can scan. |
| **Customers** | Full profile: Khmer and Latin names, gender, date of birth, phones, email, occupation, ID type/number/issue/expiry dates, **ID card front and back images**, profile photo, signed contract (image/PDF), permanent address (province → district → commune → village), emergency contact, room, contract dates, deposit and private notes. |
| **Customer portal** | Each customer has a private link/QR that opens a mobile app where they can see their bills, pay by KHQR, report a payment, connect Telegram, edit their own info and upload their ID card. |
| **QR control** | Scan with the in-app camera scanner (or any phone camera for the door stickers):<br>• room door sticker → record meter / open customer / open unpaid bill<br>• KHQR or invoice → mark paid / send reminder<br>• customer QR → open profile<br>Printable door stickers, Telegram link sheets and welcome cards. |
| **Khmer support** | Khmer UI, Khmer numerals (toggle), amounts in Khmer words (`ប្រាំរយដប់បួនដុល្លារ…`), Riel conversion, Khmer month names, **Chhankitek lunar date** and Cambodian public holidays, Khmer-aware search (Unicode normalisation + word segmentation), Cambodian phone validation (`+855` → `0xx xxx xxx`), Moul headings on printed invoices. |
| **Other** | Rooms with extra monthly charges, bulk meter entry, invoice edit (extra fees and discounts), Excel/CSV export, print-all, maintenance and lead tasks, live activity feed, import from the old browser-only version. |

## Built with work by Khmer developers

| Package | Author | Used for |
| --- | --- | --- |
| [`khmernumber`](https://github.com/seanghay/khmernumber), [`khmerword`](https://github.com/seanghay/khmerword), [`split-khmer`](https://github.com/seanghay/split-khmer), [`is-khmer`](https://github.com/seanghay/is-khmer), [`pumi`](https://github.com/seanghay/pumi-js) | **Seanghay Yath** | Khmer digits, amounts in words, word segmentation for search, Khmer-script validation, Cambodian administrative divisions |
| [`khmer-chhankitek-calendar`](https://github.com/chochkimhour/khmer-chhankitek-calendar) | Choch Kimhour | Lunar dates, holidays |
| [`bakong-khqr`](https://github.com/davidhuotkeo/bakong-khqr) | Devit Huotkeo | KHQR generation and validation |
| [Kantumruy Pro](https://fonts.google.com/specimen/Kantumruy+Pro), [Moul](https://fonts.google.com/specimen/Moul) | Tep Sovichet; Danh Hong | Fonts |
| [`khmer-normalizer`](https://www.npmjs.com/package/khmer-normalizer) | Keyman/SIL | Khmer encoding normalisation (Unicode L2/22-290) |

## Free for every landlord

Anyone can sign up with an email and password and gets their own private workspace. Every landlord's rooms, customers, invoices and ID-card images are stored separately, and each request can only reach that landlord's data. Landlords can export everything as JSON or permanently delete their account from **ការកំណត់** (Settings).

Telegram works without any setup. All landlords share one platform bot, and each message names the landlord's property. A landlord can switch to their own bot (their own name and logo) by pasting a @BotFather token.

Forgot your password? A 6-digit reset code is sent to the owner Telegram you linked, so no email service is needed.

## Sign in with Telegram

- **Sign in:** tap **ចូលតាម Telegram**. The bot shows the device, IP and time, then asks you to approve. The page signs you in once you do. On a phone this opens Telegram directly; on a computer you scan a QR instead.
- **Sign up:** on the create-account tab, enter your property name and tap **បង្កើតគណនីតាម Telegram**. No email or password is needed, and owner alerts are connected automatically.
- **Recovery:** send `/recover` (or tap 🔑 ចូលគណនី) to the bot. You get a one-time sign-in link for each linked account, valid for 15 minutes. After you open it, you can set a new password without the old one.
- Accounts made with email can link Telegram in **ការកំណត់**. Scanning the owner QR also links it.

## Super admin (platform owner)

Set `SUPER_ADMIN_EMAILS` and/or `SUPER_ADMIN_TELEGRAM_IDS`. Those accounts get a **Super** console with:

- platform statistics: landlords, sign-ups, active users, rooms/customers, invoice volume, feature adoption, storage
- a landlord list with **suspend / restore**
- **announcements** ("what's new"), shown in every landlord's app and optionally broadcast to their owner Telegram
- a **feature request board** (landlords vote) and **issue reports**, each with a status and reply; the landlord is told on Telegram when you update it
- an audit log of super-admin actions

The console shows aggregate numbers and account details only. It never shows customers' personal data or ID documents.

## Install as an app (PWA)

The app can be installed on Android, iPhone, Windows and macOS. It has a manifest, icons (including maskable and Apple touch icons), shortcuts, an offline app shell, update prompts and an install banner. Each customer's portal installs as its own app that opens straight to their page. Private data (`/api/*`) is never cached.

## Dark mode

Follows the system setting by default. The ☀️/🌙 toggle in the menu, on the login page, in the portal and in Settings cycles between system, light and dark. QR codes always stay dark-on-white so bank apps can still scan them.

## Deploy free: Vercel + Neon

1. **Neon**: create a project and copy the **pooled** connection string (`…-pooler…`).
2. **Telegram**: in @BotFather, run `/newbot` to create the shared platform bot. Copy its token and username.
3. **Vercel**: import this GitHub repo. *Framework preset: Other.* The build settings come from `vercel.json`. Add these environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled connection string |
   | `TELEGRAM_BOT_TOKEN` | platform bot token |
   | `TELEGRAM_BOT_USERNAME` | platform bot username (without @) |
   | `CRON_SECRET` | any long random string (`openssl rand -hex 32`) |
   | `SUPER_ADMIN_EMAILS` | your email (and/or `SUPER_ADMIN_TELEGRAM_IDS`) |
   | `APP_URL` | optional: your custom domain, e.g. `https://phteahyeung.com` |

4. Deploy. The database tables are created automatically on the first request.
5. Register the Telegram webhook once by opening your site, or by running:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/daily`
   After that, the daily cron re-registers it automatically.

**How it runs on Vercel**

- `api/index.js` is one serverless function, and all `/api/*` requests go to it. Everything else is the static Vite build.
- Telegram sends updates to `/api/telegram/webhook/<bot>`. Each request is checked with a secret header derived from the bot's token.
- Vercel Cron calls `/api/cron/daily` at 01:00 UTC (08:00 in Phnom Penh). That run creates and sends the monthly invoices for every landlord whose invoice day has come, and sends the reminders.
- ID cards and photos are stored in Postgres (bytea), scoped to their landlord. Photos are shrunk in the browser to stay under Vercel's 4.5 MB request limit.

**Free-tier limits to know**

- **Vercel Hobby**: one cron run per day, so auto-invoices go out every morning rather than at a custom hour. Functions run for up to 300 s, which is fine for hundreds of landlords per daily run; beyond that, move the daily job to a queue. Vercel's Hobby plan is meant for **non-commercial** use, so if you ever charge for this service, move to the Pro plan.
- **Neon Free**: 0.5 GB of storage per project. With compressed ID photos of about 200–400 KB, that's roughly 1,500 customers with full ID sets. When you outgrow it, move file storage to Cloudflare R2 (10 GB free).
- Pages refresh every 20 s and whenever you return to the tab. Instant alerts arrive through Telegram.

## Run it on your computer (Windows, macOS or Linux)

1. Install **Node.js 22 or newer** from <https://nodejs.org/>.
2. Open a terminal in this folder. On Windows: click the File Explorer address bar, type `cmd` and press Enter.
3. Run `npm install` once, then `npm run dev`, and open <http://localhost:5173/>.
4. Click **បង្កើតគណនី** (Create account).

Without `DATABASE_URL`, an embedded Postgres (PGlite) stores data in `./data/pglite`, so you don't need to install anything. To use Neon locally too, copy `.env.example` to `.env` and fill it in. Locally the bots use long polling, so no public URL is needed. **Use a separate test bot locally.** Polling turns off the production bot's webhook.

If you used the previous single-owner version, its `data/db.json` is imported on first start. Sign in with the email **`admin`** and your old password.

## Privacy and security

- ID cards and other documents are stored in the database, tied to their landlord. They are never served publicly: only that landlord, logged in, or that customer's own portal link can open them. Uploaded files are checked by their content (JPG/PNG/WEBP/PDF only), and photos are shrunk on the device before upload.
- Customer portal links are long random tokens. You can re-issue one from the profile, which disables the old link and QR. Telegram link codes are single-use.
- Customers can edit their personal details but not their room, rent, contract or your private notes.
- Passwords are hashed with scrypt. Session tokens are stored only as SHA-256 hashes, in HttpOnly SameSite cookies. Login, sign-up and reset attempts are rate limited in the database, so limits hold across serverless instances. Cross-site write requests are rejected.
- Telegram button presses include the landlord and invoice IDs, and each press is checked against that landlord's chats. A customer cannot confirm their own payment, and no landlord can act on another landlord's invoice.
- Each landlord's document is locked (`SELECT … FOR UPDATE`) while a request changes it, so simultaneous edits are never lost.

## Current limits

- Payments are confirmed by the owner. Automatic bank confirmation would need Bakong's merchant API (`check_transaction_by_md5`), which requires a registered Bakong developer token.
- One owner login per landlord. Staff accounts with roles are not built yet.
- No browser (Web Push) notifications yet. Alerts are delivered through Telegram.
