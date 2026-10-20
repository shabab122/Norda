# Norda delivery metadata

- Version: `2.6.0`
- Update base: latest `Norda-Main-v2.5.0.zip`
- Prepared: 2026-10-21 (Asia/Dhaka)
- Scope: checkout recovery, reservation expiry, automatic stock release and same-order real SSLCOMMERZ retry
- Stack: HTML, CSS, JavaScript, Node.js, Express, MongoDB
- Runtime: Node.js 22+; tested with 24.19.0 and MongoDB 7.0.45
- Existing installation: retain working `.env` and uploads; run `npm ci`, `npm run verify`, `npm run dev`; no reseed or migration
- Credentials: input `server/.env` retained byte-for-byte; preserve later SMTP edits that exist only on the laptop
- Policy: default 30-minute unpaid online reservation, 30-second worker, no expiry for COD/paid/review
- Catalog: existing 24 AI product photos and 12 categories retained
- Compatibility: prior account recovery, addresses, login/cart, admin, COD, invoices/reviews/reports and payment simulation retained
- Application port: 5000; 3000 and 3002 remain reserved for GitStack/Gitea
- Recovery setup/API/acceptance: `docs/CHECKOUT_RECOVERY.md`
- Verified results and external checks: `docs/VERIFICATION_RESULTS.md`
