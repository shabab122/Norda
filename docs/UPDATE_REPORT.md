# NORDA 2.4.0 update report

This update adds the requested self-contained demo checkout and removes homepage product/image overlap. It retains the HTML/CSS/JavaScript, Express/Node and MongoDB stack, existing accounts, COD, real SSLCOMMERZ integration and catalog data.

## Why checkout was disabled

The screenshot shows the existing real SSLCOMMERZ option disabled. That option depends on configured merchant ID/password and valid client/server URLs; the previous build had no independent local simulator. This was a missing demo flow, rather than evidence that the SSL/TLS protocol itself was broken. No private local environment file was available here, so the user's actual provider credentials were not diagnosed or changed.

## What changed

- Development checkout offers separate **Mobile Banking/bKash — DEMO** and **Card/Bank — DEMO** choices. Each opens a local page with explicit success, failure and cancel actions. No real payment details, money or external gateway calls are involved.
- Server-calculated cart totals, checkout keys, owner authorization and distributed order locks govern each attempt. A successful simulation records a paid/processing DEMO order and paid invoice once. Failure/cancel cancels that demo order and restores stock once.
- Customers can resume/cancel an unfinished demo from My Orders, including an interrupted initialization that already saved its order. Another cart is not consumed. Repeat requests preserve the result; changing a terminal outcome is rejected.
- Customer/admin/order/CSV/invoice views label demonstrations; printed invoices carry a DEMO notice. Demo payments are excluded from real revenue. Unpaid demos cannot be fulfilled or manually marked paid as COD.
- The real provider endpoints retain their existing validation/configuration behavior and now reject demo transactions. Demo endpoints reject genuine orders and another account's orders. Production always disables the simulator.
- Featured Picks and Recently Added share an exclusion set for product IDs and cover photos, preserving the newest ordering among remaining products. There is no duplicate padding when fewer eligible products exist.
- All 24 existing WebP photos were checked for unique paths, file hashes, formats and visible product subjects. The screenshot's planter/coffee duplication was the same products appearing in both sections; new imagery was not needed to fix it. Original product IDs, category mappings and media are preserved.

## Verification

- Clean lockfile install succeeds; 99 JavaScript files pass syntax checks.
- Default suite: 95 reported tests, 93 passed, 0 failed; two native entry points skip when no test URI is supplied.
- Native MongoDB 7.0.45: 27 reported tests pass on standalone and 27 on a single-member replica set, with no failures/skips. The transaction path is explicitly checked as false/true respectively.
- Both demo channels cover success/failure/cancel, simultaneous/repeated completion, authorization, forged input, invoice/stock state, revenue exclusion, cross-provider guards, disabled/production configuration, admin cancellation, injected invoice rollback and interrupted-init recovery.
- Existing COD/auth/admin/catalog/review/upload/reporting regressions pass. All 19 HTML pages and local resource references are checked; frontend VM tests verify demo rendering/routing and homepage exclusions.
- Dependency audit reports 0 vulnerabilities. No dependency versions were changed from 2.3; package version metadata is 2.4.0.

## Apply without changing credentials

Preserve your working `server/.env`, MongoDB URI, JWT secret, administrator/gateway credentials and uploads. Follow `RUN_COMMANDS.md`; setup, reseeding and data migration are not required. The Order/Payment model additions are backward compatible fields/enum values; existing records do not need rewriting. The archive contains no private environment file or account passwords. The environment example only adds explanatory demo comments.

Use your existing local MongoDB port, including 27018 if that is your working mapping. NORDA remains on 5000; GitStack/Gitea ports 3000/3002 and other applications are untouched. Demo payments persist in your configured development database and affect its stock, so use development inventory for demonstrations.

## Remaining external checks

Actual browser/mobile/keyboard/print acceptance was not performed because this managed environment has no supported browser controller. JavaScript VM/static/HTTP checks do not replace visual browser testing. The real public SSLCOMMERZ sandbox/live service was not contacted with merchant credentials; existing provider callback tests use controlled responses. These limitations do not block the local simulator, which needs no merchant account or public callback host.

Automatic expiry of abandoned reservations and retry/refund automation for real provider payments remain future development. A pending demo can already be resumed/cancelled from My Orders; an administrator can cancel an eligible unpaid order.

See `DEMO_PAYMENTS.md`, `VERIFICATION_RESULTS.md` and `ACCEPTANCE_CHECKLIST.md` for exact operation and checks.
