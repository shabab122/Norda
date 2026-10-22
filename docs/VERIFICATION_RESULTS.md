# Verification results — NORDA 2.9.0

Prepared 2026-10-22 (Asia/Dhaka) from the latest `Norda-Main-v2.8.0.zip`, including the professional README supplied by the user. Runtime: Node.js 24.19.0/npm 11.9.0; isolated native MongoDB 7.0.45.

| Check | Result |
|---|---|
| Baseline before changes | 292 passes, zero failures, six opt-in native skips |
| Dependency installation | Clean `npm ci` passed; dependency versions retained |
| JavaScript syntax | All 180 JavaScript files passed |
| Final default suite | 338 reported: 331 passed, zero failed, seven native entry points skipped without an explicit test URI |
| Native MongoDB standalone | 112 passed, zero failed/skipped; compensation path |
| Native MongoDB replica set | 112 passed, zero failed/skipped; transaction path |
| Coupon pricing | Current selected-SKU/effective prices, integer-paisa rounding, percentage/fixed caps, minimums, dates, amount limits and discounted delivery threshold |
| Coupon integrity | Concurrent global last use, per-account limits, one redemption on replay, snapshot edits, expiry/retry, all payment initiation amounts and discounted return/refund totals |
| Coupon rollback | Injected invoice/cart/redemption write failures retain stock/cart and roll back order/invoice/use counters |
| Wishlist privacy | Missing credentials, account isolation, idempotent saves, current prices, archived/missing-item removal and exact-SKU cart continuation |
| Stock tools | BOM/quoted/formula-safe CSV export, strict parser, preview without writes, exact identifiers, simple/SKU stock and thresholds, parent totals, stale hashes/revisions and duplicate/fractional rejection |
| Import recovery | Durable replay, different-file key conflicts, interrupted history write recovery, unknown writes requiring review and mixed success/concurrent-conflict results without repeated stock writes |
| Low-stock alerts | Per-option thresholds, zero stock, legacy default threshold and retired/archived exclusion |
| Published settings | Default reads do not seed; revision conflicts, validated contact/prices/safe links, public-only projection and old invoice totals preserved after price/settings changes |
| Native unique indexes | Concurrent duplicate coupon code and wishlist inserts: one succeeds and one receives error 11000; existing SKU index race also passes |
| Frontend/resource checks | All 33 pages/local references, coupon apply/remove/keys/double-submit/account guards, wishlist response isolation, escaped help/policy/invoice/order content, banner controls and import retry/results |
| Previous full flow | Account recovery/verification/SMTP/addresses; catalog/cart/COD/gateway fixtures/simulator; invoice/reviews/reports/uploads; expiry/retry; review/cancellation/returns/refunds; tracking/outbox/variants |
| Dependency audit | `npm audit --json`: zero vulnerabilities |
| Environment preservation | Input `server/.env` byte-for-byte retained; database/JWT/admin/gateway/SMTP values unchanged; no owner database or seed used |
| Original assets/source | No baseline file removed; catalog photos, logo, seed data and unrelated account/payment/operations source retained |
| Browser visual acceptance | Live browser check could not complete because browser tooling timed out/unavailable; target desktop/mobile/keyboard/print acceptance remains manual |
| External acceptance | Owner Atlas/SMTP inbox, public SSLCOMMERZ callbacks/refund settlement and courier services were not contacted |

Default HTTP journeys run actual Express routes with an isolated fault-injectable model adapter. Seven native entry points run real Mongoose/MongoDB persistence and HTTP on separate standalone and single-member replica-set servers. Each entry point creates and drops only a new random `norda_test_*` database. No real money is moved. Fault-injection diagnostics can appear in passing test output.

The default command intentionally skips native entries unless `NORDA_TEST_MONGO_URI` is explicit. All native entries were separately run on both topologies. SMTP protocol tests use an isolated local listener; that does not establish actual inbox placement. Controlled gateway fixtures do not establish merchant permissions or settlement. Frontend VM/static checks do not establish a live browser/device visual result.

CSV files are processed per product, with durable results and explicit conflict/review outcomes. They are not all-or-nothing multi-product transactions. Coupon use is retained after successful order creation, including later cancellation/expiry/refund. Those policies are visible in the feature guide/UI. Standalone coordinated commerce writes keep their prior handled-error compensation boundary; replica sets provide the transaction path.

Keep your currently working `.env`, local/Atlas URI, later laptop-only SMTP changes and uploaded files when applying the update. No setup, reseed or manual migration is required. See [COMMERCE_TOOLS.md](COMMERCE_TOOLS.md) for usage, API and acceptance.
