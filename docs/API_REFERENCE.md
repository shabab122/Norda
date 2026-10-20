# Norda 2.5 — API Reference

Base path: `/api`. JSON is used unless the endpoint is marked multipart or CSV.

Authentication accepts the `norda_token` HTTP-only cookie. Optional development clients can send `Authorization: Bearer <token>` only when `AUTH_RETURN_TOKEN=true`. `Customer` means any authenticated user; `Admin` means an authenticated user with `role: "admin"`.

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

## Payments

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/payments/config` | Public | Gateway availability/environment |
| POST | `/payments/sslcommerz/initiate` | Customer | Create online order/invoice/payment session |
| POST | `/payments/sslcommerz/success` | Gateway | Validate and redirect to result page |
| POST | `/payments/sslcommerz/fail` | Gateway | Record failure and redirect |
| POST | `/payments/sslcommerz/cancel` | Gateway | Record cancellation and redirect |
| POST | `/payments/sslcommerz/ipn` | Gateway | Server-to-server result notification |

Initiation accepts `{ "shippingAddress": { … } }` using the same address shape as COD. On success it returns `orderId`, `invoiceNumber` and an allowlisted HTTPS `checkoutUrl`.

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

CSV query parameters: `status`, `paymentStatus`, `from=YYYY-MM-DD` and `to=YYYY-MM-DD`. The `to` date is inclusive through 23:59:59.999 UTC.

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
