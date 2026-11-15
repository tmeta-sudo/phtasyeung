# Security

## Reporting a problem

Please report security issues privately through GitHub: **Security → Report a vulnerability** on this repository (https://github.com/tmeta-sudo/phtasyeung/security/advisories/new). Do not open a public issue. Khmer or English is fine. You will get an answer within a few days.

## How the app protects landlords and tenants

**Accounts and sign-in**
- Passwords are hashed with scrypt (random salt per user); common and easily guessed passwords are refused.
- Optional **two-factor sign-in** (TOTP, RFC 6238) with any authenticator app, plus 10 one-time recovery codes (only their hashes are stored). A code can never be used twice. Two-factor also applies after Telegram sign-in and recovery links.
- The platform-owner console requires a session that passed two-factor sign-in (`SUPER_REQUIRE_2FA`, on by default).
- Sessions: 256-bit random tokens, stored only as SHA-256 hashes, sent as `HttpOnly; SameSite=Lax; Secure` cookies. Every user can see their signed-in devices and sign them out; changing the password or turning on 2FA signs out other devices.
- A Telegram/phone alert is sent when an account is opened from a new device or network, and when 2FA is turned on or off.
- Rate limits on sign-in (per account and per IP), sign-up, password reset, 2FA codes, public forms and reports.

**Web protections**
- Strict Content-Security-Policy (no inline scripts, no third-party scripts, limited outbound connections), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and frame restrictions (only Telegram Web may embed the tenant page).
- Cross-site request protection on every state-changing API call: the `Origin`/`Sec-Fetch-Site` headers must match, in addition to SameSite cookies.
- Uploads are checked by their content (JPG, PNG, WEBP, PDF only; SVG and HTML are refused) and served with `nosniff` and `Content-Disposition: inline`.
- All database queries are parameterised; each landlord's data is a separate document that is locked per request.

**Data**
- Bot tokens, storage credentials and 2FA secrets are encrypted at rest (AES-256-GCM with `APP_SECRET`).
- ID cards, bank slips, meter photos and signatures are private files. OCR runs on the user's device.
- Error reports strip e-mails, phone numbers and private links. The platform owner sees statistics, not landlords' tenant data.
- Every role-protected route is checked against a deny-by-default role table (owner, manager, staff).

**Dependencies**
- `npm audit` is clean; a vulnerable `axios` pulled in by `bakong-khqr` is replaced through `overrides` in `package.json`.

## Operator checklist (production)

| Setting | Why |
| --- | --- |
| `APP_SECRET`: 32+ random characters | Encryption key for tokens, 2FA secrets and sign-in tickets |
| `CRON_SECRET`: 32+ random characters | Protects the daily job endpoint |
| `SUPER_ADMIN_EMAILS` | Only these accounts can open the platform console |
| Turn on 2FA for your own account | Required for the platform console |

The super-admin overview shows whether each of these is in place.
