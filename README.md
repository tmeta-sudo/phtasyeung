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

## Run it (Windows, macOS or Linux)

1. Install **Node.js 20 or newer** from <https://nodejs.org/>.
2. Open a terminal in this folder. On Windows: click the File Explorer address bar, type `cmd` and press Enter.
3. Run `npm install` once.
4. Run `npm run dev`, then open <http://localhost:5173/>.
5. The first visit asks you to create the owner password (at least 8 characters).

For production, run `npm run build`, then `npm start`.

### Connect Telegram (5 minutes)

1. In Telegram, open **@BotFather**, send `/newbot` and copy the token it gives you.
2. Go to **Telegram** in the app and paste the token. The status shows `@YourBot កំពុងដំណើរការ`.
3. Scan the **owner QR** on that page with your phone. You'll now receive payment alerts.
4. For each customer, open their profile and have them scan the **Telegram QR**, or print their welcome card.
5. Turn on **វិក្កយបត្រស្វ័យប្រវត្តិ**, then choose the day, hour and reminder interval.

The bot uses long polling, so it needs no public URL, domain or webhook.

### KHQR

In **ការកំណត់ → KHQR**, enter your Bakong account ID (e.g. `name@aclb`, `name@abaa`) and the receiver name in Latin letters.

## Environment variables (all optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5173` | HTTP port |
| `DATA_DIR` | `./data` | Database and uploaded documents |
| `ADMIN_PASSWORD` | — | Fixed owner password (otherwise it is set in the browser on first run) |
| `TELEGRAM_BOT_TOKEN` | — | Bot token (otherwise it is set on the Telegram page) |

## Privacy and security

- ID cards and other documents are stored in `DATA_DIR/uploads` with random file names. They are never served publicly: only a logged-in owner or that customer's own portal link can open them. Uploaded files are checked by their content (JPG/PNG/WEBP/PDF only), and photos are shrunk on the device before upload.
- Customer portal links are long random tokens. You can re-issue one from the profile, which disables the old link and QR. Telegram link codes are single-use.
- Customers can edit their personal details but not their room, rent, contract or your private notes.
- Passwords are hashed with scrypt. Sessions use HttpOnly SameSite cookies. Logins are rate limited, and cross-site write requests are rejected.
- `data/` is git-ignored. **Back it up**: it is your whole database.

## Current limits

- One owner account per installation, stored in a JSON file in `DATA_DIR`. Hosting therefore needs a persistent disk. See the roadmap in the pull request for moving to Postgres (Neon) and multi-owner hosting.
- Payments are confirmed by the owner. Automatic bank confirmation would need Bakong's merchant API (`check_transaction_by_md5`), which requires a registered Bakong developer token.
