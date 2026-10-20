# NORDA 2.5 testing and acceptance

Current results are recorded in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md). Account recovery, verification and address-book acceptance are described in [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md). Existing accounts and credentials need no migration.

## Automated verification

```bash
cd server
npm ci
npm run verify
```

Syntax checks cover all JavaScript. Default tests cover deterministic rules, injected persistence failures, HTTP journeys through the actual Express routes with a test-only model adapter, frontend safety and static resource integrity.

The three real database test entry points are intentionally skipped without an explicit test URI:

```bash
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

Each entry point creates a new random `norda_test_*` database and removes only that new database. Set `NORDA_EXPECT_TRANSACTIONS=1` when testing a replica set. Both topologies run in CI. Native HTTP checks cover the 24-product seed, asset serving, cookie login, multi-category cart, real totals, one invoice, cancellation, final-unit races, same-cart replay, injected invoice failure and upload validation. Gateway calls in regression tests are fixtures and do not test live SSLCOMMERZ.

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

1. Apply this ZIP on a new branch such as `improve/norda-ui-reliability`. Preserve the existing environment and uploads.
2. Review `git diff --check`, dependency lockfile, tests and this checklist.
3. Push your reviewed update branch and open a pull request into `main`.
4. Record environment acceptance evidence in the pull request.
5. Merge to `main` only after approval and a rollback plan.
6. Tag the accepted merge (for example `v2.3.0`) and update `CHANGELOG.md`.

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

