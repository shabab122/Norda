# NORDA 2.10 — Management, notifications, devices and item returns

> v2.12 extension: [RELEASE_AUTOMATION.md](RELEASE_AUTOMATION.md) adds release automation, private off-host recovery, independent monitoring, invitations/MFA and advanced warehouse/catalog/email tools. Earlier workflows below remain supported.


This release extends v2.9 without resetting data or changing any database, JWT, administrator, gateway or SMTP credential. Keep your currently working `server/.env`, uploads and Git history when updating. Run `npm ci`, `npm run verify` and `npm run dev` from `server/`; no seed/setup/manual migration is required. New indexes initialize before the API starts. Use a replica set for transactional recovery across process/database failures; standalone support retains handled-error compensations.

## Where to find the tools

| User | Navigation |
|---|---|
| Administrator | Sales reports, Customers, Staff & permissions, Item returns & exchanges in the existing sidebar |
| Staff | Normal sign-in → My workspace → assigned tools; existing registered accounts receive access from the administrator |
| Customer | Profile → Devices & email preferences; delivered order → Return items or exchange size/color |
| Credit note | Open the received return's credit note; Print / save PDF |
| Email outcomes | Admin Email notifications → Delivery history / Record provider outcome |

## Sales reports

Choose 1–366 inclusive calendar days in Asia/Dhaka and group daily or monthly. Zero-sale periods are included. The report includes paid, verified orders whose paid date falls in the selected period, including later-cancelled paid orders so captured money is not lost. Historical orders without a paid timestamp fall back to creation. Local payment simulations and payments still in review are excluded.

Summary: gross merchandise, coupon savings, delivery charges, captured total, confirmed order-payment refunds completed through the last selected day, currently reserved refunds, and net revenue (captured minus confirmed refunds). Refunds of an extra duplicate charge are excluded from ordinary revenue adjustments. This is a **paid-order cohort report**, not a bank-settlement, tax or calendar cash-flow ledger. Pending refunds describe current reservations, including approved item returns awaiting receipt. Top product/SKU merchandise revenue is after allocated coupons; order-level shipping and unallocated legacy refunds are not attributed to individual SKUs. SKU rankings show up to 100 rows. CSV exports the period totals. Queries reject more than 10,000 matching orders/50,000 refund rows; narrow the range instead of silently truncating totals.

## Customers and staff access

Customers can be searched by literal name/email, with paginated own purchase history. Passwords, reset/verification hashes, session secrets and payment credentials are never returned. Existing staff access is assigned to a registered account, so no password or credential is generated/replaced and no invitation email is sent.

Only a full administrator may grant/remove staff access or view the access audit. Full administrators cannot be modified by this screen. Staff cannot grant themselves permissions, and registration always creates a customer. Every protected request checks the current stored role/permissions, so changes apply on the next request. The sidebar and landing workspace expose assigned tools.

| Permission | Tools |
|---|---|
| reports | Overview, sales reports and order CSV |
| catalog | Product/category/brand management and image uploads |
| inventory | Existing product/SKU stock import/export and low-stock tools |
| orders | Order fulfillment, shipments, invoice access |
| payments | Payment review, cancellation/return decisions, refunds, item returns/exchanges and credit notes |
| customers | Customer search and purchase history |
| notifications | Email queue, retry and verified delivery outcomes |
| marketing | Coupon center |
| settings | Store content/delivery/return settings; uploading a new image additionally needs catalog access |

An assigned tool does not let staff use another customer's account-only cart or request endpoints. Staff may still shop using their own account. Access edits and their audit record share a database unit; an audit failure rolls back the grant.

## Device sessions

Each new sign-in has its own random session ID in the signed JWT. Only a SHA-256 hash is kept when adopting a valid legacy JWT; raw JWTs are never stored in the session collection. The device screen shows browser-supplied names, approximate masked network hints, last activity, expiry and the current-device marker. These are helpful labels, not verified hardware identities.

- Sign out or revoke one session invalidates only that session.
- Sign out other devices rotates the current cookie and increments the account's token version, invalidating even an unseen old JWT. The requesting browser remains signed in using the replacement cookie. Explicit bearer clients must replace their old token with the returned `user.token` when token return is enabled.
- Password changes/resets retain their existing all-session invalidation. Normal profile edits reuse the current device session.
- Earlier installations may have copied the same legacy token to more than one device; those copies are one earlier session until users sign in again per device.
- Expired session documents have a TTL index; expiry/revocation are checked by authentication immediately, without waiting for TTL deletion. Last activity writes are throttled to once per minute.

## Email preferences and delivery outcomes

Customers can choose order updates, return/exchange updates and refund updates separately; missing preferences default to enabled for compatibility. Account verification, reset and security email cannot be disabled. Preferences are checked both when an outbox entry is staged and immediately before sending. Suppressed messages remain visible for auditing and are not silently resent after opting in later. Existing queued order email uses the same working SMTP settings.

Legacy whole-order requests and new item requests produce return updates. Refund holds, queued/pending/failed/unknown/succeeded states produce refund updates without claiming that approval or a pending status means money was returned. Case/order IDs and safe customer details are sent; private bank/gateway/SMTP credentials and internal audit notes are excluded. A stored spam complaint suppresses further store notification email to that recipient; account-security mail remains available. A bounced message is not automatically resent.

The queue's `sent` status means SMTP accepted the email, or a private preview was saved in development. **Provider delivery status is separate**: unknown, accepted, preview, delivered, bounced or complained. SMTP alone cannot supply confirmed inbox delivery/bounces. An authorized operator may record a provider-verified outcome with a reason and confirmation; the append-only history retains duplicates' idempotent identities. A later delivered event cannot erase a bounce/complaint.

Automatic provider outcomes require a trusted provider adapter calling the optional signed endpoint below. This does not install a Gmail bounce listener or silently reconfigure the owner's mail. SMS is not required by the current email workflow and no paid SMS service or credentials are introduced.

### Signed delivery webhook contract

Optional `MAIL_WEBHOOK_SECRET`: configure your own random secret of at least 32 characters **only if integrating a provider adapter**. Existing credentials are unchanged; an unconfigured webhook returns 503 while normal email works. Endpoint: `POST /api/mail/delivery-events`, content type `application/json`.

```json
{
  "provider": "your-mail-adapter",
  "eventId": "unique-provider-event-id",
  "messageId": "<norda-message-id@your-sender-domain>",
  "kind": "bounced",
  "occurredAt": "2026-10-22T12:00:00.000Z",
  "reason": "Provider-confirmed permanent delivery failure"
}
```

Headers: `X-Norda-Timestamp` is the current Unix timestamp in seconds; `X-Norda-Signature` is lowercase hexadecimal HMAC-SHA256 using the secret over `timestamp + "." + exact raw JSON body`. Clock skew must be within 300 seconds. The adapter must first verify its own provider's authentic event; never expose this secret in frontend code. Accepted kinds: delivered, bounced, complained. A known `notificationId` may replace `messageId`. Replays require the same provider/event ID, notification, kind, occurrence time and reason. The global unique provider/event index and per-message lock prevent duplicate history. File previews have no provider delivery outcome.

## Return policies and accounting

Admin Store settings defines a return window of 0–365 whole days (default 30) and enables/disables exchanges. Zero disables new requests. New orders snapshot those settings; changing policy does not retroactively alter their window. Historical orders without snapshots use current policy. Eligibility requires a delivered, paid, verified order and is checked when the request is created. The window begins at recorded delivery; historical orders without it fall back to paid/update/creation time and the customer is told that fallback was used. Existing approved requests may be processed after the window closes.

Selected order lines use the immutable order array index and exact purchased product/SKU identity. Requested, approved and completed quantities consume the original purchased quantity; rejected cases release it. Whole-order returns and item cases cannot overlap. Separate existing order refunds require store reconciliation first.

Coupon discounts are allocated to lines with integer-paisa largest remainders. Stable purchased-unit ordinals allocate indivisible paisa across partial quantities, including gaps from rejected requests. Total item credit never exceeds merchandise actually paid. Original delivery fees are **not credited** by item returns; price differences, discretionary deductions, tax treatment and formal external accounting remain separate policy/integration scope. The original invoice items and total are never rewritten.

### Return sequence

1. Customer selects lines/quantities and reason; retries use one request key and mismatched details receive 409.
2. Administrator approves/rejects. Approval reserves the exact refund amount in `awaiting_return`, without submitting a gateway refund or confirming a cash payout. This prevents another refund consuming the same source balance.
3. Before receipt, approval may be withdrawn: the held refund is released and its state/history retained.
4. Administrator confirms physical receipt of **all approved quantities** and a separate restock choice for each selected line. Only chosen original SKUs are restored, once. Split parcels can be recorded after all approved items arrive; partial receipt of one case is not supported.
5. One credit note is issued against the original invoice. The refund hold becomes pending for COD/manual payout or queued for the existing gateway. Workers retain unknown-result safeguards; local simulations move no money.
6. Confirmed refund success completes the case and settles its credit note. COD needs an actual payment reference and explicit confirmation. A gateway timeout stays unknown and must be reconciled, never blindly retried.
7. A provider-confirmed failed refund can be retried with a new idempotency key on the same received case/credit note. Pending/unknown refunds block a second submission.

A fully discounted merchandise return creates a settled zero-value credit note and no refund transaction. Credit notes are owner/scoped-staff protected and printable; a pending credit note is not proof that money was paid out.

### Exchange sequence

Exchange supports **equal-price size/color alternatives of the same product**, for the original selected quantity. The current replacement unit price must equal the original unit price; otherwise use return + a new purchase. Simple products and the same option are not exchange targets. Active SKU and current stock are rechecked at approval.

Approval reserves the exact replacement SKU. Rejecting/withdrawing before receipt releases that reservation once. Receiving the original quantities restores only lines marked resellable and puts the reserved replacement in ready state. Administrator records courier/tracking and shipment, then delivery to complete the case. The original delivered order, payment and invoice totals stay intact; replacement shipment is visible in the case history/email. Replacement delivery does not create a new purchase entitlement on the old order; a further issue with the replacement is handled through customer care.

## API additions

Base `/api`; JSON responses except the sales CSV. Full administrators have all listed operational scopes.

| Method | Path | Access |
|---|---|---|
| GET | `/admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day` | reports |
| GET | `/admin/reports/sales.csv` with same filters | reports |
| GET | `/admin/customers?q=literal&page=1` | customers |
| GET | `/admin/customers/:id/orders?page=1` | customers |
| GET / PUT | `/admin/staff` | full admin only |
| GET | `/admin/staff/audit?page=1` | full admin only |
| GET | `/auth/sessions` | signed-in owner |
| DELETE | `/auth/sessions/:id` | signed-in owner |
| POST | `/auth/sessions/revoke-others` | signed-in owner; replacement cookie returned |
| PUT | `/auth/notification-preferences` | signed-in owner |
| POST | `/admin/notifications/:id/delivery` | notifications; provider-verified result |
| GET | `/admin/notifications/:id/events?page=1` | notifications |
| POST | `/mail/delivery-events` | configured HMAC signature |
| GET / POST | `/orders/:id/item-returns` | owner; full admin retains previous access |
| GET | `/admin/item-returns?status=&orderId=&page=1` | payments |
| POST | `/admin/item-returns/:id/decision` | payments |
| POST | `/admin/item-returns/:id/receive` | payments |
| POST | `/admin/item-returns/:id/retry-refund` | payments |
| POST | `/admin/item-returns/:id/shipment` | payments |
| GET | `/credit-notes/:id` | owner or orders/payments |

Staff body: `{ "email": "registered@example.com", "role": "staff", "permissions": ["inventory", "orders"], "note": "Assigned stock and shipping" }`. Use role `user` to remove operational access. Preferences body permits only boolean `orderUpdates`, `returnUpdates`, `refundUpdates`.

Item request: `{ "type": "return", "requestKey": "a-unique-uuid", "reason": "The size is unsuitable", "items": [{ "lineIndex": 0, "quantity": 1 }] }`. For exchange, each item also needs `replacementVariantId`. Decision uses `decision: approve/reject` and a 5–1000 character `note`. Receipt uses `received: true`, a note and `items: [{ lineIndex: 0, restock: true }]` for every approved line. Shipment uses status `shipped` with courierName/trackingNumber/optional HTTPS trackingUrl, or status `delivered`, plus note. Refund retry uses requestKey/note; its refund follows existing confirmation/reconciliation endpoints.

## Acceptance on your laptop

- Keep the existing customer browse → login → exact-SKU cart → COD order → invoice journey; process/deliver/cancel another eligible order as before.
- Check Sales reports in day/month modes, coupon savings, completed/pending refunds and CSV. Compare known paid order totals and separate test simulations.
- Register a team member normally; grant just inventory/customers. Verify those tools work and catalog/payments/staff endpoints reject access. Revoke a permission and refresh their session.
- Sign in from two browser profiles/devices. List both, revoke one, then sign out all other devices. Confirm the current browser remains signed in and old tokens are rejected.
- Disable return emails, create a request, inspect suppressed outbox state; leave password recovery working. With SMTP, verify a real provider delivery/bounce and record it or configure your signed adapter.
- Return one discounted unit; approve without paying/restocking, receive and inspect exact stock + one credit note, record cash repayment, check original invoice totals/refund summary. Replay receipt/confirmation and verify no extra stock/money.
- Request an equal-price size/color exchange; verify replacement reservation, withdrawal release, receipt/restock choice, courier tracking and delivery. Test out-of-stock/price-change rejection.
- Check mobile layouts, keyboard interaction and credit-note printing. Automated VM/static checks are not a completed visual/device acceptance result.

Read [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md) for recorded automated evidence. Real merchant callbacks/refund settlement, owner Atlas setup, SMTP inbox/bounce integration and external courier booking still require their respective deployment environments.
