# Norda delivery metadata

- Version: `2.7.0`
- Update base: latest `Norda-Main-v2.6.0.zip`
- Prepared: 2026-10-21 (Asia/Dhaka)
- Scope: administrator payment review, customer cancellation requests, whole-order returns and refund processing/status
- Stack: HTML, CSS, JavaScript, Node.js, Express, MongoDB
- Runtime: Node.js 22+; tested with 24.19.0 and MongoDB 7.0.45
- Existing installation: retain working `.env` and uploads; run `npm ci`, `npm run verify`, `npm run dev`; no reseed/manual migration
- Credentials: input `server/.env` retained byte-for-byte; preserve later SMTP edits that exist only on the laptop
- Dependencies: no added/removed/upgraded package; current audit reports zero vulnerabilities
- Reliability: shared order lock; replica-set transactions or handled-error compensation on standalone MongoDB; no blind resubmission of an uncertain refund
- Policy: whole-order physical returns; optional partial monetary refunds on eligible orders; provider confirmation or actual cash-repayment acknowledgement required
- Catalog: existing 24 AI product photos and 12 categories retained
- Compatibility: account recovery, addresses, cart/checkout, inventory, invoices/reviews/reports, reservation expiry, same-order payment retry and simulation retained
- Application port: 5000; 3000 and 3002 remain reserved for GitStack/Gitea
- Setup/API/acceptance: `docs/ORDER_OPERATIONS.md`
- Verified results and external checks: `docs/VERIFICATION_RESULTS.md`
