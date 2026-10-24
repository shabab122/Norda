# NORDA 2.14.1 — Local Final

The current project is finalized at the delivered **2.14 feature set**, for **localhost use**. This maintenance release starts from `Norda-Main-v2.14.0.zip`. No new product feature is introduced. Domain purchase, hosting and activation of unconfigured real merchant services are outside this release.

## Fixed scope

The owner's eight selected areas are retained below as one fixed acceptance scope. Provider activation and visible checks that could not be performed are identified precisely; they are not new feature assignments.

| Agreed area | Local release evidence / boundary |
|---|---|
| Reverse pickup and settlement connector | Existing connector client/contracts, booking/query/cancel, immutable statement pages, replay, cursor and accounting checks pass with controlled provider evidence. An actual provider-connected merchant service is not supplied/deployed by this local maintenance release. Existing manual tools remain available. |
| SSLCOMMERZ | Original/exchange sessions, validation, duplicate/late callbacks/IPN, review/refund and local mobile/card simulation checks pass. No public merchant transaction, real money or public callback acceptance is claimed. |
| Customer/admin journey | Existing guest/registered catalog, options, cart/coupon, checkout, invoice, ownership, cancellation, warehouse parcels, exchange, physical return, deductions, refund and settlement HTTP/native journeys pass. These are scripted journeys, not manual browser acceptance. |
| Browser/mobile/printing | Existing frontend VM, resource/unique-ID, identity isolation, retry/error and print/layout rules pass. All 61 pages and 146 local page/resource URLs serve successfully. The cloud browser could not access the local test app and then reported a URL-policy block; visible desktop/mobile, keyboard and printed-PDF inspection was not completed or bypassed. |
| External services | Retained SMTP loopback/protocol, file mail, authenticator/session, courier and cloud request/response checks pass with isolated fixtures. Real inbox placement, actual carrier/cloud accounts and real connector acceptance are outside local certification. |
| Production deployment | Deferred by the owner. No domain, paid hosting or deployment is required for this release. Existing optional deployment tooling is retained unchanged. |
| Backup/monitoring | Native encrypted backup/verification/isolated restore, off-host protocol/readback/drill and independent monitor outage/recovery fixtures pass. No real remote storage account or external alert receiver is activated. |
| Store preparation | Existing 24-product AI catalog, categories, store settings and localhost browsing are retained. Production catalog/stock, final-domain SEO and production capacity approval belong to a later launch decision. |

No comparison/SMS/passkeys/new-carrier/accounting-vendor/geocoding feature is assigned here. Further development starts only after a new explicit request.

## Final fixes

- Whole-order and item-level partial receipt retry keys include the loaded receipt progress. A later parcel with the same quantity/note is a new receipt; retries of one failed submission retain the same key.
- Item receipt forms release their busy state and show a usable error when session storage or local form preparation fails; account-change guards remain enforced.
- Customer whole-return history shows the actual mixed restock quantities instead of labeling every partially restocked return as completely unrestocked.
- An existing confirmed failed whole-return refund can retry through the existing refund API/form for its saved credit amount. The existing credit and request follow the new refund, and confirmed success settles them. Pending/unknown or mismatched-amount retry attempts are rejected. Failure while linking records rolls back the payout intent and summaries.
- Unexpected exceptions return error HTTP status even if a controller selected `201`/`202` before awaiting work. Explicit validation/conflict statuses remain intact; failed writes cannot appear as successful submissions.

## Measured verification

Verified **24 October 2026, Asia/Dhaka** on Node.js **24.22.1**, npm **11.9.0**, native MongoDB **7.0.45**.

| Check | Result |
|---|---|
| JavaScript syntax | **335 files** |
| Default verification | **571 passed, 0 failed, 15 deliberate native skips** without an explicit test URI |
| Native standalone | **266 passed, 0 failed, 0 skipped** |
| Native single-member replica set | **266 passed, 0 failed, 0 skipped** |
| Dependency audit | **0 vulnerabilities**, dependency selections retained |
| HTTP page/resources | **61 pages, 146 distinct targets**, all status 200 |
| Small browse smoke | 24 fixture products, 40 browse requests at concurrency 5, all status 200; test-model HTTP smoke, not a production capacity benchmark |
| Source preservation | All **506** original files retained; **42 assets** and **11 environment/config/seed files** byte-identical |

Five focused regression results were added to the default count: four frontend checks and one shared HTTP journey. The latter also runs on both native topologies and covers retry amount/pending guards, rollback and credit settlement. Existing commerce, security, email/provider, backup and server-worker/restart checks are retained. No owner database or real merchant account was used.

## Install and run locally

Keep the current laptop's working environment files, database URI, JWT/email/gateway/MFA/backup credentials, uploads and Git history. Copy updated source without overwriting those working values. No setup, seed or manual data migration is required.

From the project root:

```bash
cd server
npm ci
npm run verify
npm run dev
```

Open `http://localhost:5000`. Keep GitStack/Gitea's reserved ports 3000/3002 separate. Existing provider modes remain governed by their current configuration; unconfigured automatic services are not fabricated as live services. Upgrade every app instance sharing the database before using the maintenance fixes.

See [run commands](../RUN_COMMANDS.md), [verification](VERIFICATION_RESULTS.md) and [source preservation](SOURCE_PRESERVATION.md). The owner may treat this as the final local release; future optional features and production activation do not reopen the agreed local development scope.
