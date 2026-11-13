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
| [Chakkhu OCR](https://huggingface.co/muyleanging/Chakkhu-OCR-Khmer-ONNX) | **Ing Muyleang** | On-device Khmer/English OCR for ID cards |
| [Kantumruy Pro](https://fonts.google.com/specimen/Kantumruy+Pro), [Moul](https://fonts.google.com/specimen/Moul) | Tep Sovichet; Danh Hong | Fonts |
| [`khmer-normalizer`](https://www.npmjs.com/package/khmer-normalizer) | Keyman/SIL | Khmer encoding normalisation (Unicode L2/22-290) |

## Free for every landlord

Anyone can sign up with an email and password and gets their own private workspace. Every landlord's rooms, customers, invoices and ID-card images are stored separately, and each request can only reach that landlord's data. Landlords can export everything as JSON or permanently delete their account from **ការកំណត់** (Settings).

Telegram works without any setup. All landlords share one platform bot, and each message names the landlord's property. A landlord can switch to their own bot (their own name and logo) by pasting a @BotFather token.

Forgot your password? A 6-digit reset code is sent to the owner Telegram you linked, so no email service is needed.

## New in this version

| Feature | What it does |
| --- | --- |
| **KHQR upload** | In Settings, upload a screenshot of your bank's "receive money" KHQR (ABA, ACLEDA, Wing…). It is decoded on your device; personal (tag 29) and merchant (tag 30) accounts are both supported, and every invoice gets a dynamic KHQR with the amount and invoice number. |
| **Map + address** | Tap the map (OpenStreetMap, or Google / satellite tiles) to pin the property. The address is looked up and matched to province, district, commune and village with pumi, and you confirm it before saving. The address and a Google Maps QR appear on invoices, the customer portal and the bot (📍). |
| **3D building designer** | Pick apartment, row rooms, row houses (ផ្ទះល្វែង) or a single house; set floors, rooms per floor and a numbering style (101, A-101, 1A, A1, L1-1 …); drag to rotate the 3D model; tap a unit to leave it out; then create all the rooms at once. The Rooms page shows each building in 3D, coloured by occupied, unpaid and vacant. |
| **Khmer contract** | A short Khmer lease filled in from the customer, room and property, with 1 month's booking deposit and 1 month's prepaid rent by default. You can edit it, print it, save it as PNG, or choose "មិនត្រូវការ" (no contract). One tap creates the move-in invoice (deposit + prepaid). Customers can read it in the portal and in the bot (📄). |
| **Invoice designer** | Drag and drop sections, choose an accent colour and a Khmer title font (Moul, Koulen, Bokor, Battambang, Siemreap, Kantumruy Pro), a size (A5, square for Telegram, story, receipt) and a header style. Export a PNG instantly, share it, or send the picture to the customer's Telegram. |
| **ID card OCR** | **Chakkhu OCR** by Ing Muyleang runs *on the device* (onnxruntime-web, int8 model ~39 MB downloaded once). It finds the text lines on the card and reads the Khmer front and the MRZ on the back (with check digits), then fills in name, Latin name, ID number, sex, date of birth, issue and expiry dates. Photos never leave the phone. |
| **Bot conversations** | Customers tap 🔧 Report repair or 💬 Message owner in the bot (photos allowed). You get it in Telegram and reply by swiping to reply or tapping ↩️, and can mark it 🔵 in progress / ✅ done. The same threads are in the web **Inbox (សារ)**, with replies sent through the bot. Repair reports also appear in Tasks. |
| **Your data, your storage** | Files are stored in Postgres by default, or in Cloudflare R2 when its keys are set. A landlord can instead connect **their own Google Drive**: ID cards and photos go into a "ផ្ទះយើង" folder in their Drive (`drive.file` scope only), with a daily JSON backup there. Files are moved over automatically, and can be moved back when you disconnect. |
| **Automatic payment confirmation (Bakong)** | Each invoice keeps one KHQR. With a free Bakong developer token (`BAKONG_TOKEN` for everyone, or the landlord's own in Settings → KHQR), the app asks Bakong whether that exact QR was paid — while the customer's pay screen is open, when the dashboard opens, and every day. It is marked paid only if the money reached the landlord's account and the amount matches, then receipts go out automatically. |
| **One-click backup** | Settings → Backup: one button downloads everything (data + ID card photos) as a zip, optionally locked with a password (AES-256). Backups can go to the owner's Telegram with one tap and automatically every week. Restore from the same file in one step. A reminder appears on the dashboard after 30 days without a backup. |
| **Notifications on the phone** | Web Push for payments, Bakong confirmations, repair reports and ID uploads, even without Telegram open. Zero setup: keys are generated automatically. On iPhone, add the app to the Home Screen first. |
| **Team accounts** | Invite a manager or staff member with a one-time link (7 days). Managers handle customers, rooms, invoices and meters; staff only record meters, answer repair messages and do tasks — they never see money, ID cards or portal links. Every route is checked on the server. |
| **Reports** | Billed vs collected per month, who still owes and since when, occupancy, water and electricity usage, with Excel export and print. |
| **Smarter ID scanning** | The photo is cropped to the card, straightened and turned the right way up before OCR, so a quick photo on a table works. |
| **Error monitoring** | Server and browser errors are grouped in the super admin **Errors** tab (emails, phone numbers and links are scrubbed). A crash shows a friendly Khmer screen instead of a blank page. |
