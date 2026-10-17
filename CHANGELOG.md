# Changelog

All notable project changes are recorded here.

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
