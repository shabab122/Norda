# Local acceptance — NORDA 2.14.3

This update uses delivered **2.14.2 Local Final**. It keeps the store database, credentials, media and existing commerce rules. Production deployment, actual SSLCOMMERZ merchant acceptance and real courier/cloud/off-host activation are reserved in [deferred integrations](reserved/README.md).

## What this update can prove

The automated suites exercise the actual Express customer/admin routes, controlled frontend DOM behavior, local SMTP protocol, native MongoDB and a separately running private local connector. A successful SMTP response confirms server acceptance; only observing the received message confirms inbox/spam delivery. No private SMTP configuration or test recipient was supplied for this session. The previous browser access restriction was respected; visible browser/mobile/print acceptance is not claimed.

## 1. Customer/admin, mobile and print acceptance

Start with your existing working configuration; do not seed or reset your database:

```bash
cd server
npm ci
npm run verify
npm run dev
```

Open `http://localhost:5000`. Use disposable test customer accounts and test orders in your local store. Keep the same hostname for the entire journey; use a second browser profile/private window for the second identity.

| Step | Expected result |
|---|---|
| Open the homepage as a visitor | Search is one bordered field; an empty/space-only query stays idle. A typed product/category/brand query opens matching catalog results. |
| Open the mobile menu with keyboard | Toggle announces expanded/collapsed state. Escape closes it and returns focus to the toggle. |
| Register/sign in, show/hide password | Each eye control affects its own field and never submits the form. Leaving/hiding the page remasks revealed passwords. |
| Shop as a guest | Select an exact variant, add/update/remove cart quantities, apply a valid coupon, then complete COD checkout with a usable checkout email. Guest order history shows the full ID and private invoice/tracking links. |
| Recover a guest order | Request access using full Order ID + original checkout email. Open the one-use email link. A different email or another guest session must not expose the order. |
| Sign in as the matching verified customer | Explicitly merge/link guest shopping. Guest history remains distinct until linking succeeds; another account cannot claim it. |
| Shop as a registered customer | Product/variant → cart/coupon → checkout → order → invoice. Retry/refresh must retain one order/invoice and correct stock. |
| Sign in as admin/order staff | `/admin/orders.html` shows guest/account contacts. Processing, dispatch with courier details and delivered stages appear in the owning guest/customer tracking view. Warehouse orders use the existing parcel tool. |
| Complete COD delivery | Order and invoice become paid once. Other-account order/invoice access remains denied. |
| Test existing after-sales tools | Eligible cancellation, approved return, inspected partial receipt, exchange, refund and settlement use the existing guarded workflows. Booking/tracking alone never restocks a return. |
| Check responsive layouts | At 320, 375, 768 and 1280 CSS-pixel widths: navigation/search/forms/actions stay reachable. Wide tables scroll within their own wrapper. Check a long product name, long address, form error and sold-out variant. |
| Print invoices and credits | Check A4 preview with a long item name and enough rows for multiple pages. Brand/amounts must remain legible, headings repeat, rows remain intact where possible and navigation/actions stay hidden. Original invoice and credit amounts stay separate. |

The update fixes the semantic progress-list CSS collision, supports Escape in the mobile menu and refines narrow invoice tables/actions and print wrapping. These are code/controlled-DOM changes; the visible checks above must be observed in your own browser before recording manual acceptance.

## 2. Actual email delivery

Keep your **working laptop SMTP values**. They may be newer than the archived environment. Put only missing SMTP settings into your private `server/.env.integrations`; an existing environment value has priority. Never paste passwords into chat, commit them or replace database/JWT/payment keys.

```bash
npm run mail:diagnose
npm run mail:check
npm run mail:send-test -- --to your-own-email@example.com
```

Replace the sample recipient with your own real address. The send command is an explicit one-recipient request; it contains no password-reset or guest-access token and uses the same SMTP configuration as account/order mail. File-preview mode fails clearly instead of pretending to deliver. Each probe has a new reference; do not blindly rerun after an uncertain response. First check Inbox and Spam for that reference.

Once you have actually received that message, record where it arrived:

```bash
npm run mail:confirm -- --confirm REFERENCE-FROM-THE-SEND-RESULT --location inbox
```

Use `--location spam` if applicable. This records **your observation**, not automatic inbox access. Receipts are private under `server/.mail-checks/`, excluded from Git/ZIP. A spam receipt proves receipt, not desired inbox placement.

Finally request one ordinary verification email, one password-reset email and one guest-order recovery email from the site. Open their own fresh links; verify expiry/reuse and matching-account rules. `mail:check` verifies SMTP connectivity/authentication; the probe verifies SMTP acceptance and an observed receipt; these actual application actions verify the recipient/link flow. Order email is queued and may need its normal worker/retry interval. Existing account/guest token and notification code is preserved.

## 3. Local reverse-pickup and statement connector

See [local connector instructions](LOCAL_CONNECTOR.md). It supplies the runnable service missing from the earlier contract-only ZIP. It is explicitly a **local demonstration**, without a real courier booking, real cash receipt or real provider label. Demo statement pages can be previewed/acknowledged; they cannot enter the financial ledger. The existing merchant HTTPS mode and manual workflows remain available.

## Acceptance record

Record the date, browser/viewport, tested order ID and result of each manual scenario in a private local note. Real inbox receipts and visible browser results were **not obtained by the assistant in this session**. They are evidence still to collect, not extra development features. Current executed test results are in [verification](VERIFICATION_RESULTS.md).
