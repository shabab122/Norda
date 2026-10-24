<p align="center">
  <img src="client/assets/brand/norda-mark.png" alt="Norda logo" width="88" height="88" />
</p>

<h1 align="center">Norda</h1>

<p align="center">
  A full-stack e-commerce application for Bangladesh.<br />
  Product discovery, guest/account shopping, payments, fulfillment and store administration.
</p>

<p align="center">
  <strong>Version 2.14.3 · Local Acceptance</strong> &nbsp;·&nbsp; HTML · CSS · JavaScript · Node.js · Express · MongoDB
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

Norda brings the customer shopping journey and day-to-day store operations into one application. Visitors explore the catalog; guests and customers manage their own carts, delivery details, orders and invoices; administrators maintain products, inventory and fulfillment.

The application uses a single Express server to serve the HTML/CSS/JavaScript frontend and the `/api` backend. MongoDB stores the commerce data. No frontend build step or separate frontend development server is required.

| Project detail | Current baseline |
|---|---|
| Application version | **2.14.3** |
| Market and currency | Bangladesh · BDT / ৳ |
| Experiences | Public storefront, personal customer dashboard and scoped administrator/staff workspaces |
| Included catalog | 24 sample products across 12 categories, with 24 distinct AI-generated product photos |
| Payment modes | Cash on delivery, local mobile/card simulations and a separately configured SSLCOMMERZ integration |
| Default local URL | `http://localhost:5000` |
| Development status | Fixed localhost scope; existing commerce retained, local connector and email acceptance tools included; visible/inbox acceptance recorded separately |

> **Payment status:** the local Mobile Banking/bKash and Card/Bank flows simulate transactions and do not transfer money. The real SSLCOMMERZ integration is implemented, but public merchant sandbox acceptance has not been completed. See [Payments](#payments) and [Roadmap](#roadmap).

## Local Final Release

**2.14.3** builds directly on delivered **2.14.2 Local Final**. It adds a runnable private localhost reverse-pickup/statement connector demonstration, explicit SMTP delivery probes and receipt recording, and focused keyboard/mobile/print refinements. The prior search/password, guest/admin and commerce features are retained.

The connector keeps stable booking references and immutable statement pages through restart. Demo stages require explicit control, no real carrier label is invented, and demo statements can be previewed/acknowledged without writing a financial ledger. Existing merchant HTTPS mode and background jobs remain separated from local demo mode.

Read [local acceptance](docs/LOCAL_ACCEPTANCE.md), [connector commands](docs/LOCAL_CONNECTOR.md) and [the shopping/admin guide](docs/SHOPPING_AND_ADMIN_GUIDE.md). Actual inbox receipt and visible browser/print inspection require observation in the owner's environment; they are not certified by SMTP acceptance or controlled DOM tests. The owner's three [reserved integrations](docs/reserved/README.md) remain deferred, with no new feature phase assigned.

## Implemented Features

### Storefront and Product Discovery

- Responsive storefront with shared navigation, footer, AI-generated brand mark, Norda wordmark and transparent tab icon.
- Product browsing with product/category/brand/SKU keyword search, category/brand filters, price ranges, pagination and sorting by newest, effective price or rating.
- Product details with image galleries, descriptions, pricing, stock availability and reviews.
- Featured Picks and Recently Added selections that exclude repeated product IDs and cover images across the two sections.
- Regular, discounted, low-stock and sold-out catalog examples.

### Customer Accounts and Dashboard

- Customer registration, sign-in, sign-out and cookie-backed session restoration.
- Accessible password eye controls on static and dynamically rendered password fields; no password submission from the toggle.
- Profile/name updates and up to 10 saved delivery addresses with add/edit/delete/default actions and a checkout picker.
- Forgot/reset password with expiring one-use links, hashed tokens and session revocation; signup email verification and resend from Profile.
- SMTP account email with a private local preview when developing without SMTP.
- Password changes that verify the current password and invalidate previous sessions.
- A personal dashboard with the signed-in identity, cart quantity, order counts, recent orders, invoice links and delivery details.
- Separate visitor, customer and administrator navigation, with account-change and cached-page refresh guards.
- Owner-scoped access to carts, orders and invoices; customers cannot access another customer's records.

### Reporting, Team Access and Devices

- Daily/monthly Dhaka sales reports: paid-order cohorts, product/SKU rankings, coupon savings, confirmed refunds/net revenue and CSV export.
- Customer search and purchase history; administrator-managed existing staff accounts with nine explicit operational permissions and access-change audit.
- Staff workspace/navigation that exposes assigned tools; current database permissions enforced on every API request.
- Active device sessions, individual sign-out and sign-out-other-devices with cookie rotation and invalidation of unseen old JWTs.
- Profile email preferences for order/return/refund messages; security emails remain enabled. Separate provider delivery/bounce/complaint history and an optional signed delivery webhook.

### Item Returns and Exchanges

- Selected purchased lines/quantities with stable coupon-paisa allocation, owner guards and prevention of overlapping whole-order returns.
- Configurable return windows snapshot on new orders; approved refund holds release only after physical receipt and per-SKU restock decisions.
- Owner-protected printable credit notes; confirmed refund success synchronizes the case, original invoice refund summary and credit note without rewriting original totals.
- Same-product or cross-product/variant exchanges reserve replacement stock on approval. Higher-price adjustments use separate verified payments/receipts; lower-price adjustments release held refunds after complete receipt. Equal-price exchanges remain available.
- Reverse pickup requests, confirmed carrier booking/history and partial physical receipts with independently inspected restock quantities; original invoices remain unchanged.
- Pending/unknown refund results block duplicate payment submission; confirmed failures can retry on the same received case and credit note.

### Cart, Checkout and Orders

- Persistent registered or private guest cart: add products/exact variants, update quantities, remove items and clear the cart.
- Guest COD/configured online checkout, billing identity snapshots, one-use emailed access recovery, safe cart merging and verified-email account linking.
- Always-discoverable guest tracking/recovery, explicit order stages and per-parcel progress; guest invoice/tracking remain separate from a signed-in member cart/account.
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

### Local Operations and Email Acceptance

- Optional private localhost connector with reference-safe booking/query/cancel, durable atomic state, explicit demonstration stages and immutable cursor pages.
- Server-enforced demo/live mode separation; demo statement preview/acknowledgement cannot create reconciliation ledger entries or transfer funds.
- Explicit single-recipient SMTP probe, private receipt, operator-observed Inbox/Spam confirmation and clear file-preview diagnostics; remote authenticated SMTP requires TLS.
- The three deferred integrations have dedicated reference folders under `docs/reserved/`. Existing production/provider code and credentials are retained.

### Courier API, SEO, Cloud Media and Operations

- Optional eCourier API booking, assigned package charges, trusted PDF labels and automatic tracking with delivery-exception review.
- Durable one-booking intents and same-reference timeout recovery; carrier pickup/delivery reuses existing order, COD, invoice and notification logic.
- Automatic booking is opt-in with an activation cutoff and merchant package/address/payment requirements. Existing manual tracking remains available for orders without an API parcel.
- Product-specific metadata, canonical URLs, Open Graph, safe Product/variant JSON-LD, robots directives and paginated public sitemaps in initial server responses.
- Optional server-authenticated Cloudinary uploads, legacy-URL-preserving migration and explicit reference-checked unused-media cleanup.
- AES-256-GCM encrypted BSON/index/local/cloud-media backups, authenticated verification and restore into a new isolated database/media directory.
- Shared maintenance leases, optional scheduled backups, request IDs/redacted error events, readiness checks, system status and optional SMTP/HTTPS operational alerts.
- Three scoped tools: **Courier API**, **Media library** and **System health**. See [setup, provider limits and recovery procedures](docs/PRODUCTION_TOOLS.md).

### Releases, Team Security and Warehouse Inventory

- Optional Docker/Caddy public HTTPS deployment, persistent data and process restart, isolated staging, GitHub deployment workflow and health-checked application rollback.
- Private S3-compatible replication of encrypted archives, same-key uncertainty recovery, byte-verified readback, guarded retention and isolated scheduled restore drills.
- Independent uptime checks from GitHub-hosted Actions or another host, persistent outage/recovery state and optional webhook/SMTP alerts without application MongoDB.
- Full-admin staff invitations with expiring one-use links, existing-account ownership checks, new staff acceptance, revoke/resend and access audit.
- Optional authenticator TOTP MFA with encrypted secrets, hashed one-use recovery codes, bounded sign-in challenges and server-verified device sessions. New invited staff can be required to enroll; existing credentials remain unchanged.
- Previewed new-product/SKU CSV creation, per-warehouse ledger balances, audited/replayed transfers and count adjustments, archive guards and opt-in low-stock email queues.
- Online checkout keeps its previous stock source by default. Opt-in fulfillment rules make selected warehouses saleable, allocate exact SKU sources and split parcels with customer tracking. Cancellation, expiry, retry/review and COD delivery preserve warehouse/invoice consistency.
- See [release, recovery, MFA and inventory setup](docs/RELEASE_AUTOMATION.md). Owner host/provider configuration and live acceptance remain necessary before activation.

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

### Settlement, Guest Shopping and Fulfillment — 2.13

- Reviewed gateway/COD/exchange/refund statement CSV import, fees/net totals, partial remittances, exception-resolution audit and duplicate protection.
- Price-difference exchange adjustments and printable receipts, exact SSLCOMMERZ validation or actual manual receipts, lower-price refund/credit notes and dispatch funding guards.
- Reverse collections with confirmed carrier references and partial item receipts; only physically inspected quantities are restocked.
- Full guest cart/checkout, recovery through an expiring private email link, one-time cart merge and order linking to the matching verified account.
- Priority warehouse allocation, per-SKU splitting, parcel history/tracking and all-parcels-delivered COD confirmation. Expired checkout recovery keeps the original source plan.
- Verified-customer, exact-option back-in-stock subscriptions with durable SMTP/file queues, retry/backoff and unsubscribe.
- See [workflows, permissions, upgrade and provider boundaries](docs/COMMERCE_EXPANSION.md). The 2.13 manual workflows remain available. In 2.14, configured merchant feeds and reverse booking can run automatically with explicit opt-in; statement imports never authenticate payment or transfer money.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | HTML5, CSS3 and browser JavaScript |
| API and static hosting | Node.js and Express |
| Persistence | MongoDB and Mongoose |
| Authentication | Bcrypt password hashing, JWT and HTTP-only cookies |
| Request protection | Helmet, CORS allowlist, rate limiting, request sanitization, role/ownership checks and escaped output |
| Product media | Multer, validated local/optional Cloudinary uploads, AI-generated catalog and brand assets |
| Tests | Node's built-in test runner, HTTP regression journeys, frontend VM checks and opt-in native MongoDB tests |
| Automation | GitHub Actions verification, dependency audit, MongoDB topology tests and optional courier/backup/alert workers |

## Requirements

| Requirement | Details |
|---|---|
| Node.js | **22 or newer**, as declared in `server/package.json`; recorded release checks used Node.js 24.22.1 |
| npm | Available with the Node.js installation; use the committed server lockfile with `npm ci` |
| MongoDB | A running instance reachable through `MONGO_URI`; native release verification used MongoDB 7.0.45 |
| Database topology | Standalone supported for local development; use a replica set for public-store transaction guarantees |
| Browser | JavaScript enabled; manual desktop/mobile acceptance is still required |
| Git | Needed for repository-based contribution; optional when running an extracted ZIP |
| SMTP service | Required for actual account/order inbox delivery; private file previews are available in development |
| Optional deployment | Dedicated Docker/Compose VM, public DNS/HTTPS and pinned SSH/GitHub Environment configuration; separate staging database/host |
| Optional MFA/off-host recovery | Separate private MFA and backup keys, S3-compatible account and isolated drill permissions; all shared app servers must be upgraded |
| External payment account | Required only for actual SSLCOMMERZ hosted checkout; unnecessary for COD or the local simulator |
| Optional courier/cloud accounts | eCourier merchant sandbox/live credentials and Cloudinary credentials only when activating those integrations |
| Backup storage/key | Private disk space and a separate 32-byte base64 key; secure off-host copies and retention are an operator policy |
| Public SEO/alerts | Final HTTPS origin for indexing; existing SMTP or an HTTPS alert receiver for external notifications |

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
| Cart and checkout | `/cart.html`, `/checkout.html` | Private guest or signed-in customer |
| Guest order access | `/guest-orders.html` | Private browser session / one-use email recovery |
| Customer availability alerts | `/stock-alerts.html` | Registered account; verified email to subscribe |
| Exchange payment and return pickup | `/exchange-payment.html?id=…`, `/return-pickups.html?orderId=…` | Purchasing account/guest |
| Settlement / exchange adjustments | `/admin/settlements.html`, `/admin/exchange-payments.html` | Payment staff/admin |
| Warehouse fulfillment / return collections | `/admin/fulfillment.html`, `/admin/return-pickups.html` | Scoped inventory/order staff/admin |
| Orders and invoices | `/orders.html`, `/invoice.html?orderId=…` | Owner; administrators may access permitted records |
| Wishlist and offers | `/wishlist.html`, `/coupons.html` | Wishlist requires sign-in; offers are public |
| Help and policies | `/help.html` | Public |
| Admin workspace | `/admin/dashboard.html` | Administrator |
| Coupon, inventory and settings tools | `/admin/coupons.html`, `/admin/inventory.html`, `/admin/store-settings.html` | Administrator |
| Courier API and media library | `/admin/courier.html`, `/admin/media.html` | Administrator or assigned orders/catalog staff |
| System health | `/admin/system.html` | Full administrator |
| Staff invitations | `/admin/staff-invitations.html`, `/staff-invitation.html#…` | Full admin creates; invited recipient accepts |
| Authenticator security | `/authenticator.html` | Signed-in account; current password/proof for changes |
| Warehouses, new catalog CSV and stock mail | `/admin/advanced-inventory.html` | Assigned inventory/catalog tools; sections and APIs enforce scopes |
| API health/readiness | `/api/health`, `/api/health/ready` | Public, minimal status |

Register normally to create a customer. For administrator access, use the private `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your environment after seeding. No shared administrator password is bundled. A normal customer sign-in opens the personal dashboard; a pending shopping destination takes priority.

### Updating an Existing Installation

Preserve your working environment, uploaded images, database and Git history when copying updated source. The v2.14.3 update requires **no setup, reseed or manual database migration**. Retain your working local/Atlas connection and later laptop-only SMTP settings:

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

For shared Atlas/two-PC use, upgrade **all active app servers** before using these new guest, warehouse and exchange workflows. Older releases do not understand their records and are not a safe automatic rollback target after activation. Keep the same existing MFA/backup keys. See [upgrade compatibility](docs/COMMERCE_EXPANSION.md#upgrade-an-existing-store).

New integrations are optional. Keep your existing `.env`; if required, copy `server/.env.integrations.example` to a private `.env.integrations` and configure only the provider/backup/alert settings you want to activate. Existing environment values have priority. See [production tools](docs/PRODUCTION_TOOLS.md) before enabling automatic booking, cloud deletion or backups.

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
| `MAIL_WEBHOOK_SECRET` | Optional 32+ character secret for a trusted provider delivery-event adapter; normal SMTP does not require it |
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
| Cash on delivery | Creates an unpaid order/invoice; administrator confirms payment or delivery through the COD workflow | MongoDB and a registered account or private guest session |
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

Product and invoice history remain linked when products are archived. Uploads use `server/uploads/` by default; optional Cloudinary storage, migration and guarded cleanup are implemented. Actual cloud-account acceptance remains necessary. Brand asset provenance and prompts are recorded in [`docs/BRANDING.md`](docs/BRANDING.md); catalog prompts are in [`AI_ASSETS.json`](client/assets/products/photos/AI_ASSETS.json).

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
| Management and recovery | Sales reports, customers/staff, device sessions, email preferences/outcomes, item returns/exchanges and credit notes; see [feature guide](docs/MANAGEMENT_RETURNS.md) |
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

Preflight and mail commands read the optional `server/.env.integrations` just as startup does. Existing process and base `.env` values, including explicit empty values, retain priority. No settings file is rewritten.

## Testing

### Default Verification

```bash
npm run verify
```

Coverage includes business rules, injected write failures, HTTP authentication/catalog/cart/order journeys, payment-state protection, uploads, frontend VM rendering and static asset/reference checks.

Recorded release evidence, as of **24 October 2026 (Asia/Dhaka)**:

| Check | Recorded result |
|---|---|
| JavaScript syntax, v2.14.3 | **345 files passed** |
| Default suite, v2.14.3 | **608 passed, 0 failed, 15 native entry points skipped** without an explicit MongoDB test URI |
| Native standalone, v2.14.3 | **274 passed**, compensation path |
| Native single-member replica set, v2.14.3 | **274 passed**, transaction path |
| Dependencies | Release audit: **0 vulnerabilities**; dependency selections unchanged from 2.14.2 |
| Frontend | Controlled DOM checks cover prior shopping flows and mobile-menu Escape/focus; actual CLI/HTTP smoke serves 61 pages / 148 local targets; visible layout inspection remains unperformed |
| Browser/mobile/keyboard/print | Static/VM/HTTP and print rules passed; cloud browser access was blocked, so visible device/print inspection is not certified |
| Backup/restore | Encrypted BSON/index/local/cloud-byte verification and isolated restore passed on both topologies |
| Actual server/worker startup | All workers, graceful restart, cookie/cart persistence and production replica-set preflight checked on both topologies |
| Release/monitor tests | YAML/Bash checks, controlled code rollback, outage/recovery, RFC TOTP vectors and session/race guards passed; local SMTP account/operations/uptime delivery and rejection/TLS checks passed |
| Public providers/deployment | SSLCOMMERZ acceptance, real courier/Cloudinary account access, inbox/alert receipt, off-host recovery and final-domain SEO remain environment-specific |

Tests also cover courier replay/reconciliation/tracking/exceptions, actual provider request protocols, SEO/JSON-LD/sitemaps, cloud migration/reference locks/cleanup, maintenance leases, redacted alerts and encrypted backup recovery. Earlier tests cover reports, scoped staff/customer access, devices, signed email outcomes/preferences, item/exchange/refund/credit-note rollback, and current/previous commerce flows, coupon races/rollback/discounted returns, owner-scoped wishlists, CSV preview/import/replay/interruption/conflict handling, published settings and frontend behavior. No owner database, real inbox, courier or money is used. See [verification results](docs/VERIFICATION_RESULTS.md) for the exact scope.

### Native MongoDB Verification

Use a dedicated non-production test server. For standalone MongoDB exposed on host port `27018`:

```bash
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

For a replica set, supply its URI and use `NORDA_EXPECT_TRANSACTIONS=1`. Each entry point creates a random `norda_test_*` database and drops only that test database; permission to create/drop those fixtures is required. These tests use their explicit test URI rather than the application's `MONGO_URI`.

GitHub Actions verification is configured for Node.js 22, default verification, dependency audit, and native MongoDB 7 standalone/replica-set jobs. Provider regression tests use controlled outbound responses rather than actual merchant transactions. Deployment and independent uptime workflows are supplied but remain disabled until configured; no public host/provider activation is implied.

### Manual Review

Follow the [acceptance checklist](docs/ACCEPTANCE_CHECKLIST.md) for the complete customer/admin journey, two-account isolation, payment outcomes, keyboard navigation, responsive layouts and invoice printing. Check the website through Express rather than opening HTML files directly. If an old tab icon remains after updating, refresh with **Ctrl+Shift+R**.

## Roadmap

The **localhost feature scope remains fixed** at the existing 2.14 feature set plus the requested maintenance and local acceptance tools. This maintenance release does not assign another feature phase. The agreed status and concrete testing limits are recorded in [Local final release](docs/LOCAL_FINAL_RELEASE.md).

Production deployment/domain/HTTPS, live merchant reverse/statement activation and real-account service acceptance are deferred until the owner chooses to activate those services. They do not block using this final source locally. Optional comparison, SMS, passkeys, more carriers and accounting vendor integrations are not assigned work for this release.

### Implemented milestones

- [x] Forgot/reset password, email verification and multiple delivery addresses.
- [x] Reservation expiry/stock release and eligible same-order real payment retry.
- [x] Admin payment review, customer cancellation requests and whole-order return/refund workflows.
- [x] Store-entered courier tracking, shipment history and customer tracking view.
- [x] Queued order/payment/shipping/delivery/cancellation email with retries.
- [x] Size/color/SKU variants with independent stock, prices and photos.
- [x] Coupons/promo codes and account wishlists.
- [x] Product/SKU stock CSV tools and per-option low-stock alerts.
- [x] Editable storefront banner, contact, FAQs, policies and delivery pricing.
- [x] Advanced day/month sales reports with product/SKU rankings, coupons and confirmed refund/net revenue analysis.
- [x] Customer/staff management, audited scoped permissions and device session controls.
- [x] Return/refund email preferences and verified delivery/bounce/complaint history.
- [x] Selected-item returns, configurable windows, equal/different-price product exchanges and credit notes.
- [x] Settlement/cash reconciliation, fees and audited statement exceptions.
- [x] Per-parcel courier automation, merchant reverse/statement connector contract and balanced accounting export.
- [x] Whole-order partial receipts, multiple receiving warehouses and snapshot refund deductions.
- [x] Distance/capacity/balanced routing and previewed bulk warehouse transfers.
- [x] Reverse pickup confirmation and partial item receipt/restocking.
- [x] Private guest carts/checkout, email access recovery and verified account linking.
- [x] Opt-in warehouse routing/split parcels, stock recovery and exact-option availability mail.

- [x] eCourier booking, package charges, labels, authenticated tracking polling and exception review.
- [x] Product SEO metadata, canonical URLs, sitemap and structured data.
- [x] Optional Cloudinary media hosting, legacy URL migration and guarded unused-image cleanup.
- [x] Encrypted BSON/media backups, isolated restore drills, monitoring and optional alerts.

- [x] Docker/Caddy HTTPS/restart tooling, isolated staging, GitHub releases and health-checked code rollback.
- [x] Private off-host archive replication, guarded retention and scheduled isolated restore drills.
- [x] Independent uptime monitoring with stateful outage/recovery alerts.
- [x] Staff invitations and authenticator MFA with verified device sessions/recovery codes.
- [x] New product/SKU CSV creation, warehouse balances/transfers and low-stock email subscriptions.

Historical development is recorded in [Changelog](CHANGELOG.md). Further development begins only after a new explicit scope is agreed.

## Documentation

| Document | Purpose |
|---|---|
| [Local acceptance](docs/LOCAL_ACCEPTANCE.md) | Exact browser/customer/admin criteria and actual email probe/receipt steps |
| [Local connector](docs/LOCAL_CONNECTOR.md) | Runnable reverse-pickup/statement demonstration and safe mode boundaries |
| [Reserved integrations](docs/reserved/README.md) | The three owner-deferred activation areas |
| [Shopping and admin guide](docs/SHOPPING_AND_ADMIN_GUIDE.md) | Search, password visibility, guest tracking/recovery/linking and staff/admin order processing |
| [Local final release](docs/LOCAL_FINAL_RELEASE.md) | Fixed localhost scope, final fixes, evidence and deferred external activation |
| [Advanced operations](docs/ADVANCED_OPERATIONS.md) | Current four-feature guide, configuration, provider contracts, permissions and API |
| [Final maintenance release](docs/FINAL_RELEASE.md) | Six-area results, bug/security fixes, remaining owner-environment checks and tag preparation |
| [Commerce operations](docs/COMMERCE_EXPANSION.md) | Settlement, priced exchanges, pickups/partial receipts, guest checkout, warehouse parcels and availability alerts |
| [Release automation and team inventory](docs/RELEASE_AUTOMATION.md) | Deployment, independent monitoring, private off-host recovery, invitations/MFA and advanced inventory |
| [Production tools](docs/PRODUCTION_TOOLS.md) | Courier API, SEO, cloud media, encrypted backup/restore, monitoring and optional setup |
| [Management, devices and item returns](docs/MANAGEMENT_RETURNS.md) | Usage, policies, webhook contract and v2.10 API additions |
| [Coupons, wishlist, inventory and store settings](docs/COMMERCE_TOOLS.md) | Setup, policies, API and acceptance for the v2.9 commerce tools |
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
| [Fixed scope](docs/FUTURE_DEVELOPMENT.md) | Local closure and the policy for separately requested future work |
| [Changelog](CHANGELOG.md) | Version history |

Historical sections remain labeled by release. This README, the advanced operations guide, retained feature guides and current verification report describe the latest application status.

## Contributing

1. Start from the agreed baseline and create a branch for one feature or fix.
2. Keep existing working behavior, private environment values, uploaded media and database records intact.
3. Run `npm run verify`; use isolated native tests when changing persistence/payment behavior.
4. Update relevant documentation and complete the acceptance checks affected by the change.
5. Open a pull request describing the behavior, verification and any remaining limits.

## License

The backend package declares **ISC** in [`server/package.json`](server/package.json). A standalone root license document is not included in the current version.
