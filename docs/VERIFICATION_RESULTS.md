# Verification results — NORDA 2.6.0

Prepared 2026-10-21 (Asia/Dhaka) from the latest `Norda-Main-v2.5.0.zip`. Runtime: Node.js 24.19.0 and native MongoDB 7.0.45 in isolated standalone and replica-set instances.

| Check | Result |
|---|---|
| Baseline before changes | 128 regression passes, 0 failures, 3 opt-in native skips |
| Clean dependency install | `npm ci` passed on the input lockfile; no dependency added/removed/upgraded |
| Final JavaScript syntax | All 124 JavaScript files passed |
| Final default regression suite | 192 reported: 188 passed, 0 failed, 4 opt-in native entry points skipped without a test URI |
| Native MongoDB standalone | 55 reported, 55 passed, 0 failed/skipped; transaction detection false |
| Native MongoDB replica set | 55 reported, 55 passed, 0 failed/skipped; transaction detection true |
| Reservation expiry | Online/simulation deadlines, legacy fallback, COD/paid/review/shipped/delivered exclusions, automatic startup worker, repeated/concurrent release and catch-up |
| Same-order payment retry | Original order/invoice/price/address preservation; newer cart retained; pending-session resume; terminal retry; request replay and concurrent initiation |
| Inventory recovery | Expired re-reservation, unavailable/archived products, partial-stock compensation, retry persistence failure and repeated expiry after recovery |
| Payment integrity | Missed-success reconciliation, strict transaction/session history, query errors, late/duplicate bank charges, sticky review, old-attempt failure protection and capture/expiry rollback |
| Frontend behavior | Duplicate-submit guards, account/order retry-key scope, timeout replay, account-change isolation, safe redirect hosts and actual order state over query hints |
| Prior full flow | Account reset/verification/addresses and SMTP fixtures; catalog/cart/login continuity; admin inventory/permissions; COD and online order/invoice state; fulfillment/reviews/reports/uploads and local simulation regressions |
| Dependency audit | Current `npm audit --json`: 0 vulnerabilities; dependency lock entries retained |
| Configuration preservation | Input `server/.env` byte-for-byte preserved; no user database, seed, account or credential changes made during preparation |
| Catalog/branding preservation | Existing seed definitions, AI product photos, brand assets and styles retained |
| Browser/device visual acceptance | Not performed; frontend handlers/static resources tested, target browser/mobile/keyboard/print acceptance remains manual |
| External SMTP inbox | Not retested; working SMTP settings configured on the laptop must be kept during update |
| Public SSLCOMMERZ | Provider calls in automated tests are controlled fixtures; actual merchant sandbox/public callback acceptance remains required |

Default tests exercise actual Express routes using an isolated fault-injectable adapter. Native suites exercise real Mongoose/MongoDB persistence and HTTP on both topologies, including existing account, customer/admin and payment journeys. Each native entry point creates and drops only a new random `norda_test_*` database in the isolated test server. The owner's configured NORDA database is not used.

`npm run verify` intentionally skips four native entry points without `NORDA_TEST_MONGO_URI`; these were explicitly run and passed on both topologies. Expected fault-injection diagnostics may appear in passing tests. SMTP fixture delivery proves protocol behavior, not external sender reputation or inbox placement.

The archive retains its input configuration. SMTP edits made afterward only on the laptop are not available in the input ZIP. Preserve that working `.env` and uploads when applying the source update; no setup, seed or manual migration is needed. Overdue legacy unpaid online reservations are eligible for normal automatic release when the updated server starts.

See [CHECKOUT_RECOVERY.md](CHECKOUT_RECOVERY.md) for policy/API/manual acceptance, [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md) for email/address setup, and [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md) for target-environment checks.
