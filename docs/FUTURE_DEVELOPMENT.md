# Future NORDA development

## Completed in 2.5.0

- Forgot/reset password with one-use expiring email links, hashed tokens, request limits and session invalidation.
- Email verification at signup, protected resend, verification status and SMTP/private development email delivery.
- Up to 10 delivery addresses with labels, edit/delete/default actions, legacy compatibility and a checkout picker. Existing order/invoice snapshots are retained.
- See [account setup and acceptance](ACCOUNT_RECOVERY.md). Real inbox delivery requires the owner's SMTP configuration; verification currently informs users without blocking established login/checkout access.

## Completed in 2.4.1

- Shared AI identity, complete invoice wordmark and consistent header/footer/admin/payment branding.
- Clean customer-facing payment headings with compact simulation disclosures and improved invoice wrapping.

## Completed in 2.4.0

- Separate local mobile/bKash and card/bank demo flows, with all three outcomes, ownership/replay guards and stock/invoice synchronization.
- Clear DEMO order/invoice/admin labels and exclusion from real revenue; no merchant credentials are needed for the simulator.
- Distinct homepage featured/new selections and inspection of all 24 product photos.
- Real SSLCOMMERZ acceptance remains separate from these local simulations. Demo reservation expiry is still pending; sessions can be resumed/cancelled now.

## Completed in 2.3.0

- Separate personal customer dashboard and visible account/role identity, with guest/public and admin views retained.
- Owner-scoped dashboard data, cross-tab/cached-page session guards and profile identity refresh.
- Expanded native acceptance for the complete COD/admin/review journey, two-customer isolation and controlled gateway notification states.
- Read-only setup preflight and a precise acceptance checklist. Actual browser/device checks and public SSLCOMMERZ acceptance remain release gates.

## Completed in 2.2.0

- 24-product, 12-category catalog with original AI photos and a repeatable import.
- Login/registration cart-selection continuity and guarded/queued cart changes.
- Dependency upgrades with zero vulnerabilities in the release audit.
- Real MongoDB standalone and replica-set checks for checkout, stock, invoice, cancellation, replay/concurrency and handled-failure rollback; CI includes both topologies.

## Release acceptance first

Run the public SSLCOMMERZ sandbox success/failure/cancel/IPN matrix and browser/device/keyboard/print checks. Repeat the included MongoDB tests against an isolated instance matching your deployment configuration. Resolve environment-specific issues before accepting live payments.

## Phase 1 — account and checkout recovery

- Optional recipient names and additional address formats
- Payment retry on an existing eligible order
- Reservation expiry and safe automatic stock release
- Stronger session/device management and ongoing dependency auditing

## Phase 2 — order operations

- Customer cancellation requests
- Return/refund workflow and payment-review resolution
- Courier information, tracking number and fulfillment history
- Order/payment/shipping email or SMS notifications
- Customer management and a dedicated payment review workspace

## Phase 3 — catalog and experience

- Size/color/SKU variants with independent stock
- Coupons, wishlist and optional guest cart/checkout
- Store settings, banners, contact details, FAQ and policies
- Sales reports, optional comparison/recently viewed products
- SEO metadata, sitemap and product structured data

## Phase 4 — public operations

- Durable object storage and unused image cleanup
- Database/media backups and restore drills
- Monitoring, redacted logs and operational alerts
- Deployment/HTTPS configuration, release automation and rollback planning

Dates and exact priorities can be decided in the next development session.
