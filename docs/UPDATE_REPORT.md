# NORDA 2.2.0 update report

This release completes the selected catalog, cart/login, dependency and native-database work on the existing HTML/CSS/JavaScript and Node/Express/MongoDB application.

## Catalog and storefront

- 24 demonstration products across 12 categories, with descriptions, BDT prices, normal/discount price examples, managed brands, featured items, low-stock items and one sold-out item.
- 24 distinct realistic AI-generated photos, optimized to 800×800 WebP; together approximately 1.1 MiB. Prompts/provenance: `client/assets/products/photos/AI_ASSETS.json`.
- Category tiles use matching photography and a six-column desktop grid; existing responsive layouts remain.
- `npm run seed:catalog` imports missing records without changing administrator accounts, existing product IDs, prices, stock, order history or custom uploads. Only missing/known starter illustration images are refreshed.

## Cart and account flow

- A visitor can select a product and quantity before signing in. One selection is kept in session storage for up to 15 minutes and applied once after successful login or registration.
- Switching between login and registration preserves the safe return destination. A selected item takes the customer to the cart with success/unavailability feedback.
- Cart writes are queued within a page; stale reads cannot overwrite newer results. Repeated mutation controls are guarded, and queued work stops if the account changes.
- Database-backed cart persistence, repricing, stock checks, unavailable-item removal, totals, COD orders and invoices are covered by regression/native tests.

## Dependencies and uploads

- Express 4.22.3, Mongoose 8.24.5 and Multer 2.4.0 are locked in the release.
- Vulnerable transitive dependencies were updated. Nodemon was removed; `npm run dev` uses Node's built-in watcher. Node.js 22+ is required.
- `npm ci` succeeds. Release `npm audit`: 0 vulnerabilities including development dependencies; JSON report included.
- Uploads enforce one file per request, file/field/part limits, image checks and HTTP 400 validation errors. The existing multi-image editor uploads each photo separately.

## Real MongoDB verification

MongoDB 7.0.45 ran in isolated test databases, once as standalone and once as a single-member replica set. Both passed: 13 reported tests each, 0 failures, 0 skips. The replica-set run explicitly asserted transactions were enabled; standalone asserted the compensation path.

Native HTTP tests cover seed migration/re-seeding, all 24 photo URLs and categories, authentication/cookies/roles, multi-category carts, server prices, checkout/invoice/replay, cancellation/restock, archived-item recovery, concurrent final-unit purchases, same-cart concurrency and injected invoice-write rollback. GitHub Actions includes both topologies.

## Applying the ZIP

Preserve your existing `.env`, `MONGO_URI` and `server/uploads`. Follow `RUN_COMMANDS.md`, particularly `npm ci` and **`npm run seed:catalog`**. A source ZIP cannot add records to your laptop's database until you run the import. Existing custom data is retained, so your database may contain more than the 24 provided samples.

## Remaining acceptance boundaries

- Browser/device visual, keyboard and invoice-print acceptance must still be checked on your laptop. Frontend logic was checked in JavaScript VM tests and assets/routes over HTTP; no browser automation result is claimed.
- SSLCOMMERZ regression tests use controlled responses. Public sandbox payment/callback/IPN acceptance requires your credentials and callback host and was not performed.
- Standalone MongoDB compensates handled errors but cannot provide atomic recovery from a process crash during rollback. Use a replica set for a public store.
- The catalog is illustrative demonstration inventory with fictional brands and AI imagery. Review actual product details before selling. Returns/refunds, password recovery, variants and deployment work remain in `FUTURE_DEVELOPMENT.md`.
