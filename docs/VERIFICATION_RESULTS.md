# Verification results — NORDA 2.10.0

Prepared 2026-10-22 (Asia/Dhaka), built directly from `Norda-Main-v2.9.0.zip`. Runtime: Node.js 24.19.0/npm 11.9.0 and isolated native MongoDB 7.0.45.

| Check | Result |
|---|---|
| Input baseline | 338 reported: 331 passed, zero failed, seven opt-in native skips |
| Dependency installation | Clean npm ci passed; dependency versions retained |
| JavaScript syntax | All 210 JavaScript files passed |
| Default release suite | 381 reported: 373 passed, zero failed, eight native entry points skipped without an explicit test URI |
| Native standalone | 142 passed, zero failed/skipped; handled-error compensation path |
| Native single-member replica set | 142 passed, zero failed/skipped; transaction path |
| Reporting | Dhaka boundary, impossible dates/range, cohort captured totals, cancelled paid orders, simulations excluded, exact coupons, confirmed refunds/net revenue, product/SKU rankings and CSV |
| Staff/customer access | Guest/customer rejection, registration escalation rejection, live scoped permissions, protected admin/self grants, safe search/history, password preservation and grant/audit rollback |
| Device sessions | Distinct sign-ins, owner revocation, current markers and safe projections, individual logout preserving another login, sign-out-others rotating the current session and invalidating unseen legacy JWTs, rollback on replacement-session failure |
| Notification improvements | Preference validation/suppression before delivery, security opt-out rejection, return/refund events, verified outcome history, replay/mismatch protection, bounce monotonicity, HMAC tampering/stale/unsigned rejection and complaint suppression |
| Item return policy/quantity | Owner isolation, snapshot policy after settings changes, expired windows, original quantity bounds, overlapping requests, whole-order/item overlap rejection and approval blocked during payment review |
| Return accounting | Integer-paisa allocation conservation including rejection gaps, held refunds cannot pay early, receipt/restock replay, one credit note, original invoice total unchanged and confirmed refund metadata/credit/case synchronization |
| Return fault recovery | Injected credit-note failure rolls back stock/case/hold; invoice failure rolls back approval/refund; retry remains usable |
| Exchanges | Equal-price/different-option validation, exact replacement reservation, approval replay, one-time withdrawal release, sold-out rejection, original receipt/stock choice, courier URL safety, shipment/delivery ordering and original invoice preservation |
| Gateway refund edges | Controlled confirmed rejection can retry on the same credit note; completed replay is safe; timeout stays unknown and blocks another submission; no real merchant/money used |
| Zero credit | Fully discounted merchandise creates a settled zero credit note without a refund transaction |
| Frontend/resources | All 41 pages and local assets served; shared branding, static IDs/references, escaped case/device text, safe tracking links, case-state form gating, staff navigation, account/stale-response guards and stable per-account intent keys |
| Prior regression journeys | Catalog/cart/COD/gateway/simulator, recovery/verification/addresses, invoices/reviews/uploads, expiry/retry, review/cancellation/whole-order refund, courier/outbox/SKU, coupons/wishlist/inventory imports/settings retained |
| Dependency audit | npm audit --json: zero vulnerabilities |
| Credentials/data | Input server/.env retained byte-for-byte; database/JWT/admin/gateway/SMTP values unchanged; no owner database read, seed or reset |
| Original files/assets | No baseline file removed; catalog images, logo, seed data and unrelated configuration retained |
| Browser/device/print | Live target-browser visual/mobile/keyboard and printed invoice/credit-note acceptance remains manual; automated checks are VM/static/HTTP |
| External services | Owner Atlas, actual SMTP inbox/bounce adapter, public SSLCOMMERZ callbacks/refund settlement and carrier services were not contacted |

Default HTTP tests run the actual Express routes with an isolated, fault-injectable model adapter. Eight native entries use real Mongoose/MongoDB and HTTP on separate standalone and single-member replica-set servers. Each creates/drops only a random `norda_test_*` database; none uses the owner's database. Fault-injection diagnostics in passing output are intentional.

The eight native entries intentionally skip in a default run without NORDA_TEST_MONGO_URI. All eight were separately executed on both topologies. Existing SMTP protocol tests use a local listener; that does not prove inbox placement. Controlled gateway fixtures do not prove merchant permissions/settlement. Email delivery outcomes require provider verification or the optional trusted signed adapter, separately from SMTP acceptance.

Reports are paid-order cohorts and not bank-settlement/accounting exports. Item returns do not credit original delivery fees. Exchanges support equal-price same-product size/color alternatives. SMS, carrier API booking, price-difference exchanges, partial-parcel receipt and external accounting remain separate optional scope. See [MANAGEMENT_RETURNS.md](MANAGEMENT_RETURNS.md) for the implemented policies, API and laptop acceptance.

Preserve your working `.env`, current Atlas/local URI, later laptop-only SMTP values, uploads and Git history on update. No setup/reseed or manual migration is required. New collections/indexes are additive; standalone multi-document writes retain the handled-error compensation boundary and replica sets provide the transaction path.
