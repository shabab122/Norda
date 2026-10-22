# Norda 2.11 — API Reference

## Coupons, wishlist, inventory and store content — 2.9.0

See [COMMERCE_TOOLS.md](COMMERCE_TOOLS.md) for implemented behavior, usage/limits, routes and acceptance scenarios. These four areas remain implemented. Sales reports, staff/customer management, device sessions, notification outcomes and selected-item returns/exchanges are now implemented in 2.10; see [MANAGEMENT_RETURNS.md](MANAGEMENT_RETURNS.md). The optional eCourier API, SEO, Cloudinary media and backup/monitoring tools are now implemented in 2.11; see [PRODUCTION_TOOLS.md](PRODUCTION_TOOLS.md) for configuration and live-account acceptance. Existing credentials/data are preserved.

Base path: `/api`. JSON is used unless the endpoint is marked multipart or CSV.

Authentication accepts the `norda_token` HTTP-only cookie. Optional development clients can send `Authorization: Bearer <token>` only when `AUTH_RETURN_TOKEN=true`. `Customer` means any authenticated user; `Admin` means full administrator; operational endpoints also accept a staff account with the explicitly assigned scope. Staff-management endpoints remain full-admin only. Sessions are persisted and individually revocable. New routes/bodies and the signed delivery-event contract are in [MANAGEMENT_RETURNS.md](MANAGEMENT_RETURNS.md#api-additions).

## Common behavior

Successful endpoints return JSON and an appropriate 2xx status. Errors use:

```json
{ "message": "Human-readable explanation" }
```

Typical codes: `400` invalid input, `401` missing/invalid session, `403` wrong role/owner, `404` missing record, `409` state or uniqueness conflict, `429` rate limit, `502` gateway failure and `503` unavailable configuration.

## Health and authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Service health |
| GET | `/store/config` | Public | Currency and delivery thresholds |
| POST | `/auth/register` | Public | Create customer and session |
| POST | `/auth/login` | Public | Create customer/admin session |
| POST | `/auth/logout` | Public | Clear session cookie |
| POST | `/auth/forgot-password` | Public, rate limited | Request a one-use password reset email; generic account-existence response |
| POST | `/auth/reset-password` | Public, rate limited | Consume token and set a new password; revoke previous sessions |
| POST | `/auth/send-verification` | Customer, rate limited | Request/resend verification to the account email |
| POST | `/auth/verify-email` | Public, rate limited | Explicitly consume a verification token |
| GET | `/auth/addresses` | Customer | Read own saved addresses, default ID and limit |
| POST | `/auth/addresses` | Customer | Add a labeled delivery address |
| PUT | `/auth/addresses/:id` | Customer | Replace own saved address fields |
| PUT | `/auth/addresses/:id/default` | Customer | Choose own default delivery address |
| DELETE | `/auth/addresses/:id` | Customer | Remove own address; history is preserved |
| GET | `/auth/profile` | Customer | Read profile, email verification and address book |
| PUT | `/auth/profile` | Customer | Update name, address and optional password |

See [account request examples and compatibility rules](ACCOUNT_RECOVERY.md#api-contract). Responses never include reset/verification tokens or password hashes.

Register body:

```json
{ "name": "Amina Rahman", "email": "amina@example.com", "password": "at-least-8-characters" }
```

Profile update body:

```json
{
  "name": "Amina Rahman",
  "address": {
    "line1": "12 Lake Road",
    "line2": "Apartment 4B",
    "city": "Dhaka",
    "district": "Dhaka",
    "postCode": "1205",
    "country": "Bangladesh",
    "phone": "+8801712345678"
  }
}
```

## Categories and brands

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/categories` | Public | Category list |
| GET | `/categories/:id` | Public | Category detail |
| POST | `/categories` | Admin | Create category |
| PUT | `/categories/:id` | Admin | Update category |
| DELETE | `/categories/:id` | Admin | Delete unused category |
| GET | `/brands` | Public | Visible brands |
| GET | `/brands/manage` | Admin | All brands, including hidden |
| GET | `/brands/:id` | Public | Brand detail |
| POST | `/brands` | Admin | Create brand |
| PUT | `/brands/:id` | Admin | Update/hide brand |
| DELETE | `/brands/:id` | Admin | Delete unused brand |

Category body: `{ "name": "Electronics", "image": "https://…" }`.

Brand body: `{ "name": "SoundMax", "description": "…", "logo": "https://…", "isActive": true }`.

## Products

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/products` | Public | Filtered paginated catalog |
| GET | `/products/:id` | Public | Product detail |
| POST | `/products` | Admin | Create product |
| PUT | `/products/:id` | Admin | Update product |
| DELETE | `/products/:id` | Admin | Delete product |

List query parameters: `category`, `brand`, `keyword`, `featured=true|false`, `minPrice`, `maxPrice`, `sort=newest|price_asc|price_desc|top_rated`, `page` and `limit` (maximum 100).

Product write body:

```json
{
  "name": "Wireless Bluetooth Headphones",
  "description": "Comfortable over-ear headphones",
  "category": "CATEGORY_OBJECT_ID",
  "brandRef": "BRAND_OBJECT_ID",
  "price": 5200,
  "discountPrice": 4490,
  "stock": 40,
  "images": ["/uploads/generated-name.webp"],
  "isFeatured": true
}
```

## Product variants

Product create/update accepts `variants` with stable `_id` on existing rows, globally unique `sku`, `size`, `color`, `price`, `discountPrice`, `stock`, `images`, `isActive` and `expectedStock` for inventory edits. Up to 50 options; retire existing rows rather than deleting them. An ordered simple product cannot be converted in place.

Public product reads include active options and `hasVariants`; combined public stock sums active options. Base prices are derived from the cheapest active option for filters/sorting. SKU is included in keyword search. Cart POST accepts optional `variantId` and requires it for variant products; reads include selected stock/price/photo/labels. Order/invoice items snapshot option identity and SKU. See [PRODUCT_VARIANTS.md](PRODUCT_VARIANTS.md) for full rules and examples.

## Uploads

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/uploads` | Admin | Upload product image |

Use `multipart/form-data` with field `image`. Maximum 5 MB; allowed types are JPEG, PNG, WebP and GIF. Response: `{ "_id": "…", "url": "/uploads/…" }`.

## Cart

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/cart` | Customer | Read cart and refresh current prices |
| POST | `/cart` | Customer | Add/increment product |
| PUT | `/cart/:itemId` | Customer | Replace line quantity |
| DELETE | `/cart/:itemId` | Customer | Remove line |
| DELETE | `/cart` | Customer | Clear cart |

Add body: `{ "productId": "PRODUCT_OBJECT_ID", "quantity": 2 }`. Update body: `{ "quantity": 3 }`.

## Orders

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/orders` | Customer | Create COD order and invoice |
| GET | `/orders/my` | Customer | Current customer’s history |
| GET | `/orders` | Admin | Paginated order register |
| GET | `/orders/:id` | Owner/Admin | Order detail |
| PUT | `/orders/:id/status` | Admin | Fulfillment, eligible cancellation or COD payment update |

Admin list query parameters: `status`, `paymentStatus`, `page` and `limit`.

COD checkout body:

```json
{
  "paymentMethod": "cod",
  "shippingAddress": {
    "line1": "12 Lake Road",
    "line2": "",
    "city": "Dhaka",
    "district": "Dhaka",
    "postCode": "1205",
    "country": "Bangladesh",
    "phone": "+8801712345678"
  }
}
```

Status update examples:

```json
{ "status": "processing" }
```

```json
{ "status": "cancelled", "cancelReason": "Payment was not completed" }
```

```json
{ "status": "delivered", "isPaid": true }
```

`isPaid` is accepted only for COD. Online payment state is gateway-controlled.

## Cancellation, return, payment review and refunds

All operations paths, bodies, statuses and replay rules are documented in [ORDER_OPERATIONS.md#api-contract](ORDER_OPERATIONS.md#api-contract).

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/orders/:id/operations` | Owner/Admin | Public request and refund progress |
| POST | `/orders/:id/requests` | Owner/Admin | Cancellation or whole-order return request |
| GET | `/admin/operations` | Admin | Request/review/refund queues with pagination |
| GET | `/admin/operations/orders/:id` | Admin | Transaction, request, refund and audit history |
| POST | `/admin/operations/orders/:id/review` | Admin | Verify, retain, approve, close-refunded or add a private note |
| POST | `/admin/operations/orders/:id/refunds` | Admin | Queue a remaining or partial monetary refund against a verified captured balance |
| POST | `/admin/operations/requests/:id/decision` | Admin | Approve/reject with customer-visible message |
| POST | `/admin/operations/requests/:id/receive` | Admin | Confirm all returned goods received and choose restocking |
| POST | `/admin/operations/refunds/:id/confirm` | Admin | Confirm actually returned cash with a receipt; cannot complete gateway refunds |
| POST | `/admin/operations/refunds/:id/reconcile` | Admin | Query an existing refund or recover an uncertain provider reference |

Request creation accepts `{ "type": "cancellation", "reason": "Please cancel before shipment", "requestKey": "a-unique-request-key" }`. Use `type:"return"` for a paid delivered order. Request/refund keys are 12–80 alphanumeric, underscore or hyphen characters. Changing an intent under the same key is rejected.

Order/invoice reads add separate request/return/refund state and amounts; original invoice totals and fulfillment/payment enums remain compatible. Pending cancellation or refund operations block fulfillment/payment retry. Refund initiation is not completion: only verified provider `refunded`, acknowledged cash repayment or explicit local simulation completes the ledger. Customer projections exclude internal audit notes, bank/provider references and payment session secrets.

## Delivery tracking and email administration

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/orders/:id/tracking` | Owner/Admin | Courier metadata and paginated public shipment history |
| POST | `/orders/:id/shipment` | Admin | Save courier details or append guarded shipment progress |
| GET | `/admin/notifications` | Admin | Email delivery queue/status, filters and redacted errors |
| POST | `/admin/notifications/:id/retry` | Admin | Retry an exhausted failed email without repeating commerce writes |

Shipment body includes `event`, `requestKey`, optional `courierName`, `trackingNumber`, HTTPS `trackingUrl`, `location` and public `note`. Normal order/payment guards still control shipping/delivery; COD confirmation synchronizes the existing invoice. Request-key replay prevents duplicate events; backwards/closed updates are rejected.

Email list filters: `status`, `orderId`, `page`, `limit`. Responses never expose SMTP credentials, message bodies/source state or claim tokens. Sent denotes SMTP acceptance; file-mode records are private previews. See [DELIVERY_NOTIFICATIONS.md](DELIVERY_NOTIFICATIONS.md) for limits, event names, retries and example bodies.

## Payments

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/payments/config` | Public | Gateway availability/environment |
| POST | `/payments/sslcommerz/initiate` | Customer | Create online order/invoice/payment session |
| POST | `/payments/sslcommerz/:orderId/retry` | Order owner | Reconcile prior attempts and retry/resume the existing order |
| POST | `/payments/sslcommerz/success` | Gateway | Validate and redirect to result page |
| POST | `/payments/sslcommerz/fail` | Gateway | Record failure and redirect |
| POST | `/payments/sslcommerz/cancel` | Gateway | Record cancellation and redirect |
| POST | `/payments/sslcommerz/ipn` | Gateway | Server-to-server result notification |

Initiation accepts `{ "shippingAddress": { … } }` using the same address shape as COD. On success it returns `orderId`, `invoiceNumber` and an allowlisted HTTPS `checkoutUrl`.

Retry requires `{ "retryKey": "a-unique-request-key" }` (12–80 alphanumeric, underscore or hyphen characters). It preserves the order/invoice and cart, checks stock again after expiry, resumes pending sessions, and blocks manual cancellations/review. It may return `alreadyPaid:true` or `review:true` after validation. See [CHECKOUT_RECOVERY.md](CHECKOUT_RECOVERY.md) for response/error semantics and reservation policy. Order reads add `paymentRecovery` with the deadline, expired marker and current retry eligibility. `GET /payments/config` adds `reservationMinutes`.

## Invoices and reviews

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/invoices/my` | Customer | Current customer’s invoices |
| GET | `/invoices/order/:orderId` | Owner/Admin | Invoice for order |
| GET | `/invoices` | Admin | Paginated invoice register; optional `paymentStatus` |
| GET | `/invoices/:id` | Owner/Admin | Invoice by ID |
| GET | `/reviews/product/:productId` | Public | Product reviews |
| POST | `/reviews` | Delivered purchaser | Create or update verified review |
| DELETE | `/reviews/:id` | Owner/Admin | Delete review and recalculate rating |

Review body: `{ "productId": "…", "rating": 5, "comment": "Useful and comfortable." }`.

## Dashboard and reporting

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/admin/dashboard-summary` | Admin | Counts, paid revenue, statuses, low stock and recent orders |
| GET | `/admin/reports/orders.csv` | Admin | Download order CSV |

CSV query parameters: `status`, `paymentStatus`, `from=YYYY-MM-DD` and `to=YYYY-MM-DD`. The `to` date is inclusive through 23:59:59.999 UTC. CSV preserves existing columns and appends confirmed ordinary refunds, additional-payment refunds, pending amount, refund state and net sales. Dashboard/CSV net sales exclude review and simulated funds; confirmed ordinary refunds reduce retained sale value.

## Version 2.1 additions and changes

- `GET /products/manage` — admin catalog with the normal filters plus `archived=false|true|all`.
- `GET /products/manage/:id` — admin detail including actual stock of archived products.
- `DELETE /products/:id` — archives a product; `PUT` with `isArchived:false` restores it.
- Product writes accept the full `images` array (up to 6); `expectedStock` detects a concurrent inventory change when updating stock.
- COD and online initiation accept optional `checkoutKey` (12–80 alphanumeric, underscore or hyphen characters). A repeated key for the same customer/method replays the saved checkout.
- Order and invoice payment states also include `review`. Validated late payments on cancelled orders and high-risk transactions need operational review; online fulfillment requires `paymentStatus:paid`.
- Profile password changes require `currentPassword` and `password`. New passwords use 8+ characters and at most 72 UTF-8 bytes. The server refreshes the session; old JWT versions are invalidated.
- Logout invalidates the signed-in account's JWT version as well as clearing its cookie (other sessions of that account sign out).
- Cart reads return current prices and an `unavailable` flag without saving over concurrent cart mutations.
- Gateway callback routes accept cross-origin form posts, while success still requires gateway validation.

## Production tools — 2.11

See [the route table and request semantics](PRODUCTION_TOOLS.md#api-additions). New `/api/admin/courier` routes require the `orders` scope, media read/reconcile requires `catalog`, and migration/cleanup/system history requires full administrator access. Owner-scoped carrier tracking is at `GET /api/orders/:id/courier`. Readiness is `GET /api/health/ready`. Backup data is CLI-only.

Checkout shipping addresses accept optional trimmed `thana` and `area`; old address shapes remain compatible. During a consistent backup, API mutations temporarily return 503 with `Retry-After: 30`; retry the same idempotency/request key.
