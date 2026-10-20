# Verification results — NORDA 2.5.0

Prepared 2026-10-20 (Asia/Dhaka) against the supplied 2.4.2 archive. Runtime: Node.js 24.19.0; fresh MongoDB 7.0.45 test instances.

| Check | Result |
|---|---|
| Clean dependency install | `npm ci` passed; 117 packages installed |
| JavaScript syntax | All 112 JavaScript files passed |
| Default regression suite | 131 reported: 128 passed, 0 failed, 3 opt-in native entry points skipped without a test URI |
| Native MongoDB standalone | 42 reported, 42 passed, 0 failed/skipped; transaction detection false |
| Native MongoDB replica set | 42 reported, 42 passed, 0 failed/skipped; transaction detection true |
| Account recovery | Invalid, weak, mismatched, expired, replaced and reused tokens; simultaneous reset; session revocation; normal re-login; cart/profile preservation |
| Verification | Explicit confirmation, expiry/reissue, purpose isolation, one-use consumption and status; account ownership retained |
| Address book | Legacy compatibility; validation/ownership; add/edit/delete/default; ten-address concurrency; checkout and immutable invoice/order snapshots |
| Failure handling | Failed email and database writes leave retry paths intact; delayed failed delivery cannot delete a newer link; address locks are released after failures |
| SMTP | Real SMTP connection verification/message delivery to an isolated local listener; production rejects a listener without required TLS |
| Local email preview | Restricted directory/file permissions, private message output and production disable guard |
| Frontend handlers/assets | 22 pages, local links/assets, secret removal, form validation, duplicate-submit guards, address editing and checkout selection |
| Existing behavior | Catalog, auth/cart continuity, admin permissions, uploads, COD, stock/rollback, invoices/reviews/reports, local payment simulator and controlled gateway callbacks pass regressions |
| Dependency audit | 0 vulnerabilities; Nodemailer 10.1.7 added, every pre-existing dependency lock entry preserved |
| Supplied configuration | `server/.env` byte-for-byte preserved; no seed/migration or user-database writes performed by this update |
| Brand/catalog preservation | Existing product/brand image assets and seed definitions unchanged |
| Browser/device visual acceptance | Not performed; use the account guide/manual acceptance steps |
| External SMTP inbox | Not tested; provider credentials were not supplied |
| Public SSLCOMMERZ | Not tested; existing integration preserved and external provider acceptance remains separate |

Native tests create and drop only random `norda_test_*` databases in isolated MongoDB instances. They do not connect to the user's configured store. Default HTTP tests use an isolated, fault-injectable adapter; native suites also exercise actual Mongoose persistence on both topologies. SMTP fixture delivery proves the application's protocol path, not external sender reputation, public delivery or inbox placement.

`npm run verify` intentionally skips three native entry points without `NORDA_TEST_MONGO_URI`. They were explicitly run and passed for this release on both topologies. Expected failures in fault-injection tests may print controlled diagnostics while the test result remains passing.

No full-browser visual, keyboard or print certification is claimed. Check the new forms on the target browser/device and verify real inbox delivery after configuring SMTP, as described in [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md).
