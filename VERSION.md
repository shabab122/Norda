# Norda delivery metadata

- Version: `2.5.0`
- Update base: supplied `Norda-Main(1).zip`, application version `2.4.2`
- Prepared: 2026-10-20 (Asia/Dhaka)
- Scope: forgot/reset password, email verification, multiple delivery addresses and checkout selection
- Stack: HTML, CSS, JavaScript, Node.js, Express, MongoDB
- Runtime: Node.js 22+; tested with 24.19.0 and MongoDB 7.0.45
- Catalog: 24 sample products, 12 categories and existing AI product images retained
- Customer page: `dashboard.html`; account settings: `profile.html`; admin: `admin/dashboard.html`
- Existing installation: `cd server`, `npm ci`, `npm run verify`, `npm run dev`; no seed or migration required
- Email: SMTP when configured; otherwise private local preview outside production. See `docs/ACCOUNT_RECOVERY.md`.
- Compatibility: existing login/checkout access and all supplied credentials remain unchanged
- Private configuration: supplied `server/.env` is retained byte-for-byte and remains ignored by Git
- Local application port: 5000; 3000 and 3002 remain reserved for GitStack/Gitea
- Verification and release boundaries: `docs/VERIFICATION_RESULTS.md`
- Local payment simulation and the separate real SSLCOMMERZ integration are preserved
- Brand assets and original generation prompt: `docs/BRANDING.md`
