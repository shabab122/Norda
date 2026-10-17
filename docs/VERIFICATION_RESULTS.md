# Verification results — NORDA 2.4.0

Prepared 2026-10-17. Runtime: Node.js 24.19.0; native MongoDB 7.0.45.

| Check | Result |
|---|---|
| Clean `npm ci` | Passed with the committed lockfile |
| `npm run check` | 99 JavaScript files passed |
| Default `npm test` | 95 reported tests: 93 passed, 0 failed, 2 native entry points skipped without a URI |
| Native standalone | 27 reported tests passed, 0 failed, 0 skipped; transaction path explicitly false |
| Native replica set | 27 reported tests passed, 0 failed, 0 skipped; transaction path explicitly true |
| Dependency audit | 0 reported vulnerabilities; dependency versions unchanged from 2.3 |
| Static pages/assets | All 19 pages served; local references and IDs checked; 24 WebPs present with unique paths/hashes |
| Credentials | No private environment file, account password, JWT secret, MongoDB URI or gateway credential was changed |

Native runs cover the two entry points skipped by the default run. Each uses its own random `norda_test_*` database and drops only that database. No existing store database was used. The replica fixture has one member; it tests transaction correctness, not multi-node failover.

## Demo payment acceptance

Both `mobile_banking` and `card_bank` exercise successful, failed and cancelled payment outcomes over HTTP against real database records. Assertions cover one order/invoice/payment, server-owned amounts, cart clearing, stock reservation/restoration, ownership, same-key replay, simultaneous completion, terminal-state integrity, demo invoice labels and real-revenue exclusion. Tests also cover production/disable guards, real-order/callback isolation, administrator cancellation, injected invoice-write rollback and interrupted initialization resumed without consuming a newer cart.

The simulator never needs merchant credentials or provider responses. It is explicitly local and does not test real bKash/card/bank/SSLCOMMERZ connectivity.

## Existing commerce and provider regression

Native tests retain catalog seed preservation, all categories/photos, real password/cookie login, two-customer account/cart/order/invoice isolation, COD checkout/delivery/verified review, inventory edit conflicts, archive/removal, final-unit and checkout races, invoice-write rollback, uploads and read-only preflight.

Real-provider application state handling covers initiation replay, success/failure/cancel, repeated callbacks/IPN, amount mismatch and late validation using controlled outbound gateway responses. Paid states cannot be downgraded; late validated payment after cancellation enters review without consuming inventory again. This is not public provider acceptance.

## Frontend and image checks

JavaScript VM tests verify separated payment choices, their submitted endpoints/channels, duplicate-click guards, demo/terminal rendering without sensitive input fields, and homepage product/cover exclusions. Existing dashboard/account/cart/safe-redirect checks pass. All 24 existing photos were visually inspected in a contact sheet and match their product subjects; the screenshots repeated product selections across sections rather than showing duplicate image files.

Actual browser/mobile/keyboard/print checks remain pending; this environment has no supported browser controller. No production readiness or real payment certification is implied.

## Reproduce

```bash
cd server
npm ci
npm run verify
# Supply an isolated local test server, not a production database server:
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' NORDA_EXPECT_TRANSACTIONS=0 npm run test:integration
```

For a replica set, use its URI and `NORDA_EXPECT_TRANSACTIONS=1`. Existing CI covers both topologies. To check your working local environment without rewriting it, use `npm run acceptance:preflight`. Visible demo checks and real provider acceptance are in `ACCEPTANCE_CHECKLIST.md`.
