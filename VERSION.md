# Norda delivery metadata

- Version: `2.4.0`
- Source: uploaded `Norda-Main.zip`, whose Git snapshot has `main` at `44fed3b`
- Delivery: source ZIP; existing GitHub repository/history is preserved by the update instructions
- Prepared: 2026-10-17
- Update base: `2.3.0`; mobile/card demo payments, stock/invoice safeguards and distinct home sections
- Catalog: 24 demonstration products, 12 categories and 24 original AI-generated product photos
- Existing database import: `cd server` then `npm run seed:catalog`
- Native persistence verification: MongoDB 7.0.45, standalone and single-member replica set
- Customer account page: `dashboard.html`; existing admin workspace: `admin/dashboard.html`
- Credentials: existing configuration is preserved; no default password or environment file is bundled
- Stack: HTML, CSS, JavaScript, Node.js, Express, MongoDB
- Local application port: 5000; 3000 and 3002 reserved for GitStack/Gitea
- Verification and release boundaries: `docs/UPDATE_REPORT.md`
- Demo: enabled outside production by default, with an optional disable flag; never transfers real money.
