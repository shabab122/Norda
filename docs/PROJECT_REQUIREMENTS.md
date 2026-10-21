> Current version: 2.7.0. Stable baseline requirement IDs are retained; newer account, recovery and order-operation requirements extend them. See `ACCOUNT_RECOVERY.md`, `CHECKOUT_RECOVERY.md`, `ORDER_OPERATIONS.md` and `UPDATE_REPORT.md`. Historical branch/commit references describe the original delivery, not a required local branch.

# Norda — Project Requirements

## 1. Document control

| Field | Value |
|---|---|
| Product | Norda e-commerce website |
| Version | 2.7.0 |
| Delivery branch | `feature/v2-complete-commerce-flow` |
| Baseline commit | `8d913fa` — Basic foundation of Frontend & Backend |
| Intended market | Bangladesh |
| Currency | BDT |
| Status | Implemented baseline; environment acceptance testing required before release |

This document converts the three supplied flow sketches into explicit, testable requirements. Requirement IDs are stable references for issues, commits and acceptance results.

## 2. Product goal

Norda shall provide a clear end-to-end shopping experience and a small operational workspace. A customer can discover a product, create an account, maintain delivery details, purchase from a server-validated cart, receive an invoice, track payment and fulfillment, and review a delivered item. An administrator can prepare the catalog, process or cancel orders, observe store activity and export operational data.

## 3. Actors and permissions

| Actor | Capabilities |
|---|---|
| Visitor | Browse, search and filter the public catalog; view products and reviews; register or sign in |
| Customer | Visitor capabilities plus profile, cart, checkout, own orders, own invoices and delivered-purchase reviews |
| Administrator | Catalog/media management, all-order processing, invoices, dashboard and CSV reporting |
| SSLCOMMERZ | Hosted payment selection and result notifications; the server validates successful transactions |

An administrator is stored as a user with `role: "admin"`, rather than in a separate credentials collection. This keeps one authentication path and prevents customer/admin account logic from diverging.

## 4. Functional requirements

### 4.1 Authentication and customer profile

- **AUTH-01** A visitor shall register with full name, valid email and a password between 8 and 128 characters.
- **AUTH-02** Email addresses shall be unique and normalized to lowercase.
- **AUTH-03** A customer or administrator shall sign in through the same endpoint.
- **AUTH-04** The server shall issue a signed session token in an HTTP-only cookie. Bearer-token return shall be disabled by default and available only as an explicit development option.
- **AUTH-05** A signed-in user shall be able to sign out, invalidating the browser cookie.
- **AUTH-06** Redirects after sign-in shall accept only local Norda HTML destinations.
- **PROFILE-01** A customer shall view and update name and the default delivery address.
- **PROFILE-02** Delivery details shall include street line 1, optional line 2, city, district, postal code, country and phone.
- **PROFILE-03** A successful checkout shall save the confirmed delivery address to the customer profile.

### 4.2 Catalog and discovery

- **CAT-01** An administrator shall create, edit and delete categories.
- **CAT-02** A category used by a product shall not be deletable.
- **BRAND-01** An administrator shall create, edit, hide and delete brands.
- **BRAND-02** A brand used by a product shall not be deletable.
- **PROD-01** An administrator shall create, edit and delete products.
- **PROD-02** A product shall have a name, category, positive regular price and non-negative whole-number stock.
- **PROD-03** The management UI shall require a managed brand. The API retains a legacy brand-name snapshot for compatibility.
- **PROD-04** A discount price shall be zero or lower than the regular price.
- **PROD-05** A product may contain up to six image URLs and a featured flag.
- **PROD-06** Product slugs shall be unique, including after renaming.
- **DISC-01** A visitor shall browse a paginated catalog.
- **DISC-02** The catalog shall support literal keyword search, category, brand, featured, minimum price and maximum price filters.
- **DISC-03** The catalog shall support newest, price ascending, price descending and top-rated sorting.
- **DISC-04** Product cards and details shall display BDT pricing, discounts, rating and stock state.
- **DISC-05** The storefront shall be usable across desktop, tablet and mobile viewport sizes.

### 4.3 Media

- **MEDIA-01** Only administrators shall upload product media.
- **MEDIA-02** Uploads shall accept JPEG, PNG, WebP and GIF only when filename extension, declared MIME type and file signature agree.
- **MEDIA-03** Each upload shall be limited to 5 MB and stored under a generated filename.
- **MEDIA-04** Upload metadata shall record uploader, original name, stored filename, URL, MIME type and size.
- **MEDIA-05** Failed metadata creation shall remove the corresponding filesystem upload.

### 4.4 Cart and totals

- **CART-01** Each customer shall have a private persistent cart.
- **CART-02** The server shall use the current effective product price; the browser shall not set price.
- **CART-03** Add and update operations shall require a positive whole-number quantity within current stock.
- **CART-04** A customer shall update quantity, remove an item or clear the cart.
- **CART-05** Cart reads shall refresh stored prices from the catalog.
- **TOTAL-01** Subtotal shall equal the sum of server prices multiplied by quantities.
- **TOTAL-02** Default delivery shall be ৳120 below a ৳5,000 subtotal and free at or above ৳5,000. Both values shall be configurable on the server.
- **TOTAL-03** Currency shall be BDT.

### 4.5 Checkout, stock and invoices

- **ORDER-01** Checkout shall require an authenticated customer, non-empty cart and complete valid shipping address.
- **ORDER-02** The server shall rebuild all order lines and totals from current product records.
- **ORDER-03** The server shall reserve stock before creating the order and reject an item with insufficient stock.
- **ORDER-04** If order or invoice creation fails, stock already reserved by that attempt shall be rolled back.
- **ORDER-05** A successful checkout shall create an order, create exactly one invoice, save the delivery profile and clear the cart.
- **ORDER-06** An order shall preserve product name, price and image snapshots so later catalog edits do not change history.
- **ORDER-07** Order fulfillment states shall be `pending`, `processing`, `shipped`, `delivered` or `cancelled`.
- **ORDER-08** Valid forward transitions shall be pending → processing → shipped → delivered. Pending or processing may be cancelled; shipped and delivered orders may not be cancelled in this baseline.
- **ORDER-08A** An online order shall not enter fulfillment until SSLCOMMERZ payment has been validated.
- **ORDER-09** Cancelling an unpaid order shall restore its reserved stock once only and record the reason and time.
- **ORDER-10** Direct paid-order cancellation shall remain blocked by the original status endpoint. Approved cancellation requests shall coordinate verified captured-payment refunds, stock restoration and invoice state through the operations workflow.
- **ORDER-11** Unpaid online/simulated reservations shall expire after the configured period; startup and periodic sweeps shall restore stock once and synchronize the existing invoice. COD, paid and review orders are excluded.
- **ORDER-12** Expiry shall preserve order/invoice records. Legacy unpaid online orders derive their deadline from creation time; expired real orders must re-reserve available non-archived products before recovery.
- **INV-01** Every order shall receive a unique invoice number.
- **INV-02** The invoice shall preserve line items, delivery address, subtotal, shipping fee, total, currency and payment state.
- **INV-03** A customer shall access only invoices belonging to that account.
- **INV-04** An administrator shall list and filter all invoices.
- **INV-05** The invoice view shall support browser printing or saving to PDF.

### 4.6 Payments

- **PAY-01** Checkout shall support cash on delivery.
- **PAY-02** Online payment shall be visible only when the required SSLCOMMERZ configuration is present.
- **PAY-03** SSLCOMMERZ credentials and API calls shall remain on the server.
- **PAY-04** The server shall create a unique transaction ID and persist a payment record before redirecting the browser.
- **PAY-05** The server shall send success, failure, cancellation and IPN callback URLs when creating the hosted session.
- **PAY-06** A successful callback/IPN shall not mark an order paid until the validation API confirms status, transaction ID, amount, currency and acceptable risk level.
- **PAY-07** Valid online payment shall mark the payment and order paid, synchronize the invoice and move a pending order to processing.
- **PAY-08** Failed or cancelled online checkout shall keep the order unpaid, with eligible retry/resume until payment, manual cancellation or automatic reservation expiry.
- **PAY-09** Online order totals shall be limited to the configured gateway range used by this implementation: ৳10 through ৳500,000.
- **PAY-10** Gateway redirect URLs returned to the client shall use HTTPS and an exact `sslcommerz.com` host or subdomain.
- **PAY-10A** Live-mode application and callback base URLs shall use HTTPS; local HTTP URLs are allowed only in sandbox mode.
- **PAY-11** Delivering a cash-on-delivery order shall record it paid; an administrator may also explicitly confirm received cash.
- **PAY-12** The browser result page shall derive its displayed payment outcome from the authenticated order record, not trust callback query text alone.

- **PAY-13** Owner-only real payment retry shall retain the same order/invoice, original totals/address and newer cart. Previous attempts must be queried/reconciled before another session is created; pending sessions are resumed.
- **PAY-14** Repeated retry requests and callbacks shall not duplicate stock or payments. Old failure hints cannot overwrite a newer attempt; late or multiple successful charges require review and block fulfillment.

### 4.7 Orders and reviews

- **HIST-01** A customer shall list only that customer’s orders.
- **HIST-02** Each order view shall show line items, totals, fulfillment status, payment status, method, destination summary and invoice link.
- **REVIEW-01** Public visitors shall view product reviews.
- **REVIEW-02** Only a customer with a delivered order containing the product shall submit or update that product review.
- **REVIEW-03** Verified reviews shall contain a one-to-five rating and an optional comment up to 1,200 characters.
- **REVIEW-04** Product rating average and count shall be recalculated after a review is saved.

### 4.8 Order operations (2.7)

- **OPS-01** Customers shall request cancellation only before shipment and full-order return only after paid delivery, with ownership and eligibility checks.
- **OPS-02** Pending cancellation shall block fulfillment and payment retry. Administrator rejection shall retain payment/inventory state; approval shall restore reserved stock once and queue any remaining captured-payment refund.
- **OPS-03** Return approval shall not change stock or initiate repayment. Recording physical receipt of all items shall require an explicit restock decision; only sellable returns shall increase stock, once.
- **OPS-04** Real payment review shall show recorded attempts/reasons, freshly validate captured charges, require explicit risk acknowledgement when applicable and record administrator notes/decisions. Additional charges must be fully refunded before approving a retained sale.
- **OPS-05** Refunds shall have a persistent replay key, unique transaction ID, source bank charge, amount cap and state history. Pending/uncertain refunds shall reserve their source balance; duplicate-charge refunds shall be separate from original-order refunds.
- **OPS-06** Provider initiation shall remain pending until a matching refund query confirms `refunded`. A timeout/interrupted submission shall require reconciliation, never blind resubmission or manual gateway-completion overrides.
- **OPS-07** COD repayment shall require an explicit actual-payment acknowledgement, receipt/reference and audit note. Simulation shall remain identified and move no real money.
- **OPS-08** Original invoice identity/items/totals/address shall remain immutable; refund amounts and return state shall synchronize separately. Confirmed ordinary refunds shall reduce net revenue; review/simulated funds and additional-payment refunds shall not inflate/double-reduce it.
- **OPS-09** Customer operation views shall exclude private audit notes, payment session secrets and bank/provider references. Operations shall share the existing order lock and transaction/compensation unit.
- **OPS-10** Full-order returns shall support partial monetary refund records after eligibility; per-item quantities, exchanges, configurable windows and formal credit notes remain future development.

### 4.9 Administration and reporting

- **ADMIN-01** Every management endpoint shall require both authentication and the administrator role.
- **ADMIN-02** The overview shall show products, categories, brands, customers, orders, invoices, paid revenue, pending orders, failed payments, fulfillment counts, low-stock products and recent orders.
- **ADMIN-03** The order workspace shall filter by fulfillment and payment state.
- **ADMIN-04** An administrator shall only be offered valid next fulfillment actions.
- **ADMIN-05** The invoice register shall filter by payment state and link to the printable invoice.
- **REPORT-01** An administrator shall export up to 10,000 orders as UTF-8 CSV.
- **REPORT-02** CSV export shall support order-state, payment-state and inclusive date-range filters.
- **REPORT-03** CSV values shall be quoted, escape embedded quotes and neutralize spreadsheet-formula prefixes.

## 5. Non-functional requirements

### Security

- **SEC-01** Passwords shall be hashed with bcrypt and never selected by default.
- **SEC-02** JWT secrets shall contain at least 32 characters; startup shall fail without one.
- **SEC-03** Production startup shall require an explicit browser-origin allowlist.
- **SEC-04** API responses shall omit stack traces and replace production 5xx details with a generic message.
- **SEC-05** The API shall apply secure HTTP headers, request-size limits, rate limiting, Mongo query sanitization and HTTP parameter pollution protection.
- **SEC-06** Server-generated identifiers, prices, role decisions and paid state shall not trust browser-supplied values.
- **SEC-07** Environment secrets, local runtime uploads and dependencies shall not be committed or included in public distributions. This personal update preserves the supplied ignored `.env` for the owner; retain the working local environment when applying source.

### Reliability and integrity

- **REL-01** The API shall start listening only after MongoDB connects.
- **REL-02** SIGINT and SIGTERM shall close HTTP and database connections gracefully.
- **REL-03** Payment success processing shall be idempotent for an already-paid transaction.
- **REL-04** Stock restoration shall use a claim flag and compensate successful increments if a later restoration step fails.
- **REL-05** Historical order and invoice prices shall remain independent of later catalog changes.

### Usability and accessibility

- **UX-01** Interactive controls shall have visible keyboard focus.
- **UX-02** Forms shall use explicit labels, browser autocomplete hints and meaningful error states.
- **UX-03** Dynamic checkout, cart, invoice and order areas shall announce updates through live regions where appropriate.
- **UX-04** Primary pages shall have unique titles and descriptions.
- **UX-05** The UI shall not rely on color alone for order or payment state; text labels are mandatory.
- **UX-06** The invoice shall have print-specific layout rules.

### Maintainability

- **MAIN-01** HTTP composition, controllers, business services, models and utilities shall remain separate.
- **MAIN-02** No client build system shall be required for v2.
- **MAIN-03** Core deterministic business rules shall have automated unit tests.
- **MAIN-04** API and environment behavior shall be documented in the repository.

## 6. Source-diagram traceability and design decisions

| Supplied concept | v2 implementation |
|---|---|
| Admin login → upload media → category and brand → product | Admin role, upload endpoint/metadata, category and brand CRUD, product editor |
| Customer browse → login/register → cart → profile → invoice → gateway | Storefront filters, shared auth, persistent cart, saved address, order/invoice service, SSLCOMMERZ module |
| Payment success → paid → delivered → review | Validated callback marks paid; admin transition to delivery; delivered-purchase review gate |
| Payment failed → unpaid → admin cancel/restock | Failed payment remains on unpaid order; cancel transition restores inventory once |
| Dashboard and CSV | Aggregated overview plus protected CSV endpoint |
| `admins` collection | Represented by `users.role`, avoiding duplicate identity storage |
| `invoiceproducts` collection | Embedded immutable invoice line items, appropriate to an order-owned MongoDB snapshot |
| Route → auth → controller → MongoDB | Express router, JWT middleware, controller/service layers and Mongoose models |

## 7. Scope boundaries

Included: physical-product catalog, one currency, flat/free delivery rule, one shipping address per order, COD, SSLCOMMERZ hosted checkout, manual fulfillment, invoice history, verified reviews, local uploads and CSV reporting.

Included since the baseline: account recovery/email verification, multiple saved addresses, local payment simulation, reservation expiry/same-order retry, payment review resolution, customer cancellation requests, whole-order return portal and provider-confirmed/refund-ledger workflows.

Deferred: coupons, tax engine, variants/SKUs, wish lists, item-level returns/exchanges, configurable return policies, split shipments, multiple warehouses, customer deletion, order/shipping/refund email/SMS, formal credit notes/accounting integration, cloud media storage, recommendation engine, translations, multiple currencies and marketplace sellers.

## 8. Release acceptance summary

The release candidate is acceptable when:

1. All automated tests pass on the target Node version.
2. A clean database can be seeded without a hardcoded password.
3. The complete COD flow passes, including delivery, invoice and verified review.
4. The SSLCOMMERZ sandbox success, failure, cancellation and IPN cases pass with a public callback URL.
5. Concurrent stock checks do not permit inventory below zero.
6. Cancelling an eligible unpaid order restores stock exactly once.
7. Customer A cannot read Customer B’s order or invoice.
8. A non-admin cannot use any management or report endpoint.
9. CSV opens correctly and formula-like customer values remain inert.
10. Responsive, keyboard and print checks in `TESTING_GUIDE.md` pass.

Detailed execution steps are in [TESTING_GUIDE.md](TESTING_GUIDE.md).
