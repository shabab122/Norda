# Verification results — NORDA 2.14.1 · Local Final

Verified **24 October 2026, Asia/Dhaka** using Node.js **24.22.1**, npm **11.9.0**, native MongoDB **7.0.45**. Source baseline is the delivered **2.14.0** ZIP. No owner database or real merchant account was used.

| Executed check | Result |
|---|---|
| `npm run verify` | **335 JS syntax checks; 586 reported results: 571 passed, 0 failed, 15 deliberately skipped native entry points** |
| `npm run test:integration`, standalone | **266 passed, 0 failed, 0 skipped**, handled-error compensation |
| `npm run test:integration`, single-member replica set | **266 passed, 0 failed, 0 skipped**, native transaction path |
| Focused final frontend rerun | All selected order-operations, final-release and frontend-safety tests pass after the last caption update |
| Actual isolated HTTP smoke | **61 HTML pages, 146 distinct local page/resource targets**, all status 200; health 200 |
| Bounded browse smoke | 24 fixture products; **40 GET requests, concurrency 5, all 200** through the real Express app with a test-only model adapter. This is not a production capacity benchmark. |
| `npm audit --json` | **0 vulnerabilities**; dependency selections unchanged |
| Source preservation | All **506** original files retained; all **42 assets** and **11 environment/config/seed files** byte-identical |

## What changed and was exercised

1. Whole-return and item-return frontend tests prove later equal-quantity/equal-note physical parcels get different receipt intents, while one failed whole receipt retains its retry key.
2. A blocked-session-storage item receipt reports an error, unlocks the form and allows a corrected retry; existing ownership guards remain.
3. Customer history reports mixed restock counts accurately.
4. A shared actual-HTTP/native journey reproduces and fixes failed whole-return refund retry leaving the credit/request linked to the old refund. It checks pending and mismatched-amount rejection, injected credit-link failure rollback, the saved entitlement and final credit/request settlement without invoice total changes.
5. The injected refund-link failure also verifies that an exception cannot retain a controller's provisional `202` success status. Central error handling returns an error instead. Validation/conflict status behavior remains covered by the full suites.

Five results were added to the default pass count: four frontend tests and one shared HTTP journey. The shared journey also runs on both native topologies. Existing account/guest/cart/checkout/coupon/variant, inventory/warehouse/parcel, payment/review/cancellation, return/exchange/refund/settlement, notification/MFA/session, provider, backup/restore, monitor and app startup/restart tests remain passing. Native fixtures create randomized isolated databases and remove only their own targets. Actual server/worker restart and production transaction preflight tests remain fixture checks; no public deployment was attempted.

## Fixed local scope and honest boundaries

- A real isolated local app was prepared with fixture users/products. The cloud browser initially could not connect; after server readiness, its URL-policy gate blocked observation. No alternate browser/network workaround was attempted. **Visible browser/mobile/keyboard/printed-PDF acceptance was not completed**. Frontend VM/static/HTTP and print-rule checks are the evidence available here.
- Real SSLCOMMERZ money/public callbacks/refunds, actual courier pickups/labels, approved reverse/statement connector deployment, real inbox placement/cloud account/storage/alert receipt and domain/production hosting are **not claimed**. Existing integrations/contracts/manual modes remain intact for later explicit activation.
- The owner selected localhost as the final target for this release. The above external boundaries are not new feature assignments or an expanding release backlog. No additional feature is proposed as a condition of local completion.

See [fixed local scope](LOCAL_FINAL_RELEASE.md), [run commands](../RUN_COMMANDS.md) and [source preservation](SOURCE_PRESERVATION.md). Earlier FINAL_RELEASE and feature guides are historical/reference material; this file records the current execution results.
