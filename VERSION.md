# Norda delivery metadata

- Version: `2.8.0`
- Update base: latest `Norda-Main-v2.7.0.zip`
- Prepared: 2026-10-21 (Asia/Dhaka)
- Scope: courier/delivery tracking, transactional order/payment email and independent size/color product variants
- Stack: HTML, CSS, JavaScript, Node.js, Express, MongoDB
- Runtime: Node.js 22+; tested with Node.js 24.19.0 and MongoDB 7.0.45
- Update: retain working `.env`, SMTP settings and uploads; `npm ci`, `npm run verify`, `npm run dev`; no reseed/manual migration
- Credentials: input `.env` byte-for-byte preserved; later laptop-only changes must be retained from that laptop
- Dependencies: no added/removed/upgraded package
- Inventory: up to 50 retained SKU options; atomic per-option/total stock; historical order/invoice snapshots preserved
- Courier: store-entered history and optional HTTPS carrier link; no carrier API credentials required or invented
- Email: durable held/queued delivery, 15-second worker, five automatic attempts, stable Message-ID and admin retry
- Compatibility: prior account recovery, addresses, simple products, cart/checkout, reservation expiry/payment retry, reviews, cancellation/return/refund and simulation flows retained
- Application port: 5000; 3000 and 3002 remain reserved for GitStack/Gitea
- Guides: `docs/DELIVERY_NOTIFICATIONS.md`, `docs/PRODUCT_VARIANTS.md`
- Evidence/boundaries: `docs/VERIFICATION_RESULTS.md`
