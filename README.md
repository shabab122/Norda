# Norda

A full-stack e-commerce application for Bangladesh, built with HTML, CSS, browser JavaScript, Node.js, Express and MongoDB. Customers browse the catalog, keep a stock-aware cart, check out using cash on delivery or SSLCOMMERZ, follow orders, print invoices and review delivered purchases. Administrators manage the catalog, media, orders, invoices and reports.

**Current version: 2.1.0 — UI and commerce reliability update.**

## What's improved

- A consistent storefront and operations workspace: warm neutral surfaces, forest-green accents, clearer typography, responsive product cards and visible mobile account actions.
- Multi-image product editing with cover selection, reordering and removal; searchable, paginated administration.
- Discount-aware price sorting, honest delivery information and illustrated sample catalog images.
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
| Payments | Cash on delivery and SSLCOMMERZ hosted checkout |
| Images | Validated local uploads and included sample SVG illustrations |

## Run locally

Install Node.js 18+ and run MongoDB. This update was checked with Node.js 24.

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

NORDA defaults to port **5000**. Ports **3000** and **3002** are rejected at startup because they are reserved for GitStack/Gitea. NORDA uses its own MongoDB database; it does not use GitStack's PostgreSQL/Gitea services.

**Existing installations:** retain your current `.env`, `MONGO_URI` and `server/uploads` when applying the update. The new-install template uses `norda_db`; an existing database URI is not automatically migrated or changed. The seed script preserves existing products and only fills missing sample brand links/images.

## Payments

COD is available without gateway credentials. To enable online checkout, set these in the server's private environment:

```dotenv
SSLCOMMERZ_STORE_ID=your_sandbox_store_id
SSLCOMMERZ_STORE_PASSWORD=your_sandbox_store_password
SSLCOMMERZ_IS_LIVE=false
SERVER_URL=https://your-public-api.example
CLIENT_APP_URL=https://your-storefront.example
```

The gateway must reach the callback/IPN URLs. Success notifications are checked through the gateway validation API. A validated payment arriving after order cancellation remains a **payment review**; it does not reopen fulfillment or reserve inventory again. Review transactions need operational resolution before fulfillment/refund changes.

Failed/abandoned hosted payments remain visible for administrator review and eligible cancellation. Customer payment retry, reservation expiry and gateway refund automation remain future development items.

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
- [Requirements](docs/PROJECT_REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API_REFERENCE.md)
- [Testing and acceptance](docs/TESTING_GUIDE.md)
- [Future development](docs/FUTURE_DEVELOPMENT.md)
- [Changelog](CHANGELOG.md)

## Database reliability and deployment

Replica-set/sharded MongoDB supports the transaction path. Standalone development databases use shared operation locks and ordered compensations for handled failures. A standalone database cannot provide atomic recovery from a process crash or database outage during rollback; use a replica set for a public store. Callback/IPN writes and administrator cancellation share the same order lock. Checkout and cart mutations share a customer cart lock.

Keep secrets out of Git. The archive intentionally excludes `.git`, `.env`, `.envy`, dependencies and runtime uploads. If credentials from an earlier upload were ever used, rotate them in your own environment; this ZIP does not rewrite your GitHub history. For public release, complete gateway acceptance, durable image storage, backups, monitoring, dependency auditing and operational policies.
