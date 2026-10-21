# Checkout recovery

Introduced in **NORDA 2.6.0**, building on 2.5.0 account recovery and saved addresses. The existing MongoDB URI, JWT/admin/SMTP/gateway settings, account credentials, catalog and branding are retained. No seed or manual database migration is required.

## Reservation policy

| Order/payment state | Reservation behavior |
|---|---|
| New unpaid SSLCOMMERZ or simulated order | Reserve items for 30 minutes by default |
| Deadline reached while unpaid and pending/processing | Cancel the unpaid order, restore inventory once and synchronize the existing invoice |
| Paid, review, shipped or delivered | Excluded from automatic expiry |
| COD | Excluded from automatic expiry |
| Manually cancelled order | Remains cancelled; online retry cannot reopen it |
| Payment validated after inventory was released | Payment review; keep cancellation and restored stock; fulfillment stays blocked |

The expiry worker runs at server startup and every 30 seconds while `npm start` or `npm run dev` is running. A sweep handles up to 50 eligible orders; a backlog drains over subsequent sweeps. After downtime the next startup processes overdue reservations. Orders and invoices are retained; this feature does not use MongoDB TTL deletion.

Older unpaid online orders with no explicit deadline use `createdAt + the configured reservation duration`. Starting this version can therefore release stock held by old abandoned online orders. Paid, COD and review orders remain excluded. Deadline checks also run when initiating/retrying a saved online checkout or submitting a payment result, so a callback cannot bypass expiry between scheduled sweeps.

Optional environment overrides are documented in `server/.env.example`. Existing `.env` files work without adding them:

```dotenv
PAYMENT_RESERVATION_MINUTES=30
RESERVATION_SWEEP_SECONDS=30
```

Allowed ranges are 1–1440 minutes and 5–3600 seconds. Invalid values prevent normal server startup. Existing orders with stored deadlines keep them; a successful new payment attempt starts a fresh reservation window. Resuming an active session keeps its current deadline; resuming after an expiry re-checks and re-reserves stock first.

A one-off bounded sweep is available from `server/`:

```bash
npm run reservations:expire
```

This command writes cancellation/inventory state for eligible orders in the configured database. The normal worker makes running it manually unnecessary. Do not confuse it with the read-only `acceptance:preflight` command.

## Customer recovery

1. Sign in to the account that placed the order and open **My Orders**.
2. An eligible real SSLCOMMERZ order shows **Retry or resume online payment**. Its deadline or released-stock note is visible beside the invoice action.
3. The server checks the gateway history for every recorded attempt. A successful payment is validated before the order is marked paid. An unresolved gateway response blocks a fresh attempt.
4. If an existing session is still pending/unattempted, resume that hosted session. A terminal failed/cancelled/expired attempt can be replaced by a new unique gateway transaction.
5. If the reservation expired, re-reserve every original product with conditional stock checks. An unavailable/archived item rejects retry, compensates any partial reservation and leaves the expired order intact.
6. Complete payment on the provider page, then inspect the saved order and invoice.

Retry keeps the **same order ID, invoice number, original line prices, totals and delivery snapshot**. It neither reads nor empties a newer cart. The server stores an attempt-specific request key; browser timeouts preserve it for a replay. Concurrent attempts share the same database-backed order lock.

Paid or review orders cannot create another payment session. At most 20 recorded gateway attempts are allowed per order; additional attempts require store assistance. A manual cancellation cannot be treated as an automatic expiry. An expired local simulation requires a new cart/order; pending simulations retain their existing resume/cancel actions before expiry.

## API

```http
POST /api/payments/sslcommerz/:orderId/retry
Content-Type: application/json
```

```json
{ "retryKey": "a-unique-uuid-or-request-key" }
```

Authentication and order ownership are required. `retryKey` contains 12–80 alphanumeric, underscore or hyphen characters. Use the same key for an uncertain network retry, then a fresh key for a later intentional attempt after receiving the prior result.

Successful responses contain `orderId`, `invoiceNumber`, `checkoutUrl` and `resumed`, or `alreadyPaid:true` / `review:true` when reconciliation resolved the payment instead. Gateway URLs are allowlisted HTTPS SSLCOMMERZ addresses. Configuration errors return 503; unavailable inventory, manual cancellation, unresolved attempts and review states return a conflict; gateway query failures return 502.

Read-only order APIs add:

```json
{
  "paymentRecovery": {
    "reservationExpiresAt": "2026-10-21T12:30:00.000Z",
    "reservationExpiredAt": null,
    "canRetry": true
  }
}
```

This is display/eligibility data; the POST always rechecks ownership, stock, payment state and gateway status. A page left open may need refreshing to show a worker's latest status.

## Payment integrity

- Expiry, administrator cancellation, callback capture and retry use `order:<id>` locking across API processes.
- Re-reservation and release use native MongoDB transactions on a replica set. Standalone development uses the existing ordered compensation path for handled failures. Use a replica set for atomic recovery from process crashes or a database outage during rollback.
- Remote gateway calls run outside database transactions. A transaction/session history query must succeed before opening another charge. A pending session without a recoverable hosted URL stays blocked for store assistance.
- An old failure notification cannot overwrite a newer retry's order or invoice state.
- Duplicate success/IPN delivery is idempotent. Success on a second attempt, or a distinct validated bank charge on the same attempt, creates a sticky review while retaining the first paid time and existing inventory state.
- Risk/review outcomes block online fulfillment. NORDA 2.7 adds an administrator review/refund workflow; review is never silently auto-approved. See [ORDER_OPERATIONS.md](ORDER_OPERATIONS.md).
- Gateway credentials and session URLs stay on the server; the client receives only the current hosted checkout link after authorization.

Implementation follows the provider's [official SSLCOMMERZ v4 transaction-query and validation API documentation](https://developer.sslcommerz.com/doc/v4/). Merchant sandbox acceptance still requires your real provider configuration and publicly reachable callbacks. Automated gateway responses are controlled test fixtures, not external provider certification.

## Update and acceptance

Keep the **working laptop `server/.env`**, including the SMTP settings you configured after downloading 2.5.0, and existing uploads when copying this update. The ZIP preserves the input archive's configuration; it cannot include later edits that exist only on your laptop. Do not run setup/seed or replace your working environment just to install recovery.

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

For an isolated test database, run `npm run test:integration` with `NORDA_TEST_MONGO_URI` and the appropriate `NORDA_EXPECT_TRANSACTIONS` value, as in [TESTING_GUIDE.md](TESTING_GUIDE.md). Native tests always use new random test databases.

Manual checks on a test installation:

- Leave an unpaid online/simulated checkout, wait past its deadline, refresh My Orders and verify stock/invoice cancellation. Restart the server with an overdue order and confirm catch-up release.
- Retry an expired real gateway order; verify one order/invoice, original totals, fresh stock reservation, successful payment and normal admin delivery.
- Resume a pending gateway session and confirm no second gateway attempt is created.
- Make one product unavailable after expiry and confirm retry does not open hosted payment or reserve any other line.
- Submit repeated/delayed success, failure, cancellation and IPN events in the public sandbox; inspect review behavior for a late payment or a second successful charge.
- Verify keyboard/mobile use, messages, current-account isolation and invoice printing in the target browser.

Automated evidence and remaining external checks are recorded in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md).
