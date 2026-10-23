# Verification results — NORDA 2.12.0

Recorded 23 October 2026 (Asia/Dhaka) using Node.js 24.19.0, npm 11.9.0 and native MongoDB 7.0.45. Built directly from `Norda-Main-v2.11.0.zip`.

| Check | Recorded result |
|---|---|
| JavaScript syntax | **268 files** including new independent operations scripts |
| Default `npm run verify` | **453 reported: 441 passed, 0 failed, 12 native entry points skipped** without an explicit test URI |
| Native standalone | **197 passed**, 0 failed/skipped; compensation path |
| Native single-member replica set | **197 passed**, 0 failed/skipped; transaction path |
| Additional server/preflight smoke | 1 passed on each topology: actual server/all workers, optional config, readiness, clean shutdown and production preflight accepting replica/rejecting standalone |
| Focused compatibility | New HTTP/security/inventory, infrastructure/rollback and frontend cases passed; MFA device rotation/password-change compatibility also rechecked on both native topologies |
| Dependency audit | **0 vulnerabilities**; dependency selections unchanged |
| Configuration/shell | Compose and all three workflow YAML files parsed; Bash syntax and actual release-script candidate-failure/rollback harness passed |
| Pages/resources | All **48 HTML pages**, local scripts/styles/assets and unique static IDs checked through existing HTTP/static regressions |
| Preservation | All 372 input files retained; original `.env`, config/seed data, catalog/brand assets and dependency selections preserved |

## New coverage

- **Deployment:** isolated environment validation, unchanged input credentials, forbidden staging live effects, permanent separation from ports 3000/3002, serialized shell release and a fake Docker executable that rejects a candidate and confirms restoration of the recorded previous code/shared state. Real production preflight is also run against isolated standalone/replica MongoDB and requires the new MFA capability.
- **Off-host backup:** the actual encrypted backup service and real MongoDB with intercepted signed S3 requests. Lost PUT response leaves one object; HEAD/readback recovery avoids duplicate upload. Fetch/checksum failure, authenticated archive verification, private latest pointer, guarded minimum-copy retention and another namespace's protection pass. A drill restores BSON/indexes/media into a new random target, checks/restores data and removes only that target.
- **Independent monitor:** controlled stopped-host/network failure without application MongoDB, durable state, one outage/recovery transition, finite maintenance grace, URL validation and alert-data redaction.
- **MFA:** RFC 6238 SHA-1 published vectors including post-2038 timestamps; encrypted pending/active secrets, hashed recovery codes, password checks, consumed OTP/recovery replay, challenge attempt bounds/expiry, token/revision guards, old-style token rejection and verified device session rotation/password-change compatibility.
- **Staff:** full-admin versus scoped/customer isolation, existing-password preservation, matching-email acceptance, required enrollment, demotion policy, revoke/expiry, retained delivery failure and new-token resend.
- **Inventory:** exact SKU transfers, satellite-versus-online saleability, request replay/mismatch, stale counts, handled write rollback, edit/archive protection, base-SKU identity guards and unchanged checkout stock behavior.
- **Catalog CSV:** strict quoted/multiline framing, exact preview hash, unique new product/SKU validation, unsafe images/invalid input rejection, retained import history, replay and all-new-record rollback after an injected failure.
- **Stock mail:** initial low episode, no repeat while still low, rearm after replenishment, unsubscribe and local-versus-SMTP acceptance state. No actual inbox is used.
- **Frontend:** MFA challenge does not create a session or finish a pending guest cart early; required enrollment/scoped navigation, account-switch secret/status guards and stale CSV preview rejection.
- **Signing:** actual SigV4 GET calculation matches the official AWS published example signature; provider protocol fixtures also check headers/payload hashes and namespace use.

The full previous account/cart/checkout/payment/review/refund/return/courier/variant/coupon/wishlist/settings/report/staff/device/SEO/cloud/backup suites remain included. Deliberate injected failures print bounded redacted diagnostics in passing runs.

## Execution and limits

Twelve native entries run serially on independently started standalone and single-member replica-set servers. Each owns only new random `norda_test_*` databases and isolated restore targets. Provider responses are intercepted, not live account calls. No owner's Atlas/local database was contacted, no real invitations/alerts were sent, no storage account/VM was activated and no money or parcels moved.

Startup tests run the actual `server.js` and all workers using an isolated URI, temporary integration file and disabled external side effects. Their configuration is not shipped. S3 readback/restore tests use real encrypted archive bytes and actual MongoDB persistence, but do not prove a particular S3-compatible account's permissions or network behavior.

Docker/Compose/Caddy artifacts were checked statically and the shell workflow was exercised with a controlled Docker executable. This environment did not provide a live Docker daemon/target VM/domain, so an actual image build, certificate/SSH/public deployment and real GitHub-hosted run remain owner acceptance. GitHub schedules are best effort, not an uptime SLA.

A reliable live browser/device visual pass was unavailable; HTTP/static/VM tests do not establish mobile/keyboard/print acceptance. Actual SMTP/inbox/Spam, authenticator-device setup, real alert receiver, bucket lifecycle/retention permissions, public SSLCOMMERZ/courier/cloud account acceptance and deployment capacity must be checked in the owner's environment.

Warehouse stock uses one existing online fulfillment location plus satellite balances moved through audited transfers. Automatic order splitting/routing, passkeys, multi-part archives over 5 GiB, local archive retention and production restore promotion are separate scope. SMTP delivery is at least once; stable IDs help with uncertain-send deduplication. Standalone compensation handles managed errors; public production uses replica-set transactions.

Keep working laptop credentials/uploads and upgrade all shared-DB app servers before enabling MFA. New secrets stay in a private optional integration file. See [RELEASE_AUTOMATION.md](RELEASE_AUTOMATION.md).
