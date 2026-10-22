# Verification results — NORDA 2.11.0

Release checks recorded on 22 October 2026 using Node.js 24.19.0, npm 11.9.0 and native MongoDB 7.0.45. Source was extracted directly from `Norda-Main-v2.10.0.zip` and extended for the four selected production areas.

| Check | Recorded result |
|---|---|
| JavaScript syntax | 235 files passed |
| `npm run verify` | 419 reported: **409 passed**, 0 failed, 10 native entry points skipped without an explicit test URI |
| Native standalone | **173 passed**, 0 failed/skipped; handled-error compensation path |
| Native single-member replica set | **173 passed**, 0 failed/skipped; transaction path |
| Actual server startup/shutdown | 1 additional smoke test passed on each topology, including all workers, optional configuration, readiness and graceful shutdown |
| Dependency audit | **0 vulnerabilities**, dependency versions unchanged; JSON included |
| Existing files | All 342 input files retained; input `.env`, config/seed data, catalog/brand assets and dependency selections preserved |
| Frontend resources | All 44 HTML pages/local resources checked through existing HTTP/static tests; new admin VM checks passed |

## New feature evidence

| Area | Exercised behavior |
|---|---|
| eCourier HTTP/native | Scope/privacy, one-intent replay, package quote checks, acceptance without pickup, dropped-response reconciliation, local invoice failure after remote acceptance, COD delivery/invoice replay, partial-delivery exceptions, identity/amount mismatch, cancellation before stock release, fractional/prepaid guards, activation cutoff, zero-collection mapping and manual-dispatch protection |
| Provider protocols | Actual eCourier/Cloudinary adapters with intercepted fetch: fixed official hosts, server headers/authentication, package/label validation, uncertain duplicate errors, multipart public identity, no overwrite and owned-asset deletion |
| SEO | Initial HTML product-specific metadata/JSON-LD/canonicals, actual offers/ratings, script-terminator escaping, private noindex, robots/sitemap, archived-product behavior and variant offer range |
| Cloud media | Validated uploads, uncertain upload recovery, migration preserving legacy URLs, reference checks including variants/history/transformed URLs, preview-to-delete reference race, explicit/idempotent cleanup and deleted-image reuse rejection |
| Maintenance | Temporary mutation rejection with Retry-After, successful release, and a drain timeout retaining a still-active writer lease |
| Monitoring | Administrator/scoped privacy, hourly deduplication, safe error capture, file-versus-inbox delivery distinction and bounded/replayed webhook alerts |
| Backup/restore | Real encrypted raw BSON/collection/index/local/cloud-byte capture, authenticated verification, wrong key/tamper refusal, exact BSON type/index/image recovery, source/existing-target protection and missing-image failure without false success |
| Frontend | New courier state/action rendering, escaping, media/system account-change guards and orders/catalog versus full-admin navigation |

The prior account, cart, checkout, SSLCOMMERZ state handling, review/cancellation/refund, delivery/email, SKU, coupon/wishlist/inventory/settings, reports/staff/devices and selected-item return/exchange tests remain in the full suite.

## Execution boundary

The ten native entries were executed serially on newly started isolated standalone and single-member replica-set servers. Each creates and drops only its new random test databases; restore uses a fresh `norda_restore_*` target and private temporary media directory. Provider responses are controlled; no owner database, real courier parcel, live Cloudinary account, public alert receiver or real payment is used. Passing fault-injection output deliberately includes redacted error diagnostics.

Actual server smoke tests also start the real `server.js`, initialize the additive models and all workers, load a temporary optional integration file, fetch readiness/robots/new admin HTML and shut down cleanly on both topologies. Their test configuration is not shipped.

Browser automation was not available for a reliable live visual pass in this environment. Static/HTTP/VM checks do not establish desktop/mobile/keyboard/print acceptance. The owner's real eCourier package/collection contract, booking/labels/tracking, Cloudinary upload/delete permissions, actual SMTP/alert receipt, off-host backup recovery and final public-domain SEO must be checked during deployment. Public SSLCOMMERZ success/failure/cancellation/IPN/refund acceptance remains separate.

The archive format is NORDA `.ndb`, not `mongodump`. Backups coordinate upgraded NORDA writers; old app versions and outside database writers require a maintenance window. Off-host replication/retention and recovery promotion are operator procedures. Standalone multi-document commerce writes retain handled-error compensation limits; replica sets provide transaction semantics.

Preserve the working laptop `.env`, current Atlas/local URI, SMTP values, private optional integration settings, uploads and Git history. No setup/reseed or manual migration is required. See [PRODUCTION_TOOLS.md](PRODUCTION_TOOLS.md) for setup, contract limits and acceptance.
