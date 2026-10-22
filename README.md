<p align="center">
  <img src="client/assets/brand/norda-mark.png" alt="Norda logo" width="88" height="88" />
</p>

<h1 align="center">Norda</h1>

<p align="center">
  A full-stack e-commerce application for Bangladesh.<br />
  Product discovery, account-based shopping, checkout, invoices and store administration.
</p>

<p align="center">
  <strong>Version 2.9.0</strong> &nbsp;·&nbsp; HTML · CSS · JavaScript · Node.js · Express · MongoDB
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#implemented-features">Features</a> ·
  <a href="#getting-started">Setup</a> ·
  <a href="#payments">Payments</a> ·
  <a href="#testing">Testing</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

## Overview

Norda brings the customer shopping journey and day-to-day store operations into one application. Visitors explore the catalog; customers manage their own carts, delivery details, orders and invoices; administrators maintain products, inventory and fulfillment.

The application uses a single Express server to serve the HTML/CSS/JavaScript frontend and the `/api` backend. MongoDB stores the commerce data. No frontend build step or separate frontend development server is required.

| Project detail | Current baseline |
|---|---|
| Application version | **2.9.0** |
| Market and currency | Bangladesh · BDT / ৳ |
| Experiences | Public storefront, personal customer dashboard and administrator workspace |
| Included catalog | 24 sample products across 12 categories, with 24 distinct AI-generated product photos |
| Payment modes | Cash on delivery, local mobile/card simulations and a separately configured SSLCOMMERZ integration |
| Default local URL | `http://localhost:5000` |
| Development status | Core commerce, recovery, order operations, SKU variants, coupons, wishlist, inventory tools and editable store content implemented; public-release acceptance remains |

> **Payment status:** the local Mobile Banking/bKash and Card/Bank flows simulate transactions and do not transfer money. The real SSLCOMMERZ integration is implemented, but public merchant sandbox acceptance has not been completed. See [Payments](#payments) and [Roadmap](#roadmap).

## Implemented Features

### Storefront and Product Discovery

- Responsive storefront with shared navigation, footer, AI-generated brand mark, Norda wordmark and transparent tab icon.
- Product browsing with keyword search, category/brand filters, price ranges, pagination and sorting by newest, effective price or rating.
- Product details with image galleries, descriptions, pricing, stock availability and reviews.
- Featured Picks and Recently Added selections that exclude repeated product IDs and cover images across the two sections.
- Regular, discounted, low-stock and sold-out catalog examples.

### Customer Accounts and Dashboard

- Customer registration, sign-in, sign-out and cookie-backed session restoration.
- Profile/name updates and up to 10 saved delivery addresses with add/edit/delete/default actions and a checkout picker.
- Forgot/reset password with expiring one-use links, hashed tokens and session revocation; signup email verification and resend from Profile.
- SMTP account email with a private local preview when developing without SMTP.
- Password changes that verify the current password and invalidate previous sessions.
- A personal dashboard with the signed-in identity, cart quantity, order counts, recent orders, invoice links and delivery details.
- Separate visitor, customer and administrator navigation, with account-change and cached-page refresh guards.
- Owner-scoped access to carts, orders and invoices; customers cannot access another customer's records.

### Cart, Checkout and Orders

- Persistent account-based cart: add products, update quantities, remove items and clear the cart.
- Selected product/quantity continuity through sign-in or registration, with a short-lived selection added once after authentication.
- Server-side price, quantity, stock and archived-product validation.
- Shipping-address validation, saved address details and configurable delivery charges.
- Cash-on-delivery checkout with stock reservation, one order/invoice per checkout key and cart clearing after successful order creation.
- Customer order history, fulfillment/payment statuses and links to printable invoices.
- Invoice snapshots that preserve the recorded items and totals when catalog prices change later.
- Print/save-PDF option through the browser's print dialog.
- Verified-purchase reviews after delivery, rating recalculation and authorized review deletion.

### Payments and Inventory Integrity

- Separate local Mobile Banking/bKash and Card/Bank simulation choices.
- Simulated success, failure and cancellation, plus unfinished-session recovery from My Orders.
- Stock restoration for failed/cancelled local simulations, with repeat-request protection.
- Automatic unpaid reservation expiry and stock release, plus eligible same-order real payment retry that keeps one invoice and the original totals.
- Admin payment review with transaction history, verification, private notes and guarded resolution.
- Customer cancellation requests, whole-order returns after physical receipt, partial monetary refunds and provider/manual refund confirmation.
- SSLCOMMERZ hosted-session initiation, callbacks, IPN handling and server-side transaction validation.
- Explicit review handling for risky or late validated provider payments.
- Shared operation locks, checkout request keys and conditional stock updates to handle overlapping requests.
- MongoDB transactions when available; compensating writes for handled failures on standalone development databases.
- Compact simulated-payment/no-charge information on relevant customer and invoice views; local simulator payments are excluded from administrator revenue.

### Administration

- Product, category and brand management, including search/pagination in management lists.
- Regular/sale price and inventory updates, with stale stock-edit detection.
- Product galleries with up to six images, cover selection, reordering and removal.
- Administrator image uploads: JPEG, PNG, WebP or GIF, up to **5 MB per file**, with file-signature validation.
- Product archiving/restoration that retains historical purchase references.
- Order processing, shipping and delivery; COD payment confirmation and eligible unpaid-order cancellation with stock restoration.
- Invoice register and access to customer/order billing records.
- Dashboard totals, paid revenue excluding local simulations, low-stock products and payment exceptions.
- Order CSV export with date/status filters and spreadsheet-formula protection.

### Coupons, Wishlist and Inventory Tools

- Admin **Coupon center** supports fixed/percentage savings, minimum subtotals, maximum discounts, scheduling, public/private offers and total/per-account limits.
- Checkout calculates discounts from current product/SKU prices on the server. Orders, invoices, confirmation email and CSV reports retain the discount snapshot.
- A successfully created order consumes one coupon use; cancellation, expiry, refunds and payment retry retain that use. Failed order creation rolls it back. One code applies per order.
- Personal wishlist with up to 200 products, save/remove actions, live price/availability and existing cart actions. Variant products require an exact size/color choice.
- Admin **Inventory tools** exports stock CSVs, previews edits and imports existing product/SKU stock and low-stock thresholds with stale-stock checks and durable replay/recovery results.
- Per-SKU low-stock alerts include sold-out options and exclude retired/archived inventory. CSV imports update each product atomically and report conflicts separately.

### Courier, Notifications and Store Content

- Admin **Delivery tracking** records courier, tracking number/link and shipment events; customers view their own tracking history.
- Confirmation, payment, shipment, delivery, cancellation and tracking email use the existing SMTP through a durable retry queue; admin can inspect status/retry failed mail.
- Size/color variants have retained unique SKUs, individual prices/photos and independent stock throughout cart, checkout, cancellation, expiry/retry and return restocking.
- Admin **Store settings** publishes a homepage banner, announcement, support contact, FAQs and delivery/return/privacy/terms text to the storefront and help page.
- Editable delivery charges apply to new checkouts after coupon savings. Existing orders/invoices retain recorded totals.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | HTML5, CSS3 and browser JavaScript |
| API and static hosting | Node.js and Express |
| Persistence | MongoDB and Mongoose |
| Authentication | Bcrypt password hashing, JWT and HTTP-only cookies |
| Request protection | Helmet, CORS allowlist, rate limiting, request sanitization, role/ownership checks and escaped output |
| Product media | Multer, validated local uploads, AI-generated WebP catalog images and PNG/WebP brand assets |
| Tests | Node's built-in test runner, HTTP regression journeys, frontend VM checks and opt-in native MongoDB tests |
| Automation | GitHub Actions verification, dependency audit and MongoDB topology test matrix |

## Requirements

| Requirement | Details |
|---|---|
| Node.js | **22 or newer**, as declared in `server/package.json`; recorded release checks used Node.js 24.19.0 |
| npm | Available with the Node.js installation; use the committed server lockfile with `npm ci` |
| MongoDB | A running instance reachable through `MONGO_URI`; native release verification used MongoDB 7.0.45 |
| Database topology | Standalone supported for local development; use a replica set for public-store transaction guarantees |
| Browser | JavaScript enabled; manual desktop/mobile acceptance is still required |
| Git | Needed for repository-based contribution; optional when running an extracted ZIP |
| SMTP service | Required for actual account/order inbox delivery; private file previews are available in development |
| External payment account | Required only for actual SSLCOMMERZ hosted checkout; unnecessary for COD or the local simulator |

Norda defaults to port **5000**. Startup rejects ports **3000** and **3002**, which are reserved for the existing GitStack/Gitea services. Docker is optional; this application does not require those services or their PostgreSQL databases.

## Getting Started

### 1. Install the Backend Dependencies

Clone/download the repository or extract the release ZIP, then open the project root containing `client/` and `server/`:

```bash
cd server
npm ci
npm run setup
```

**Run all npm commands below from `server/`.** The setup script creates `server/.env` with a unique JWT secret and seed-admin password when that file does not exist. It preserves an existing `.env`.

### 2. Configure MongoDB

Open `server/.env` in an editor. Keep the generated secret/password values and set the correct database URI. A standard local configuration is:

```dotenv
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/norda_db
```

If MongoDB is exposed on a different host port, use that port. For example, a Docker mapping from host `27018` to container `27017` requires:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27018/norda_db
```

MongoDB must be running before seeding or starting the API. Existing installations should retain their working URI and database name, including a working MongoDB Atlas URI. The application does not require replacing an existing Atlas/shared database with a local database.

### 3. Initialize a Fresh Database and Start

For a new installation:

```bash
npm run seed
npm run verify
npm run dev
```

The full seed creates the administrator when the configured account does not already exist, then imports the sample catalog. It preserves an existing administrator's password. A new seed-admin password must contain at least 12 characters.

Open **[http://localhost:5000](http://localhost:5000)**. Express serves the website and API together. Stop the process with **Ctrl+C**; use `npm start` to run without Node's development watcher.

### 4. Sign In and Explore

| Destination | Path | Access |
|---|---|---|
| Storefront | `/index.html` | Public |
| Product catalog | `/products.html` | Public |
| Customer dashboard | `/dashboard.html` | Signed-in customer |
| Cart and checkout | `/cart.html`, `/checkout.html` | Signed-in customer |
| Orders and invoices | `/orders.html`, `/invoice.html?orderId=…` | Owner; administrators may access permitted records |
| Wishlist and offers | `/wishlist.html`, `/coupons.html` | Wishlist requires sign-in; offers are public |
| Help and policies | `/help.html` | Public |
| Admin workspace | `/admin/dashboard.html` | Administrator |
| Coupon, inventory and settings tools | `/admin/coupons.html`, `/admin/inventory.html`, `/admin/store-settings.html` | Administrator |
| API health | `/api/health` | Public |

Register normally to create a customer. For administrator access, use the private `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your environment after seeding. No shared administrator password is bundled. A normal customer sign-in opens the personal dashboard; a pending shopping destination takes priority.

### Updating an Existing Installation

Preserve your working environment, uploaded images, database and Git history when copying updated source. The v2.9.0 update requires **no setup, reseed or manual database migration**. Retain your working local/Atlas connection and later laptop-only SMTP settings:

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

To import missing catalog samples separately:

```bash
npm run seed:catalog
```

The catalog-only import preserves administrator credentials, existing prices, stock, custom uploads, product IDs and orders. It adds missing samples and refreshes only missing/known starter artwork. Further instructions: [run and update guide](RUN_COMMANDS.md).

## Configuration

The complete template is [`server/.env.example`](server/.env.example). Configure private values in `server/.env` or the deployment environment.

| Variable | Purpose / default |
|---|---|
| `PORT` | Application port; `5000` |
| `NODE_ENV` | Local development: `development`; public deployment: `production` |
| `MONGO_URI` | Required MongoDB connection string; retain an existing working URI |
| `JWT_SECRET` | Required unique secret, at least 32 characters; generated by setup for fresh installs |
| `JWT_EXPIRES_IN` | JWT lifetime; `7d` |
| `AUTH_COOKIE_DAYS` | Cookie lifetime; `7` days |
| `AUTH_RETURN_TOKEN` | Optional token response for custom development clients; normally `false` |
| `CLIENT_URL` | Comma-separated permitted browser origins; configure explicitly for production |
| `CLIENT_APP_URL` | Storefront base URL; local default `http://localhost:5000` |
| `SERVER_URL` | API/callback base URL; local default `http://localhost:5000` |
| `FREE_SHIPPING_THRESHOLD` | Free delivery from this BDT subtotal; `5000` |
| `FLAT_SHIPPING_FEE` | Delivery charge below that threshold; `120` BDT |
| `PAYMENT_DEMO_ENABLED` | Local simulator enabled outside production unless set to `false`; always disabled in production |
| `SSLCOMMERZ_STORE_ID` | Private merchant ID; optional until using the actual provider |
| `SSLCOMMERZ_STORE_PASSWORD` | Private merchant password; optional until using the actual provider |
| `SSLCOMMERZ_IS_LIVE` | Provider environment; `false` for sandbox |
| `MAIL_TRANSPORT` | `auto`, `smtp` or private development `file` delivery |
| `MAIL_FROM` | Verified sender address/name for SMTP |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Existing mail server and TLS configuration |
| `SMTP_USER`, `SMTP_PASS` | Private SMTP authentication; retain working values |
| `PAYMENT_RESERVATION_MINUTES` | Optional unpaid online reservation window; default 30 minutes |
| `RESERVATION_SWEEP_SECONDS` | Optional expiry worker interval; default 30 seconds |
| `ADMIN_NAME` | Display name for a newly seeded administrator |
| `ADMIN_EMAIL` | Email for the seed administrator |
| `ADMIN_PASSWORD` | Private password for creating a seed administrator; minimum 12 characters |

The currency is BDT. Without a saved store override, delivery defaults to **৳120 below ৳5,000** and is free from **৳5,000**. Admin **Store settings** can change these amounts; the free-delivery threshold uses the product subtotal after coupons. Existing orders keep their original charges. Keep credentials and runtime uploads out of commits; preserve existing working values during updates.

## Payments

| Mode | Current behavior | Requirements |
|---|---|---|
| Cash on delivery | Creates an unpaid order/invoice; administrator confirms payment or delivery through the COD workflow | MongoDB and an authenticated customer |
| Mobile Banking/bKash simulation | Local successful/failed/cancelled payment outcomes | Development environment; no merchant credentials |
| Card/Bank simulation | Separate local card/bank payment flow with the same outcome safeguards | Development environment; no merchant credentials |
| SSLCOMMERZ hosted checkout | Session initiation, notifications and server validation are implemented; public merchant acceptance remains pending | Merchant credentials and reachable callback/client configuration |

### Local Simulator

Select Mobile Banking/bKash or Card/Bank at checkout. The payment page requests no real financial information and offers explicit test outcomes.

| Action | Recorded result |
|---|---|
| Begin payment | One pending order/invoice; stock reserved |
| Complete a successful simulation | Simulated payment marked paid; order moves to processing; invoice synchronized |
| Fail or cancel the simulation | Order cancelled; payment/invoice reflect the outcome; stock restored once |
| Leave the page | Resume/cancel through My Orders until automatic reservation expiry releases stock |
| Repeat a completed request | Existing result preserved; no duplicate invoice or stock update |

The simulator uses inventory in the configured development database. Successful simulations retain their stock reservation; unfinished unpaid reservations expire after 30 minutes by default, with one-time stock restoration and a synchronized invoice. Use development inventory for simulations. They are excluded from administrator revenue and include compact no-charge information.

The simulator is always disabled when `NODE_ENV=production`, including when `PAYMENT_DEMO_ENABLED=true`. Existing internal `demo` identifiers and URLs remain compatible with earlier versions.

### Actual SSLCOMMERZ Integration

Configure merchant ID/password, keep `SSLCOMMERZ_IS_LIVE=false` for sandbox testing, and use publicly reachable HTTPS `SERVER_URL` and `CLIENT_APP_URL` values for acceptance. Configure the provider's IPN listener to:

```text
https://your-api-host/api/payments/sslcommerz/ipn
```

The provider option appears when the application's configuration checks pass. Successful notifications require server validation of transaction details; a configuration flag or browser return URL does not establish payment success. Risky or valid late payments after cancellation enter review without reopening cancelled fulfillment or consuming restored stock again.

Failed/abandoned provider attempts remain visible. Eligible orders can retry/resume real payment on the same order and invoice; expired orders re-check stock. Admin review, cancellation requests and whole-order return/refund workflows are implemented. Gateway refunds wait for provider confirmation; cash refunds require a repayment reference. A successful local simulation does not verify SSLCOMMERZ or direct bKash connectivity.

See the [payment guide](docs/DEMO_PAYMENTS.md) and [acceptance checklist](docs/ACCEPTANCE_CHECKLIST.md).

## Data and Media

The seed provides **24 illustrative products, 12 categories and 24 original AI-generated 800×800 WebP photos**. Categories cover electronics, fashion, home/kitchen, sports, books, beauty, bags/travel, furniture/lighting, stationery, toys/games, groceries and garden/living.

Brands, descriptions, prices and quantities are sample data. Replace them with verified merchant inventory before actual sales. An intentionally sold-out organizer and several low-stock products support availability testing. The administrator can add real products through the UI without editing seed files.

Product and invoice history remain linked when products are archived. Uploads currently live in `server/uploads/`; durable production media storage remains on the roadmap. Brand asset provenance and prompts are recorded in [`docs/BRANDING.md`](docs/BRANDING.md); catalog prompts are in [`AI_ASSETS.json`](client/assets/products/photos/AI_ASSETS.json).

## Architecture and Project Structure

The browser uses the same Express origin for pages and `/api` requests. Routes apply authentication/role checks, controllers handle HTTP input/output, services coordinate commerce writes and gateway operations, and Mongoose models persist data in MongoDB. Payment and fulfillment states are tracked separately.

On replica sets, database units use transactions. Standalone local MongoDB uses ordered compensations for handled errors; this does not provide atomic recovery across a process crash or database outage. Cart/checkout and payment/cancellation operations share database-backed locks.

| Path | Responsibility |
|---|---|
| `client/` | Storefront and customer HTML pages |
| `client/admin/` | Administrator pages and browser scripts |
| `client/js/` | API client, account/cart/checkout flows and shared rendering |
| `client/css/` | Storefront, admin, dashboard and branding styles |
| `client/assets/` | Brand identity, product photography and illustrations |
| `server/server.js` | Environment checks, MongoDB connection and server startup |
| `server/app.js` | Middleware, routes and static website hosting |
| `server/routes/`, `server/controllers/` | API routing and HTTP handlers |
| `server/services/` | Orders, invoices, payments, locks and coordinated database writes |
| `server/models/` | Accounts, catalog, variants, commerce/operations ledgers, email outbox, coupons/redemptions, wishlists, inventory imports, settings and locks |
| `server/middleware/`, `server/utils/` | Authorization, upload/error handling and validation helpers |
| `server/seed/`, `server/scripts/` | Sample catalog, setup, preflight and syntax checks |
| `server/test/`, `server/test-support/` | Automated tests and isolated test adapters |
| `server/uploads/` | Local runtime media; excluded from version control except its placeholder |
| `docs/` | Requirements, architecture, API, acceptance and release notes |
| `.github/workflows/verify.yml` | Verification, dependency audit and native MongoDB CI configuration |

## API Overview

API base path: **`/api`**. JSON is used for normal requests; uploads use multipart form data and reports return CSV. Normal browser authentication uses the `norda_token` HTTP-only cookie.

| Area | Principal endpoints |
|---|---|
| Health and store settings | `GET /health`, `GET /store/config` |
| Authentication | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` |
| Profile and recovery | `GET/PUT /auth/profile`, forgot/reset password, verification and saved-address routes |
| Catalog | `GET /products`, `GET /products/:id`, `GET /categories`, `GET /brands` |
| Admin catalog | Protected create/update/archive/restore operations on products; category and brand management |
| Cart | `GET/POST/DELETE /cart`, `PUT/DELETE /cart/:itemId` |
| Customer orders | `POST /orders` for COD, `GET /orders/my`, `GET /orders/:id` |
| Admin orders | `GET /orders`, `PUT /orders/:id/status` |
| Invoices | `GET /invoices/my`, `GET /invoices/order/:orderId`, `GET /invoices/:id`; admin invoice listing |
| Payment availability | `GET /payments/config` |
| Local payment | `POST /payments/demo/initiate`, `GET /payments/demo/:orderId`, `POST /payments/demo/:orderId/complete` |
| SSLCOMMERZ | `POST /payments/sslcommerz/initiate` and `POST` success/fail/cancel/IPN notifications |
| Reviews and uploads | `GET /reviews/product/:productId`, `POST /reviews`, `DELETE /reviews/:id`, `POST /uploads` |
| Coupons | Public `GET /coupons`, protected `POST /coupons/preview`, admin `GET/POST/PUT /admin/coupons` |
| Wishlist | Protected `GET /wishlist`, `GET /wishlist/ids`, `PUT/DELETE /wishlist/:productId` |
| Inventory tools | Admin list/export, preview/import and recorded import-result endpoints |
| Published settings | Public `GET /store/config`, admin `GET/PUT /admin/store-settings` |
| Operations and delivery | Customer requests/tracking; admin review, returns/refunds, shipment and email queue routes |
| Administration reports | `GET /admin/dashboard-summary`, `GET /admin/reports/orders.csv` |

Protected endpoints enforce sign-in, role and ownership as appropriate. Invalid input, unauthorized access and conflicting stock/state changes return structured errors. See [`server/routes/`](server/routes/) for the current route definitions and [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) for detailed baseline examples.

## Commands

All commands run from `server/`.

| Command | Purpose |
|---|---|
| `npm ci` | Install dependencies from the committed lockfile |
| `npm run setup` | Create `.env` only when absent |
| `npm run seed` | Initialize/preserve the configured administrator and import sample catalog |
| `npm run seed:catalog` | Import catalog samples without changing administrator credentials |
| `npm run acceptance:preflight` | Read-only environment/database/configuration check |
| `npm run dev` | Start Node's built-in development watcher |
| `npm start` | Start a regular Node process using the configured environment |
| `npm run check` | Check JavaScript syntax |
| `npm test` | Run the default automated test suite |
| `npm run verify` | Run syntax checks and default tests |
| `npm run test:integration` | Run opt-in native MongoDB tests with an explicit test URI |
| `npm audit` | Inspect the dependency vulnerability report |
| `npm run mail:check` | Check SMTP/private preview configuration |
| `npm run mail:preview -- email@example.com` | Read private development account mail |
| `npm run mail:orders -- email@example.com` | Read private development order mail |
| `npm run reservations:expire` | Run a one-shot reservation expiry sweep |

## Testing

### Default Verification

```bash
npm run verify
```

Coverage includes business rules, injected write failures, HTTP authentication/catalog/cart/order journeys, payment-state protection, uploads, frontend VM rendering and static asset/reference checks.

Recorded release evidence, as of **22 October 2026**:

| Check | Recorded result |
|---|---|
| JavaScript syntax, v2.9.0 | **180 files passed** |
| Default suite, v2.9.0 | **331 passed, 0 failed, 7 native entry points skipped** without an explicit MongoDB test URI |
| Native standalone, v2.9.0 | **112 passed**, compensation path |
| Native single-member replica set, v2.9.0 | **112 passed**, transaction path |
| Dependencies | Release audit: **0 vulnerabilities**; dependency versions retained |
| Frontend | VM behavior, safe rendering, state guards and all 33 pages/local resources checked |
| Browser/mobile/keyboard/print | Target-device visual acceptance remains manual; browser tooling could not complete the live check |
| Public SSLCOMMERZ/SMTP/carrier | Actual merchant callbacks/refund settlement, inbox placement and courier-provider acceptance remain environment-specific |

Tests cover current and previous commerce flows, coupon races/rollback/discounted returns, owner-scoped wishlists, CSV preview/import/replay/interruption/conflict handling, published settings and frontend behavior. No owner database, real inbox, courier or money is used. See [verification results](docs/VERIFICATION_RESULTS.md) for the exact scope.

### Native MongoDB Verification

Use a dedicated non-production test server. For standalone MongoDB exposed on host port `27018`:

```bash
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

For a replica set, supply its URI and use `NORDA_EXPECT_TRANSACTIONS=1`. Each entry point creates a random `norda_test_*` database and drops only that test database; permission to create/drop those fixtures is required. These tests use their explicit test URI rather than the application's `MONGO_URI`.

The GitHub Actions workflow is configured for Node.js 22, default verification, dependency audit, and native MongoDB 7 standalone/replica-set jobs. Provider regression tests use controlled outbound responses rather than actual merchant transactions.

### Manual Review

Follow the [acceptance checklist](docs/ACCEPTANCE_CHECKLIST.md) for the complete customer/admin journey, two-account isolation, payment outcomes, keyboard navigation, responsive layouts and invoice printing. Check the website through Express rather than opening HTML files directly. If an old tab icon remains after updating, refresh with **Ctrl+Shift+R**.

## Roadmap

These items are planned work, separate from the implemented features above. Development will proceed one feature at a time, followed by testing and review.

### Release Acceptance

- [ ] Complete browser/mobile, keyboard and printed-invoice acceptance.
- [ ] Repeat customer/admin shopping journeys in the target environment.
- [ ] Complete public SSLCOMMERZ sandbox success/failure/cancel/repeated callback/IPN acceptance before accepting real online payments.
- [ ] Replace sample catalog content with actual merchant inventory and store information before sales.

### Completed Development Phases

- [x] Forgot/reset password, email verification and multiple delivery addresses.
- [x] Reservation expiry/stock release and eligible same-order real payment retry.
- [x] Admin payment review, customer cancellation requests and whole-order return/refund workflows.
- [x] Store-entered courier tracking, shipment history and customer tracking view.
- [x] Queued order/payment/shipping/delivery/cancellation email with retries.
- [x] Size/color/SKU variants with independent stock, prices and photos.
- [x] Coupons/promo codes and account wishlists.
- [x] Product/SKU stock CSV tools and per-option low-stock alerts.
- [x] Editable storefront banner, contact, FAQs, policies and delivery pricing.

### Next Product and Operations Work

- [ ] Advanced sales/product/SKU reporting beyond the existing summary and CSV.
- [ ] Carrier API booking, rates, labels and authenticated tracking automation.
- [ ] Item-level returns/exchanges, configurable return windows and credit notes.
- [ ] Refund-specific email, SMS, bounce monitoring and notification preferences.
- [ ] Customer/staff management and stronger device/session controls.
- [ ] Optional full guest cart/checkout, comparison and recently viewed products.
- [ ] SEO metadata, sitemap and product structured data.
- [ ] Deployment/HTTPS, durable media storage and unused-image cleanup.
- [ ] Database/media backups, restore drills, monitoring and operational alerts.
- [ ] Release automation, rollback planning and ongoing dependency auditing.

Carrier events are currently store-entered. Return requests currently cover whole orders; partial monetary refunds are supported. Variant products require an exact option for cart actions. See [the new feature guide](docs/COMMERCE_TOOLS.md) for coupon usage rules, CSV recovery and settings behavior.

## Documentation

| Document | Purpose |
|---|---|
| [Coupons, wishlist, inventory and store settings](docs/COMMERCE_TOOLS.md) | Setup, policies, API and acceptance for v2.9.0 |
| [Account recovery and addresses](docs/ACCOUNT_RECOVERY.md) | Email, reset/verification and address book |
| [Checkout recovery](docs/CHECKOUT_RECOVERY.md) | Reservation expiry and same-order retry |
| [Order operations](docs/ORDER_OPERATIONS.md) | Payment review, cancellations, returns and refunds |
| [Delivery and notifications](docs/DELIVERY_NOTIFICATIONS.md) | Courier tracking and order email |
| [Product variants](docs/PRODUCT_VARIANTS.md) | Size/color SKU inventory |
| [Run and update commands](RUN_COMMANDS.md) | Local startup and preserving an existing installation |
| [Catalog guide](docs/CATALOG_GUIDE.md) | Sample inventory, import behavior and adding products |
| [Payment guide](docs/DEMO_PAYMENTS.md) | Local simulation, states and real-provider boundaries |
| [Branding](docs/BRANDING.md) | AI logo assets, exact prompt and presentation changes |
| [Verification results](docs/VERIFICATION_RESULTS.md) | Latest recorded release checks |
| [Acceptance checklist](docs/ACCEPTANCE_CHECKLIST.md) | Customer/admin/browser/payment review matrix |
| [Project requirements](docs/PROJECT_REQUIREMENTS.md) | Original functional requirements baseline |
| [Architecture](docs/ARCHITECTURE.md) | Components, data and reliability design |
| [API reference](docs/API_REFERENCE.md) | Baseline endpoint examples; current routes are in `server/routes/` |
| [Testing guide](docs/TESTING_GUIDE.md) | Test procedures and manual scenarios |
| [Future development](docs/FUTURE_DEVELOPMENT.md) | Development phases and planned capabilities |
| [Changelog](CHANGELOG.md) | Version history |

Historical sections remain labeled by release. This README, the v2.9.0 feature guide and the current verification report describe the latest application status.

## Contributing

1. Start from the agreed baseline and create a branch for one feature or fix.
2. Keep existing working behavior, private environment values, uploaded media and database records intact.
3. Run `npm run verify`; use isolated native tests when changing persistence/payment behavior.
4. Update relevant documentation and complete the acceptance checks affected by the change.
5. Open a pull request describing the behavior, verification and any remaining limits.

## License

The backend package declares **ISC** in [`server/package.json`](server/package.json). A standalone root license document is not included in the current version.
