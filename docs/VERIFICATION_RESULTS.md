# Verification results — NORDA 2.14.0

Verified **24 October 2026, Asia/Dhaka**, using Node.js **24.22.1**, npm **11.9.0** and native MongoDB **7.0.45**. Source baseline: delivered **2.13.1**. No owner database, real carrier booking or real payment account was used.

| Executed check | Result |
|---|---|
| `npm run verify` | **335** JS syntax checks; **581 reported tests: 566 passed, 0 failed, 15 intentionally skipped native entry points** |
| `npm run test:integration`, standalone | **265 passed, 0 failed, 0 skipped**; handled-error compensation |
| `npm run test:integration`, single-member replica set | **265 passed, 0 failed, 0 skipped**; native transactions |
| New checks in the default count | **39 passes**: 31 advanced HTTP journey/parent results, 4 frontend checks, 4 merchant protocol/parent results |
| New native journeys | **31 passes per topology**, included in each 265 total |
| Actual isolated HTTP smoke | **61 pages**, **146 distinct page/resource targets**, all status 200; `/api/health` 200 |
| Actual server startup/restart | All workers initialize/shut down, existing cookie/cart persist across graceful restart; production transaction preflight verified on both topologies |
| `npm audit --json` | **0 vulnerabilities**; no dependency selections changed |
| Static/frontend | All page resource references/unique IDs, retained branding/receipt checks, admin account-change guards, retry serialization, stale previews and escaping pass |
| Source preservation | All **473** original files retained; **42 assets** and **10 credential/config/seed files** byte-identical |

## New persistence, money and provider coverage

- Scoped authentication/authorization; versioned settings and customer order isolation.
- Nearest source splitting, exact parcel money, capacity below active holds, missing-district no-write failure and concurrent cross-SKU warehouse capacity.
- Sequential/quoted CSV transfer previews, stale balances, replay, injected movement-write failure and restoration of both sides.
- Fixed/percentage/delivery-credit snapshot deductions; approved amounts, multi-location partial receipt/replay, over-receipt rejection and injected receipt failure.
- No premature refund; separate credit after full receipt; deducted confirmed refunds settle request/credit while original invoice remains partly refunded; zero-credit returns create no money movement.
- Legacy receive-all after partial receipt never restocks the already received quantity again.
- Independent native eCourier parcel references/pickup addresses/collection amounts, trusted PDF, manual bypass/cancellation guards and all-parcels-delivered COD synchronization.
- Timed-out booking is queried using its original reference and not resent; reverse booking/appointment/tracking; explicit cutoff opt-in, queue replay and cancelled-attempt history/rebooking.
- Active reverse jobs block approval withdrawal; submission rechecks current approval before outbound work.
- Feed staging/review/automatic import, stable cursor on error, immutable batch IDs, identical manual-import deduplication, empty idle pages and balanced journal CSV.
- Merchant HTTPS/token/redirect/response-size/error classification and streamed multibyte JSON; provider evidence is controlled, with no external merchant side effects.

The complete retained customer/admin, account recovery/email/device/MFA, guest cart/link/recovery, coupon/variant/warehouse, payment/review/refund/exchange, courier, media, backup/restore, monitoring and release suites also pass. Native fixtures use randomized isolated test databases and drop only their own targets. MongoDB standalone compensation does not certify atomic process-crash recovery; production requires a replica set.

## Findings corrected during this release

Fixed system-actor parcel history handling, the new worker's startup import, approval resetting a deducted refund amount, stale/duplicate feed import behavior, stream decoding and shared capacity compare-and-set guards. These are scoped integration fixes for the four features. Final evidence above is from the corrected source.

## Remaining actual-environment acceptance

| Area | Boundary |
|---|---|
| Merchant services | No approved reverse/statement connector or active merchant credentials were supplied. Real reverse bookings, parcel labels, statements, original/exchange SSLCOMMERZ callbacks/IPN/refunds and settlement receipts are **not executed**. |
| Visible UI/device/print | Static/VM/HTTP checks pass. The previously available browser could not access this isolated local app; no new visible browser, physical phone, keyboard or printed-PDF inspection is claimed. |
| External operations | Real inbox/spam placement, courier/cloud accounts, public Docker/TLS/host deployment and remote-storage restore remain deployment-specific. Retained controlled SMTP/backup/rollback tests pass. |

See [advanced operations](ADVANCED_OPERATIONS.md), [run commands](../RUN_COMMANDS.md) and [acceptance checklist](ACCEPTANCE_CHECKLIST.md). The [2.13.1 final report](FINAL_RELEASE.md) is historical evidence, not this release's test count.
