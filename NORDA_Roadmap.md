# NORDA — Two Developer Roadmap

Prepared: 15 October 2026  
Baseline: the delivered NORDA v2.1.0 source and its verification reports  
Team: Shabab + one teammate  
Stack: HTML, CSS, JavaScript, Node.js, Express.js, MongoDB/Mongoose

This is a proposed development plan. It does not change the application, invite collaborators, publish anything, or claim that the live GitHub repository was inspected today.

## 1. Current position

The storefront and admin application already contain registration/login, profile/password changes, product discovery, categories/brands, product management with six-image galleries, cart, COD checkout, orders, invoice printing, delivered-purchase reviews, dashboard/reporting and SSLCOMMERZ integration.

The v2.1.0 update improved responsive UI, product archive/restore, effective-price sorting, session restoration, checkout replay protection, stock compensation, operation locks and payment-review handling. Product creation and Add to cart already exist; the next phase should build on them.

| Area | What exists | What remains to prove or extend |
|---|---|---|
| Catalog/admin | Product/category/brand management, galleries, stock, archive/restore | Real catalog, browser acceptance, optional variant model |
| Accounts | Registration/login/logout, profile, password change | Forgotten-password recovery, email verification, address book |
| Cart/checkout | Stock-aware cart, COD, duplicate-order protection | Real persistence/concurrency tests, payment recovery and reservation expiry |
| Payments | SSLCOMMERZ initialization, validated callbacks/IPN, review states | Public sandbox acceptance, retry, reconciliation and refund operations |
| Orders | Customer order list, admin status updates, eligible admin cancellation/restock | Customer requests, shipping/tracking, return/refund workflow, notifications |
| Operations | Local uploads, CSV reports, setup scripts, CI checks, documentation | Durable media storage, backup/restore, monitoring, production deployment |

Packaged verification: 53 automated tests passed, 0 failed; 86 JavaScript files passed syntax checks. One native MongoDB integration test was skipped. The business/HTTP tests used a test-only model adapter and controlled gateway responses. Browser/device acceptance, real database behavior and real gateway processing still need verification.

The user's 13 October npm screenshot reported eight dependency vulnerabilities, including one critical. Obtain a fresh audit before deciding which versions need updates; the historical count is not a current audit.

## 2. Agree the release scope

Aim for a usable, supportable public store: customers can discover a real product, order it, pay through an accepted method, receive an invoice and delivery updates, and obtain support for cancellation/payment/return problems. Admins can manage that lifecycle and investigate exceptions.

Launch requirements:
- Existing flows accepted against a real test database and real browsers.
- Real product content, prices, images, stock and store policies.
- Account recovery, dependable checkout and a defined abandoned-payment policy.
- The actual enabled payment methods tested; online payments enabled only after gateway acceptance.
- Order fulfillment, cancellation and a documented return/refund process with visible status.
- Durable image storage, database/media backups, HTTPS, logs and a rollback path.

Decide early whether products need size/color variants. If they do, the variant/stock model must precede checkout extensions. A product's price and variant description must remain in the order snapshot even after the catalog changes.

Wishlist, coupons, guest checkout, comparison, recommendations and advanced analytics belong to an optional enhancement milestone unless the business makes one a launch requirement.

Planning estimate: around 6–8 weeks for the launch scope if both developers can contribute roughly 3–4 focused hours per working day. This is a planning range, not a deadline. Teammate experience, discovered defects, provider credentials, business decisions and review time can change it. Optional enhancements need additional time.

## 3. Ownership

Shabab is the initial integration/release owner because he already knows the application. The teammate starts with catalog and UI work, then takes broader ownership after the first reviewed contributions. Change this split to match their actual skills.

| Work area | Primary owner | Collaboration rule |
|---|---|---|
| Checkout, payment, order state and stock correctness | Shabab | Teammate builds the corresponding customer/admin views and reviews scenarios |
| Storefront, product cards, product-detail/gallery, catalog admin | Teammate | Shabab reviews changes that affect price, stock, upload security or API behavior |
| Authentication/account recovery | Shabab: API/token/mail behavior; teammate: forms and UX | Agree request/response/error contracts before implementation |
| Shipping, cancellation/return requests and notifications | Shabab: lifecycle/integrations; teammate: request/status/tracking UI | Integrate one complete customer journey at a time |
| QA, documentation and content entry | Both; teammate coordinates manual test records | Each task has an owner and the other person reviews it |
| Deployment, secrets, database environments and release | Shabab initially | Teammate maintains the runbook and performs a second acceptance pass |

Coordinate changes to shared files before both people edit them:
- client/js/api.js, client/js/layout.js, client/css/style.css
- server/app.js, server/models/*, server/services/orderService.js
- server/services/databaseUnit.js, server/services/operationLock.js
- server/package.json, server/package-lock.json, shared environment configuration

The primary owner integrates shared-file changes; ownership does not prevent peer review or future rotation. Existing features should remain available while adding new ones.

## 4. Roadmap and exit criteria

The phase order follows dependencies. Catalog/content and account UI can proceed in parallel after the shared setup is accepted. Do not start every module at once.

| Phase | Main work | Shabab | Teammate | Exit criterion |
|---|---|---|---|---|
| 0 — Handover and setup | Repo access, code tour, identical runtime, isolated dev/test data, agreed scope | Explain architecture; set environment conventions and issue priorities | Clone/run; walk through storefront/admin; record questions | Both can run the same main baseline and reproduce one COD journey |
| 1 — Verify the baseline | Fresh dependency audit, real MongoDB checks, browser/manual regression | Audit/update dependencies with regression checks; validate database/stock behavior | Test responsive pages, forms, catalog, gallery, archive/restore, invoice print | Release-blocking baseline defects have issues/fixes; real DB tests pass |
| 2 — Prepare the real catalog | Real products/images/descriptions; admin usability; store policies; variant decision | Review data/stock rules and safe media migration plan | Add development catalog, verify cards/detail/gallery and write product-entry guide | An admin can publish/edit/archive/restore a real product, and customers see correct prices/stock |
| 3 — Complete customer accounts | Forgot/reset password, email verification, saved addresses, account feedback | Secure one-time expiring tokens, validation, mail integration and authorization | Recovery/verification/address forms and error/loading states | Recovery/verification links cannot be reused after completion; customers only access their own addresses |
| 4 — Complete checkout/payment recovery | Gateway sandbox, payment retry, reservation expiry, concurrency and review handling | Order/payment transitions, retry eligibility, safe stock release and reconciliation | Checkout/payment-result/order UI for retry, expiry and review | Duplicate requests/callbacks create no extra charge or order; final stock and invoice states are consistent |
| 5 — Fulfillment and after-sales | Customer cancellation requests, courier/tracking, notifications, return/refund and review resolution | Lifecycle rules, provider operations, authorization, audit trail | Customer request forms, status/tracking views and admin decision screens | A tested order can be fulfilled or resolved through the supported exception/refund process |
| 6 — Release preparation | Durable images, backup restore, staging, performance/SEO, HTTPS/deployment, monitoring, runbook | Infrastructure, private configuration, persistence, deployment and rollback | Mobile/browser acceptance, SEO/content checks, admin/customer guides | The agreed release checklist passes in staging and the backup/rollback procedure has been exercised |
| 7 — Optional enhancements | Wishlist, coupons, guest cart/checkout, variants if not needed earlier, richer reports | Financial/model/API rules and integration review | Feature UI and independent modules such as wishlist | Each feature has its own acceptance checks and does not delay a completed launch scope |

Payment recovery rules must be designed together:
- Failed or expired attempts must not create duplicate orders.
- Payment retry must use an eligible existing order and recheck price/stock/reservation rules.
- Expiry must only release stock once.
- A payment that arrives after expiry/cancellation must reach review/reconciliation without reopening an unsafe fulfillment path.
- Refund approval, gateway processing and final refund status must be distinguishable.
- Invoice records must remain consistent with payment/refund events.

Use a persistent worker/scheduler for reservation expiry and notifications. Design jobs so retries or two workers cannot release stock or send a financial operation twice. A browser timer is not sufficient.

Full transaction behavior must be tested on a replica-set deployment. The current standalone fallback compensates for handled failures but cannot provide atomic crash recovery.

The first fulfillment/after-sales release can use admin-entered tracking information and a recorded manual refund procedure. Courier APIs and automated gateway refunds can follow after provider access and the manual workflow are proven. A refund request or admin approval must not be presented as a completed money transfer without the provider's confirmed result/reference.

## 5. First five working days

These are initial assignments, not actions already performed.

| Day | Shabab | Teammate | Reviewable output |
|---|---|---|---|
| 1 | Explain routes, models, auth and commerce lifecycle; establish the chosen development DB setup | Clone/run the app; read README and run guide; use a customer and admin test account | Setup checklist and both developers running the same baseline |
| 2 | Obtain a fresh npm audit and identify dependency fixes | Add 5–10 products in an isolated development DB; exercise price, stock, images, filters, feature/archive/restore | Catalog acceptance notes with reproducible defects, if any |
| 3 | Make focused dependency fixes and run relevant existing checks | Produce a short admin product-entry guide; fix one agreed small catalog/UI defect if found | Small, independently reviewable PRs |
| 4 | Run native MongoDB tests and concurrent checkout/cancellation scenarios | Exercise account → cart → COD → invoice and responsive/print behavior | Recorded expected/actual results and an ordered bug list |
| 5 | Review and integrate accepted fixes; decide phase-2/3 API contracts | Review fixes, demonstrate catalog workflow, confirm open UI requirements | Shared baseline milestone and next week's issue list |

Recommended first teammate task: catalog acceptance and the product-entry guide. Do not ask them to rebuild product CRUD or Add to cart; those are already implemented.

Product-entry acceptance:
1. Create/select a category and brand.
2. Add name, description, price, optional discount, stock and product images.
3. Confirm the first image becomes the cover; reorder/remove gallery images and save again.
4. Enable storefront visibility; enable Featured when intended.
5. Confirm card/detail data and discounted-price sorting.
6. Confirm zero stock disables purchase.
7. Confirm archive/restore preserves existing order references.
8. Note that homepage sections currently show up to eight products each.

## 6. Development environments and data

Keep each developer's environment private and use development/test data.

- App port: 5000. Keep 3000 and 3002 reserved for GitStack/Gitea.
- Local database option: the previously proposed Docker MongoDB endpoint at 127.0.0.1:27018. Each developer runs their own instance on their own computer.
- Atlas option: an intentionally selected non-production cluster, with separate development databases/users as appropriate.
- Keep the existing database URI and uploads when updating an existing installation. Switching the URI does not migrate old data.
- Use separate staging and production environments. Do not run seed scripts or development experiments against production.
- Never commit .env, credentials, node_modules or customer data. Share required access through a private channel.
- Use the same agreed Node version. The packaged version was verified with Node 24.
- Preserve package-lock.json and use npm ci for reproducible installation.
- Keep database/media migrations and their recovery steps in the PR if a schema or storage location changes.

For a fresh teammate checkout only:

```bash
git clone https://github.com/shabab122/Ecommerce_Web_Project.git norda
cd norda/server
npm ci
npm run setup
```

Configure the new server/.env for the chosen development database before seeding.

```bash
npm run seed
npm run verify
npm run dev
```

Use http://localhost:5000. The setup script creates fresh credentials only when .env is absent; it preserves an existing file.

To run the existing native integration test against the dedicated local development/test MongoDB service:

```bash
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27018' npm run test:integration
```

Also run against a dedicated replica-set test deployment to cover the transaction path. Passing the standalone test alone does not prove replica-set transactions.

## 7. GitHub collaboration

Use main plus a short-lived branch for each issue. One person owns each issue; the other reviews. Keep PRs small enough to review and test. Keep main runnable.

Example branch names:
- docs/catalog-usage
- fix/dependency-security
- fix/catalog-image-validation
- feat/password-recovery
- feat/address-book
- feat/payment-retry
- feat/order-tracking

Before a new task, first check that the working tree is clean. Create the task branch from freshly fetched origin/main, so older local-only main commits are not accidentally included:

```bash
git status
git fetch origin
git switch --no-track -c docs/catalog-usage origin/main
```

Commit the actual task files, run appropriate checks, push that branch and open a PR. For the example above:

```bash
git push -u origin docs/catalog-usage
```

Process: issue → branch → focused change → relevant checks → PR → peer review → merge.

Use available GitHub review/check rules to support this process; follow the review rule manually if repository settings do not enforce it. Select one consistent merge strategy for future PRs. Avoid direct changes to main during parallel development and avoid combining unrelated features in one PR.

Do not reset away existing local work or force-push shared branches to make histories look identical. Resolve history differences with the affected developer first.

Every issue should state:
- The customer/admin problem and current behavior.
- The intended behavior and affected screens/API.
- Owner, dependencies and priority.
- Acceptance scenarios, including relevant errors/permissions.
- Validation performed and documentation/migration requirements.

Every PR should state what changed, why, how it was checked and any remaining limitation. For visible changes, attach useful screenshots without credentials or personal customer/payment data.

## 8. Definition of done

A task is complete when:
- The agreed user/admin behavior and relevant error states work.
- Server validation and permissions enforce the rule.
- Existing functionality remains available.
- Relevant automated checks and manual acceptance pass.
- Shared API/model changes are integrated with their callers.
- Needed configuration, migration and usage notes are updated.
- The other developer has reviewed the change and it is merged through the agreed process.

Use tests for meaningful business risks: price/discount totals, overselling, replayed checkout, cancellation/restock, payment callbacks, authorization, password-reset tokens and return/refund transitions. Do not add tests that merely mirror static markup or low-impact documentation changes.

## 9. Launch acceptance

Before public release:
- Both customer and admin journeys pass on real desktop and mobile browsers.
- Correct permissions prevent one customer from reading or changing another's orders, invoices, addresses or recovery state.
- Real MongoDB integration and transaction-path acceptance pass.
- Concurrent purchases of the last item cannot oversell it.
- Repeat checkout, callbacks, cancellations and scheduled expiry do not duplicate effects.
- Every enabled payment method passes its intended acceptance matrix.
- Payment-review/refund cases have an operational owner and visible resolution history.
- Real product content, policies and support contact details are ready.
- Dependency findings have been triaged; release-blocking vulnerabilities are resolved.
- Image/data persistence survives application restarts or redeployment.
- Database/media backup restore and application rollback have been tested.
- HTTPS, secrets, redacted logs and operational alerts are configured.
- A second person can follow the runbook and operate the deployed release.

Completing only the UI or passing the existing mocked tests does not satisfy this release gate.

## 10. Project references

Baseline documents:
- README.md and RUN_COMMANDS.md
- docs/UPDATE_REPORT.md
- docs/VERIFICATION_RESULTS.md
- docs/FUTURE_DEVELOPMENT.md
- docs/API_REFERENCE.md
- docs/ARCHITECTURE.md

Official references:
- [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/)
