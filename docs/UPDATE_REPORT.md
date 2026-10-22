# NORDA 2.11.0 update report

Built from the latest `Norda-Main-v2.10.0.zip`. The professional README layout and all earlier feature guides remain. This release implements the four requested production areas without changing the input database/JWT/admin/SMTP/gateway credentials or existing catalog/brand images.

**Courier API:** an optional eCourier general REST v5.5 adapter provides assigned package quotes, durable booking, labels, opt-in automatic booking, authenticated tracking, cancellation reconciliation and audited exceptions. Booking is separate from pickup. Existing fulfillment/COD/invoice/notification logic handles confirmed carrier movement; ambiguous or partial delivery cannot silently restock, refund or mark full payment. An active external parcel protects against manual dispatch/payment changes and order cancellation before carrier cancellation. Whole-BDT collection, address length and prepaid merchant mapping restrictions are explicit.

**SEO:** initial product HTML now contains specific metadata, canonical/Open Graph tags and escaped real-offer Product/variant structured data. Public sitemaps paginate active products; private/admin/local pages are protected with robots rules. Existing browser product/cart behavior is retained.

**Cloud media:** optional server-authenticated Cloudinary uploads record ownership and recovery state before external calls. Local uploads remain the default. Migration preserves old upload URLs, uncertain responses reconcile existing identities, and preview/confirmation cleanup rechecks live references under a shared lock. Product, variant, order/history, exchange, banner, category and brand references protect media.

**Backup/monitoring:** authenticated AES-256-GCM archives include raw BSON, collection/index definitions, local/assets and active cloud image bytes. Writer leases coordinate a consistent capture across upgraded app processes. CLI verification and restore reject tampering and only restore into a new database/output folder. Optional scheduling, readiness, safe request IDs/redacted incident history, system status and bounded SMTP/HTTPS alerts are available. Local archive retention/off-host replication and production restore promotion remain operator policies.

Three scoped workspaces are added: Courier API, Media library and System health. Optional checkout thana/area fields support carrier addressing without invalidating existing saved addresses. New integration values live in an optional private `.env.integrations`; the original `.env` has not been edited. Automatic booking, scheduled backups and alerts require explicit activation. No paid service was activated, no owner database was seeded/contacted and no real courier/payment was submitted during verification.

Validation: 235 JavaScript syntax checks; default suite 409 passed, 0 failed, 10 intentionally skipped native entry points; native standalone 173 passed and replica-set 173 passed; actual server startup/worker/shutdown smoke passed on both; dependency audit 0 vulnerabilities. See [full results](VERIFICATION_RESULTS.md). Actual provider account, browser/device/print, public payment/SEO and off-host recovery acceptance remain deployment checks.

Preserve your laptop `.env`, optional private integrations file, uploads and Git history. From `server/`: `npm ci`, `npm run verify`, `npm run dev`. No setup/reseed/manual migration is needed. See [PRODUCTION_TOOLS.md](PRODUCTION_TOOLS.md) before activating new integrations.

Suggested commit: `feat: add courier integration, SEO, cloud media, and backup monitoring`.
