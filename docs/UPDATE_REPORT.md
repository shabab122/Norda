# NORDA 2.1.0 update report

This revision develops the features already present in the uploaded v2 project. It retains the existing HTML/CSS/JavaScript frontend and Express/Mongoose backend.

## User-visible changes

- Redesigned storefront and admin workspace with consistent spacing, wider desktop layouts, mobile filters and visible sign-out actions.
- Homepage/category/product imagery, sample product illustrations and shared price/delivery information.
- Quick cart actions, unavailable-item notices, guarded quantity controls and clearer checkout feedback.
- Product management search, category/brand/visibility filters, pagination and six-image gallery editing.
- Product archive/restore keeps order links and delivered-purchase reviews usable.
- Password-change UI, session restoration, keyboard dialogs/tabs and review deletion for authorized users.
- Order progress and visible payment-review states across orders, invoices, results and admin summaries.

## Backend changes

- Shared MongoDB operation locks serialize cart/checkout and order/payment/cancellation operations across processes.
- Checkout keys replay a recorded order rather than create another purchase.
- Replica sets use transactions; local standalone MongoDB has compensating writes for handled failures.
- Partial stock-reservation failures restore prior increments/decrements. Cart clearing is the last checkout write.
- Paid-state updates are monotonic. Late validated payment after cancellation retains cancellation/restored inventory and records a payment review.
- Gateway callbacks are allowed to reach the validation controller despite their external Origin; storefront API CORS rules remain in place.
- Catalog sorting uses effective discounted prices. Admin stock edits detect an inventory change since the form was opened.
- Request bodies are parsed before sanitization. Sensitive API responses are not cached. HTML attribute and CSV cell escaping are strengthened.
- Distribution secrets and Git metadata are omitted. Fresh environment setup generates unique credentials without overwriting an existing `.env`.

## Verification result

The final `npm run verify` result: 86 JavaScript syntax checks passed; 53 automated tests passed, 0 failed, and 1 real MongoDB integration test was skipped. See `VERIFICATION_RESULTS.md`. Tests include HTTP journeys with a model adapter and injected persistence failures; the adapter is strictly test-only.

Coverage includes registration/login, roles/ownership, catalog, cart, checkout replay, rollback, COD transitions, cancellation/restock, invoice synchronization, delivered-purchase reviews, media signatures, payment callbacks/review, password changes, session invalidation, HTML escaping and asset references.

## Verification boundaries

- A real MongoDB service was not available in the build environment. The native database integration test is included and skipped unless `NORDA_TEST_MONGO_URI` is configured.
- No live gateway credentials or public callback host were used. Gateway requests in automated tests are controlled fixtures, not evidence of successful real payment processing.
- Browser automation was unavailable. Responsive, keyboard and print rules were implemented, but actual browser/device visual acceptance is still required.
- Standalone MongoDB compensations cannot guarantee atomic crash recovery. A replica set is required for public-store transactional integrity.
- Local uploads remain local filesystem storage. Gateway refunds, automatic reservation expiry and full returns remain future phases.

## Data compatibility

Existing collections and order item snapshots are retained. New fields default safely: product archive state, JWT token version, checkout key and payment review reason. Existing invoice numbers are not changed. New invoice numbers use a longer order suffix. An existing database URI and upload directory must be preserved while applying the ZIP.

## Scope for the next phase

See `FUTURE_DEVELOPMENT.md`. This update does not claim a complete public-store production certification.
