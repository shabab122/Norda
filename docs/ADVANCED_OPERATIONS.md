# Advanced operations — NORDA 2.14.0

This release starts from the delivered **2.13.1** archive. Keep the existing database, uploads and private credentials. No setup, reseed, credential rotation or manual data migration is needed. Normal startup initializes the additional collections/indexes. Upgrade every instance sharing the store before activating the new workflows; old code does not understand their guards and is not a safe rollback target after activation.

## Tools and permissions

| Tool | Location | Required staff scope |
|---|---|---|
| Courier automation | `/admin/logistics-automation.html` | `orders` |
| Statement feeds / accounting export | `/admin/statement-sync.html` | `payments` |
| Whole-order receipts / deduction policy | `/admin/whole-return-receipts.html` | `payments` |
| Routing / bulk transfers | `/admin/routing-bulk.html` | `inventory` |
| Customer return progress / credit | `/whole-return.html?id=<requestId>` | Order owner, or authorized payments staff |

Full administrators can use all four tools. Existing staff permissions are unchanged. Customers cannot submit admin stock, booking, import or refund operations. Customer history links to the whole-order progress/credit page; original invoices remain accessible as before.

## Configuration and activation

`server/.env.operations.example` is a **reference file**, not an automatically loaded configuration file. Merge only needed new settings into the existing private `server/.env.integrations` or deployment environment. Keep all working database/JWT/email/gateway/eCourier/MFA/backup settings intact. Restart the server after changing deployment configuration.

```dotenv
OPERATIONS_CONNECTOR_URL=https://your-approved-merchant-connector.example/v1
OPERATIONS_CONNECTOR_TOKEN=your-private-token-with-at-least-24-characters
RETURN_RECEIVING_ADDRESS=Your actual online receiving depot address

PARCEL_COURIER_AUTO_ENABLED=false
REVERSE_PICKUP_AUTO_ENABLED=false
LOGISTICS_AUTO_AFTER=
REVERSE_PICKUP_WAREHOUSE=online
```

The connector must be a merchant-operated/approved **public HTTPS API**, protected by the private bearer token. It is not a browser-facing endpoint. Never put its token in client code or Git. Requests are limited to four operations, reject redirects, have a 15-second timeout and accept at most 1 MB of response JSON. Response/error content does not expose server credentials to shoppers.

Native parcel booking reuses the existing eCourier credentials, assigned packages and prepaid mapping from [Production tools](PRODUCTION_TOOLS.md). No extra payment-gateway password is needed for NORDA's feed adapter itself; the approved connector owns any provider-specific authentication.

To opt into automatic booking, set the relevant flag to `true` **and** `LOGISTICS_AUTO_AFTER` to an explicit ISO timestamp at activation. Automatic parcel booking also needs the existing `ECOURIER_AUTO_PACKAGE_CODE`. Only processing parcels/requested pickups created at or after that cutoff are considered. Reverse auto-booking uses `REVERSE_PICKUP_WAREHOUSE`, with `RETURN_RECEIVING_ADDRESS` required when it is `online`. Defaults submit no new automatic booking intents.

The 30-second worker submits queued jobs and polls due active jobs. Statement feeds run at five-minute intervals when configured and enabled. Workers share maintenance leases with the existing backup/restore mechanism and await in-flight work on graceful shutdown.

## 1. Courier automation

1. Enable warehouse fulfillment only after checking balances in the existing Fulfillment tool.
2. Move each eligible parcel to **processing**. From its row, open Courier automation.
3. Select `parcel`, confirm the assigned package code/current courier charge and confirm booking. Each warehouse parcel gets a distinct reference, tracking number and label; its frozen collection amount preserves the original order's discount/shipping allocation.
4. The worker submits the queued reference once. **Submit now** runs that same intent immediately. Booking confirms a carrier record, not physical pickup or delivery.
5. Use **Reconcile / track** to query authenticated provider evidence, and **Get label** for the carrier PDF. COD is marked paid only after every parcel is delivered. Reservations release exactly once.

Satellite pickup addresses use the warehouse's configured address. eCourier restrictions remain enforced: assigned package charge, supported Bangladesh phone/address fields, whole-BDT collection amount and approved prepaid mapping. Invalid collection/address/package data blocks submission instead of rounding money or guessing account settings. A legacy order-level carrier booking/manual tracking record cannot be booked again as a parcel job.

For a return, first approve the whole-order or item return/exchange and create a customer/admin pickup request. Select `pickup`, its request ID and the receiving warehouse. The connector must confirm the reference, tracking identity and appointment. Tracking can advance to `booked`, `picked_up`, `in_transit`, `arrived`; it does not restock anything. Staff inspect the physical parcel separately.

### Uncertain results and cancellation

- A timeout or ambiguous booking result becomes **unknown** with the original reference retained. Processing it again does not resend. Query the same reference until confirmed; provider absence alone must not trigger a new booking.
- Active API jobs block manual tracking/fulfillment changes and order cancellation that would otherwise restore stock. Provider delivery exceptions remain visible for review.
- Carrier cancellation requires confirmation and a note. An uncertain cancellation stays `cancel_unknown` until authenticated evidence confirms it. Order cancellation is a separate guarded operation.
- A definitively cancelled/rejected attempt stays in history. A new explicitly confirmed request key may create a new attempt for a still-eligible target; automatic scans do not recreate old attempts.
- PDF links must be HTTPS on the approved connector or supported official eCourier label hosts. Reverse query/label results must preserve the saved reference and tracking identity.

### Merchant connector contract: reverse pickup

All calls use `Authorization: Bearer <OPERATIONS_CONNECTOR_TOKEN>` and JSON. The base URL may contain a version path. NORDA appends the following paths:

**`POST /courier/book`** receives:

```json
{
  "reference": "NLR<stable-reference>",
  "direction": "reverse",
  "orderId": "<order-id>",
  "pickupId": "<pickup-id>",
  "customer": { "name": "Customer", "line1": "Pickup address", "city": "Dhaka", "district": "Dhaka", "phone": "01712345678", "country": "Bangladesh" },
  "destination": { "warehouse": "online", "address": "Receiving depot" },
  "items": [{ "name": "Purchased item", "quantity": 1 }]
}
```

Confirmed booking/query response:

```json
{
  "reference": "NLR<same-reference>",
  "status": "booked",
  "state": "booked",
  "trackingNumber": "REV1234567890",
  "courierName": "Your contracted carrier",
  "scheduledFor": "2026-10-25T10:00:00+06:00",
  "trackingUrl": "https://your-carrier.example/track/REV1234567890",
  "labelUrl": "https://your-approved-merchant-connector.example/labels/REV1234567890.pdf"
}
```

`trackingUrl` and `labelUrl` are optional. A label may be issued on a later query. `scheduledFor` must be a valid appointment timestamp. The connector must enforce **idempotency by reference** and query provider-side evidence when its own provider request times out.

**`POST /courier/query`** receives `{ "reference": "...", "trackingNumber": "..." }`; an unknown booking may send an empty tracking number. Return the same booking identity plus its current state. A confirmed cancellation returns `state: "cancelled"`. Unknown/not-found evidence must return a non-success response; never fabricate a booked/cancelled response.

**`POST /courier/cancel`** receives `{ "reference": "...", "trackingNumber": "...", "note": "..." }`. Only confirmed provider cancellation returns `{ "reference": "...", "status": "cancelled" }`. An explicit 400/401/403/422 rejection is treated as definite rejection for booking; network/other outcomes require reconciliation.

The public [eCourier General API v5.5](https://ecourier.com.bd/wp-content/uploads/eCourier_Merchant_API_Document_General_v5.5.pdf) documents forward booking, package/pickup fields and tracking. Its exchange sending type is not a documented standalone reverse-pickup API. A merchant-approved adapter/contract is therefore required for reverse pickup; entering normal forward credentials alone does not enable it.

## 2. Statement feeds and accounting

In Statement feeds, enable `gateway` or `courier` fetching. Leave automatic import unchecked to stage every page for review. **Preview matches** shows references, money and mismatch reasons. Import records a reconciliation ledger; exceptions are still reviewed in the existing Settlement tool. A statement never marks an order paid or submits a transfer/refund.

The cursor advances only after the staged page is imported or confirmed empty. The deterministic batch key, immutable source hash and provider/reference checks protect retries. If an identical row was manually imported after fetch, it is skipped under the same ledger lock. Different amounts/identities fail without advancing the cursor. A lost local response can replay the existing batch. Import mode may be explicitly switched to automatic; mismatched/unmatched entries still retain their exception status.

### Merchant connector contract: statements

**`GET /statements?source=gateway|courier&cursor=<opaque>&limit=500`** returns:

```json
{
  "source": "courier",
  "batchId": "immutable-provider-page-id",
  "nextCursor": "opaque-next-cursor",
  "csv": "kind,provider,reference,orderId,transactionId,refundId,gross,fee,net,currency,settledAt\r\ncod_remittance,ecourier,REMIT-123,<order-id>,,,300,20,280,BDT,2026-10-24T10:00:00+06:00\r\n"
}
```

- The first cursor is empty. Batch IDs are nonempty and at most 100 characters; cursors at most 500 characters, without control characters.
- Use the **exact existing settlement template** and 1–500 rows, under 500 KB. Monetary values have at most two decimals and currency `BDT`.
- Gateway kinds: `gateway_sale`, `gateway_refund`, `exchange_sale`. Courier kind: `cod_remittance`.
- Sale/COD: `net = gross - fee`. Refund: `net = -gross - fee`. Refund lines identify a confirmed real refund; gateway/exchange lines identify validated retained payment transactions. Original order IDs are required.
- Every provider/reference identifies one immutable line. The connector must map merchant transaction/remittance records to actual NORDA IDs, use real confirmation evidence and retain stable cursor pages. Do not infer cash receipts from delivery status.
- An empty advancing page is the exact header with no rows. For an idle feed, return the exact header, current cursor and a valid batch ID; it schedules the next poll without a duplicate run.

[SSLCOMMERZ documentation](https://developer.sslcommerz.com/docs.html) and its [merchant FAQ](https://sslcommerz.com/faq/) expose transaction validation/refunds and merchant settlement reports. This release does not assume an undocumented public settlement-pull endpoint. eCourier payment-status fields are not relabeled as a cash statement. The merchant must supply an approved statement API/adapter or keep using reviewed CSV import.

### Accounting CSV

Export a date range in Statement feeds, or all entries up to 10,000 records. Only `matched` and `accepted_adjustment` entries are exported; unresolved/excluded records are omitted. Each journal balances in minor units. Columns are `Journal,Date,AccountCode,Debit,Credit,Currency,Reference,Description`.

| Account code | Generic meaning |
|---|---|
| `1000` | Merchant bank/cash |
| `1200` | Gateway/courier clearing |
| `5000` | Settlement/refund fees |

Map these codes to your accounting software before import. This is a generic double-entry CSV, not automatic posting to an unconfigured accounting vendor. Exporting does not write accounting state or move funds. Re-import rules belong to that vendor; journal IDs are stable to help its duplicate detection. Formula-like reference text is CSV-neutralized.

## 3. Whole-order partial returns and deductions

1. Set fixed deduction, percentage deduction and whether to credit original delivery in **Whole-order receipts**. The default is `0`, `0%`, delivery credited, preserving previous behavior.
2. The rules are snapshotted when a new whole-order return is requested. Later policy edits do not change that request. An approved request retains its calculated refund amount.
3. Approve in the existing Operations tool, then open its request ID in Whole-order receipts.
4. Record **arrived now**, **sellable units** and a receiving warehouse for each purchased line. Submit separate receipts when parcels/locations arrive at different times. The API also accepts multiple locations for one line in a single receipt.
5. Only inspected sellable units return to stock at the selected location. Excess/duplicate quantities and nonexistent historical SKUs are rejected. Receipt retries do not restock twice.
6. While incomplete, the request remains approved with explicit received counters. Only complete receipt creates a separate whole-return credit and releases the calculated existing refund. It never rewrites invoice totals.
7. Confirm a COD/manual refund only after paying the customer and recording its receipt. Gateway refunds require provider confirmation. The credit/request settle after confirmed refund success, including a policy-deducted refund that leaves the original invoice `partially_refunded`. A zero entitlement settles without creating a money movement.

Calculation in paisa: **net merchandise = subtotal − coupon discount**; **deduction = min(net merchandise, fixed + rounded percentage of net merchandise)**; **refund = net merchandise − deduction + eligible original delivery**. Fixed/percentage deductions apply once to the whole return, not to every physical parcel. Prior active refunds that overlap the planned entitlement require review before final receipt.

Legacy returns without snapshotted rules use zero deductions/full delivery. Existing completed receipts are displayed as received. The old receive-all action completes only the unreceived remainder once partial receipt has started; it cannot restock previously received units. Existing selected-item receipt forms also include a receiving warehouse selector. Archived historical product/options can be restocked only when their exact physical identity still exists.

## 4. Routing and bulk transfers

Fulfillment must be enabled separately in the existing Fulfillment tool, with eligible warehouses/priorities and per-SKU splitting configured. The new modes apply to **future reservations**:

- **Priority:** previous configured location order.
- **Distance:** nearest configured warehouse to the shipping district's configured centre, with priority tie-breaking.
- **Capacity:** largest eligible available quantity after the location's remaining open-reservation capacity.
- **Balanced:** distance in kilometres plus reservation utilization multiplied by 100, with priority tie-breaking.

Distance is haversine over operator-entered coordinates, not live driving distance/geocoding. Distance/balanced modes require every enabled location and destination district to have valid coordinates; missing data blocks checkout without reserving stock. Capacity is the satellite's total open reserved units across all products/SKUs, not physical storage size or daily dispatch count. `0` means unlimited; online fulfillment remains unlimited. Delivery/cancellation releases the same existing reservation ledger. Atomic warehouse updates prevent concurrent buyers from exceeding the limit, and settings cannot lower capacity below held units. Payment recovery retains the original allocations and parcel IDs.

Bulk transfer CSV header: `productId,variantId,from,to,quantity,note`. Use exact IDs, `base` for a non-variant product and `online` for its existing stock pool. Positive whole units, different locations, active warehouses and a 5–1000 character note are required. Up to 100 rows per batch.

**Preview** simulates the full row order, including chained transfers of the same SKU. Review expected source/destination balances, then **Apply**. Changed balances invalidate the batch; edit requires a fresh preview. The request key prevents duplicate movement, and a failed write rolls back the batch. Old single-transfer/count/export tools remain available. Replica-set transactions are required for atomic crash/outage recovery; standalone compensation covers handled failures.

## API additions

All paths below are relative to `/api`; existing APIs remain available. Admin endpoints require the scope listed above. Mutation notes/request keys and confirmation fields are enforced in the relevant operations.

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/admin/routing` | Read/update versioned routing settings |
| GET | `/admin/warehouse-batches/template.csv` | Transfer template |
| POST | `/admin/warehouse-batches/preview` | Preview `{rows}` or `{csv}` |
| POST / GET | `/admin/warehouse-batches` | Apply preview `{rows,previewHash,requestKey}` / recent batches |
| GET / PUT | `/admin/return-rules` | Read/update revisioned deduction policy |
| GET | `/admin/receiving-warehouses` | Active receiving locations |
| GET | `/admin/whole-returns` | Recent whole-order requests |
| POST | `/admin/whole-returns/:id/receipts` | Physical partial receipt |
| GET | `/whole-returns/:id` | Owned progress/credit, or payments staff details |
| GET | `/admin/logistics` | Configuration flags and safe job history; optional `orderId` |
| POST | `/admin/logistics/parcel/:id` | Queue confirmed package booking intent |
| POST | `/admin/logistics/pickup/:id` | Queue confirmed reverse pickup intent |
| POST | `/admin/logistics-jobs/:id/process` | Submit queued intent once |
| POST | `/admin/logistics-jobs/:id/sync` | Reconcile/query same identity |
| POST | `/admin/logistics-jobs/:id/cancel` | Confirmed carrier cancellation with note |
| POST | `/admin/logistics-jobs/:id/label` | Trusted confirmed PDF label |
| GET | `/admin/statement-feeds` | Feed settings and recent staged pages |
| PUT | `/admin/statement-feeds/:source` | `{revision,enabled,automatic}` |
| POST | `/admin/statement-feeds/:source/pull` | Fetch/resume durable page |
| GET | `/admin/statement-runs/:id/preview` | Current matches/exceptions |
| POST | `/admin/statement-runs/:id/import` | Import reviewed page once |
| GET | `/admin/accounting/journal.csv` | Balanced export; optional ISO `from`/`to` |

Receipt body example:

```json
{
  "requestKey": "unique-receipt-intent-1234",
  "received": true,
  "items": [{ "lineIndex": 0, "quantity": 1, "restockQuantity": 1, "warehouse": "online" }],
  "note": "Physically received and inspected this parcel"
}
```

## Verification and acceptance

Run `npm run verify` from `server`. For native tests, set `NORDA_TEST_MONGO_URI` to an **isolated** local MongoDB and run `npm run test:integration`. Tests create randomized `norda_test_*` databases and drop only their own targets. Never point acceptance fixtures at the live store.

The added journeys cover permissions, settings revisions, nearest/capacity splitting, concurrent capacity across SKUs, stale/batched movements, write rollback, snapshot deductions, partial/multi-location receipt, legacy continuation, zero/deducted refund credits, native parcel booking/tracking, unknown-reference recovery, opt-in queues, cancellation/rebooking, feed review/automatic/duplicate/idle/cursor behavior and balanced CSV. Frontend/connector tests cover changed identities, serialized retries, stale CSV edits, escaping, authenticated HTTPS, limits and split UTF-8 decoding. See [current measured results](VERIFICATION_RESULTS.md).

Public merchant reverse pickup/forward parcel booking/labels and settlement feed acceptance require the actual approved accounts/connector. Browser/mobile/keyboard/print inspection, real SMTP inbox placement and public host/deployment checks are not certified by controlled-response tests. Existing simulation and manual tools remain usable without those integrations.
