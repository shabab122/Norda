# Changelog

All notable project changes are recorded here.

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
