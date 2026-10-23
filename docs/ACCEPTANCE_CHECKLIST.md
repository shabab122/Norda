# NORDA 2.13.0 acceptance checklist

> Current extension: the six commerce operations workflows are implemented. See [the operational guide](COMMERCE_EXPANSION.md) and [measured results](VERIFICATION_RESULTS.md). Existing credentials are preserved; no owner database or real provider was used for release testing. Browser/provider acceptance is still a target-environment step.

> Version 2.10 extension: see [Management, notifications, devices and item returns](MANAGEMENT_RETURNS.md) for scoped staff access, device revocation, return/refund email preferences, delivery outcomes, selected-item returns/exchanges and credit notes. Earlier workflows below remain available.

## New commerce workflows — 2.13

Run these on isolated staging/test merchandise, using the existing private environment settings:

- Guest: browse → exact variant → cart quantity/removal → enter contact/shipping → COD or configured payment → own order/invoice. Use another browser profile to confirm isolation. Recover through the actual inbox link, then merge a guest cart and link orders to its matching verified account. A different verified email must not claim them.
- Settlement: preview/import a partial COD statement and its fee, import the balance, compare net, reject a repeated provider reference, inspect unpaid/overpayment exceptions and audit an exclusion. Match a real refunded exchange charge and its separate negative refund line. An import must not mark an unpaid order paid.
- Exchanges: select higher-, lower- and equal-price products/variants with a coupon. Approve, check exact reserved replacement SKU, collect/validate an extra payment or hold the lower-price refund, receive in two parts, then complete the actual refund/payment and dispatch. Compare original invoice, adjustment and credit note.
- Reverse pickup: request on an approved return, arrange the actual carrier booking, record its real reference/appointment, progress to arrival and receive partial quantities. Repeated receipt must not restock twice. Whole-order pickup must link to the earlier whole-order receipt tool.
- Warehouses: verify location balances before opting in. Enable priorities, try split and single-source-per-SKU modes, place a multi-location order, inspect parcel totals/tracking, confirm partial delivery does not mark COD paid and cancellation is blocked after dispatch. Test unpaid expiry/retry and late-payment review without changing parcel IDs.
- Availability: verified customer subscribes to the sold-out exact SKU; restock another SKU (no alert), then the followed SKU (one accepted notification). Check actual inbox/Spam, unsubscribe and a later sold-out re-subscription. An alert must not reserve stock.
- Staff: verify payments, inventory and orders scopes expose only their respective policy/parcel/ledger/receipt screens and APIs. Keep full-admin MFA/invitation rules unchanged.
- Visual: inspect all eight new screens on desktop/phone, keyboard and 200% zoom. Print the exchange adjustment and compare it with the original invoice and lower-price credit note. No automated VM test is a substitute for this visual acceptance.
- Providers: complete the public **exchange** SSLCOMMERZ session/success/fail/cancel/IPN/replay/risk/review/refund matrix as well as the existing original-order matrix. Verify actual SMTP order-recovery/stock emails. Reverse bookings and split-parcel shipping confirmations require the actual carrier arrangement.

Upgrade every server sharing the DB before activation; older versions cannot safely process these new records. Keep backups and use a compatible release for rollback.

## Coupons, wishlist, inventory and store content — 2.9.0

See [COMMERCE_TOOLS.md](COMMERCE_TOOLS.md) for implemented behavior, usage/limits, routes and acceptance scenarios. These four areas remain implemented. The five management/session/notification/item-return areas are now implemented in 2.10; see [MANAGEMENT_RETURNS.md](MANAGEMENT_RETURNS.md). eCourier/cloud media and deployment tooling are implemented in later releases; actual provider/host acceptance remains separate. Existing credentials/data are preserved.

## Recorded status

| Area | Current evidence | Remaining action |
|---|---|---|
| Customer browse/login/cart/COD/order/invoice | Automated real HTTP + MongoDB pass on both topologies | Repeat the visible journey on your laptop |
| Admin inventory/delivery/cancellation/restock/reviews | Automated real HTTP + MongoDB pass on both topologies | Repeat with your existing admin account |
| Different customer identities and private data | Frontend VM + real HTTP ownership checks pass | Verify two browser profiles show the right name/email/data |
| Desktop/mobile layout, keyboard and print | Responsive/print rules and static/VM checks are present | Actual browser/device acceptance pending |
| Gateway success/failure/cancel/IPN state handling | Controlled provider responses + real MongoDB pass | Public SSLCOMMERZ sandbox acceptance pending |
| Reservation expiry and same-order retry | Automated HTTP, race/fault-injection and both native MongoDB topology checks pass | Follow [checkout recovery acceptance](CHECKOUT_RECOVERY.md#update-and-acceptance), including public sandbox retry |
| Customer cancellation, whole-order return and refunds | HTTP/fault-injection/frontend checks and real MongoDB pass on both topologies | Follow [operations acceptance](ORDER_OPERATIONS.md#reliability-and-acceptance), including real merchant refund confirmation |
| Admin review and audit privacy | Verified-charge/risk/additional-refund rules, owner/admin API isolation and net revenue tests pass | Repeat review and two-browser-profile checks on the deployment |
| Courier history/customer tracking | Guarded HTTP and real MongoDB checks pass; repeated/backwards/unsafe updates checked | Inspect visible courier pages and supplied carrier link |
| Transactional order email | Commit activation, bounded retry/claims, isolated SMTP delivery and actual automatic worker/file preview pass | Test the owner's actual SMTP inbox/Spam and links |
| SKU options and independent stock | Cart/checkout/snapshot/race/rollback/expiry/return checks pass on both MongoDB topologies; frontend guards pass | Create real options/photos and inspect browser/mobile/invoice printing |
| Reports, staff and customers | Native HTTP monetary cohorts, private customer history, scope enforcement and audit rollback pass | Check assigned tools with a team member account |
| Devices and notification outcomes | Native/VM session isolation/rotation, preferences and signed delivery replay pass | Check two devices, real provider outcomes and optional adapter |
| Selected-item returns and exchanges | Exact coupon/quantity/stock, held-refund/credit-note synchronization, provider failure/unknown safeguards pass on both topologies | Check visible receipt workflow, replacement tracking and credit-note print |
| Configuration and credentials | Read-only preflight; no credential/seed changes; additive demo fields need no migration | Retain your working `.env` and uploads |

## Before starting

Keep your current `server/.env` exactly as configured. Retain your currently working MongoDB URI/database, including Atlas or your existing local port. Keep NORDA on port 5000. Applying this update does not require setup or reseeding.

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

Open http://localhost:5000. Use your existing admin login; no shared demo password is supplied. For a genuinely fresh database with no admin, `npm run seed` can initialize the account using your own private `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Do not change working credentials to apply this update.

## Local demo payment journey

1. Run development with your working `.env`; merchant credentials and a public callback URL are not required. Verify `/api/payments/config` reports `demoEnabled: true`. A production environment or `PAYMENT_DEMO_ENABLED=false` disables it.
2. Add products, sign in and checkout using **Mobile Banking / bKash**. On the demo page choose successful payment. Confirm a processing order with a simulation note, paid invoice with a simulation note, cleared cart and one stock decrement; real revenue stays unchanged.
3. Repeat with **Card / Bank**. Check the selected category, order total, result, invoice and compact simulation/no-charge notes.
4. For each category, start a separate demo and choose failed payment; repeat with cancel. Both orders must be cancelled, stock restored once, and payment/invoice statuses must match the outcome. No real money moves.
5. Leave a pending demo, return to My Orders and use Resume or cancel payment. Existing items are reserved until completion/cancellation or automatic expiry (30 minutes by default); startup/periodic sweeps restore stock once.
6. Refresh after completion; do not create another order/invoice or repeat stock updates. Another customer must not access/finish this demo. Browser/mobile/keyboard/print checks still need the visible inspection below.

## Customer browser journey

1. Signed out, verify Home/Shop and Sign in/Create account are visible. Browse products/categories, search, sort and open a product.
2. Select quantity 2 and Add to cart. Sign in or follow Create account. Confirm the selection arrives once in the cart.
3. For a normal login without a shopping return URL, confirm the customer dashboard opens. It must show the correct name/email and Customer account label.
4. Add products from several categories, increase/decrease/type quantity, remove, clear, re-add and reload. Confirm totals, badge and stock errors.
5. Complete an order with cash on delivery. Check the order, invoice, shipping address and cleared cart. Try the same checkout key only in the isolated automated test; never create duplicate real orders to test a retry.
6. Sign out and use a second browser profile/customer. Its dashboard, cart, orders and invoices must belong to that account. Return to the first account and confirm its history remains.
7. In two tabs of the same browser profile, sign out/switch accounts. The other tab should refresh and show the current account rather than the old identity. Use separate browser profiles for simultaneous independent accounts because cookies are shared within one browser profile.
8. Change your display name in Profile and confirm the header/profile refresh. Existing password changes still require the current password; the update itself does not reset any password. Forgot/reset password and email verification remain available through the existing account workflow.

## Admin browser journey

1. Sign in using your existing administrator account. Confirm the Admin workspace label and existing overview.
2. Edit a test product's price/stock and open it in the storefront. Save an unrelated description edit without losing stock.
3. Process a test COD order through processing → shipped → delivered. Confirm order and invoice become paid. Leave a review from its purchasing customer.
4. Place a separate unpaid test order, cancel it and check exact stock restoration. Repeat cancellation and confirm stock does not increase again.
5. Verify customers cannot open management APIs or another customer's order/invoice. Automated native tests already cover these restrictions.

## Courier, email and variants

Follow [DELIVERY_NOTIFICATIONS.md](DELIVERY_NOTIFICATIONS.md#acceptance) and [PRODUCT_VARIANTS.md](PRODUCT_VARIANTS.md#acceptance). The update does not auto-convert your catalog or automatically book a carrier. Use an administrator-created variant product, real uploaded option photos and test orders. Keep current SMTP credentials, verify received mail/Spam and inspect owner-only links after login. Complete desktop/mobile/keyboard/print checks below.

## Requests, returns and refund acceptance

Follow the matrix in [TESTING_GUIDE.md](TESTING_GUIDE.md#order-operations-acceptance-27) and [ORDER_OPERATIONS.md](ORDER_OPERATIONS.md). At minimum, use separate orders to reject a cancellation and ship, approve an unpaid cancellation, approve a paid online cancellation and observe a query-confirmed refund, and return a paid delivered order with receipt/restock. Confirm cash repayment requires a receipt and that local simulated refunds remain clearly simulated.

Inspect pending/unknown refund messages and the provider-reference recovery form without submitting a second refund. Use two customer profiles to verify private note/payment-reference isolation. Compare invoice totals, refund metadata, net dashboard sales and CSV. Repeat actions to verify stock and refunds do not duplicate.

## Desktop/mobile/keyboard/print

Check Chrome/Chromium and Firefox at 360, 768, 1024 and 1440 pixels; also check your actual phone if available.

- No horizontal page overflow; header account identity/sign-out, mobile menu and catalog filters stay reachable.
- Dashboard cards become two columns, then account sections stack; long names/emails wrap or truncate without hiding actions.
- Keyboard Tab reaches the skip link, navigation, forms, cart and checkout; focus remains visible. Test Enter/Space and Escape in dialogs.
- Labels and errors remain readable at 200% zoom. Sold-out/error/empty states remain understandable.
- Print an invoice with a few rows and a long one. Confirm A4 output, repeated table heading, legible totals, page breaks and hidden site navigation.
- Refresh protected pages and use Back after sign-out; no stale private account view should remain.

These browser checks are not marked passed by the build because a supported browser controller was unavailable.

## Public SSLCOMMERZ sandbox acceptance

Requires your own sandbox merchant credentials and a public reachable callback host. Keep credentials private in the server environment; do not put them in commits, screenshots or the frontend. Use the same values you already configured. This ZIP does not provide or rotate them.

1. On your sandbox test host, run `npm run acceptance:preflight`. Confirm sandbox mode, credential presence and your public HTTPS callback/client URL format. A URL-format pass does not establish internet reachability.
2. Confirm `/api/payments/config` shows online payment enabled and sandbox. Configure the merchant's IPN listener to the existing `/api/payments/sslcommerz/ipn` route on your public API host.
3. Complete an actual hosted sandbox success. Record order ID, transaction ID, invoice number, amount and resulting paid/processing state. Never record the store password or tokens.
4. Complete separate failure and customer-cancel cases. Confirm unpaid status and matching invoice state. Administratively cancel eligible unpaid orders and verify one stock restoration.
5. Replay success/IPN for the same test transaction. Confirm one order/invoice, one stock decrement and stable paid state.
6. Replay failure/cancel after a successful validation. Confirm it remains paid. Exercise tampered amount/transaction/currency only on isolated test fixtures; it must not be accepted as paid.
7. Confirm a valid late payment after admin cancellation appears as payment review without re-consuming inventory; resolve it through **Requests & payments**, with fresh verification, a recorded decision and provider-confirmed refunds where required.
8. Save the observed results against the matrix before enabling live payments.

Official integration reference: https://developer.sslcommerz.com/doc/v4/ . This release checks application behaviour with controlled responses and has not completed these public-provider steps.

## Branding and invoice presentation

Check the full Norda name and AI symbol in the storefront header/footer, invoice, payment page and admin sidebar. Inspect the updated tab icon, long invoice numbers and long email addresses at small widths. Confirm the repeated Demo badges/large yellow invoice banner are gone while the compact simulation/no-charge information remains readable, including in a printed invoice.

## Production tools — 2.11 deployment acceptance

Automated HTTP/native/protocol/VM checks passed; owner-account/browser acceptance remains separate. Keep old credentials and follow [PRODUCTION_TOOLS.md](PRODUCTION_TOOLS.md).

1. In eCourier sandbox, load assigned package charges, book one eligible processing order, print its label, reconcile the original reference and verify real pickup/tracking. Check COD/prepaid collection semantics with the merchant; acknowledge exceptions without automatic stock/payment changes. Confirm carrier cancellation before order restocking.
2. Inspect new courier/media/system screens with full admin, scoped staff and a customer. Check desktop/mobile/keyboard behavior and visible customer tracking; retain existing invoice/credit-note printing acceptance.
3. On the final HTTPS domain, inspect initial product metadata/JSON-LD, canonical URL, sitemap and robots rules; validate with Rich Results/Search Console.
4. With the owner's Cloudinary account, upload a real image, migrate one old upload, confirm the legacy URL, and delete a truly unreferenced aged test asset through preview/confirm. Verify a referenced image is blocked.
5. Create/verify an encrypted backup, copy it off-host and restore to a new test database/media directory. Check indexes, representative orders/invoices and images. Keep the key separate; do not promote the drill automatically.
6. Verify readiness during maintenance and receive a controlled operational alert through actual SMTP/HTTPS. Use an external monitor for a stopped host/process.

These checks do not replace the retained public SSLCOMMERZ sandbox success/failure/cancel/IPN/refund acceptance matrix.

## Release/team/inventory acceptance — 2.12

1. Upgrade both shared-DB laptops, retain their working `.env` and configure the same new MFA key. Verify old credentials still work, then enroll one account and check two-step login/recovery/session revocation.
2. Invite a new staff member and an existing account; inspect actual email links, matching-account acceptance, expiry/resend/revoke, required MFA enrollment and scoped tools. Existing passwords/history must remain.
3. Preview/import a small real catalog CSV, then test warehouse counts/online transfers and a stale adjustment. Online checkout must ignore satellite-only stock. Check stock shortage, replenishment/rearm, unsubscribe and actual inbox/Spam.
4. On isolated staging, build/run the Docker image, verify DNS/TLS/restart/persistent uploads and preflight. Complete a customer/admin journey, deploy a compatible release and exercise code rollback. Only then promote production through the configured Environment.
5. With the real private bucket, create/upload/read back an encrypted archive, fetch it without relying on the store database and perform an isolated drill. Confirm retention preserves the minimum copies and leaves other namespaces alone.
6. Run the independent monitor outside the store host, stop staging and observe one outage/recovery notification. Confirm state survives restarts and alerts reach the actual receiver.

Actual Docker/TLS/provider/browser acceptance is distinct from the automated fixture/native tests. See [the guide](RELEASE_AUTOMATION.md); do not disrupt the working production database to perform these checks.
