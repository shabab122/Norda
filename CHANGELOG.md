# Changelog

## 2.13.0 — 2026-10-24

- Add reviewed gateway/COD/exchange/refund settlement CSV reconciliation, exact fees/net amounts, partial remittances, duplicate guards and audited exceptions. Imports never authenticate payment or alter orders.
- Add different-product/variant price adjustments with preserved coupon allocation, dedicated validated SSLCOMMERZ or actual manual exchange receipts, lower-price refund/credit notes and financial review/refund dispatch guards.
- Add reverse pickup requests, confirmed courier appointments/history and durable partial item receipts with physical/restock quantity validation, rollback and replay protection.
- Add full private guest carts and checkout, frozen billing identity, one-use email access recovery, once-only cart merging and atomic order linking to matching verified accounts.
- Add opt-in priority warehouse allocation and split parcels, exact discount/shipping allocations, source-specific cancellation/expiry/retry/review and all-parcels-delivered COD confirmation. Keep legacy online fulfillment as the default.
- Add verified-customer base/SKU availability subscriptions with exact fulfillment availability, durable email batches, unsubscribe, backoff and maintenance participation.
- Add scoped customer/admin screens and regression/HTTP/fault/race/frontend/native tests. Preserve all source files, credentials, dependency selections and catalog/brand assets. See the feature guide for manual provider steps and shared-server upgrade compatibility.

## 2.12.1 — 2026-10-23

- Make acceptance preflight and mail commands load optional integration settings with the same precedence as application startup. Existing process/base environment values and private files remain intact.
- Add integration configuration/credential preservation checks, real loopback SMTP account/operations/uptime delivery and rejection/TLS checks, and hosted-session/validation request/response protocol coverage.
- Add an opt-in native actual-server test for worker startup, graceful restart, cookie/cart persistence and production topology preflight; include it in the integration command.
- Repeat the retained commerce/security/refund/backup suites and record the exact automated evidence and remaining real-provider/browser/host acceptance boundaries. No storefront, commerce logic, credentials or dependency selections change.

## 2.12.0 — 2026-10-23

- Add Docker/Caddy HTTPS/restart and persistent storage configuration, isolated staging/production preflight, pinned SSH deployment, verified source transfer and health-checked code rollback. Rollback can run even if candidate validation fails.
- Add private SigV4 S3-compatible encrypted archive replication, conditional same-key recovery, full readback verification, a disaster recovery pointer, opt-in retention and isolated scheduled restore drills.
- Add an independent monitor and GitHub-hosted workflow with persisted outage/recovery state, bounded checks, maintenance grace and optional webhook/SMTP alerting.
- Add full-admin expiring staff invitations with one-use acceptance, existing-password preservation, revoke/resend, MFA-required onboarding and audited access changes.
- Add encrypted authenticator TOTP, one-use hashed recovery codes, bounded challenges, replay/version checks and verified MFA proof on device sessions. Existing accounts are not silently enrolled.
- Add previewed new-product/SKU CSV creation, satellite warehouse stock/counts/transfers/edit/archive safeguards and subscribed low-stock email queues. Existing online checkout stock behavior is retained.
- Correct premature success HTTP status on asynchronous tool errors; extend native, protocol, fault-injection, frontend and shell/config checks. Preserve input credentials, dependencies and previous features.

## 2.11.0 — 2026-10-22

- Add optional eCourier REST v5.5 booking, package charges, trusted PDF labels, opt-in automatic booking, authenticated tracking and audited exception review. Preserve manual tracking for orders without active API parcels.
- Add durable one-booking intents, same-reference uncertainty recovery, carrier/order cancellation guards and existing COD/invoice/notification synchronization. Booking alone never confirms pickup.
- Add server-rendered product metadata, canonical/Open Graph tags, escaped Product/variant JSON-LD, public sitemaps and private-page robots protection.
- Add optional server-authenticated Cloudinary storage, legacy URL migration, uncertain-result reconciliation and explicit reference-locked unused-media cleanup.
- Add encrypted raw BSON/index/local/cloud-media backup, authenticated verification, isolated new-target restore, maintenance leases and optional scheduling.
- Add minimal readiness, safe request IDs/error events, full-admin system status, bounded optional alerts and three scoped administration screens.
- Extend protocol, HTTP, frontend and native standalone/replica tests; retain existing credentials, dependencies, branding/catalog assets and earlier features. New integrations use an optional private configuration file.

## 2.10.0 — 2026-10-22

- Add Dhaka daily/monthly paid-order cohort reports, product/SKU rankings, coupon savings, confirmed refunds/net revenue and CSV export.
- Add customer search/purchase history and administrator-managed, audited staff permissions. Existing accounts/passwords are retained.
- Add store email preferences, return/refund updates and verified delivery/bounce/complaint history with optional signed webhook integration.
- Add active device sessions, individual revocation and sign-out-other-devices with current-session rotation and legacy JWT invalidation.
- Add selected-item/quantity returns, coupon-paisa allocation, held refunds released after receipt, configurable order-snapshot return windows and printable credit notes.
- Add same-product equal-price size/color exchanges with replacement-SKU reservation, receipt/restock decisions and replacement tracking.
- Extend HTTP, fault-injection, frontend and native MongoDB tests; preserve existing credentials, dependencies, catalog and previous journeys.


All notable project changes are recorded here.

## 2.9.0 — Coupons, wishlist, inventory tools and published store settings

- Fixed/percentage coupons with caps, schedules, minimums, global/account limits and guarded checkout usage; recorded discounts reach invoices, mail, CSV, payment retry and refunds.
- Private account wishlists with current availability, idempotent saves/removal and existing exact-SKU cart actions.
- Stock CSV export/preview/import, per-option thresholds/alerts, stale-write checks, durable replay/recovery and per-product conflict reporting.
- Admin banner/announcement/contact/FAQ/policy/delivery settings, public help pages and snapshot-preserving delivery changes.
- Retains the user's professional README layout and updates its version/features/requirements/roadmap to the actual implementation.
- Native standalone/replica and frontend/fault-injection tests cover the new and prior flows; no dependency or credential changes.

## [2.8.0] — 2026-10-21

- Added courier/tracking metadata, administrator shipment updates, append-only history and an owner-protected customer tracking page. Normal fulfillment, payment and cancellation/refund guards still apply; old basic status controls retain compatibility.
- Added a durable transactional order-email outbox for confirmations, payment changes, shipping, delivery, cancellation and shipment progress. Staged activation, atomic claims, exponential retry, stable Message-ID, worker recovery and admin retry keep SMTP outside commerce transactions. Account mail previews remain separate from new `mail:orders` previews.
- Added up to 50 size/color options per product with global SKU uniqueness, per-option price/discount/photos/availability and independent stock. Selection survives guest sign-in; cart lines, checkout, expiry/retry, payment review, cancellation and return receipt retain exact option identity. Invoices preserve option snapshots.
- Added SKU stock/edit races, rollback, privacy, shipment replay, notification worker and frontend/upload-retry regressions. Native HTTP journeys pass on standalone and replica-set MongoDB; isolated SMTP and actual server/worker startup/shutdown checks pass.
- Retained input credentials, dependency versions, existing catalog/photos/branding and prior account/payment/refund features. No reseed/manual migration is required. Courier updates are store-entered; actual carrier API automation is separate future work.

## [2.7.0] — 2026-10-21

- Added the administrator Requests & payments workspace with transaction history, fresh gateway verification, risky-payment acknowledgement, retained-charge selection, explicit approval/refunded closure and private audit notes.
- Added owner-scoped cancellation requests, administrator approve/reject decisions, fulfillment/payment-retry guards, one-time stock restoration and captured-payment refund coordination.
- Added whole-order return requests, approval, physical receipt and explicit sellable-stock decisions. Refunds queue after receipt rather than approval.
- Added a replay-safe refund ledger for real SSLCOMMERZ, recorded COD repayment and local simulation; partial monetary refunds and duplicate-charge balances are separate. A background worker queries provider references; uncertain submissions require reconciliation rather than blind resubmission.
- Kept invoice identity, original items/prices/totals and shipping snapshots; added refund progress and return state. Dashboard/CSV sales exclude review funds and subtract confirmed ordinary refunds without counting duplicate-charge refunds twice.
- Added fault-injection, HTTP, frontend, provider-contract and native MongoDB tests on both standalone and replica-set paths. Verified 248 default passes and 69 native passes per topology; public merchant/browser acceptance remains environment-specific.
- Preserved input credentials, dependencies, catalog/photos, branding and account recovery. No reseed/manual migration is required. Keep later laptop SMTP settings and uploaded media during update.

## [2.6.0] — 2026-10-21

- Added 30-minute unpaid online/simulation reservations, startup catch-up and a periodic stock-release worker, with optional timing overrides and a one-shot expiry command.
- Added owner-only SSLCOMMERZ retry on the existing order/invoice. Reconcile prior transaction/session history and validate missed successes before resuming a pending session or opening a new unique transaction. Expired orders re-reserve available stock; manual cancellations remain final.
- Added request replay and concurrent retry protection, late-payment/duplicate-charge review, current-attempt failure guards and expiry-aware customer/admin messages. Original price/address snapshots and newer carts are preserved.
- Added recovery fault-injection, HTTP, frontend and gateway-query tests; native MongoDB acceptance covers both standalone compensation and replica-set transactions.
- Retained the input `.env` byte-for-byte, all dependency versions, account recovery/address-book behavior, catalog, AI photos and branding. Keep later laptop SMTP edits when applying the update. No reseed/migration is required.

## [2.5.0] — 2026-10-20

### Added

- Forgot/reset password, 30-minute one-use hashed links, consistent public responses, per-account cooldowns and per-IP request limits. Atomic consumption prevents two concurrent password resets; successful resets revoke prior sessions without automatic login.
- Email verification at registration, protected resend and 24-hour one-use confirmation links. Existing login, admin and checkout permissions remain compatible.
- Up to 10 labeled delivery addresses, ownership checks, edit/delete/default operations, automatic legacy-address compatibility and a saved-address selector at checkout.
- SMTP delivery with production TLS requirements, private development email previews, and `mail:check` / `mail:preview` commands. Only Nodemailer is added; prior dependency versions and supplied credentials are preserved.
- Account HTTP, fault-injection, SMTP and frontend regressions, plus native MongoDB coverage on standalone and replica-set deployments.

### Compatibility

- Existing customer/admin passwords, `.env`, JWT/MongoDB/payment configuration, catalog, photos, orders, invoices, payment logic and stock workflows are retained.
- Saving contact details no longer submits a possibly stale delivery address. Address-book edits do not rewrite historical order or invoice snapshots.
- No seed or database migration is required. See `docs/ACCOUNT_RECOVERY.md` and the current verification report for setup and acceptance limits.

## [2.4.2] — 2026-10-18

- Removed the opaque off-white favicon tile by reusing the existing transparent logo PNG unchanged. Pages use a different favicon asset URL so the old cached tile is replaced.
- Removed the administrator logo's CSS background/padding tile. The logo design, wordmark, dimensions and commerce features are preserved.
- Existing tests and static asset references pass; no dependency or credential changes.

## [2.4.1] — 2026-10-18

### Fixed

- Removed repeated Demo headings/badges from customer checkout, payment, result, order and invoice views, retaining compact truthful simulation/no-charge notes.
- Fixed the invoice's split/shrunken Norda wordmark by scoping document-label styles and using one shared brand component.
- Improved invoice header/ID/email wrapping, brand alignment on small screens and print typography.
- Normalized known legacy simulator cancellation notes for display; underlying records and custom text are unchanged.

### Added

- Original AI-generated N/shopping-ribbon identity, optimized transparent mark, consistent live Norda wordmark and matching tab icon on all pages.
- Branding provenance/prompt documentation and focused regressions for the complete wordmark, invoice/payment disclosures and existing payment links.

### Compatibility

- Cart, stock, prices, payment outcome/replay/ownership rules, production guards, revenue calculations, original catalog/product photos and credentials are preserved. Backend edits are limited to customer-facing wording.
- See `docs/VERIFICATION_RESULTS.md` for final checks and browser acceptance boundaries.

## [2.4.0] — 2026-10-17

### Added

- Local, explicitly labeled Mobile Banking/bKash and Card/Bank simulation, with authenticated success/failure/cancel actions, server-owned totals and My Orders resume links.
- Demo-only payment/order markers, production disable guard, revenue exclusion, printable DEMO invoice notice and customer/admin labels.
- Failure/cancel stock release, immutable terminal outcomes, repeated request protection, transactional/compensating rollback and interrupted-init recovery.

### Fixed

- Development checkout no longer depends on merchant configuration for the requested local demo. The separate real SSLCOMMERZ option retains its configuration and validation requirements.
- Real provider callbacks cannot edit demo payments; demo endpoints cannot pay real orders or another customer's order.
- Featured Picks and Recently Added no longer share product IDs or cover images; missing/error states stay honest without duplicate padding.

### Verification

- See `docs/VERIFICATION_RESULTS.md` for the final automated/native results and remaining browser/public-provider checks. All 24 existing product photos were retained after subject/uniqueness inspection.
- Dependencies, existing seed data, uploads, authentication credentials and working MongoDB URI are preserved.

## [2.3.0] — 2026-10-17

### Added

- Personal customer dashboard with visible identity, own order counts/recent orders, invoice links, cart quantity and delivery details.
- Different guest/customer/admin navigation and normal authentication destinations, while preserving shopping return URLs and pending cart selections.
- Read-only environment/database acceptance preflight without credential disclosure or configuration changes.
- Native complete COD/admin delivery/review, two-customer isolation, controlled payment-notification matrix and preflight tests.

### Fixed

- Refresh stale account identity when another tab changes accounts or the browser restores a cached page.
- Refresh the header/profile identity after a profile-name change.
- Recent-order links can target the correct order after loading; invoice print styles allow long tables to continue across pages.

### Verification and scope

- 93 JavaScript files passed syntax checks; 74 default tests passed, 0 failed, 2 native entry points skipped without a test URI.
- Native MongoDB 7.0.45: 17 reported tests passed on standalone and 17 on a single-member replica set, with no failures/skips.
- No dependency changes; release audit remains at 0 vulnerabilities. Existing credentials, seed/catalog, images, backend business services/models/routes and existing admin operations are preserved.
- Public SSLCOMMERZ sandbox acceptance and actual browser/device/keyboard/print acceptance remain pending; see the acceptance checklist.

## [2.2.0] — 2026-10-15

### Added

- 24 distinct AI-generated product photos and 12-category demonstration catalog with prices, descriptions, managed brands and stock scenarios.
- Non-destructive `npm run seed:catalog` import for existing installations.
- Short-lived, single-use pre-login cart selection carried through login/registration; notices for items that become unavailable.
- Native MongoDB HTTP coverage and CI jobs for standalone and replica-set transactions, including concurrent stock reservations and injected invoice-write rollback.
- AI prompt/provenance manifest and catalog/manual acceptance guide.

### Fixed

- Login/registration links retain the safe return destination; explicit admin shopping destinations are respected.
- Cart writes are queued, stale reads are ignored, and account changes stop queued writes.
- Multipart uploads return validation errors for rejected file types and enforce one-file request limits.

### Security

- Updated Express, Mongoose, Multer and vulnerable transitive dependencies; removed nodemon in favor of Node's built-in watcher. Node.js 22+ is required.
- Release `npm audit`: 0 vulnerabilities. Native database checks passed on MongoDB 7.0.45 for both supported write paths; live payment acceptance and browser/device QA remain separate checks.

## [2.1.0] — 2026-10-12

### Improved

- Storefront/admin design, navigation, cards, responsive forms and accessible dialogs/tabs
- Cookie session restoration, current-password verification and JWT invalidation
- Product administration pagination/search, six-image editor and archive/restore behavior
- Effective-price filtering/sorting and unavailable cart-item recovery
- Database-coordinated checkout replay/concurrency and ordered rollback; native transactions on replica sets
- Order/payment/invoice consistency, cross-origin gateway callbacks and visible risk/late-payment review
- HTML attribute escaping, CSV formula protection, request parsing/sanitization order and clean source packaging
- Illustrated sample products, setup/run instructions and regression coverage

### Verification

Automated checks pass locally; real database integration is opt-in. Real SSLCOMMERZ acceptance and browser/device QA remain environment checks, detailed in the update report.

## [2.0.0] — 2026-09-07

### Added

- Responsive Norda storefront redesign and original hero asset
- Managed brands and brand catalog filtering
- Expanded customer/shipping profiles
- BDT totals with configurable flat/free delivery
- One-per-order invoice records and printable views
- SSLCOMMERZ sandbox/live configuration, hosted session initiation, callbacks, IPN and validation checks
- Separate payment, invoice and fulfillment states
- Safe unpaid-order cancellation with stock restoration
- Delivered-purchase review verification
- Upload metadata and stricter file validation
- Admin invoice register, expanded dashboard, constrained workflow and protected CSV report
- Unit tests and project/API/architecture/testing documentation

### Changed

- Authentication now defaults to an HTTP-only cookie instead of browser-stored JWTs
- Cart and checkout totals are recalculated from current server prices
- Products use managed brand references while retaining a legacy display snapshot
- Server startup waits for MongoDB and validates security-critical configuration

### Removed

- Tracked environment-like file containing example credentials
- Publicly displayed demo administrator password
- Simulated card-payment option

## [1.0.0]

- Initial storefront and Express/MongoDB foundation.
