# NORDA 2.11 testing and acceptance

## Coupons, wishlist, inventory and store content — 2.9.0

See [COMMERCE_TOOLS.md](COMMERCE_TOOLS.md) for implemented behavior, usage/limits, routes and acceptance scenarios. These four areas remain implemented. Sales reports, staff/customer management, device sessions, notification outcomes and selected-item returns/exchanges are now implemented in 2.10; see [MANAGEMENT_RETURNS.md](MANAGEMENT_RETURNS.md). The optional eCourier API, SEO, Cloudinary media and backup/monitoring tools are now implemented in 2.11; see [PRODUCTION_TOOLS.md](PRODUCTION_TOOLS.md) for configuration and live-account acceptance. Existing credentials/data are preserved.

Current results are recorded in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md). Account recovery, verification and address-book acceptance are described in [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md). Checkout recovery acceptance and reservation behavior are described in [CHECKOUT_RECOVERY.md](CHECKOUT_RECOVERY.md). Payment review, cancellation and refund acceptance are described in [ORDER_OPERATIONS.md](ORDER_OPERATIONS.md). Courier/email acceptance is in [DELIVERY_NOTIFICATIONS.md](DELIVERY_NOTIFICATIONS.md), and SKU inventory acceptance is in [PRODUCT_VARIANTS.md](PRODUCT_VARIANTS.md). Existing accounts and credentials need no migration.

## Automated verification

```bash
cd server
npm ci
npm run verify
```

Syntax checks cover all JavaScript. Default tests cover deterministic rules, injected persistence failures, HTTP journeys through the actual Express routes with a test-only model adapter, frontend safety and static resource integrity.

The ten real database test entry points are intentionally skipped without an explicit test URI:

```bash
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

Each entry point creates a new random `norda_test_*` database and removes only that new database; backup tests also create and remove a new isolated `norda_restore_*` target and temporary media folder. Native files run serially to avoid shared upload-fixture races. Set `NORDA_EXPECT_TRANSACTIONS=1` when testing a replica set. Both topologies run in CI. Native HTTP checks cover the 24-product seed, asset serving, cookie login, multi-category cart, real totals, one invoice, cancellation, final-unit races, same-cart replay, injected invoice failure and upload validation. Native operations checks also cover cancellation decisions, return receipt, cash/gateway/simulated refund persistence, private audit projections, risky review, extra charges and net revenue. Gateway calls in regression tests are fixtures and do not test live SSLCOMMERZ.

## Current verification limits

Native MongoDB 7.0.45 checks passed in this release on standalone and replica-set paths. Public gateway acceptance and browser/device visual QA remain target-environment checks. Follow the acceptance matrix below on your laptop and deployment. Use a replica set for public-store transactional integrity.

## Clean local environment

1. Start a dedicated non-production MongoDB database.
2. Run `npm run setup` from `server/`, or copy `.env.example` to `.env` manually.
3. Generate a new JWT secret and choose a seed admin password of 12 or more characters.
4. Keep `SSLCOMMERZ_IS_LIVE=false`.
5. Run `npm run seed`, then `npm run dev`.
6. Open `http://localhost:5000` rather than opening the HTML file directly.

## Core acceptance matrix

| ID | Scenario | Expected result |
|---|---|---|
| A01 | Register with valid name/email/8+ password | Account created; cookie set; user enters storefront |
| A02 | Register duplicate email | Clear 400 error; no second user |
| A03 | Put external URL in `next` login query | Redirect falls back to Norda home |
| C01 | Filter by category, brand and BDT price | URL and result chips reflect filters; results match |
| C02 | Search text containing regex characters | Treated literally; API remains responsive |
| C03 | Add quantity above stock | 409 response; cart/stock unchanged |
| O01 | COD checkout | Stock decreases; order and one invoice created; profile saved; cart cleared |
| O02 | Edit a product price after O01 | Existing order/invoice totals remain unchanged |
| O03 | Cancel eligible unpaid order twice | First request restores exact quantity; second does not add stock again |
| O04 | Move pending directly to shipped | 409 conflict |
| O04A | Advance unpaid online order to processing | 409 conflict; cancellation remains available |
| O05 | Deliver COD order | Fulfillment is delivered; payment and invoice are paid |
| I01 | Customer A requests Customer B invoice | 403 response |
| R01 | Review before delivery | 403 response |
| R02 | Review after delivered purchase | Review saved as verified; product aggregate updates |
| M01 | Upload valid WebP ≤5 MB as admin | File and metadata created |
| M02 | Upload executable renamed `.jpg` | Rejected by MIME/extension checks |
| X01 | Non-admin requests dashboard/CSV | 403 response |
| X02 | CSV customer value begins `=` | Exported cell starts with apostrophe and cannot execute as formula |

## Manual COD journey

1. Sign in as administrator and create a category and brand.
2. Upload a product image, create a stocked product and make it featured.
3. Open the storefront in a separate browser profile.
4. Register, browse/filter, add the product and change quantity.
5. Complete every delivery field and select cash on delivery.
6. Confirm My Orders shows pending payment, pending fulfillment and an invoice.
7. In admin, advance pending → processing → shipped → delivered.
8. Confirm COD payment and the invoice are paid.
9. As the customer, submit a review and confirm it displays as verified.

## SSLCOMMERZ sandbox acceptance

Requirements: sandbox credentials, HTTPS `SERVER_URL`, HTTPS `CLIENT_APP_URL`, and a public callback/IPN route.

1. Confirm `/api/payments/config` reports enabled and `sandbox`.
2. Complete checkout with online payment and verify the browser is redirected only to an HTTPS SSLCOMMERZ host.
3. Complete a successful sandbox payment. Confirm one payment record is paid, its transaction/amount/currency match, the order is paid and processing, and the invoice is paid.
4. Replay the success callback/IPN. Confirm totals, stock and paid timestamp are not duplicated.
5. Run a failed payment. Confirm the order remains visible and unpaid with failed payment status.
6. Cancel a hosted payment. Confirm it remains visible and unpaid/cancelled-payment; then administratively cancel the order and verify stock restoration.
7. Alter transaction ID, amount or currency in an isolated test callback fixture. Confirm validation refuses payment.
8. Exercise a high-risk sandbox result if available. Confirm it is not accepted as paid and requires review.

Do not test live payment credentials from a developer machine. Rotate sandbox credentials if they appear in logs or screenshots.

## Order operations acceptance (2.7)

Use separate test orders for each row. The same flows are automated with the test adapter and both native MongoDB topologies; repeat the visible/provider steps in your own environment.

| Scenario | Expected result |
|---|---|
| Customer requests cancellation before shipment | One saved request; pending request blocks fulfillment and payment retry |
| Administrator rejects it with a decision message | Message visible to owner; stock/payment unchanged; normal shipment available |
| Approve unpaid cancellation twice | One cancellation; exact stock restored once; no refund invented |
| Approve paid online cancellation | One refund against verified captured balance; provider acceptance remains pending |
| Query confirmed provider repayment | Ledger completes; same original invoice gains refund metadata; request completes |
| Request return after paid delivery and approve | Delivered history retained; stock unchanged before receipt |
| Receive the whole return and choose restock | Exact stock restored once; remaining refund queued; replay does not repeat either |
| Receive damaged return without restock | Refund proceeds; no increase in sellable stock |
| Confirm COD refund without acknowledgement/receipt | Rejected; proper confirmation requires actual repayment and its receipt |
| Submit duplicate/partial/over-limit refunds | Saved keys replay; changed intents/over-refunds rejected; pending/unknown balance reserved |
| Interrupt refund initiation | Unknown/submitting state never causes a blind second transfer; reconcile existing reference |
| Approve risky or duplicate-payment review | Fresh verification, risk acknowledgement and completed additional-charge refunds required |
| Two customer profiles | Each sees only own requests/refunds; private audit/payment references remain admin-only |
| Invoice, dashboard and CSV after refund | Original total retained; confirmed refund/net sales and extra-charge amounts correct |

For public merchant acceptance, allowlist the refund API source IP as required by the provider and check the merchant's refund permission. Record actual query-confirmed sandbox repayment, not only a successful initiation. A simulated refund is not evidence of a bank transfer. See [the detailed workflow and uncertain-refund recovery](ORDER_OPERATIONS.md).

## Additional 2.8 acceptance

- Create size/color options, choose the exact SKU through guest login/cart/checkout, inspect its photo/price/quantity limit and original invoice labels.
- Race the final unit of one SKU from two customer accounts; another option's stock must remain untouched. Repeat cancellation, expiry/retry and physical return receipt on variant orders.
- Save a stale administrator stock edit after a purchase; require a conflict. Retire an option; old history/restock must remain valid while new purchases are blocked.
- Add courier details, dispatch, record progress/attempt/delivery and inspect owner-only paginated history. Retry the same key and reject unsafe URLs/backwards/closed updates.
- Verify queued confirmation/payment/shipping/delivery/cancellation mail. Actual SMTP acceptance, local preview and inbox placement must remain distinguishable. Fail SMTP in isolated tests; saved order/payment/stock must remain intact and email retries must be bounded.
- Check admin email privacy/retry permissions, account-change guards and interrupted variant-photo upload recovery.
- Run the actual API startup/shutdown with an isolated MongoDB and file-mode transport; confirm the automatic worker writes a private order confirmation after checkout.

## Browser and responsive checklist

- Current Chrome/Chromium, Firefox and Safari/WebKit equivalents
- 360 px mobile, 768 px tablet, 1024 px laptop and 1440 px desktop
- Header menu opens by keyboard and touch; focus remains visible
- Catalog cards do not overflow and filters remain usable
- Cart quantities and checkout labels remain readable at 200% zoom
- Forms expose labels, errors and useful autocomplete values
- Order and payment states have text, not color only
- Invoice prints on A4/Letter without the site header/footer or horizontal clipping
- Hero text remains readable and the decorative image does not hide core actions

## Security release checklist

- Unique 32+ character JWT secret in secret storage
- Seed/admin password changed; no shared demo credentials
- Exact production `CLIENT_URL`; HTTPS on client, API and gateway callback URLs
- `AUTH_RETURN_TOKEN=false` for same-origin deployment
- `NODE_ENV=production`
- MongoDB least-privilege user, network allowlist, backups and restore test
- Gateway live credentials installed only after sandbox sign-off
- Reverse proxy request limits and security headers reviewed
- Upload directory replaced with durable storage and content scanning
- Central logs redact cookies, tokens, credentials and payment payload details
- Monitoring covers 5xx rate, callback failures, unpaid/failed orders, stock anomalies and database health

## Branch and release procedure

1. Apply this ZIP on a new branch such as `feat/tracking-notifications-variants`. Preserve the existing environment and uploads.
2. Review `git diff --check`, dependency lockfile, tests and this checklist.
3. Push your reviewed update branch and open a pull request into `main`.
4. Record environment acceptance evidence in the pull request.
5. Merge to `main` only after approval and a rollback plan.
6. Tag the accepted merge (for example `v2.9.0`) and update `CHANGELOG.md`.

## Additional 2.2 acceptance

- Run the catalog import twice: unchanged merchant stock/prices and custom photos; no duplicated sample products.
- Browse all 12 categories, category/brand filters, price sorting and pagination. Check the sold-out organizer and low-stock products.
- Signed out, select a product with quantity 2. Continue from login to registration, finish authentication, and confirm exactly 2 are in the cart.
- Reload, sign out and sign back in: the database-backed cart remains. A consumed login selection is not added again.
- Increase/decrease quantity, type a quantity, remove, clear, and recover an archived/unavailable item. Verify the badge and summary.
- Place a COD order containing products from several categories; check totals, invoice, emptied cart and one stock decrement.
- Repeat the checkout key, cancel twice, and test two customers attempting the final unit. The native integration tests automate these scenarios.

## Additional 2.1 acceptance

- Retry the same checkout key after an interrupted response: one order/invoice and one stock decrement.
- Trigger an isolated persistence failure on each checkout write: no orphan order/invoice, empty cart or missed stock compensation.
- Send a success callback after admin cancellation: payment review, cancelled fulfillment and unchanged restored stock.
- Repeated success followed by failure/cancel notifications cannot downgrade validated payment.
- Foreign-origin gateway form callback reaches validation; a disallowed storefront API Origin is rejected.
- Edit a six-image product without removing images; reorder, remove and add new uploads.
- More than 100 products remain reachable through admin pagination/search.
- Archived items remain visible as unavailable in carts and historical product details.
- Password changes reject an incorrect current password; old JWTs stop working after a valid change/logout.
- Sign-out actions remain reachable at 360px and in mobile admin navigation.
- Names and addresses containing quotes render intact in input values.
- Verify modal focus/escape, roving product tabs, empty/error states and A4 invoice printing.


## 2.10 management and item-return acceptance

Run the new `managementUnit`, `managementFrontend` and `managementHttp` tests with the default suite. `mongoManagement.test.js` runs the shared HTTP/fault journeys against native Mongoose/MongoDB in `npm run test:integration`; the CI matrix includes it on both topologies. Coverage includes scoped staff access/audit rollback, device rotation/revocation and unseen legacy tokens, preference suppression and signed outcome replay, paid-cohort report arithmetic, return windows/quantity/coupon-paisa conservation, held refunds, credit-note receipt rollback, equal-price SKU replacement, zero credit and confirmed-failure/unknown gateway refund handling.

Use the laptop acceptance matrix in [MANAGEMENT_RETURNS.md](MANAGEMENT_RETURNS.md#acceptance-on-your-laptop). Test actual browser/mobile/keyboard/credit-note printing and provider mail/gateway behavior separately from VM/native automated evidence.

## Production tools regression coverage — 2.11

`productionToolsHttp.test.js` and `mongoProductionTools.test.js` share 24 HTTP journeys: scope/privacy, initial SEO, booking replay/uncertainty, tracking/invoice/COD guards, exceptions/cancellation, automatic/prepaid/manual-dispatch rules, cloud upload/migration/reference-safe cleanup, maintenance/writer drainage and redacted alert transport. `providerProtocols.test.js` exercises the actual eCourier/Cloudinary REST adapters with intercepted network responses. Unit and frontend VM suites check authenticated archive framing, logical text-index restoration, safe structured data, scoped pages and account-response races.

`mongoBackup.test.js` exercises encrypted BSON/index/local/cloud-byte backup, wrong-key/tamper rejection, isolated restore, source/existing-target refusal and missing-media failure on real MongoDB. All provider calls remain controlled fixtures. Follow [the production guide](PRODUCTION_TOOLS.md) for actual provider/off-host/SEO acceptance.
