# Payment review, cancellation requests, returns and refunds

Available in NORDA **2.7.0**, based on 2.6.0. This update adds three connected workflows without changing customer credentials, saved addresses, catalog records or historical order/invoice totals.

## Apply the update

Stop the previous API and copy the source while retaining your existing `.git`, working `server/.env` and `server/uploads`. Keep the SMTP settings configured on your laptop; later local changes cannot be recovered from an older ZIP. No setup, seed or manual database migration is required. The existing MongoDB connection and SSLCOMMERZ settings are used; no new secret is required.

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

Open `http://localhost:5000`. Customer entry: **My Orders → Cancellation, returns & refunds**. Administrator entry: **Requests & payments** in the admin sidebar, or **Requests & payments** on an order. An administrator may open `/admin/operations.html?orderId=ORDER_ID` directly.

New collections and optional order/invoice fields are created through the existing Mongoose models. Defaults apply when older documents are read; no existing orders are rewritten in bulk. The reservation-expiry worker from 2.6 continues to run. A separate refund worker starts with the API and checks up to 30 eligible refunds every 30 seconds.

## What is included

| Workflow | Customer action | Administrator action | Completion rule |
|---|---|---|---|
| Payment review | View the payment/review state and contact the store | Inspect attempts and reasons, verify gateway history, retain a charge, record notes and resolve | Fresh verification; risky payments require acknowledgement; additional charges must be refunded first |
| Cancellation | Request cancellation of a pending/processing order, with a reason | Approve or reject before shipment | Approval cancels fulfillment, restores stock once, and queues a refund if money was captured |
| Return | Request return of a delivered, paid order | Approve/reject; inspect and record receipt of all items; decide restocking | Approval alone changes neither stock nor refund; physical receipt queues the refund |
| Refund | Follow progress and completed amounts | Request a remaining or partial monetary refund; reconcile provider results or confirm returned cash | Real gateway status must be `refunded`; cash requires an actual-payment acknowledgement and receipt |

This release supports **whole-order physical returns**, not per-item return quantities, exchanges or a courier return label. Cancellation/return approval queues the full remaining original order amount, including its recorded delivery charge. Administrators can request partial monetary refunds for an eligible cancelled/received-return order. Item-level returns, configurable eligibility windows, deductions and refund policy settings are future work. No return deadline is silently imposed in this version; the store reviews each request.

## Customer cancellation requests

1. Open the support link on an order that has not shipped. Enter a reason of 5–1,000 characters.
2. The request becomes `requested`. Fulfillment progression and payment retry are blocked while the request is pending. Requesting cancellation does not immediately add stock or claim money was returned.
3. The administrator provides a customer-visible decision message and approves or rejects.
4. Rejection retains inventory/payment state and permits normal fulfillment. Approval cancels the order and restores reserved stock once. Already-restored inventory is not added again.
5. An unpaid request completes without a refund. A captured payment queues a refund and the request stays approved until that refund is confirmed. Paid COD requires manual cash repayment; real online payments use the gateway.

Shipped/delivered orders cannot use cancellation. A manually cancelled order stays cancelled. A validated payment arriving later still enters review and can be refunded; it cannot silently reopen fulfillment. Up to three requests of each type are allowed after rejection; an active/completed request cannot be duplicated. The same request key replays the saved request.

## Returns and inventory

1. A delivered and paid order can request a whole-order return.
2. Approving the return only authorizes it. The original fulfillment history remains `delivered`, with a separate return state.
3. When every item physically arrives, the administrator checks the receipt acknowledgement, chooses **Restock all returned items** or **Do not restock**, and writes a customer update.
4. Stock increases only for the restock choice, once. Damaged/unsellable returns can be refunded without adding sellable inventory.
5. A refund is queued for the remaining captured balance. The request changes from `received` to `completed` only after the original order amount has been confirmed refunded.

Repeated receipt/approval requests do not repeat stock or refunds. A changed restock decision on a repeated receipt is rejected. If a stock, invoice or audit write fails, handled failures roll back the operation using the existing database unit.

## Payment review workspace

The workspace shows all recorded payment attempts, transaction and bank references, validation references, risk levels, failure/review reasons, refund records and the latest 200 operation audit events. Payment session secrets and checkout URLs are not returned by this workspace.

- **Verify gateway history** queries the existing attempts and validates newly discovered captures before changing the local payment state. An unknown/network result cannot authorize fulfillment.
- **Retain selected charge** records which verified charge funds the sale. This is useful when an order has more than one captured payment. The retained charge cannot change after an ordinary order refund has been recorded.
- Refund every additional captured charge through the refund form. These use their own balance and do not reduce the retained sale or restock inventory.
- **Approve retained payment** requires a freshly validated matching charge, no refund against that retained charge, and completed refunds for every other verified charge. Risk level 1 needs an explicit acknowledgement and an audit note; other malformed/unknown risk levels are rejected.
- Approval can recover an automatically expired order only if all items can be reserved again. Manual cancellations, already fulfilled orders and unresolved cancellation/return cases cannot be reopened this way.
- To return all money instead, refund each charge, then **Close fully refunded review**. Closing checks that every verified captured charge is fully refunded and the order is cancelled or its return is complete. Initiating one refund never automatically closes a multi-charge review.
- **Save note** records an internal administrator note. Customers receive their request decision/update messages and refund progress, not internal audit notes, bank references or provider secrets.

## Refund ledger and provider truth

Each refund records a unique request key, unique refund transaction ID, source payment/bank transaction, amount, scope, provider reference and timestamps. Amounts are compared in integer poisha, capped against the same captured bank transaction. Pending and uncertain refunds reserve their balance. The browser cannot choose the refund scope or supply a price/paid state.

| Internal state | Meaning | Next action |
|---|---|---|
| `queued` | Recorded durably; not submitted yet | Worker submits when the existing gateway configuration is available |
| `submitting` | State committed before the external call | Wait; a submission interrupted for over 60 seconds becomes `unknown` |
| `pending` | Provider accepted/processing; or cash has not been repaid | Query the existing provider reference, or actually return cash |
| `unknown` | Timeout, interruption or mismatched response; result cannot be assumed | Reconcile the existing refund; its balance stays reserved |
| `succeeded` | Provider query confirms `refunded`, cash receipt is confirmed, or local simulation completes | Order/invoice summaries and eligible requests synchronize |
| `failed` | Provider explicitly rejected/cancelled the refund | Review the reason; a new refund intent may use the remaining balance |

SSLCOMMERZ initiation returning `success` means acceptance, **not completed repayment**. The worker queries the saved `refund_ref_id`; only a matching response with status `refunded` completes it. Bank transaction, original transaction, provider reference, and amount/currency when returned must match. A real gateway refund cannot be marked complete using the cash-confirmation endpoint.

For a timeout without a saved reference, do not submit another refund. Find the existing refund in the SSLCOMMERZ merchant portal using the original bank transaction and unique NORDA refund transaction ID. In the workspace enter its existing provider reference, verify and enter the exact amount, acknowledge the portal check and record evidence in the note. The server checks the returned transaction/reference/status and prevents reusing that provider reference. The amount acknowledgement is required because the documented query response may omit the amount. If no reference can be found, leave the refund unresolved and investigate with the provider; the application deliberately does not guess or blindly resend money.

For cash, return the actual money using your store's agreed channel first. Then record its receipt/reference, audit note and acknowledgement. This records a repayment; it does not send bank/bKash money. Local simulated refunds move no real money and remain identified as simulation records, excluded from real sales.

## Invoice and reporting

The original invoice number, items, prices, delivery snapshot and total remain unchanged. Refund totals, pending amounts, return state and the amount retained after confirmed refunds appear separately. Additional duplicate-payment refunds have their own amount and never subtract the retained sale twice. Payment/fulfillment history is retained rather than rewritten to look like an unpaid purchase.

Dashboard sales count paid, non-cancelled, non-simulated orders with `paymentStatus:paid`, net of confirmed ordinary order refunds. Review funds are excluded until approval. CSV adds order refund amount, additional-payment refunds, pending amount, refund state and net sales alongside existing columns. This is an operational register, not a statutory credit-note/tax accounting system.

## API contract

All paths below are under `/api`. JSON errors use the existing `{ "message": "..." }` shape. Use cookie authentication. Every administrator route requires `protect` and `adminOnly`; customer routes check ownership.

| Method | Path | Access | Body / purpose |
|---|---|---|---|
| GET | `/orders/:id/operations` | Owner/Admin | Order plus public request/refund progress; excludes private audit/payment details |
| POST | `/orders/:id/requests` | Owner/Admin | `{type:"cancellation"|"return",reason,requestKey}` |
| GET | `/admin/operations` | Admin | `mode=requests|reviews|refunds`, `status`, `type` for requests, `page`, `limit` |
| GET | `/admin/operations/orders/:id` | Admin | Payment history, requests, refunds and audit events |
| POST | `/admin/operations/orders/:id/review` | Admin | `{action,note,paymentId?,validationId?,acknowledgeRisk?}`; action `verify`, `retain`, `approve`, `close_refunded` or `note` |
| POST | `/admin/operations/orders/:id/refunds` | Admin | `{requestKey,note,paymentId?,validationId?,amount?}`; omitted amount means remaining balance |
| POST | `/admin/operations/requests/:id/decision` | Admin | `{decision:"approve"|"reject",note}`; note is customer-visible |
| POST | `/admin/operations/requests/:id/receive` | Admin | `{received:true,restock:true|false,note}`; all returned items received |
| POST | `/admin/operations/refunds/:id/confirm` | Admin | Cash only: `{confirmed:true,reference,note}` |
| POST | `/admin/operations/refunds/:id/reconcile` | Admin | Known reference: `{}`; recovery: `{refundReference,confirmedAmount,amountVerified:true,note}` |

Request keys contain 12–80 alphanumeric, underscore or hyphen characters. Monetary inputs are positive BDT amounts with at most two decimals. Text notes/reasons are 5–1,000 trimmed characters. A changed payload using the same key is rejected rather than submitted as another refund. Customer and admin forms serialize writes, preserve uncertain request keys and stop writes after an account change.

Customer request states are `requested`, `approved`, `rejected`, `received` and `completed`. Order summaries add `cancellationStatus`, `returnStatus`, `refundStatus`, `refundedAmount`, `refundPendingAmount`, `extraRefundedAmount` and payment review metadata. Older data defaults to no requests/refunds. Refund state is separate from the existing fulfillment/payment states.

## Reliability and acceptance

Review, request decisions, stock receipt, refund writes, callbacks, expiry and payment retry share the existing renewable distributed order lock. Related database writes use transactions on a replica set and reverse-order compensations for handled errors on standalone MongoDB. External gateway calls remain outside database transactions. A durable `submitting` marker protects against blind refund resubmission after a crash; a standalone database still cannot guarantee atomic rollback after a process/database failure. Use a replica set for public operation.

Automated tests cover replay/races, invoice/audit failures, partial stock rollback, uncertain submissions, duplicate bank captures, risky approvals, public/private projections, cash acknowledgements and frontend account/timeout guards. The same HTTP journeys passed with real Mongoose and MongoDB on standalone and replica-set paths. See [verification results](VERIFICATION_RESULTS.md).

Before real payment use, repeat on your own public sandbox host:

1. Request cancellation before shipment; reject one request and fulfill normally. Approve a separate unpaid request and verify exact stock restoration.
2. Approve a paid sandbox cancellation, observe provider acceptance as pending, then query until the provider actually confirms repayment. Check one refund and the unchanged invoice number/total.
3. Deliver a paid test order, request/approve return, confirm no stock change before receipt, then receive/restock once and verify refund completion. Repeat with a damaged/non-restocked return.
4. Confirm cash repayment requires the actual-money acknowledgement and receipt. Check a local simulation separately; it must not affect real revenue.
5. Exercise a risky/late/duplicate charge if the merchant sandbox supports it. Confirm explicit review, additional-charge refund, approval or close-refunded conditions. Replay callbacks and refund intents without another transfer.
6. Inspect new pages at 360/768/1024/1440 px, keyboard focus, long notes and invoice printing. Use two customer browser profiles and verify ownership and private-note isolation.

The implementation uses the documented SSLCOMMERZ refund initiation/query API and unique `refund_trans_id`. Your merchant account must permit refunds; live APIs require the merchant public IP to be allowlisted. Existing credentials are reused. Automated provider responses are fixtures: actual merchant permissions, sandbox/public callback reachability, refund settlement timing and visible browser/device acceptance require your environment. No real money or user database was used in release verification.

Official API reference: [SSLCOMMERZ version 4 integration documentation](https://developer.sslcommerz.com/doc/v4/).
