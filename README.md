# Norda

A full-stack e-commerce application for Bangladesh, built with HTML, CSS, browser JavaScript, Node.js, Express and MongoDB. Customers browse the catalog, keep a stock-aware cart, check out using cash on delivery, a local demo simulator or configured SSLCOMMERZ, follow orders, print invoices and review delivered purchases. Administrators manage the catalog, media, orders, invoices and reports.

**Current version: 2.4.2 — transparent Norda logo and tab icon.**

## What's improved

- Transparent logo/tab icon backgrounds across the storefront and admin workspace; the existing AI artwork is preserved.

- A new AI-generated N symbol, consistent Norda wordmark and matching tab icon across the storefront, payment page, invoice and administration.
- Fixed invoice logo typography and improved wrapping for long invoice numbers, emails and mobile layouts.
- Removed repeated Demo headings/badges from customer pages. Payment simulation remains clear through compact test-environment/no-charge notes; payment behavior and credentials are preserved.

- Self-contained **Mobile Banking/bKash** and **Card/Bank** test choices, with explicit success, failure and cancellation outcomes. No merchant credentials, public callback server or payment secrets are required for this local simulator.
- Simulated orders/invoices are labeled throughout customer/admin views, and simulated payments are excluded from revenue. Failed/cancelled demos release stock exactly once; interrupted initiation can resume from My Orders.
- Featured Picks and Recently Added exclude shared product IDs and cover photos while preserving arrival order. All 24 existing product photos were checked for unique files, image contents and correct subjects.

- Distinct visitor, customer and administrator experiences. Customers land on `dashboard.html` after a normal sign-in/sign-up; administrators retain their existing workspace.
- The customer dashboard shows the signed-in name/email, personal order counts, recent orders/invoices, cart quantity and delivery details through existing owner-protected APIs.
- Clear account identity in the header, with refresh guards when another tab changes accounts or a cached page is restored.
- Expanded native acceptance covers administrator inventory edits, the complete COD delivery/review journey, two-customer data isolation and controlled gateway callback states.
- Read-only `npm run acceptance:preflight` checks the configured MongoDB host/port, existing record counts and payment setup without rewriting configuration.
- 24 products across 12 categories, each with its own realistic AI-generated 800×800 WebP photo, BDT price, description, brand and stock.
- A repeatable catalog import that preserves existing prices, stock, uploads, product IDs and orders.
- A visitor's selected product/quantity carries through login or registration and is added once; queued cart writes prevent conflicting page actions.
- Updated Express, Mongoose, Multer and vulnerable transitive packages; removed the unused development watcher dependency. The release audit reports zero vulnerabilities.
- Native MongoDB 7.0.45 checks passed on both standalone and replica-set transaction paths, including real HTTP login, cart, checkout, invoice, cancellation, stock races and rollback.
- A consistent storefront and operations workspace: warm neutral surfaces, forest-green accents, clearer typography, responsive product cards and visible mobile account actions.
- Multi-image product editing with cover selection, reordering and removal; searchable, paginated administration.
- Discount-aware price sorting, honest delivery information and consistent product photography.
- Safe cart rendering for unavailable products, server-side stock/price checks and guarded form submissions.
- Checkout request replay protection and MongoDB-backed operation locks across API processes.
- Transactional order/invoice/stock/profile/cart writes on a MongoDB replica set; compensating writes for standalone local MongoDB.
- Monotonic payment updates, cross-origin gateway form callbacks, and explicit review states for high-risk or late payments.
- Product archiving/restoration preserves historical purchases instead of deleting their references.
- Cookie-backed session restoration, password changes with current-password checks, session invalidation, safer HTML/CSV output and cleaned distribution credentials.

## Stack

| Layer | Technology |
|---|---|
| Storefront and administration | HTML, CSS, JavaScript; no frontend build step |
| API | Node.js, Express |
| Database | MongoDB, Mongoose |
| Authentication | Bcrypt and signed JWT in an HTTP-only cookie |
| Payments | COD, local mobile/card simulator and separately configured SSLCOMMERZ hosted checkout |
| Images | Validated local uploads, 24 AI product WebPs and fallback illustrations |

## Run locally

Install Node.js 22+ and run MongoDB. This update was checked with Node.js 24. Development watching uses Node's built-in watcher.

```bash
cd server
npm ci
npm run setup
```

Open `server/.env` and set `MONGO_URI` for your local database. The setup command creates a unique JWT secret and admin password only when `.env` does not exist. Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` there for the seeded admin login. Existing `.env` files are preserved.

```bash
npm run seed
npm run verify
npm run dev
```

Open **http://localhost:5000**. Express serves both the website and `/api`.

After a standard customer login or registration, open **http://localhost:5000/dashboard.html** for the personal account area. Product/cart return destinations still take priority when signing in during shopping. Administrator login still opens the existing admin dashboard.

NORDA defaults to port **5000**. Ports **3000** and **3002** are rejected at startup because they are reserved for GitStack/Gitea. NORDA uses its own MongoDB database; it does not use GitStack's PostgreSQL/Gitea services.

**Existing installations:** retain your current `.env`, `MONGO_URI` and `server/uploads` when applying the update. After `npm ci`, run **`npm run seed:catalog`** from `server/` to add the new catalog to your existing database. This command does not change the admin account, existing prices, purchased stock, custom photos or orders. It replaces only missing/known starter illustration images. The new-install template uses `norda_db`; your existing URI is preserved.

**Updating from 2.2/2.3:** no database migration or reseed is required. Keep your working `.env`, including your `27018` MongoDB port if that is how Docker exposes your database. Run `npm ci`, `npm run acceptance:preflight`, `npm run verify` and `npm run dev`. The update never runs setup/seed automatically.

The catalog is demonstration data: brands, prices and quantities are illustrative, and photos are AI-generated. One organizer is intentionally sold out; several products have low stock so you can check these states. See [catalog and shopping guide](docs/CATALOG_GUIDE.md) before replacing the samples with saleable inventory.

## Payments

See [the demo payment guide](docs/DEMO_PAYMENTS.md) for the new local simulator and its outcome/state table.

For the requested demo, keep your existing `.env` and run the development server. With `NODE_ENV=development` (or unset), checkout shows **Mobile Banking/bKash** and **Card/Bank**. They open `demo-payment.html`; choose a simulated outcome, then inspect My Orders and its invoice. No real financial information is collected. Both demo and COD use the existing cart and server-calculated totals.

Demo is enabled by default outside production, unless `PAYMENT_DEMO_ENABLED=false`. It is always disabled when `NODE_ENV=production`, even if that flag is true. Keep a demo store separate from real inventory: successful simulations reserve/decrement actual catalog stock in the configured development database. Failure/cancellation restores it; abandoned sessions can be resumed/cancelled from My Orders or by an administrator. Automatic reservation expiry remains future work.

The **separate real SSLCOMMERZ integration** still requires merchant configuration. Its option is shown only when its existing configuration checks pass. A local demo does not validate SSLCOMMERZ or bKash connectivity. To enable the provider checkout, configure these in the server's private environment:

```dotenv
SSLCOMMERZ_STORE_ID=your_sandbox_store_id
SSLCOMMERZ_STORE_PASSWORD=your_sandbox_store_password
SSLCOMMERZ_IS_LIVE=false
SERVER_URL=https://your-public-api.example
CLIENT_APP_URL=https://your-storefront.example
```

The gateway must reach the callback/IPN URLs. Success notifications are checked through the gateway validation API. A validated payment arriving after order cancellation remains a **payment review**; it does not reopen fulfillment or reserve inventory again. Review transactions need operational resolution before fulfillment/refund changes.

Failed/abandoned hosted payments remain visible for administrator review and eligible cancellation. Retrying a real provider payment on an existing order, automatic reservation expiry and gateway refunds remain future development items. Demo sessions can already be resumed from My Orders.

## Verification

```bash
npm run verify
```

The suite includes business-rule checks, injected write failures, HTTP API journeys with an isolated model adapter, upload signature checks and frontend rendering/resource checks. A real MongoDB test is opt-in:

```bash
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27017' npm run test:integration
```

That test creates and removes only a new random `norda_test_*` database. It never drops the database named in the supplied URI. Run it against a local test server; use a replica set to check transaction behavior as well.

The packaged verification does **not** certify a live payment gateway or browser layout. Run the real database, public SSLCOMMERZ sandbox and browser acceptance checks in [the testing guide](docs/TESTING_GUIDE.md).

## Project structure

```text
client/                 Storefront, admin pages and static assets
server/controllers/     HTTP handlers
server/services/        Checkout, invoices, gateway and write coordination
server/models/          MongoDB data models
server/middleware/      Authentication, uploads and errors
server/scripts/         Environment setup and syntax checks
server/test/            Automated regression and optional database tests
server/test-support/    Test-only model adapter
server/uploads/         Local runtime uploads, excluded from source distribution
```

## Documentation

- [Run and update commands](RUN_COMMANDS.md)
- [Update report and verification boundaries](docs/UPDATE_REPORT.md)
- [Catalog import and manual shopping checklist](docs/CATALOG_GUIDE.md)
- [Verification results](docs/VERIFICATION_RESULTS.md)
- [Customer/admin/browser/payment acceptance checklist](docs/ACCEPTANCE_CHECKLIST.md)
- [Requirements](docs/PROJECT_REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API_REFERENCE.md)
- [Testing and acceptance](docs/TESTING_GUIDE.md)
- [Future development](docs/FUTURE_DEVELOPMENT.md)
- [Changelog](CHANGELOG.md)

## Database reliability and deployment

Replica-set/sharded MongoDB supports the transaction path. Standalone development databases use shared operation locks and ordered compensations for handled failures. A standalone database cannot provide atomic recovery from a process crash or database outage during rollback; use a replica set for a public store. Callback/IPN writes and administrator cancellation share the same order lock. Checkout and cart mutations share a customer cart lock.

Keep secrets out of Git. The archive intentionally excludes `.git`, `.env`, `.envy`, dependencies and runtime uploads. If credentials from an earlier upload were ever used, rotate them in your own environment; this ZIP does not rewrite your GitHub history. For public release, complete gateway acceptance, durable image storage, backups, monitoring, dependency auditing and operational policies.
