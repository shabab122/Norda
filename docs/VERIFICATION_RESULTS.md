# Verification results — NORDA 2.8.0

Prepared 2026-10-21 (Asia/Dhaka) from the latest `Norda-Main-v2.7.0.zip`. Runtime: Node.js 24.19.0/npm 11.9.0, native MongoDB 7.0.45 and an isolated local SMTP listener.

| Check | Result |
|---|---|
| Baseline before changes | 248 regression passes, zero failures, five opt-in native skips |
| Dependency install | Clean `npm ci` passed; no dependency package added/removed/upgraded |
| JavaScript syntax | All 159 JavaScript files passed |
| Final default regression suite | 298 reported: 292 passed, zero failed, six native entry points skipped without an explicit test URI |
| Native MongoDB standalone | 87 reported, 87 passed, zero failed/skipped; compensation path |
| Native MongoDB replica set | 87 reported, 87 passed, zero failed/skipped; transaction path |
| Variant catalog | Unique/case-normalized SKU, duplicate/invalid options, safe price/stock totals, identity retention, inactive public stock, expected-stock edit conflicts and legacy conversion guards |
| Database SKU constraint | Two concurrent native product inserts with the same SKU: one succeeds, one receives unique-index error 11000 |
| Selected inventory | Distinct cart lines, live selected prices/stock/photos, immutable invoice labels, final-unit SKU race, partial rollback, inactive historical restock, expiry/retry and received returns |
| Courier tracking | Owner/admin permissions, metadata/dispatch/progress/attempt/delivery, COD invoice synchronization, replay/conflicts, unsafe/backwards/closed guards and public paginated history |
| Email outbox | Held-until-commit, rollback, state coalescing, queued activation, atomic claims, bounded backoff, stable Message-ID, stale claim recovery and admin retry/privacy |
| Actual SMTP protocol | Existing account message and order message accepted by an isolated SMTP listener; explicit Message-ID retained; production TLS checks retained |
| Actual API lifecycle | Separate real MongoDB: server/index initialization, variant checkout, automatic worker delivery to a private file preview with invoice reference, graceful worker/server shutdown |
| Frontend behavior | Exact-option card/picker, guest continuity, selected-stock controls, escaped invoice/notes, owner account-change guard, shipment timeout/replay guard, email status truth and partial photo upload retry |
| Previous full flow | Account reset/verification/SMTP/addresses; cart/catalog/admin/checkout; COD/online simulation/gateway state fixtures; invoices/reviews/reports/uploads; reservation expiry/retry; payment review/cancellation/returns/refunds |
| Dependency audit | Current `npm audit --json`: zero vulnerabilities; dependency lock entries retained except project version |
| Configuration preservation | Input `server/.env` byte-for-byte preserved; database/JWT/admin/SMTP/gateway credentials unchanged; no owner database or seed changed |
| Source/assets preservation | No baseline files deleted; catalog/seed/AI images, branding/base CSS, auth/account-recovery/address-book source and unrelated configuration retained |
| Browser/mobile visual acceptance | Frontend VM/static/resource checks pass; actual target browser/mobile/keyboard/print inspection remains manual |
| External inbox/Spam | Not contacted; use the owner's working SMTP settings and check actual inbox/Spam and login links |
| Carrier automation | Store-entered tracking/history implemented; carrier API booking, polling, labels and webhooks not included |
| Public SSLCOMMERZ/refund settlement | Controlled provider fixtures in tests; merchant/public callback/refund acceptance remains target-environment work |

Default tests exercise actual Express routes with an isolated fault-injectable model adapter, services, frontend handlers and local SMTP protocol. Six native entry points exercise real Mongoose/MongoDB persistence and HTTP on standalone and replica-set paths. Each creates and drops only a new random `norda_test_*` database on an isolated test server. The runtime smoke check also uses a new isolated test database and file-mode mail. The owner's configured NORDA database is never used.

`npm run verify` intentionally skips six native entry points without `NORDA_TEST_MONGO_URI`; all were explicitly run in both modes. Expected fault-injection/rollback diagnostics can appear in passing tests. SMTP acceptance and local previews do not establish actual external inbox placement. Provider fixtures do not establish merchant permissions, public callback reachability or bank settlement. No real money was transferred and no actual courier was contacted.

The update keeps existing products as they are; variant records are created through the admin editor when the owner chooses. Startup initializes additive indexes and background workers. Existing overdue unpaid reservations and queued refunds continue their established recovery behavior. Order email is queued only for new changes, not mass-generated for all historical orders.

Retain the working local `.env` and uploads during update, especially SMTP changes made later only on the laptop. No setup, reseed or manual migration is required. For usage and acceptance see [DELIVERY_NOTIFICATIONS.md](DELIVERY_NOTIFICATIONS.md), [PRODUCT_VARIANTS.md](PRODUCT_VARIANTS.md), [ORDER_OPERATIONS.md](ORDER_OPERATIONS.md) and [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md).
