# NORDA run and update commands

Requires Node.js 22+ (24 recommended). Keep your existing MongoDB URI and uploads.

## Update an existing installation to 2.13.0

Stop the old NORDA process and copy the new source into your existing checkout while preserving `.git`, `server/.env`, any other environment files and `server/uploads`. Keep your working database URI and JWT/admin/gateway/SMTP credentials exactly as they are. In particular, retain the email settings you recently configured on your laptop instead of overwriting them with the archive's older `.env`. This update requires no database migration or reseeding.

From the updated project root:

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

Before using the new guest, warehouse or different-price exchange workflows, upgrade every app instance sharing your database. Keep automatic warehouse allocation disabled until balances are checked. Older code is not a safe rollback target after using the new records. See [the 2.13 operating guide](docs/COMMERCE_EXPANSION.md). No setup, reseed or credential rotation is needed.

Open **http://localhost:5000**. Standard customer login/signup now opens `/dashboard.html`; administrator login keeps `/admin/dashboard.html`. A shopping return URL or pending cart selection still takes priority.

The preflight is read only. It shows the selected database host/port and record counts, with all secrets hidden. Keep your currently working local MongoDB or Atlas URI and database name in your own `.env`. NORDA stays on port 5000 and leaves GitStack/Gitea ports 3000/3002 alone.

For the requested simulator, keep `NODE_ENV=development` (or unset) in your existing environment. No merchant credentials need changing. Checkout now has separate Mobile Banking/bKash and Card/Bank demo choices. Choose an outcome, then inspect My Orders and the invoice with its simulation note. If your environment already sets `PAYMENT_DEMO_ENABLED=false`, the simulator is disabled; `NODE_ENV=production` always disables it. These settings do not change the real provider credentials.

Real public gateway and browser acceptance still need the steps in `docs/ACCEPTANCE_CHECKLIST.md`. Do not treat successful automated tests as completion of those external checks.

## Management, devices and item returns — 2.10

- Admin: **Sales reports**, **Customers**, **Staff & permissions**, **Item returns & exchanges**.
- Staff: sign in with an existing registered account; the admin assigns explicit permissions, then **My workspace** lists their tools.
- Customer: **Profile → Devices & email preferences**, and a delivered order's **Return items or exchange size/color** action.
- Return/refund mail uses the existing SMTP configuration. Provider bounce/delivery events need either a verified manual outcome or the optional signed webhook; no new credential is required for normal use.
- Policy defaults to 30 days with equal-price size/color exchanges enabled. New orders retain a policy snapshot; existing data is not reseeded.

See [docs/MANAGEMENT_RETURNS.md](docs/MANAGEMENT_RETURNS.md) for procedures, permission scopes, return/refund accounting and the optional email delivery adapter.

## Coupons, wishlist, inventory and store settings

- Admin: **Coupon center**, **Inventory tools**, **Store settings** in the sidebar.
- Customers: **Offers**, **Wishlist**, checkout coupon field and **Contact & help** in the footer.
- No new environment variables, database reset, setup or reseed are needed. New collections/indexes are additive and initialized at startup; existing catalog/account/order records are retained.
- Preserve your working local/Atlas URI and later laptop-only SMTP values. Do not overwrite your working `.env` with an older archive copy.
- CSV edits apply to existing inventory only. Preview first; retain expectedStock/inventoryVersion and the exact exported header. Each product is atomic; review any conflict/uncertain result before another import.

See [docs/COMMERCE_TOOLS.md](docs/COMMERCE_TOOLS.md) for the complete usage and acceptance guide.

## Delivery tracking, order email and variants

- Customer: **My Orders → Track delivery**.
- Admin: **Delivery tracking** to assign courier/record progress; **Email notifications** for delivery attempts and failed-email retry.
- Admin: **Products → New product → Use size / color variants**. Existing products are not automatically converted or reseeded.

The email worker runs on startup/every 15 seconds using the same SMTP configuration. New indexes are initialized with the API. No new credentials or manual migration are required. Keep NORDA on port 5000. Read [docs/DELIVERY_NOTIFICATIONS.md](docs/DELIVERY_NOTIFICATIONS.md) and [docs/PRODUCT_VARIANTS.md](docs/PRODUCT_VARIANTS.md).

For development file-mode order email, leave the API running, then in another terminal:

```bash
cd server
npm run mail:orders -- your-account@example.com
```

The existing `mail:preview` command continues to show account reset/verification mail separately.

## Payment review, cancellation and returns

Customer: **My Orders → Cancellation, returns & refunds**. Administrator: **Requests & payments**, or `http://localhost:5000/admin/operations.html`. No new credentials, seed or manual migration are required. Refund reconciliation starts automatically with the server every 30 seconds. Keep the API running while a gateway refund is pending; the next startup catches up with saved eligible refunds.

Use [docs/ORDER_OPERATIONS.md](docs/ORDER_OPERATIONS.md) for paid/unpaid cancellation, return receipt/restocking, provider-confirmed refunds, cash receipts and uncertain-refund recovery. A local simulated refund moves no money. Real merchant refund permissions and public sandbox acceptance must be checked using your own setup.

## Checkout recovery

The server starts the reservation worker automatically. Unpaid online/simulated reservations default to 30 minutes and are swept every 30 seconds. On startup, older overdue unpaid orders can release their held stock. COD, paid and review orders are excluded. My Orders offers eligible real SSLCOMMERZ orders **Retry or resume online payment** using the same order/invoice. No new environment setting is required; optional overrides and a one-shot sweep command are in [docs/CHECKOUT_RECOVERY.md](docs/CHECKOUT_RECOVERY.md).

## Account email and address book

Recovery, verification and multiple addresses require no reseed or migration. Keep the supplied `.env` unchanged. The optional new mail settings are listed in `.env.example` and [the account guide](docs/ACCOUNT_RECOVERY.md).

For local development without an SMTP host, request a reset or verification email on the website, then run in another terminal:

```bash
cd server
npm run mail:check
npm run mail:preview -- your-account@example.com
```

Open your account's link from the terminal output. These are private, one-use links. They are not served by the website or included in the ZIP. Real inbox delivery uses your own SMTP settings; production requires SMTP and HTTPS account links.

Manage saved addresses in `profile.html`; use the new selector in `checkout.html`. Existing passwords, MongoDB URI, JWT, admin and payment credentials are not replaced.

## Optional: import missing catalog samples

After copying this update into your existing project, from `Norda-Main`:

```bash
cd server
npm ci
npm run seed:catalog
npm run verify
npm run dev
```

Open **http://localhost:5000**. `seed:catalog` adds missing samples and updates known starter art to the included AI photos. It preserves existing stock, prices, custom uploads, orders and admin credentials. You may run it again safely; it does not reset sold inventory. The provided catalog has 24 products across 12 categories. Existing custom products stay in the database too.

`server/.env` must still point to your current MongoDB. If your laptop's Docker MongoDB is mapped to port 27018, keep that port in `MONGO_URI`; do not replace a working URI with a different database name. The catalog command connects to the database you configure; the ZIP itself cannot import it remotely.

## Fresh checkout

From the extracted `Norda-Main` directory:

```bash
cd server
npm ci
npm run setup
```

Open `.env` in an editor. Set `MONGO_URI`, and note `ADMIN_EMAIL`/`ADMIN_PASSWORD` for your private administrator login. Start MongoDB, then:

```bash
npm run seed
npm run verify
npm run dev
```

Website: **http://localhost:5000**. Stop the API with Ctrl+C. For a normal Node process, use `npm start` instead of `npm run dev`.

Never set NORDA to port 3000 or 3002. Startup rejects these reserved GitStack/Gitea ports. No GitStack container or PostgreSQL configuration is changed by this project.

## Apply to an existing GitHub checkout

Stop the old NORDA API. Keep a copy of your current `.env` and uploaded images. Substitute your actual extracted-folder and existing-repository paths:

```bash
cd /path/to/your/existing/Norda-repository
git status
git switch -c feat/tracking-notifications-variants
rsync -av --exclude='.git/' --exclude='.env' --exclude='.envy' --exclude='node_modules/' --exclude='uploads/' /path/to/extracted/Norda-Main/ ./
git rm --ignore-unmatch server/.envy
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

The copy command preserves your existing Git history, environment and upload folder. It intentionally does not use `--delete`. The explicit `git rm` removes the legacy tracked credential file from the next commit. Rotate any old JWT/admin credentials that were previously used or shared; source removal cannot erase old GitHub commits.

For an existing installation, keep `MONGO_URI` pointing at the original NORDA database. Use `npm run seed:catalog` to import samples without creating or changing an administrator account. On a fresh database, `npm run seed` creates the admin plus catalog instead.

After review:

```bash
cd /path/to/your/existing/Norda-repository
git status
git add .
git commit -m "feat: add courier tracking, order notifications and product variants"
git push -u origin feat/tracking-notifications-variants
```

Open a pull request into `main`. Confirm `.env`, runtime uploads and `node_modules` are excluded from the staged changes.

## Optional real database check

```bash
cd server
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

Use `NORDA_EXPECT_TRANSACTIONS=1` and your replica-set URI to test transactions. Both modes were verified for this release with native MongoDB 7.0.45. GitHub Actions runs both modes on MongoDB 7.

The tests use new random `norda_test_*` databases, then remove only those test databases. Use an isolated MongoDB server with permission to create test databases. The tests exercise real HTTP authentication, all catalog categories/images, cart operations, checkout/invoices, cancellation, simultaneous stock purchases, payment review, return receipt, refund persistence, SKU inventory/receipt, courier history, email queue and rollback. They do not use your store's database name or import demo records into it.

## Optional production integrations — 2.11

Keep the working `.env` and any existing `.env.integrations`. For new integrations only, copy `server/.env.integrations.example` to a private `server/.env.integrations`, fill the relevant provider/backup settings, then restart. Existing `.env`/process values have priority. The default update does not enable courier booking, cloud storage, alerts or scheduled backups. Full setup, provider restrictions and acceptance: [PRODUCTION_TOOLS.md](docs/PRODUCTION_TOOLS.md).

Backup commands, from `server/`, after setting a separate backup encryption key:

```bash
npm run backup:create
npm run backup:verify -- --file /absolute/private/path/actual-backup.ndb
npm run backup:restore -- --file /absolute/private/path/actual-backup.ndb --database norda_restore_release_check --output /absolute/private/new-restore-folder
```

Use the actual generated archive path and a fresh target/folder. Restore refuses the original or an existing database and leaves the working `MONGO_URI` unchanged. Schedule/off-host retention and recovery promotion are described in the guide.

## Release/MFA/warehouse additions — 2.12

Normal local run commands stay the same. Preserve current credentials and use only optional `.env.integrations` for the new separate MFA key/off-host settings. On shared Atlas, upgrade all active PCs before enabling MFA and securely share the same MFA key. Do not reseed.

After configuring encrypted local/private remote backup, from `server/`:

```bash
npm run backup:create
npm run backup:upload -- --run ACTUAL_BACKUP_RUN_ID
npm run backup:fetch -- --output /absolute/private/recovery/latest.ndb
npm run backup:retention
npm run backup:drill
```

Actual host/domain deployment, pinned SSH, GitHub settings, independent monitor commands and private recovery procedures are in [RELEASE_AUTOMATION.md](docs/RELEASE_AUTOMATION.md). These workflows are not activated by a local `npm run dev`.
