# Verification results — NORDA 2.7.0

Prepared 2026-10-21 (Asia/Dhaka) from the latest `Norda-Main-v2.6.0.zip`. Runtime: Node.js 24.19.0/npm 11.9.0 and native MongoDB 7.0.45 on isolated standalone and replica-set instances.

| Check | Result |
|---|---|
| Baseline before changes | 188 regression passes, 0 failures, 4 opt-in native skips |
| Clean dependency install | `npm ci` passed; no dependency added/removed/upgraded |
| JavaScript syntax | All 142 JavaScript files passed |
| Final default regression suite | 253 reported: 248 passed, 0 failed, 5 opt-in native entry points skipped without a test URI |
| Native MongoDB standalone | 69 reported, 69 passed, 0 failed/skipped; transaction detection false |
| Native MongoDB replica set | 69 reported, 69 passed, 0 failed/skipped; transaction detection true |
| Customer requests | Eligibility, ownership, replay/concurrency, pending cancellation shipment/retry guards, reject/unpaid/paid approval and public decision messages |
| Returns and inventory | Whole-order paid-delivery eligibility; approval without restock; physical receipt; damaged/non-restocked choice; exact-once inventory and refund; stock/audit/invoice rollback |
| Payment review | Fresh captured-charge verification, real risky initial payment, acknowledgement, retained-charge selection, extra captures, expired-stock recovery and manually cancelled-order guards |
| Refund ledger | Source-bank amount caps, partial refunds, replay, queued/accepted/confirmed states, cash receipts, simulation, unknown submissions, reference recovery and duplicate-reference protection |
| Refund worker and provider contract | Startup sweep; queued/config-missing and interrupted submitting recovery; existing-reference query; documented refund transaction/amount fields; redacted gateway failures |
| Financial history | Original invoice identity/totals preserved; pending/completed/extra refund metadata; review funds excluded; net revenue/CSV; private audit projection |
| Frontend behavior | Escaped notes/references, eligibility/receipt/risk controls, double-click guards, timeout intent preservation, account-change isolation and invoice refund display |
| Prior full flow | Account email/reset/verification/addresses; catalog/cart/login continuity; admin permissions/inventory; COD and online checkout/invoice/fulfillment/reviews/reports/uploads; simulation, reservation expiry and same-order retry |
| Dependency audit | Current `npm audit --json`: 0 vulnerabilities; all non-root dependency lock entries retained |
| Configuration preservation | Input `server/.env` byte-for-byte preserved; no owner database, seed, account, password or credential changes made |
| Source preservation | No baseline files deleted; catalog/seed/AI photos/brand assets/base CSS, account-recovery/address-book source and unrelated handlers retained |
| Browser/device visual acceptance | Not performed; frontend VM/static/resource checks passed; target browser/mobile/keyboard/print checks remain manual |
| External SMTP inbox | Not retested; retain the working SMTP settings configured on the laptop |
| Public SSLCOMMERZ/refund settlement | Automated responses are controlled fixtures; merchant permissions/IP allowlisting, public callback acceptance and actual provider-confirmed sandbox repayment remain target-environment checks |

Default tests exercise the actual Express routes with an isolated, fault-injectable model adapter. Five native entry points exercise real Mongoose/MongoDB persistence and HTTP on both topologies. Each creates and removes only a new random `norda_test_*` database on the isolated server. The owner's configured NORDA database is not used.

`npm run verify` intentionally skips five native entry points without `NORDA_TEST_MONGO_URI`; all were explicitly run and passed in both modes. Expected injected-failure diagnostics can appear in passing tests. Provider fixtures verify application decisions/protocol fields, not merchant permission, bank settlement or public reachability. SMTP fixtures verify protocol behavior, not external sender reputation/inbox placement. No real money was transferred.

The archive retains its input configuration. SMTP edits made afterward only on the laptop are not available in the source ZIP. Preserve the working `.env` and uploads when applying this update; no setup, seed or manual migration is needed. Existing overdue unpaid reservations remain eligible for the normal expiry worker. The refund worker resumes only saved eligible refunds and never blindly resubmits an uncertain transfer.

See [ORDER_OPERATIONS.md](ORDER_OPERATIONS.md) for policy/API/manual acceptance, [CHECKOUT_RECOVERY.md](CHECKOUT_RECOVERY.md) for expiry/retry, [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md) for email/address setup and [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md) for environment checks.
