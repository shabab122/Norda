# NORDA 2.6.0 update report

This update extends the latest 2.5.0 project with unpaid payment-reservation expiry, automatic stock release and real SSLCOMMERZ recovery on the same order and invoice.

New online/simulated orders reserve items for 30 minutes by default. A worker starts with the server and sweeps every 30 seconds; older overdue unpaid online orders use their creation time when no deadline is stored. Eligible expiry cancels the unpaid order, returns stock once and updates the existing invoice. COD, paid, review and already-fulfilled orders are excluded. Orders/invoices are retained for history.

My Orders shows reservation information and **Retry or resume online payment** on eligible configured real gateway orders. The server queries every recorded real payment attempt and validates successful remote transactions before opening another session. Pending hosted sessions are resumed. A terminal attempt can be replaced by a new unique gateway transaction; an expired order first re-reserves all available products. Original line prices, totals, delivery snapshots, invoice identity and any newer cart are preserved. A manual cancellation remains final.

Shared order locks and the existing transaction/compensation infrastructure coordinate expiry, retries, cancellation and callbacks. Old failure events cannot overwrite a newer retry; duplicate successes replay safely, and late or multiple successful charges require sticky store review. Recovered stock can expire again if payment is abandoned. An expired simulation cannot later report success and requires a new order.

Customer/admin messages, gateway-query error handling, the API reference, run commands, requirements and roadmap reflect the new behavior. No dependency versions were changed. Supplied `server/.env`, authentication/account-recovery/address-book source, catalog/seed/images, branding and unrelated features are preserved. Keep the laptop's current SMTP settings when applying this update: later local `.env` edits were not present in the input ZIP.

Verification: 124 JavaScript syntax checks; 188 default passes, 0 failures and 4 opt-in skips; 55 native passes on standalone MongoDB and 55 on a replica set; current dependency audit with 0 vulnerabilities. Full details and boundaries are in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md). Browser/device checks and real merchant sandbox/public callback acceptance remain target-environment checks; automated gateway responses are fixtures.

Apply source while retaining working `.env`, Git history and uploads; run `npm ci`, `npm run verify` and `npm run dev` from `server/`. No reseed/manual migration is required. See [CHECKOUT_RECOVERY.md](CHECKOUT_RECOVERY.md) and [../RUN_COMMANDS.md](../RUN_COMMANDS.md).
