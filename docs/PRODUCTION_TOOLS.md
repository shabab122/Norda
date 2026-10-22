# Production tools — NORDA 2.11.0

Built from `Norda-Main-v2.10.0.zip`. This release adds eCourier REST integration, server-rendered SEO, optional Cloudinary storage, encrypted BSON/media backups and operational monitoring. Existing commerce, account, payment and administration workflows remain covered by regression tests.

## Update without changing credentials

Preserve your working `server/.env`, database, uploads and Git history. The supplied input `.env` is unchanged. No reseed or manual migration is required; additive collections/indexes initialize at startup.

From `server/`:

```bash
npm ci
npm run verify
npm run dev
```

Optional integrations use **`server/.env.integrations`**. Copy `.env.integrations.example` only if that private file does not already exist, then fill in the integrations you intend to activate. Startup and the backup CLI load it after `.env`, without overriding existing environment values. Never commit either private file. With no new configuration, manual courier tracking and local image uploads continue to work; automatic booking, scheduled backups and alerts remain disabled.

## 1. Courier API: eCourier

### Setup and permissions

The provider adapter follows eCourier's official general API v5.5. Obtain a merchant sandbox account, assigned packages and API credentials:

```dotenv
COURIER_PROVIDER=ecourier
ECOURIER_MODE=sandbox
ECOURIER_API_KEY=
ECOURIER_API_SECRET=
ECOURIER_USER_ID=
```

Use **Admin → Courier API** (`/admin/courier.html`). Administrators and staff with `orders` permission can manage bookings; customers see only their own safe tracking details. Keys never appear in the API configuration response or browser bundle. Live mode uses the official live host and must be selected explicitly after merchant acceptance.

### Booking, labels and charges

1. Process an eligible order using the existing order workspace. Booking requires `processing`, a valid recipient and no blocking payment/return/cancellation operation. Simulation orders are excluded.
2. Load the merchant's assigned packages and select the quoted shipping charge. Supply city, thana, area and the carrier address. Optional checkout thana/area fields can carry these details into new orders; existing saved addresses remain compatible.
3. Submit once. A durable booking is queued; the worker submits it. A booking or label **does not mark an order shipped**. Carrier pickup/movement supplies that evidence.
4. Open the provider's trusted PDF label after acceptance. Refresh tracking manually, or allow the worker to poll active bookings about every five minutes.

Package quotes, actual shipping charges and COD charges are recorded separately from the customer's checkout delivery charge. Existing order/invoice amounts are never silently changed by a carrier fee.

**Provider contract limits:** the documented recipient address is at most 40 characters, a Bangladesh phone is normalized to 11 digits, and collection amounts must be whole BDT. Fractional COD totals are rejected rather than rounded. The administrator can supply a concise delivery address while the original customer address remains in the order. Ask the merchant about a different provider contract if these limits do not fit the store.

Paid orders require explicit, merchant-confirmed **zero collection** mapping. Configure `ECOURIER_PREPAID_CONFIRMED=true`, `ECOURIER_PREPAID_METHOD=MPAY` or `CCRD`, and `ECOURIER_PGW_ID` only after eCourier confirms those semantics for your account. The adapter sends zero collection with the retained payment transaction; it never asks a paid customer to pay again.

### Automatic booking

After completing a manual sandbox journey, optionally configure:

```dotenv
COURIER_AUTO_BOOK_ENABLED=true
ECOURIER_DEFAULT_PACKAGE_CODE=#YOUR_ASSIGNED_CODE
COURIER_AUTO_AFTER=2026-10-23T00:00:00+06:00
```

Choose your actual activation date. The worker scans eligible processing orders created after that cutoff. Required address/payment fields still apply. Existing historical orders are not bulk submitted. Automatic booking uses the merchant's configured default package; confirm its weight/coverage/cost suitability before enabling it. Missing prerequisites produce an operational review signal rather than a guessed parcel.

### Recovery and delivery exceptions

- The order and request key identify one booking intent. Repeated identical requests replay it; changed details do not create a second parcel.
- A timeout, dropped response or local save failure after acceptance stays uncertain. **Reconcile** looks up the original reference and validates identity, phone and amount. It does not blindly submit another parcel.
- Recognized pickup/transit/delivery events use existing fulfillment, COD payment, invoice and notification logic. Repeated or older history cannot mark payment twice or move an order backward.
- Partial delivery, return-to-sender, unknown statuses and identity/amount mismatches require review. They do not automatically restore stock, refund a charge or count as full delivery. Inspect the parcel and use the existing return/refund workflow as appropriate.
- Resolve an exception with an explanatory audit note. Acknowledgement itself does not change financial or stock state.
- Cancel the carrier booking before cancelling/restocking an order with an active parcel. Uncertain cancellation remains blocked until reconciled. Manual dispatch/payment/shipment changes are blocked while an API parcel is active.

The current provider uses authenticated outbound polling, not an unauthenticated tracking webhook. Reverse pickup, another carrier and price-difference exchanges remain separate scope. One booking per order is retained for audit; a rejected/cancelled booking is not silently replaced with another parcel.

## 2. SEO

Set `SITE_URL` to the final public HTTPS origin, for example `https://shop.your-domain.com`. An existing public `CLIENT_APP_URL` or `SERVER_URL` can be used as fallback. URL paths, embedded credentials and query/fragment values are not accepted as the canonical origin. Request `Host` headers are not trusted for this purpose.

Implemented:

- Product-specific title, description, canonical URL and Open Graph metadata in the **initial HTML** at `/product-detail.html?id=…`.
- Escaped Product JSON-LD using actual price, availability, images and recorded ratings; variant products use their real active offer range. No invented reviews or sales data.
- `/robots.txt`, `/sitemap.xml`, `/sitemaps/pages.xml` and paginated `/sitemaps/products-N.xml`, excluding archived products and private/admin pages.
- Canonicals for the main public pages, and `X-Robots-Tag` protection for account/admin pages and invalid/unavailable products. Missing products return 404; archived products return 410 while historical access remains available.
- Local/nonpublic development remains non-indexable. JSON-LD follows the existing Content Security Policy with a per-response nonce.

Check the final domain with Google's Rich Results Test and Search Console, then submit `/sitemap.xml`. Metadata and valid structured data make pages eligible for discovery; they do not guarantee indexing or rich-result display. Filter/search variants canonicalize to the main catalog; dedicated category landing pages are future scope.

## 3. Cloud images and cleanup

### Activate Cloudinary

```dotenv
MEDIA_STORAGE=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Credentials stay server-side. Existing JPEG/PNG/WebP/GIF signature validation and 5 MB limits remain in place. Server-authenticated uploads use application-owned `norda/uploads/<uuid>` identities, HTTPS delivery and `overwrite=false`. API secrets are not placed in frontend code or returned to customers.

Use **Admin → Media library** (`/admin/media.html`). Catalog staff can inspect/reconcile; full administrators can migrate local media and confirm deletion.

- New confirmed cloud uploads are saved before local temporary bytes are removed.
- Uncertain uploads retain local bytes and a recovery record. Reconcile checks that same public ID; it does not retry a potentially successful upload under a new identity.
- Migrating an existing local upload retains its `/uploads/<filename>` identity. That route redirects to the verified cloud image, preserving old product/order/history references.
- The included catalog and brand files in `client/assets` remain unchanged and local. The tool migrates managed uploads; it does not rewrite all existing catalog artwork.

### Cleanup procedure

Preview unused assets, then explicitly confirm each deletion. Candidates must be managed, at least seven days old and unreferenced. The server checks product/variant images including archived products, original order images, exchange replacements, store banners, category images and brand logos. It recognizes transformed cloud URLs and legacy local URLs.

Preview tokens are checked again under a shared media-reference lock immediately before deletion. A reference added after preview blocks cleanup. Deleted/pending assets cannot be reattached through guarded catalog/settings mutations. Uncertain cloud deletion is reconciled before retry; repeated confirmed cleanup is idempotent. Unregistered filesystem files and arbitrary third-party public IDs are not deleted. There is no unattended blanket deletion job.

## 4. Encrypted backups, restore and monitoring

### Generate a separate backup key

Generate a key **on your own computer** and store it in the private integration file:

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'
```

```dotenv
BACKUP_ENCRYPTION_KEY=
BACKUP_DIRECTORY=
BACKUP_INTERVAL_HOURS=0
```

Keep a secured copy of this key separately from the archives. It is required for recovery; JWT, SMTP and payment secrets are not substituted. An empty directory setting uses private `server/.backups`. An enabled schedule accepts 1–720 hours and runs only while the application is running.

### Create and verify

From `server/`:

```bash
npm run backup:create
npm run backup:verify -- --file /absolute/private/path/norda-backup.ndb
```

Use the actual `.ndb` filename returned by creation. This is NORDA's authenticated archive format, **not** a `mongodump` archive. No MongoDB command-line tools are required.

Backups contain raw BSON collections, collection/index definitions, local uploaded media, bundled client assets, and the actual bytes of active managed cloud images. BSON types and text/unique indexes are retained. Transient locks, active login sessions, maintenance state and operational/backup telemetry are omitted. Existing user password hashes remain data, not plaintext passwords. Environment files and provider keys are not archived.

A shared database maintenance lease blocks new application mutations, drains existing API/worker writes and checks ownership during capture. New writes receive 503 with `Retry-After: 30`; reads remain available. AES-256-GCM authentication, per-entry SHA-256, path/count/size validation and private file permissions guard verification. Missing managed images fail the backup instead of reporting incomplete success.

**Consistency boundary:** every running NORDA process sharing the database must use this version's lease. Other database clients, an old laptop server or out-of-band imports can bypass it. Upgrade all app processes or stop all other writers for the capture. Large media libraries need sufficient private temporary disk space and a maintenance window; this implementation captures ordinary collections rather than MongoDB time-series/views or an enterprise point-in-time oplog.

Local encrypted archives must be copied to a secured **off-host** destination using your chosen storage/backup service. No unconfigured remote destination is invented. Retention/off-host replication is an operator policy; archive files are not automatically deleted. Protect the temporary directory used during backup/verification/restore because intermediate BSON/media is plaintext until encrypted or cleaned up.

### Restore drill — isolated target only

```bash
npm run backup:restore -- --file /absolute/private/path/norda-backup.ndb --database norda_restore_20261023_check --output /absolute/private/new-restore-folder
```

Choose a new `norda_restore_…` database and a new output directory. Restore refuses the source database, an existing target database or an existing output directory. It authenticates and verifies the whole archive before creating data, and it serializes concurrent NORDA restores to the same target. Restored local/assets/cloud bytes and their manifest are placed in the new output directory; production files and `MONGO_URI` are not replaced.

Inspect collection counts, indexes, representative customer/order/invoice records and media checksums. The included native tests perform this drill on standalone and replica-set MongoDB, including exact BSON types and local/cloud image bytes. For a real recovery, review jobs/queues, revoke old application tokens as appropriate and promote the restored database/media through a separate deployment procedure. Do not start a drill copy with live courier/payment/mail workers. If cloud objects were lost, re-upload the restored cloud bytes to the verified original identities or explicitly migrate their references before promotion; restoration itself does not make external provider calls.

### Monitoring and alerts

Use **Admin → System health** (`/admin/system.html`, full administrators only). It shows MongoDB readiness, uptime, RSS memory, available disk, integration readiness, recent backup runs, failed mail, uncertain refunds/parcels and open operational events.

- `GET /api/health` retains the existing liveness response.
- `GET /api/health/ready` returns 200 when ready and 503 during database outage/backup maintenance; it exposes no connection string or internal error.
- API failures have request IDs, redacted structured logs and bounded safe source frames. Request bodies, raw error messages, cookies and credentials are not sent to the operational event store.
- A worker checks queue/refund/carrier/disk/backup signals. Hourly deduplication, bounded claims/retries and 90-day event retention limit noise. Admin acknowledgement closes the visible event; a later occurrence can reopen it.
- Configure one alert channel: `OPS_ALERT_WEBHOOK_URL=https://…` for an HTTPS JSON receiver, or `OPS_ALERT_EMAIL=…` through the existing SMTP. Webhook has priority if both are configured. The payload contains operational summaries/request IDs, without customer or payment data. Local file mail previews are recorded as `file`, not claimed as inbox delivery.
- Database-outage alerts are best effort while the process is alive. An external uptime monitor should poll readiness to detect process/host failure; a stopped process cannot send its own alert.

## API additions

| Access | Method and path | Purpose |
|---|---|---|
| Public | `GET /api/health/ready` | Minimal readiness |
| Orders scope | `GET /api/admin/courier/config`, `/packages`, `/bookings` | Readiness, quotes, booking list |
| Orders scope | `POST /api/admin/courier/orders/:id/book` | Queue one booking (`requestKey`, package, expected charge, address) |
| Orders scope | `POST /api/admin/courier/bookings/:id/sync`, `/cancel`, `/resolve`, `/label` | Recovery/actions; cancellation/resolution include notes |
| Orders scope | `GET /api/admin/courier/bookings/:id/events` | Carrier audit history |
| Owner or orders scope | `GET /api/orders/:id/courier` | Safe customer tracking and paginated history |
| Catalog scope | `GET /api/admin/media` | Managed media list/readiness |
| Catalog scope | `POST /api/admin/media/:id/reconcile` | Resolve an uncertain existing upload/deletion |
| Full admin | `GET /api/admin/media/cleanup` | Preview unused media candidates |
| Full admin | `POST /api/admin/media/:id/migrate`, `/:id/cleanup` | Cloud migration or explicit token-confirmed cleanup |
| Full admin | `GET /api/admin/system/status`, `/events` | Operational status/history |
| Full admin | `POST /api/admin/system/events/:id/resolve` | Acknowledge an event |

List routes accept existing `page`/`limit` pagination. Backup creation/verification/restore stay CLI-only; no database archive is publicly downloadable.

## Verification and deployment acceptance

Run `npm run verify`. For native testing, point `NORDA_TEST_MONGO_URI` at an **isolated test MongoDB** and run `npm run test:integration`; tests choose random test databases and an isolated restore target. Never set that variable to the store's production database account. See [recorded results](VERIFICATION_RESULTS.md).

Automated checks exercise the actual Express/Mongoose flows with controlled provider responses, plus the real REST adapters with intercepted requests. They do **not** establish merchant account permissions or live external delivery. Before activation, complete one merchant sandbox booking/label/charge/cancel/tracking journey, a real Cloudinary upload/migration/cleanup, an off-host backup/restore drill and receipt of an alert. Browser/mobile/keyboard/print, public SSLCOMMERZ acceptance and final-domain SEO validation remain deployment acceptance checks.

## Official provider references

- [eCourier merchant resources](https://ecourier.com.bd/resources/) and [General API v5.5](https://ecourier.com.bd/wp-content/uploads/eCourier_Merchant_API_Document_General_v5.5.pdf)
- [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference), [server uploads](https://cloudinary.com/documentation/upload_images) and [asset deletion](https://cloudinary.com/documentation/delete_assets)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [MongoDB Node.js BSON documentation](https://www.mongodb.com/docs/drivers/node/current/data-formats/bson/)
