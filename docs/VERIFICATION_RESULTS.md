# Verification results — NORDA 2.13.1

Verified **24 October 2026, Asia/Dhaka** with Node.js **24.22.1**, npm **11.9.0** and native MongoDB **7.0.45**. Source starts from the delivered v2.13.0. No owner database or real provider account was used.

| Executed check | Result |
|---|---|
| `npm run verify` | **309** JS syntax checks; **541 reported tests: 527 passed, 0 failed, 14 skipped** |
| `npm run test:integration`, standalone | **234 passed, 0 failed, 0 skipped**, compensation path |
| `npm run test:integration`, replica set | **234 passed, 0 failed, 0 skipped**, transaction path |
| New frontend/security checks | **27 passed**, included in default count |
| Actual isolated HTTP server | All **56 HTML pages**, **135** distinct pages/resources returned 200; readiness 200 |
| `npm audit --json` | **0 vulnerabilities**, after body-parser 1.20.9/Multer 2.5.0 updates |
| Source preservation | All **470** baseline files retained; config/seed/credentials, all assets and backend business source byte-identical |

The 14 default skips are native database entry points. Each ran in the separate complete native checks using explicit isolated loopback URIs, including after the dependency fixes. Coverage counts overlap. Archive CRC/content and source preservation are checked during packaging; see [manifest](UPDATE_FILES.json).

Coverage retains guest/registered cart/checkout/SKU/coupon/invoice/recovery/linking; scoped staff and owner isolation; inventory/warehouses/split COD; cancellation, payment review, returns, partial receipt/restock, priced exchanges, refunds/credit notes and settlement fees/net/replay; reservation/retry, fault/race guards, notifications/subscriptions; actual disposable SMTP protocol tests and controlled payment/courier/cloud adapters; native MFA/device/invitation routes; encrypted BSON/index/media isolated restore, controlled offsite retention/recovery, independent alerts, shell rollback and actual server/worker graceful restart/topology checks.

The new 26 frontend regressions exercise guest payment truth, expired access, changed-identity private responses, checkout contact, initialization errors, ordered refresh/previews and retryable storage/date failures. The new disposable HTTP-process test checks compressed JSON/trailing decoder bytes and subsequent healthy requests. Upload/signature/cleanup tests remain active under the updated Multer.

## Explicit limits

Cloud Browser could not open the **running** isolated local server (`ERR_CONNECTION_REFUSED`). Actual desktop/mobile layout, keyboard/zoom and printed/PDF appearance are **not marked passed**. HTTP, VM and responsive/print CSS checks do not replace visual acceptance.

No active merchant/public callback, owner SMTP inbox, carrier/Cloudinary/offsite/MFA setup, target VM/domain or Docker/Podman daemon was available. Real payments/refunds, public IPN, inbox/alert receipt, carrier booking, external upload, owner off-host recovery and actual container/HTTPS deployment were **not executed**. Controlled responses, local SMTP and deployment-shell harnesses are labelled accordingly.

See [the six-area final report](FINAL_RELEASE.md), [source preservation](SOURCE_PRESERVATION.md) and [acceptance checklist](ACCEPTANCE_CHECKLIST.md). These results support a tested maintenance source release; universal bug freedom or public production acceptance is not guaranteed.
