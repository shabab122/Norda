# Verification results — NORDA 2.13.0

Recorded **24 October 2026 (Asia/Dhaka)** with Node.js 24.19.0, npm 11.9.0 and native MongoDB 7.0.45. Source baseline: the delivered `Norda-Main-v2.12.1.zip` (425 original files).

## Result

The six selected feature areas are implemented and the automated checks pass. The release adds reviewed settlement statements, different-price exchanges, reverse pickup/partial item receipts, full guest shopping, opt-in warehouse allocation/split parcels and customer availability email. Existing credentials, dependency selections and brand/catalog assets are preserved.

| Check | Measured result |
|---|---|
| `npm run check` | **307 JavaScript files passed** |
| `npm run verify` | **514 reported: 500 passed, 0 failed, 14 opt-in native entries skipped** without a test URI |
| Full native standalone suite | **234 passed**, 0 failed/skipped; handled-failure compensation |
| Full native single-member replica set | **234 passed**, 0 failed/skipped; MongoDB transaction path |
| Latest six-feature native recheck | **36 passed per topology**, including the final refunded-charge statement and recovery integrations |
| Dependency audit | **0 vulnerabilities**; no dependency selections changed |
| Static/HTTP resources | All **56 HTML pages**, local script/style/asset references and unique static IDs checked |
| New frontend coverage | **10 VM tests** for guest identity/initialization, request keys, stale previews/owners, escaping, adjustment funding controls, alert history, pickup links and parcel links |
| Preservation | All **425 original files** retained; private environment files, dependency selections and all existing asset bytes compared against the input |

The 14 native entry points run serially, each using an explicit loopback test URI and random `norda_test_*` databases. The MongoDB servers and test databases are disposable. No owner database was connected to, migrated, reseeded or modified. No actual external mail inbox, payment, bank transfer, carrier booking, cloud upload or remote bucket action was submitted.

The default suite intentionally skips native database entry points when `NORDA_TEST_MONGO_URI` is absent. Those entries were run separately against **both** actual MongoDB topologies. Expected fault-injection error diagnostics in passing tests do not represent unresolved production errors.

## New HTTP/database evidence

- Private guest cookie, registered/admin boundary, browser identity guard, exact variant cart and COD checkout, billing snapshot, one checkout/invoice on replay, cart clearing and cross-customer isolation.
- One-time cart merge, explicit matching verified-email purchase claim, ownership propagation and rollback after invoice write failure. Expiring one-use order-access recovery issues no cookie after a failed commit and remains retryable.
- Coupon limits across guest/contact and registered identities; prior records are not reset by merging/linking.
- Warehouse opt-in/default behavior, active/selected source availability, splitting disabled/max-location quantity, exact base/SKU reservations, parcel monetary conservation and repeated checkout.
- Two buyers racing for the final warehouse unit, conditional balances, source-specific cancellation and reservation ledger closure, rollback after invoice failure and archive protection.
- Partial parcel dispatch prevents cancellation; individual delivery cannot prematurely mark COD paid. Whole-order cash/status controls cannot bypass parcel aggregation.
- Warehouse reservation expiry releases original sources. Real-payment retry and admin approval of a late validated payment re-reserve the original plan, reopen the same parcel IDs and retain one original invoice.
- Higher/lower/equal-price and cross-product exchange snapshots; exact original coupon allocation, current-price approval guards, replacement stock and withdrawal restoration.
- Actual amount-checked manual adjustment receipt with replay protection; separate dedicated SSLCOMMERZ exchange callbacks/IPN with exact amount/currency/transaction/bank/risk matching. Repeated success/later failure remain monotonic; mismatched or missing risk is rejected; risky/late charges require review and cannot reopen a rejected exchange.
- Failed online attempt reconciliation before an additional manual charge, separate additional-charge refund, active-refund funding lock, duplicate resolution handling and original invoice preservation.
- Approved/owned reverse pickup, real-reference confirmation requirement, forward tracking, partial receipt, excess quantity/key mismatch rejection and complete-receipt refund/dispatch gating. Physical/restock quantities are separate; a failed receipt write compensates stock/progress/credit state.
- Verified-email exact-option sold-out subscriptions, duplicate suppression, another SKU staying silent, notice generation, local-delivery distinction, unsubscribe, re-subscription and concurrent scan/send guards.
- COD/exchange partial settlement, strict fee/signed-net arithmetic, immutable paid-state boundaries, duplicate import/reference protection, unpaid exceptions/audited exclusion, batch rollback, negative refund cash flow and spreadsheet-safe export. A refunded exchange retains a matchable original charge plus a separate refund entry.
- Sales cohorts expose additional exchange receipts/refunds without rewriting original sales, SKU or invoice totals.

## Retained regression coverage

The original account/reset/verification/address, login/MFA/staff invitation, device-session, coupon/wishlist/settings/CSV, base/SKU inventory, checkout recovery, payment review, cancellation/return/refund/credit-note, courier, SMTP/notification, SEO/cloud-media, backup/restore, independent monitoring and deployment-configuration tests remain in the suite. Native checks include actual worker startup, graceful restart, cookie/cart persistence and production topology preflight.

Source edits outside the new modules are the integration points needed for guest identity, fulfillment stock, exchange refunds, navigation, billing display, reports, backup leases and tests/documentation. Credential/configuration/seed values, dependencies and images are retained. No unrelated framework replacement or catalog reseed was performed.

## Provider and visible acceptance

| Area | Checked here | Target-environment follow-up |
|---|---|---|
| Payment | Adapter protocol, validated state transitions and real database persistence using controlled responses | Actual merchant-hosted order **and exchange** sessions, public success/fail/cancel/IPN/replay/risk/review/refund and money settlement |
| Email | Existing actual local SMTP protocol suites; durable subscription/recovery behavior and local delivery distinction | Owner inbox/Spam, sender/domain configuration and actual email links |
| Reverse pickup | Request/confirmed reference/tracking/receipt workflow | Arrange and verify real carrier acceptance; no automatic reverse-booking API is claimed |
| Warehouse parcels | Automatic source selection/reservation, tracking states and aggregate COD | Actual physical stock/picking, per-parcel courier arrangements and mobile staff acceptance |
| Browser/mobile/print | HTTP/static references, 56-page checks, frontend VM behavior and responsive/print CSS | Actual desktop/phone, keyboard, zoom and invoice/adjustment/credit-note print review |
| Deployment/recovery | Existing native encrypted archive/index/media restore, actual server lifecycle, configuration/shell rollback and topology checks | Real Docker build/container, domain/HTTPS/Caddy, target-host rollout, compatible rollback and independent provider recovery/alerts |

The available browser could not reach the isolated test server because access was blocked; no alternate browser path bypassed that restriction. These automated tests do not establish visual acceptance or a universal bug-free guarantee.

No Docker/Podman build daemon, public target VM/domain or configured merchant/provider account was available. Existing protocol/harness tests do not imply a public deployment, certificate, real bank statement download or actual remote-provider acceptance. Development simulations transfer no money.

## Operating notes

1. Keep your current working `.env`, optional integration file, uploads and database. Do **not** reseed for this release. From `server/`: `npm ci`, `npm run verify`, `npm run dev`.
2. Upgrade **every** app instance sharing the DB before using new guest, warehouse or priced-exchange records. 2.12 binaries are not compatible rollback targets after activation; use compatible source and test recovery on staging. Existing MFA/backup/JWT secrets stay the same.
3. Automatic warehouse allocation is initially disabled. Explicitly inspect balances/locations before enabling it. Single-order API carrier booking remains for one parcel; multiple warehouse parcels require separate confirmed carrier arrangements.
4. Follow [COMMERCE_EXPANSION.md](COMMERCE_EXPANSION.md) and [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md) for UI/provider checks. NORDA remains on port 5000; GitStack/Gitea ports 3000/3002 remain separate.
