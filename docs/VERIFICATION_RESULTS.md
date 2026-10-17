# Verification results — NORDA 2.2.0

Prepared 2026-10-15 with Node.js 24.19.0 and native MongoDB 7.0.45.

| Check | Result |
|---|---|
| `npm ci` in `server/` | Passed; clean lockfile install |
| `npm run check` | 89 JavaScript files passed syntax validation |
| Default `npm test` | 62 reported tests: 60 passed, 0 failed, 2 native entry points skipped without a URI |
| Native standalone integration | 13 reported tests passed, 0 failed, 0 skipped; transaction path explicitly false |
| Native replica-set integration | 13 reported tests passed, 0 failed, 0 skipped; transaction path explicitly true |
| `npm audit --json` | 0 vulnerabilities; report included |
| Catalog/photo integrity | 12 categories, 24 products, 24 unique 800×800 WebPs; every seeded photo served over HTTP |

The two default skips are covered by the separate native runs above. Native tests use random `norda_test_*` databases and remove only those databases. No existing store database was changed. The single-member replica fixture tests transactions, not failover/high availability.

## Regression evidence

The existing HTTP model-adapter suite passes across all 17 pages, registration/login, authorization, administration, stock-aware cart, COD, invoices/reviews, media validation, controlled payment callbacks and password/session invalidation. Fault-injection tests cover handled persistence failures.

Frontend VM checks cover escaped output, sold-out quick-cart gating, checkout keys, resource references, local cookie hostname, guest selection/quantity, single-use completion, expired/invalid selections, write serialization/recovery, account changes, failure notices and login/registration return context.

## Native HTTP evidence on both topologies

1. Seed upgrades starter art and adds missing samples without resetting merchant prices, stock or custom photos; rerunning creates no duplicates.
2. Anonymous users browse all 12 categories and 24 image URLs; cart access requires login.
3. Real password hashing, registration/login cookies, logout revocation, cart persistence and admin/ownership restrictions work.
4. All 23 stocked products coexist in the cart; sold-out product, invalid quantity and excess stock are rejected. Update/remove/re-add and repricing work.
5. Multi-category COD creates one order/invoice, computes current totals, decreases stock and clears the cart. Repeating a key returns the same order.
6. Repeated cancellation restores stock once and updates the invoice.
7. Archived items remain removable and prevent checkout.
8. Two simultaneous customers competing for one unit produce one success and one stock conflict, never negative stock.
9. Injected invoice-write failure restores inventory/order state and retains the cart; locks are released.
10. Concurrent checkout from one cart reserves once and remains replayable.
11. Multipart accepts a real image, rejects invalid/extra files and enforces admin access.

Reproduce against an isolated server:

```bash
cd server
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

For a replica set, supply its URI and `NORDA_EXPECT_TRANSACTIONS=1`. CI runs the same two modes.

## Not covered

Actual browser/device rendering, keyboard/print acceptance, live or public sandbox SSLCOMMERZ processing, multi-node failover and deployment capacity were not tested. `TESTING_GUIDE.md` and `CATALOG_GUIDE.md` provide manual checks. Tests do not certify crash-atomic recovery on standalone MongoDB.
