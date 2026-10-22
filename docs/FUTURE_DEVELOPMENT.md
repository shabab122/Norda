# Future NORDA development

## Completed in 2.10.0

- Daily/monthly sales reports, top products/SKUs, coupon savings and confirmed refund/net revenue cohorts.
- Customer search/history and audited, explicit staff permissions with a staff workspace.
- Return/refund email, account preferences and verified delivery/bounce/complaint history; optional signed provider adapter endpoint.
- Active device sessions, individual revocation and sign-out-others with legacy JWT invalidation.
- Selected-item/quantity returns, order-snapshot return windows, held refunds, credit notes and equal-price size/color exchanges with replacement stock/tracking.
- See [the feature and acceptance guide](MANAGEMENT_RETURNS.md).

## Completed in 2.9.0

- Coupon center and guarded fixed/percentage checkout discounts with limits and immutable invoice/payment/refund snapshots.
- Account wishlists and safe cart continuation, including exact variant selection.
- Product/SKU stock CSV export/preview/import, durable results and individual low-stock thresholds/alerts.
- Admin storefront banner/announcement/contact/FAQ/policy/delivery settings and public help pages.
- See [the complete feature guide](COMMERCE_TOOLS.md). Bulk creation of new catalog/SKU identities, stock-email subscriptions and multi-warehouse tooling remain separate future scope.

## Completed in 2.8.0

- Courier name/tracking number/link, administrator dispatch/progress, append-only history and a customer tracking view. Carrier API booking/polling/webhooks are separate future integration work.
- Queued order confirmation/payment/shipping/delivery/cancellation email through current SMTP, retries/worker recovery and admin delivery status/retry. Existing account mail and private previews remain compatible.
- Size/color SKU variants with independent price/photos/stock, guest/cart continuity, immutable order/invoice snapshots and selected-SKU stock through cancellation, expiry/retry and received returns.
- See [delivery/email setup](DELIVERY_NOTIFICATIONS.md) and [variant guide](PRODUCT_VARIANTS.md). Actual inbox placement, browser/device acceptance and merchant settlement still require the deployment environment.

## Completed in 2.7.0

- Admin payment review: transaction/reason history, fresh gateway verification, risk acknowledgement, retained-charge selection, additional-charge refunds, approval/refunded closure and private audit notes.
- Customer cancellation requests with admin decisions, one-time stock restoration and captured-payment refund coordination.
- Whole-order returns with physical receipt/restock decisions, real gateway/COD/simulated refund status, partial monetary refunds, uncertain-result reconciliation and original invoice synchronization.
- See [order operations](ORDER_OPERATIONS.md). Live merchant permissions, public sandbox/refund settlement and browser/device acceptance still require the owner's environment.

## Completed in 2.6.0

- Unpaid online/simulated reservation expiry, startup catch-up and automatic stock release with one existing invoice.
- Same-order real SSLCOMMERZ retry, gateway-history reconciliation and pending-session resume. Expired orders re-reserve stock; snapshot prices, addresses and newer carts are retained.
- Late/duplicate payment review, old-attempt callback protection, customer/admin recovery messages and tests on both MongoDB topologies.
- See [checkout recovery policy, setup and acceptance](CHECKOUT_RECOVERY.md). Public merchant sandbox checks remain environment-specific; refunds/review resolution are included in 2.7.0.

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
- Real SSLCOMMERZ acceptance remains separate from these local simulations. Demo reservation expiry is included in 2.6.0; active sessions can be resumed/cancelled.

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
- Optional MFA/passkeys and ongoing dependency auditing

## Phase 2 — order operations

- Carrier-specific booking, labels, rates, authenticated webhooks/polling and delivery-exception/return-to-sender workflows
- Optional SMS provider, provider-specific mail adapters and delivery/complaint remediation tooling
- Price-difference exchanges, partial-parcel receipt, discretionary refund deductions and external credit-note/accounting integration
- Optional staff MFA, invitation lifecycle and organization-specific permission expansion

## Phase 3 — catalog and experience

- Optional bulk creation of new catalog/SKU records, warehouse inventory and low-stock email subscriptions
- Optional full guest cart/checkout
- Bank settlement/cash-flow reconciliation reports, optional comparison/recently viewed products
- SEO metadata, sitemap and product structured data

## Phase 4 — public operations

- Durable object storage and unused image cleanup
- Database/media backups and restore drills
- Monitoring, redacted logs and operational alerts
- Deployment/HTTPS configuration, release automation and rollback planning

Dates and exact priorities can be decided in the next development session.
