# NORDA 2.14.0 update report

Built directly from the delivered **2.13.1** archive. Adds the four requested advanced operations features:

1. Independent warehouse parcel courier booking/labels/tracking and approved-connector reverse pickup automation, with stable-reference uncertainty recovery and opt-in cutoff.
2. Scheduled merchant settlement feeds, reviewed/automatic imports, duplicate/cursor protection and balanced accounting CSV.
3. Whole-order partial receipts, multiple receiving warehouses, request-snapshot refund deductions and separate printable credits synchronized with confirmed refunds.
4. Configured distance/capacity/balanced allocation and previewed, replay-safe bulk warehouse transfers.

Adds four scoped admin screens and customer whole-return progress/credit. Existing shopping/payment/guest/refund flows, legacy manual operations and invoice snapshots are retained. Necessary integration guards connect the new operations to inventory, cancellation, delivery, permissions and refunds; unrelated credentials/assets/dependency selections are unchanged.

Verified: **335 JS files**, **566 default passes / 0 failures / 15 explicit native skips**, **265 native passes per topology**, **0 audit vulnerabilities**, and **61 pages / 146 HTTP targets** returned 200. No owner database, actual provider account or money was used.

Keep the current working laptop environment and uploads. No setup, seed or manual migration is required. Native forward parcels reuse configured eCourier credentials. Reverse pickup and automatic statement feeds require a merchant-approved HTTPS connector; the contract and activation steps are included in [ADVANCED_OPERATIONS.md](ADVANCED_OPERATIONS.md). Automatic job creation defaults off. Public provider/host and visible device/print acceptance remain explicit limits in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md).

Suggested commit: `feat: automate logistics, settlements, returns and warehouse routing`
