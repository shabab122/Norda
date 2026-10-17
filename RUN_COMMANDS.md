# NORDA run and update commands

Requires Node.js 22+ (24 recommended). Keep your existing MongoDB URI and uploads.

## Update from 2.2/2.3/2.4/2.4.1 to 2.4.2

Stop the old NORDA process and copy the new source into your existing checkout while preserving `.git`, `server/.env`, any other environment files and `server/uploads`. Keep your working database URI and JWT/admin/gateway credentials exactly as they are. This update requires no database migration or reseeding.

From the updated project root:

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

Open **http://localhost:5000**. Standard customer login/signup now opens `/dashboard.html`; administrator login keeps `/admin/dashboard.html`. A shopping return URL or pending cart selection still takes priority.

The preflight is read only. It shows the selected database host/port and record counts, with all secrets hidden. Your current local database was exposed at `127.0.0.1:27018/norda_db`; keep that working URI in your own `.env`. NORDA stays on port 5000 and leaves GitStack/Gitea ports 3000/3002 alone.

For the requested simulator, keep `NODE_ENV=development` (or unset) in your existing environment. No merchant credentials need changing. Checkout now has separate Mobile Banking/bKash and Card/Bank demo choices. Choose an outcome, then inspect My Orders and the invoice with its simulation note. If your environment already sets `PAYMENT_DEMO_ENABLED=false`, the simulator is disabled; `NODE_ENV=production` always disables it. These settings do not change the real provider credentials.

Real public gateway and browser acceptance still need the steps in `docs/ACCEPTANCE_CHECKLIST.md`. Do not treat successful automated tests as completion of those external checks.

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
git switch -c fix/norda-logo-transparency
rsync -av --exclude='.git/' --exclude='.env' --exclude='.envy' --exclude='node_modules/' --exclude='uploads/' /path/to/extracted/Norda-Main/ ./
git rm --ignore-unmatch server/.envy
cd server
npm ci
npm run setup
npm run seed:catalog
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
git commit -m "fix: remove logo and favicon backgrounds"
git push -u origin fix/norda-logo-transparency
```

Open a pull request into `main`. Confirm `.env`, runtime uploads and `node_modules` are excluded from the staged changes.

## Optional real database check

```bash
cd server
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

Use `NORDA_EXPECT_TRANSACTIONS=1` and your replica-set URI to test transactions. Both modes were verified for this release with native MongoDB 7.0.45. GitHub Actions runs both modes on MongoDB 7.

The tests use new random `norda_test_*` databases, then remove only those test databases. Use an isolated MongoDB server with permission to create test databases. The tests exercise real HTTP authentication, all catalog categories/images, cart operations, checkout/invoices, cancellation, simultaneous stock purchases and rollback. They do not use your store's database name or import demo records into it.
