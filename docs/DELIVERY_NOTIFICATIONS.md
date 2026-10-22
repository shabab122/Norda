# Courier tracking and order email — NORDA 2.8

> Version 2.10 extension: see [Management, notifications, devices and item returns](MANAGEMENT_RETURNS.md) for scoped staff access, device revocation, return/refund email preferences, delivery outcomes, selected-item returns/exchanges and credit notes. Earlier workflows below remain available.

This release adds courier/tracking details, append-only shipment history, an owner-protected customer tracking view and queued transactional email. It uses the existing MongoDB and SMTP configuration. No new merchant/courier credential or required environment setting is introduced.

## Update and entry points

Keep the working `server/.env`, including the SMTP settings configured on your laptop, and `server/uploads`. Apply the new source, then:

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

No setup, seed or manual migration is required. Keep NORDA on port 5000; ports 3000/3002 remain reserved for GitStack/Gitea. The API initializes new indexes and starts the existing reservation/refund workers plus the email worker automatically.

| User | Entry point |
|---|---|
| Customer | My Orders → Track delivery (`order-tracking.html?orderId=…`) |
| Administrator | Orders → Delivery tracking, or sidebar → Delivery tracking |
| Administrator | Sidebar → Email notifications; shipment detail also links to the selected order's emails |

## Courier and delivery workflow

1. Process an order using the existing pending → processing workflow. Online payments still require verified paid status; unresolved cancellation/refund/review guards stay in place.
2. Open its delivery tracking workspace. Save the courier name and tracking number together, and optionally the courier's HTTPS tracking URL.
3. Select **Dispatch order**. This advances normal fulfillment to shipped, records one shipment event and queues the shipping email. Courier and tracking number are required for dispatch from this workspace.
4. Add **In transit**, **Out for delivery** or **Delivery attempted** with an optional location and customer-visible note. Progress cannot silently move backwards; a new out-for-delivery attempt can follow a delivery attempt.
5. Record **Delivered**. It updates the existing order/invoice; COD becomes paid through the established fulfillment rule. Delivery and any newly paid-state email are queued once.
6. The customer opens Track delivery to see courier details, the current state and paginated recent history. A supplied courier URL opens in a separate tab.

Shipment notes are explicitly customer-visible. Keep private payment/fraud evidence in the existing Requests & payments workspace. History records server timestamps and the administrator actor; customer responses omit the actor and request keys. Delivered/cancelled orders close further shipment edits, while history remains available. Details can be corrected before delivery; assigned tracking cannot be cleared after dispatch through the new workspace.

Courier events in this release are **recorded manually by the store**. The URL can open the carrier's own tracking page, but NORDA does not book a courier, create a shipping label, poll a carrier API or accept unverified carrier webhooks. Such automation needs the chosen carrier's integration and credentials in a later phase. No arrival estimate is invented.

Existing basic order-status controls remain usable. They create shipped/delivered history and emails even for an older order without courier metadata; this preserves the prior admin flow. The new shipment workspace asks for full dispatch details.

## Email notifications

| Trigger | Email |
|---|---|
| Successful order creation | Confirmation with original total, item/SKU quantities and invoice reference |
| Payment status changes | Paid/failed/cancelled/review update; repeated callbacks do not create the same event email again |
| Order ships | Shipping update with available courier/tracking details and private customer tracking link |
| Shipment progress/details after dispatch | Delivery update with the store's recorded public note/location |
| Order delivered | Delivery confirmation; COD payment update when cash is newly recorded |
| Order cancelled or reservation expires | Cancellation notice; captured money/refunds remain tracked separately in account support |

A local payment simulation is described as a test with no real money transferred. Existing account-reset/verification messages continue to use the current mail configuration. This release does not add SMS, refund-specific email, marketing campaigns or subscriptions.

Emails are queued for new changes after the update; the application does not send a bulk backlog of confirmations for every old order at startup.

## Queue, retries and delivery truth

A durable `OrderNotification` record is staged with the order transaction/compensation unit. It remains `held` until the operation commits, then becomes `queued`. SMTP never runs inside checkout, payment validation or a MongoDB transaction. A failed SMTP delivery therefore does not roll back a valid order or stop shopping.

The worker checks on startup and every **15 seconds**, up to 20 queued messages per sweep. Atomic claim tokens coordinate workers across API processes. There are up to **five automatic attempts**, with exponential delay (one minute, four minutes, sixteen minutes, sixty-four minutes; capped at two hours). An exhausted record becomes failed and an administrator can retry it from Email notifications. A sent email cannot be blindly replayed using that button.

Interrupted sending claims recover after ten minutes. Retries retain a stable Message-ID. SMTP is an at-least-once delivery boundary: a connection/process interruption after the provider accepts a message may still produce a duplicate email on retry; Message-ID cannot guarantee provider deduplication. The order/payment/refund/stock operations themselves keep their separate existing replay protections.

Held activation interrupted after commit can recover after one minute when the stored order state still matches. A rolled-back/missing or superseded state is suppressed. Multiple intermediate payment changes within one database unit produce the final payment-state email rather than contradictory transient notices. Replica-set transactions remain recommended for atomic crash recovery; standalone compensation covers handled failures, not every process/database outage.

**Sent** means accepted by SMTP, not guaranteed inbox placement. Spam handling, mailbox quotas, sender reputation, SPF/DKIM/DMARC and actual SMTP availability remain provider/environment concerns. A development file delivery is displayed as **Saved preview**, not inbox delivery. Check both Inbox and Spam when using your current sender.

The admin delivery list exposes only recipient, subject, topic, status, attempt times and a redacted error. It never returns SMTP credentials, full message bodies, internal source state or claim tokens to the browser. Customers cannot open this administration endpoint.

## SMTP and private local preview

Your existing `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` settings are reused. Do not overwrite working settings with a template. See [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md#smtp-delivery) for the original SMTP setup.

```bash
cd server
npm run mail:check
```

With local file mode (development only), let the API run for a queue sweep, then in another terminal:

```bash
npm run mail:orders -- your-account@example.com
```

This shows up to five recent private order messages. The existing `mail:preview` continues to show account-related mail, so order traffic cannot displace password-reset/verification previews. Preview files are server-only, mode 0600, pruned on new preview writes to one day/100 recent messages; they are never served or distributed in the ZIP. Production disables file delivery and requires proper SMTP/TLS configuration.

## API

All paths are under `/api` and use cookie authentication.

| Method | Path | Access | Contract |
|---|---|---|---|
| GET | `/orders/:id/tracking` | Owner/Admin | Public order summary, courier details, paginated shipment events; `page`, `limit` |
| POST | `/orders/:id/shipment` | Admin | Store courier details or append a delivery event while applying normal order guards |
| GET | `/admin/notifications` | Admin | Filter by `status`, `orderId`, `page`, `limit`; current mail transport mode, never credentials |
| POST | `/admin/notifications/:id/retry` | Admin | Requeue a failed email; does not create another order/payment/refund |

Shipment example:

```json
{
  "event": "shipped",
  "courierName": "Your courier",
  "trackingNumber": "TRACK-123456",
  "trackingUrl": "https://courier.example/track/TRACK-123456",
  "location": "Dhaka",
  "note": "Your parcel has been handed to the courier.",
  "requestKey": "a-unique-request-key"
}
```

Events: `details_updated`, `shipped`, `in_transit`, `out_for_delivery`, `delivery_attempted`, `delivered`. Request keys are 12–80 alphanumeric, underscore or hyphen characters. Repeating the same key/details replays the saved update; changed details under that key conflict. Courier name ≤80, tracking number ≤100, location ≤120 and public note ≤500 characters. Tracking URLs must be HTTPS, without embedded credentials. The old status endpoint applies the same shipment validation if shipment input is supplied.

Shipment events, fulfillment changes, COD payment updates, invoice synchronization and staged emails share the order lock and database unit. Shipment timestamps cannot be forged by supplying a browser time. Events are not editable/deletable through the API.

## Acceptance

1. Use an existing customer/admin pair on your test database. Confirm foreign customers and signed-out visitors cannot view tracking or email administration.
2. Save courier details, dispatch, record progress, attempt and delivery. Check the public customer history, tracking URL and original invoice.
3. Retry the same shipment update after an interrupted response: one event/email, no second stock/payment update. Verify an unsafe URL and backwards event are rejected.
4. Dispatch an unpaid online/review order or one with a pending cancellation: it must remain blocked by the existing rules.
5. Use your working SMTP sender for an actual test order, failed/paid payment, shipment, delivery and cancellation. Observe the Email notifications queue; verify received messages, totals, SKU/invoice reference and links after login. Check Spam too.
6. Temporarily use an isolated failing mail listener in automated tests. The order stays saved; errors are redacted, retries back off and the admin can retry an exhausted record after fixing its configuration.
7. Test a local file-mode confirmation with `mail:orders`. Account previews must still show reset/verification messages separately.
8. Inspect customer/admin pages on mobile/desktop with keyboard and long courier/notes; print an invoice with variant labels.

Release verification uses isolated native MongoDB, an isolated SMTP listener and private file-mode delivery. It does not contact the owner's SMTP inbox or an actual courier. Browser/device visual acceptance, external inbox placement, carrier website accuracy and public SSLCOMMERZ settlement require the target environment.

Primary references: [MongoDB positional array updates](https://www.mongodb.com/docs/v8.0/reference/operator/update/positional/) and [Nodemailer message configuration](https://nodemailer.com/message).
