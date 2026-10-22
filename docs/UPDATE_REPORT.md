# NORDA 2.10.0 update report

Built from the latest `Norda-Main-v2.9.0.zip`. The professional README structure is retained and updated. The five selected development areas are implemented: advanced sales reports; customer/scoped staff management; refund/return notification improvements; active device sessions; selected-item returns and equal-price size/color exchanges.

Reports use Dhaka paid-order cohorts with exact coupon allocation, confirmed refund adjustments and explicit current refund reservations. Product/SKU rankings and CSV are available. Customer history uses safe projections; full-admin staff grants preserve registered passwords and have a coordinated audit. Current database permissions guard existing operational routes, while customer mutation ownership remains intact.

Device sessions persist signed session identities with expiry/revocation/version checks. Individual logout preserves other devices. Sign-out-others rotates this browser's cookie and invalidates unseen legacy tokens. Account password recovery/version invalidation remains compatible. Store notification preferences leave security emails enabled. Refund/return events use the existing outbox and SMTP; verified provider outcome history and an optional HMAC adapter endpoint distinguish delivery/bounce/complaint from SMTP acceptance. No paid SMS service is introduced.

Item returns reserve an amount without paying before receipt. Receipt decisions restore selected original SKUs and issue one credit note. Confirmed cash/provider settlement updates the case, credit note and invoice refund metadata while preserving original invoice totals. Stable purchased-unit ordinals conserve coupon paisa through rejections. Equal-price exchanges reserve exact replacement SKUs, release on withdrawal and record replacement delivery after receiving original items. Whole-order returns remain supported and cannot overlap item cases.

The input `.env` is retained byte-for-byte. Dependency versions, catalog/brand images and seed data are retained. Necessary authentication, authorization, notification, order/refund, store-setting and navigation paths are extended; unrelated behavior is covered by prior regression journeys. No baseline file is removed, no owner database is seeded or contacted and no real money is moved during tests.

See [MANAGEMENT_RETURNS.md](MANAGEMENT_RETURNS.md) for procedures, permissions, accounting definitions and limits, and [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md) for measured tests. Browser/device/print acceptance and actual merchant/SMTP/provider/courier outcomes remain deployment checks.

Keep your working laptop `.env`, Atlas/local database URI, SMTP values, uploads and Git history. From `server/`, run `npm ci`, `npm run verify`, `npm run dev`; no setup, reseed or manual migration is needed.

Suggested commit: `feat: add reports, scoped staff access, device sessions, and item returns`.
