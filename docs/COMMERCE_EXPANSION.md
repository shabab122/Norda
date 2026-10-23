# Commerce operations — NORDA 2.13

This release extends the delivered **2.12.1** source with settlement reconciliation, price-difference exchanges, reverse collection/partial receipts, guest shopping, automatic warehouse allocation and customer availability alerts. It keeps the existing framework, brand/catalog assets, provider settings, credentials and original invoice totals.

## Upgrade an existing store

1. Retain your working `server/.env`, optional `.env.integrations`, uploaded media and database. Copy the updated source without overwriting newer laptop-only settings. **Do not reseed or run setup for this update.**
2. Stop every old app instance sharing the database, install this version on each instance, then restart. Keep the existing JWT, MongoDB, SMTP, payment, MFA and backup secrets. No new credential is required for these six workflows.
3. Run from `server/`:

   ```bash
   npm ci
   npm run verify
   npm run dev
   ```

4. Leave automatic warehouse allocation disabled until you have inspected the real location balances and tried an isolated order. Existing installations default to the previous online stock behavior.
5. The added models/fields are initialized on application startup; there is no destructive migration or catalog conversion. This development work did not connect to, seed or alter the owner's database. After using these new workflows, use this release or a compatible newer release for every app server. Older binaries do not understand warehouse plans, guest ownership or exchange charges; an automatic code rollback to 2.12 is not safe once these records are in use. Test recovery on staging before promotion.

Replica-set transactions remain the required public-store configuration. Standalone development uses compensation for handled failures; it cannot guarantee rollback after process failure or a database outage halfway through an operation.

## Screens and permissions

| Screen | Path | Access |
|---|---|---|
| Settlement ledger | `/admin/settlements.html` | `payments` staff or full admin |
| Warehouse policy / parcels | `/admin/fulfillment.html` | `inventory` manages policy; `orders` manages parcels |
| Return collections | `/admin/return-pickups.html` | `orders` staff or full admin |
| Exchange adjustment review | `/admin/exchange-payments.html` | `payments` staff or full admin |
| Guest cart/history/recovery | `/guest-orders.html` | Private guest cookie; matching verified account for linking |
| Exchange payment/printable adjustment | `/exchange-payment.html?id=CASE_ID` | Purchasing customer/guest or payment staff |
| Return pickup history/request | `/return-pickups.html?orderId=ORDER_ID` | Purchasing customer/guest |
| Availability subscriptions | `/stock-alerts.html` | Signed-in customer; verified email to subscribe |

The storefront and account navigation link these tools. Cart and checkout now work without registration. Account profile, saved addresses, wishlist, security and staff APIs still require a registered account.

## 1. Settlement and cash reconciliation

Open **Settlement ledger**, download the CSV header, and prepare one row for each real provider statement entry. Upload/paste it, preview matches and exceptions, then import the unchanged reviewed statement. Import never marks an order paid, creates a refund or changes stock.

Exact header:

```csv
kind,provider,reference,orderId,transactionId,refundId,gross,fee,net,currency,settledAt
```

| Field | Rule |
|---|---|
| `kind` | `gateway_sale`, `cod_remittance`, `exchange_sale` or `gateway_refund` |
| `provider` / `reference` | Real statement source and its stable, unique line reference; provider is normalized to lowercase |
| `orderId` | Full recorded MongoDB order identifier |
| `transactionId` | Required to match a real gateway sale or additional exchange charge; optional on COD/refund rows |
| `refundId` | Full confirmed refund identifier for `gateway_refund` |
| `gross`, `fee`, `net` | BDT decimal amounts, maximum two decimal places |
| `currency` | `BDT` |
| `settledAt` | ISO date/time with an explicit timezone, e.g. `2026-10-24T10:00:00+06:00` |

Incoming money uses **net = gross − fee**. Refunded money uses positive gross and **negative net = −gross − fee**. For example, a BDT 1,000 COD remittance with a BDT 20 charge has net 980; a BDT 100 refund with a BDT 1 fee has net −101.

- COD rows match delivered, paid COD orders. Gateway rows match the retained validated original transaction; exchange rows match the separately captured adjustment. Simulations are excluded.
- Multiple partial remittances can match one order, up to its confirmed gross amount. Import rejects repeated provider references and replays the same unchanged request once. A preview can become stale; import rechecks the database.
- Unpaid, unknown, excessive or unmatched rows remain exceptions. A payment administrator can document an accepted accounting adjustment or exclude an exception. This audit decision does not authenticate payment or unlock fulfillment. Matched statement lines stay immutable.
- Totals show signed gross, fees and net. Outstanding original-order balances show the oldest 500 eligible orders. Exchange charges and refunds have independent statement lines. Ledger CSV export is capped at 10,000 rows and escapes spreadsheet formulas.
- This is a reviewed statement import/reconciliation workflow. It does not log in to a bank, automatically download merchant statements or transfer money.

## 2. Price-difference exchanges

From a paid delivered order, open **Return items or exchange products**, choose purchased quantities, then select another product or active size/color. The picker loads catalog pages and offers available **online replacement inventory**. Customer requests retain prices, exact SKUs and the purchased unit's original coupon allocation.

For each selected line:

**replacement net = max(0, replacement unit price × quantity − allocated original coupon)**

**adjustment = total replacement net − original selected net credit**

Example: an item originally cost BDT 100 with BDT 10 of coupon savings. Replacing it with BDT 200 merchandise requires BDT 100 more; replacing it with BDT 50 merchandise returns BDT 50 after complete receipt. The original delivery fee is retained.

1. A payment administrator approves the request, after checking current replacement price and stock. Approval reserves exact replacement stock. An unfunded approval can be withdrawn and releases it once.
2. **Higher price:** the owner opens the exchange adjustment and pays through the configured SSLCOMMERZ account. Dedicated exchange callbacks validate the exact currency, transaction, amount, bank reference and risk. Alternatively payment staff record an actual bank/cash receipt, exact amount, explicit confirmation and note. A manual receipt cannot fund two exchanges.
3. **Lower price:** approval holds the difference refund against the original payment. It is released after every approved returned unit is physically received. Original gateway/COD/simulation refund rules and confirmation still apply. A separate exchange credit note settles with the refund.
4. **Equal price:** no additional money is required. Existing equal-price behavior remains available.
5. Receive originals through the quantity receipt form. Dispatch only after complete receipt and the required payment/refund is confirmed. Record replacement shipment and final delivery using the existing return tools.

A printable `NEX-…` adjustment and independent payment history accompany the original invoice. The original invoice's item prices and total are not rewritten. Original-order refunds update its existing refund summary; refunds of additional exchange charges remain separate. Sales reports expose exchange receipts/refunds and combined revenue separately from the existing original-order cohort/timeline and SKU totals.

Risky, duplicate or late charges require review. A late charge never reopens a rejected exchange. Approval revalidates the provider and requires explicit risk acknowledgement where applicable. Before a second online/manual charge, ambiguous failed attempts are reconciled. Starting a charge refund blocks funding reuse; confirmation, retry after a confirmed failure and duplicate resolution requests retain the existing refund safeguards. Staff must actually repay a manual refund before confirming it.

Online balances use the existing BDT 10–500,000 gateway limits. Below/above those gateway limits, arrange and record a real store receipt where supported. Test simulations, when enabled in development, remain explicitly labelled and excluded from real settlement/revenue.

## 3. Reverse pickup and partial return receipt

The customer opens **Arrange return pickup** from an approved item return/exchange, or uses the pickup screen for an approved whole-order return. The collection uses the order's saved shipping address.

- A collection starts as `requested`. Order staff arrange it with the carrier, then explicitly confirm the **real booking reference**, carrier name, appointment and optional HTTPS tracking URL.
- Forward progress is `booked → picked_up → in_transit → arrived`. A pre-collection booking can be cancelled only with carrier confirmation. Customers see the history and tracking link.
- This release records confirmed reverse bookings; it does not claim that the existing forward eCourier API creates reverse collections. Arrange the carrier appointment before recording `booked`.
- Payment staff use **Item returns & exchanges** to enter each actual received quantity and its independently inspected restock quantity. Receive two units now and one later without pretending the whole request arrived.
- A receipt has a durable request key and audit record. Repeating it cannot add stock again. Different quantities with the same key, excessive receipt quantities and duplicate lines are rejected. A later failed write rolls back stock, progress and receipt records together.
- The case stays `receiving`, and the pickup shows `partially_received`, until every approved unit is received. Credit notes/refunds and replacement release wait for complete receipt. Damaged units can be received with a restock quantity of zero.
- Item-level inspected returns enter the existing **online return desk inventory**; whole-order restocking preserves its original saved warehouse allocation. Record a warehouse transfer if physical stock is subsequently moved.
- Whole-order return receipt remains all-at-once and also closes its pickup. Partial physical receipt is provided by the selected-item/quantity workflow. Partial monetary refunds remain available through the earlier refund tools.

## 4. Full guest cart, checkout and secure account linking

A visitor can add base products or exact variants, change/remove quantities, browse away and resume the private cookie-backed cart. Checkout collects the guest's name, order email and delivery address. COD, configured online payment and development simulations reuse the same server validation, coupons, reservation/retry, invoice and order ownership rules.

- A 256-bit random HttpOnly cookie identifies the guest. Only its hash is stored server-side; secrets are not put in browser local storage. The guest session lasts 30 days. Simultaneous clicks share one session initialization.
- After any guest order, its contact email is fixed for that guest identity. Invoices preserve the billing name/email snapshot, including after account linking. Admin invoice/customer screens show the real contact, rather than an internal guest identifier.
- **Guest orders** shows the current browser's history and cart. Changing email on a device with another person's orders requires a separate browser profile/session. Browser profiles keep independent guest cookies.
- To recover access on another device, enter the **full order ID and matching order email**. A generic response prevents order/email enumeration. The private email link expires in one hour and requires an explicit confirmation; it is consumed once, only after the new session is committed. No link/token is returned in the public API response.
- Sign-in/registration merges the guest cart into the account cart once. Combined quantities are revalidated. On conflict both carts remain intact; review/remove unavailable guest lines before merging again.
- Linking purchases requires the private guest cookie, a signed-in account with a **matching verified email**, explicit confirmation and an empty/merged guest cart. Orders, invoices, payments, requests, refunds, credit notes, notifications and coupon redemptions transfer together. Failure rolls ownership back; successful linking expires old guest/recovery access.
- Email equality alone never grants order access. Guest sessions cannot use registered profile, device, security, wishlist or administration APIs. Expiring a guest session does not sign an already registered account out.
- Coupon per-customer limits count guest contact and registered identities sharing the normalized order email. This limits repeat browser sessions; an unverified guest contact is not proof of a person's identity.

## 5. Automatic warehouse fulfillment

Default: **disabled**, retaining the earlier online location. In **Warehouse fulfillment**, inventory staff explicitly enable locations, set their priorities (lower first) and decide whether a single SKU's requested quantity may split across locations. Stock at unselected/archived warehouses remains unavailable for new allocations.

- Storefront/detail/cart/SEO availability reflects eligible balances. With splitting disabled, availability is the largest single-location quantity for that SKU. With splitting enabled, eligible quantities are combined.
- Checkout reserves in priority order and records each exact product/SKU source. Conditional stock writes, active-location checks, transaction/compensation and warehouse reservation counters prevent overselling and archiving a location with open orders.
- Items from the same source form a parcel. Coupon paisa are allocated exactly once; one parcel receives the original delivery fee. Parcel order allocations sum to the unchanged original invoice total. Multiple SKUs can still use different sources when per-SKU splitting is disabled; this is not a whole-order single-warehouse constraint.
- Order staff move each parcel `pending → processing → shipped → delivered`, recording the carrier/tracking details and confirming delivery/cash collection. Customers see each parcel in **Track warehouse parcels**.
- The order aggregates parcel progress. **COD is marked paid only after every parcel is delivered.** A partial dispatch blocks whole-order cancellation; returns follow delivery. Whole-order status/cash buttons cannot bypass these rules.
- Cancellation/expiry before dispatch restores each original source once and closes reservation counters. Existing payment retry and late-payment review approval re-reserve the frozen source plan and reopen the same parcel IDs. If that source is unavailable, recovery stops for review without losing the saved order/invoice.
- Existing single-parcel eCourier API behavior remains. Multi-warehouse parcels require separate real carrier arrangements recorded per parcel; the old whole-order booking endpoint refuses them to prevent creating an incorrect duplicate/full-value carrier parcel. Native multi-parcel carrier labels/API booking are a future adapter extension.
- New policies affect new checkouts. Existing allocation snapshots do not move automatically when priorities or settings change. Exchange replacement reservations continue to use the online return/replacement desk.

## 6. Back-in-stock notifications

On a sold-out product or size/color, choose **Notify me when available**. A signed-in customer must verify their email first. Manage/stop subscriptions from **Availability alerts**.

- The subscription targets the exact base product or SKU. Restocking another option does not trigger it. Up to 100 active subscriptions per customer are supported.
- A worker checks eligible fulfillment availability every 60 seconds, then processes bounded durable mail batches. It uses the existing SMTP/file transport and participates in backup maintenance leases.
- One notice per subscription generation, atomic claims, stable Message-ID, retry/backoff and stale-claim recovery guard against ordinary duplicate sends. Five failed attempts leave a visible `failed` status. SMTP acknowledgement is not proof of inbox placement, and a crash around an external SMTP acceptance can still cause at-least-once delivery.
- Development file delivery is shown as `local`, not inbox delivery. Real inbox/Spam placement still depends on the owner's SMTP/domain configuration.
- A delivered subscription closes. A newly sold-out episode can be subscribed to again as a new generation. Owner-only removal and explicit secret-link unsubscribe stop further alerts. Links use URL fragments so email access tokens do not enter URL query logs.
- An email never reserves inventory. It links the product and identifies its SKU; stock may change before checkout. Retired/archived options are not sent as available.

## Main API additions

All paths are under `/api`. Existing APIs and registered-account guards remain. Mutations use durable request keys where indicated and existing maintenance/error handling.

| Area | Routes |
|---|---|
| Guest identity | `GET/POST /guest/session`, `POST /guest/contact`, `/guest/recovery`, `/guest/recover`, `/guest/merge-cart`, `/guest/claim` |
| Guest history | `GET /guest/orders`, `GET /guest/cart`, `DELETE /guest/cart/:itemId`, `GET /guest/invoices/order/:orderId` |
| Settlement | `GET /admin/settlements`, `/template.csv`, `/export.csv`; `POST /admin/settlements/preview`, `/import`, `/:id/resolve` |
| Warehouse | `GET/PUT /admin/fulfillment/policy`; `GET /admin/fulfillment/parcels`; `POST /admin/fulfillment/parcels/:id/status`; `GET /orders/:id/parcels` |
| Pickup | `GET/POST /orders/:id/pickups`; `GET /admin/return-pickups`; `POST /admin/return-pickups/:id/status` |
| Receipts | `GET /orders/exchanges/:id/receipts`; existing `POST /admin/item-returns/:id/receive` accepts quantities, restock quantities and a request key |
| Exchange payment | `GET/POST /orders/exchanges/:id/payment`; development `POST /orders/exchanges/:id/payment/simulate`; `POST /admin/exchanges/:id/payment`; `GET /admin/exchanges/:id/payments`; `POST /admin/exchange-payments/:id/resolve` |
| Exchange callback | `POST /exchange-payments/sslcommerz/{success,fail,cancel,ipn}`; public notifications are authenticated by fresh server-side provider validation |
| Availability | `GET/POST /stock-alerts`, `DELETE /stock-alerts/:id`, `POST /stock-alerts/unsubscribe` |

The existing gateway merchant/callback origin settings supply the dedicated exchange callback URLs. Allow these public routes on a deployed proxy; do not add storefront login to IPN callbacks. The existing order callback paths remain unchanged.

## Acceptance and boundaries

See [measured verification](VERIFICATION_RESULTS.md) and [manual acceptance](ACCEPTANCE_CHECKLIST.md). The release tests real Express HTTP, disposable standalone/replica MongoDB, cross-customer ownership, fault rollback, payment matching, warehouse last-unit races, quantity/fee arithmetic and frontend VM/static behavior. Provider responses are controlled fixtures; no owner's DB, real money, mail inbox or carrier is used.

Before public use, exercise the real hosted SSLCOMMERZ exchange charge/review/refund paths, actual inbox recovery/stock messages, confirmed return bookings, mobile/keyboard views and adjustment/invoice/credit-note printing. Existing public-host, Docker/HTTPS and provider acceptance requirements still apply. This work does not publish a live store or claim universal bug-free behavior.
