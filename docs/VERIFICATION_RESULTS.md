# Verification results — NORDA 2.14.2 · Local Final

Verified **24 October 2026, Asia/Dhaka** on Node.js **24.22.1**, npm **11.9.0**, native MongoDB **7.0.45**. Baseline: delivered **2.14.1 Local Final**. No owner database or real merchant account was used.

| Executed check | Result |
|---|---|
| `npm run verify` | **337 JS syntax checks; 605 results: 590 passed, 0 failed, 15 deliberate native skips** |
| `npm run test:integration`, standalone | **269 passed, 0 failed, 0 skipped** |
| `npm run test:integration`, single-member replica set | **269 passed, 0 failed, 0 skipped** |
| New frontend scenarios | **16 passed**, included in the default count |
| New shared HTTP scenarios | **3 passed**, included in default and each native topology |
| Actual isolated Express HTTP smoke | **61 pages / 146 distinct local page-resource targets**, all 200; health 200 |
| Bounded browse smoke | 24 fixture products; 40 GETs at concurrency 5, all 200; test-model adapter, not production capacity certification |
| `npm audit --json` | **0 vulnerabilities**; dependency selections unchanged |
| Source preservation | All **507** original files retained; **42 assets** and **11 environment/config/seed files** byte-identical |

## Requested behavior covered

- Empty/space-only header search does not navigate; typed/trimmed or prefilled search works and clearing the field disables submission. A visitor can find guest recovery before starting a guest session.
- Password controls are independent, keep input values, use non-submit buttons/accessible labels and work on dynamically inserted fields. Leaving the page remasks them.
- Category-name search uses literal matching with regex metacharacters and excludes archived inventory; brand search remains supported.
- A real HTTP/native guest order appears in the admin queue with its billing email, then progresses pending → processing → dispatched → delivered. Guest refresh sees every stage, COD/invoice becomes paid, stock is deducted once and one invoice remains.
- A separate signed-in customer cannot read that guest order through ordinary member access. Explicit guest tracking requires the valid guest cookie/identity; a mismatched identity is rejected. Frontend explicit guest context does not replace member cart, wishlist, auth or admin requests.
- Guest history shows full Order IDs/stages and private tracking/invoice links while signed in. Guest linking stops between requests when the signed-in identity changes; stale guest history cannot overwrite a new guest.
- Admin rows label guest/account origin, escape real customer contacts, direct warehouse orders to parcel fulfillment and hand dispatch to the courier form without a premature status write. Old filter results and delayed COD confirmations cannot write/render for a new account.
- Staff sign-in accepts only safe local destinations and keeps customer signup in its own dashboard; required MFA still takes priority.
- The optional ensure-admin operator function preserves existing admin credentials, refuses customer promotion and invalid/new weak configurations, creates one configured admin and leaves catalog counts unchanged. It was tested only against isolated fixture databases; the owner database was not connected.

The retained full suites also cover account recovery/email verification, guest recovery/claim rollback, member carts/coupons/SKUs, warehouse reservations/parcels, payment callbacks/retry/review, cancellations/returns/exchanges/refunds/credit notes, statement reconciliation, notifications/MFA/devices, courier/cloud protocols, encrypted backups/restores, independent monitoring and real app worker/start/restart behavior. Native tests create/drop only their own randomized databases. No fixture email/media is packaged.

## Method and limits

Frontend checks execute the actual page scripts against controlled DOM models and HTTP tests use the real Express routes. Search/eye/progress CSS and resource references are included; a browser CSS renderer was not available through the permitted local browser path. The prior cloud-browser access/policy restriction was respected; **visible desktop/mobile, keyboard and printed-PDF inspection is not certified**. No alternate browser/network workaround was used.

Real SSLCOMMERZ/provider transactions, inbox placement, actual carrier/cloud accounts, reverse/statement merchant connector deployment and public hosting/domain remain outside this localhost release. They are not an expanding feature backlog. Existing optional integrations and credentials remain intact.

See [shopping/admin guide](SHOPPING_AND_ADMIN_GUIDE.md), [local scope](LOCAL_FINAL_RELEASE.md), [run commands](../RUN_COMMANDS.md) and [source preservation](SOURCE_PRESERVATION.md).
