# Third-party notices

ផ្ទះយើង (Phteah Yeung) is built on open-source work. This file lists what the app ships or calls, who made it, and under which licence. Versions and licences are taken from each package's own `package.json` / `LICENSE` at the time of writing; the copy in `node_modules/<package>/` is authoritative.

## Khmer language, calendar, payments and OCR

| Component | Author | Licence | Used for |
| --- | --- | --- | --- |
| [khmernumber](https://www.npmjs.com/package/khmernumber) 0.1.0 | Seanghay Yath | MIT | Khmer ↔ Latin digits |
| [khmerword](https://www.npmjs.com/package/khmerword) 0.2.0 | Seanghay Yath | MIT | Amounts in Khmer words |
| [split-khmer](https://www.npmjs.com/package/split-khmer) | Seanghay Yath | MIT | Khmer word splitting for search (its approach is reimplemented in `shared/khmer.js`; the package is no longer installed) |
| [is-khmer](https://www.npmjs.com/package/is-khmer) 1.0.1 | Seanghay Yath | Apache-2.0 | Detecting Khmer text |
| [pumi](https://www.npmjs.com/package/pumi) 1.0.3 | Seanghay Yath | MIT | Provinces, districts, communes, villages |
| [khmer-chhankitek-calendar](https://github.com/chochkimhour/khmer-chhankitek-calendar) 1.2.2 | Choch Kimhour | MIT | Lunar dates and public holidays |
| [khmer-normalizer](https://github.com/sillsdev/khmer-normalizer) 1.0.2 | Marc Durdin / SIL | MIT | Khmer Unicode normalisation |
| [bakong-khqr](https://www.npmjs.com/package/bakong-khqr) 1.0.20 | Devit Huotkeo (NBC KHQR SDK) | ISC | KHQR generation and decoding |
| [Chakkhu-OCR-Khmer-ONNX](https://huggingface.co/muyleanging/Chakkhu-OCR-Khmer-ONNX) | Ing Muyleang | Apache-2.0 | On-device OCR: ID cards, meters, bank slips. The model is downloaded by the browser from Hugging Face; it is not stored in this repository. |

KHQR is the National Bank of Cambodia's QR payment standard. Payment confirmation uses the NBC Bakong Open API with a token the operator or landlord registers for. "KHQR", "Bakong", and bank names such as ABA, ACLEDA and Wing belong to their owners; this project is not affiliated with or endorsed by them.

## Fonts (SIL Open Font License 1.1)

Self-hosted through [Fontsource](https://fontsource.org).

| Font | Copyright |
| --- | --- |
| Kantumruy Pro | The Kantumruy Project Authors (github.com/sovichet/kantumruy-pro) |
| Moul, Koulen, Bokor, Battambang | The respective Project Authors (github.com/danhhong) |
| Siemreap | Danh Hong, Reserved Font Name "Khmer OS Siemreap" |
| Inter Tight | The Inter Project Authors (github.com/rsms/inter-tight) |

## Application libraries

| Package | Licence | Used for |
| --- | --- | --- |
| [react](https://github.com/facebook/react), react-dom 19 | MIT | User interface |
| [vite](https://github.com/vitejs/vite) 8, @vitejs/plugin-react | MIT | Build |
| [express](https://github.com/expressjs/express) 5, [multer](https://github.com/expressjs/multer) | MIT | Server, uploads |
| [pg](https://github.com/brianc/node-postgres) | MIT | PostgreSQL client |
| [@electric-sql/pglite](https://github.com/electric-sql/pglite) | Apache-2.0 | Embedded database for local use and tests |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | MIT | Running the OCR model in the browser |
| [leaflet](https://github.com/Leaflet/Leaflet) | BSD-2-Clause | Map |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC | Icons |
| [qrcode](https://github.com/soldair/node-qrcode) | MIT | QR images |
| [jsqr](https://github.com/cozmo/jsQR) | Apache-2.0 | QR scanning |
| [html-to-image](https://github.com/bubkoo/html-to-image) | MIT | Invoice and contract PNG export |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Backup zip files |
| [aws4fetch](https://github.com/mhart/aws4fetch) | MIT | Cloudflare R2 storage |
| [web-push](https://github.com/web-push-libs/web-push) | MPL-2.0 | Push notifications (used unmodified) |

## Services and data

| Service | Terms |
| --- | --- |
| Map tiles and address lookup | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL). Address lookup uses Nominatim under its usage policy. Optional Google map tiles are subject to Google's terms. |
| Telegram Bot API | Telegram's Bot Developer terms |
| Default cover photo | Loaded from Unsplash under the Unsplash Licence |

If you believe something here is missing or wrong, please open an issue.
