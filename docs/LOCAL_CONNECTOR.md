# Runnable local operations connector

**Mode: local-demo. No carrier is contacted and no money is received or transferred.** A specific real reverse-pickup/settlement provider was not selected, and real courier activation is deferred. This service demonstrates the existing API contract end to end with durable local state. It does not claim merchant integration or manufacture provider evidence.

## Start

From `server/`, after `npm ci`, stop the ordinary NORDA server before starting the second command:

```bash
# Terminal 1 — private connector, loopback port 5018
npm run connector:demo
```

```bash
# Terminal 2 — same NORDA app/database configuration, explicit local connector mode
npm run dev:operations-demo
```

Open `http://localhost:5000`. GitStack/Gitea ports 3000/3002 remain reserved. The service binds only `127.0.0.1`, requires a runtime-generated private bearer token and rejects browser-origin requests. Token/state files live under ignored `server/.local-connector/`; no existing environment file is rewritten. The app command verifies the connector health before starting and overrides only connector-related values **inside that process**. A missing receiving address gets an explicitly demonstrated local desk value.

Prefer a test-only local store when demonstrating after-sales steps. The app still uses your configured database; no database is automatically created, reset, seeded or switched. Normal admin actions on test orders use the existing database guards.

To return to ordinary mode, stop both processes with Ctrl+C and run your normal `npm run dev`. Existing real merchant configuration has not changed. A booking/feed retains its original connector mode; it cannot be reconciled using another mode. Background processing skips jobs/feeds from the other mode, automatic booking flags are off in this launcher and real parcel booking is disabled in explicit local demo mode.

## Reverse-pickup demonstration

1. Use an eligible delivered COD test order. Request a return/exchange, approve it using the existing Operations tool, then create the return pickup.
2. From the pickup open **Courier automation**, select `pickup`, enter its exact ID and choose the receiving warehouse. Confirm and queue the booking.
3. **Submit now** contacts the running private service. It returns `NORDA demo carrier` and a stable `DEMO_…` tracking identity. Repeated submissions/queries do not create another booking. An ordinary query never advances a stage.
4. Copy the job's full `NLR…` reference. Advance each stage explicitly from a third terminal:

```bash
npm run connector:control -- pickup NLR_REFERENCE picked_up
npm run connector:control -- pickup NLR_REFERENCE in_transit
npm run connector:control -- pickup NLR_REFERENCE arrived
```

After each command, use **Reconcile / track** or let the normal worker poll. The customer/admin pickup view shows its new stage. Advance one stage at a time; backwards movement is rejected. Cancellation before pickup is idempotent; a moving pickup cannot be cancelled.

The demonstration issues no real provider PDF label. **Get label** reports that no label exists. Arrival never confirms physical item receipt, restocks inventory or releases a refund. The existing inspected receipt workflow remains a separate explicit staff action.

## Statement demonstration

1. Export the existing settlement CSV template and save a local copy. Keep the exact header; add 1–500 sample rows with valid IDs, ISO dates, BDT and balanced amounts. Gateway kinds are `gateway_sale`, `gateway_refund`, `exchange_sale`; courier kind is `cod_remittance`.
2. Publish that sample page to the local service:

```bash
npm run connector:control -- statement courier sample-batch-001 /absolute/path/to/sample.csv
```

3. In **Statement feeds**, enable the matching source with automatic import off, save and **Fetch now**. The configuration and page are labelled LOCAL DEMO.
4. **Preview matches** checks the sample against actual local test order/payment records. A sample does not authenticate a payment; unmatched/mismatched rows stay visible.
5. **Acknowledge demo preview** advances only that demo feed cursor. It creates **no settlement ledger entry**, changes no paid/invoice state and performs no transfer/refund. Automatic import and direct import are rejected server-side for demo pages. Use existing reviewed settlement import only for genuine verified statements.

Published pages are immutable and retain stable cursors/batch IDs through restart. Changed content under the same batch ID or reused provider references is rejected. An idle feed retains its cursor. Existing merchant feeds with cursors/pending data are protected from switching into demo mode; use a fresh test store for such a demonstration instead of clearing production history.

## State and recovery

The connector stores no customer name, address or phone in booking state: only the normalized intent hash, IDs and demonstration result are retained. JSON writes use a private temporary file, fsync and atomic rename before acknowledgement. An exclusive lifetime lock rejects a second service process. After an uncertain disk error the service stops accepting operations until recovery/restart.

Clean shutdown releases `service.lock`. After a crash, stop/confirm that **all** connector processes using this directory are gone, preserve `state.json`, then remove only the stale lock and restart. Never delete state to retry an uncertain booking; query the original reference. The service fails closed on corrupt state. Do not publish the private directory or token.

This implementation is limited to localhost demonstration storage (2,000 booking records and 100 pages per source). Real provider onboarding/retention, authentication mapping and deployment remain an explicitly deferred integration decision.
