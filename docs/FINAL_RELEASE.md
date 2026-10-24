# NORDA 2.13.1 — final maintenance source release

Built from the delivered **Norda-Main-v2.13.0.zip**, SHA-256 `7e06934574bd7f28ba9614800d5e2a76c24d432e6343700bb5976ce46eecba89`. Verified **24 October 2026, Asia/Dhaka**. This release fixes identified bugs/security issues and retains existing commerce features. Unperformed public-provider, host and visible-device checks are not claimed.

## Six requested acceptance areas

| Area | Completed | Still needs the actual environment |
|---|---|---|
| Customer journey | Real HTTP/native guest and registered cart, exact SKU, coupons, checkout, invoices, recovery, merge/link and ownership checks. Fixed guest result verification, expired access and changed-account responses. | Visible journeys using the owner's store and separate browser profiles. |
| Admin journey | Native inventory/warehouse allocation, split delivery/COD, cancellation, priced exchanges, partial receipt/restock, refunds, settlement and replay/race/failure checks. Fixed retry locks and invalid appointment handling. | Physical stock, carrier/money receipts and target staff operation. |
| SSLCOMMERZ | Original/exchange session, validation, callback/IPN, repeated/late/risky payment, review and refund tests with controlled responses and native persistence. UI success comes from the saved order. | No merchant credentials/public callback target were supplied. Real merchant sandbox success/fail/cancel/IPN/review/refund acceptance **not executed**. Local mobile/card simulations transfer no money. |
| Browser/mobile/print | 26 focused frontend regressions, retained state/static checks; all 56 pages/135 page-resource targets served by the app. Improved fonts, focus, mobile actions/forms and branded receipt print rules. | Cloud Browser returned `ERR_CONNECTION_REFUSED` for the running isolated server. Actual desktop/phone, keyboard/zoom and print/PDF visual acceptance **unverified**. |
| Deployment/recovery | Actual server/workers, graceful restart, cookie/cart persistence, topology preflight, encrypted isolated restore, controlled offsite recovery, shell rollback and independent monitor transitions. | No Docker/Podman daemon or target VM/domain. Actual container build, staging/TLS deployment/rollback and owner off-host restore drill **not performed**. |
| External services | Actual disposable SMTP protocol delivery/rejection/TLS tests, TOTP vectors/native MFA/session routes and controlled courier/cloud/S3 adapters/workers. | Owner SMTP/merchant/courier/Cloudinary/offsite/MFA settings absent. Actual inbox/alerts, authenticator-app pairing, booking, external upload and storage recovery require those accounts. |

## Corrections and UI refinements

- Guest payment results verify the saved order using private guest access. A `status=success` query never proves payment; missing/expired access offers recovery.
- Expired protected guest pages return to recovery without signing a registered account out for a separate guest-cookie failure.
- Late invoice, credit-note, cart, checkout-contact and payment responses are discarded if shopping identities change. Separate guest invoices guard both account and guest identities.
- Guest session-creation errors show useful actions. Storage/key/date failures release settlement, pickup, parcel and exchange submit locks so corrected retries work.
- Settlement file/preview responses are invalidated on edits or staff changes; old staff forms cannot mutate under another account. Exchange refreshes have ordering guards and a visible Refresh status action.
- Partial receipts link accurately to pickup history. Pickup navigation sits with order-support actions. New screens use established fonts, visible focus, mobile tap spacing and wrapping forms/actions.
- Exchange receipts include Norda branding; credit notes print only after loading. Print rules hide screen introductions/navigation, allow page breaks and repeat headings. Actual visual print output remains a browser acceptance step.

## Security updates

Only two installed dependency entries changed:

| Package | Before | After | Advisory |
|---|---|---|---|
| body-parser, transitive under Express 4 | 1.20.8 | **1.20.9** | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) |
| Multer | 2.4.0 | **2.5.0** | [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) |

These address newly reviewed denial-of-service advisories. An isolated HTTP-process regression exercises valid compressed JSON, malformed trailing bytes and subsequent healthy requests. Existing upload/signature/cleanup and complete native tests pass with the patched packages. Other dependency selections and backend business source are unchanged.

## Measured checks

| Check | Result |
|---|---|
| Syntax | **309 JavaScript files passed** |
| Default tests | **527 passed / 0 failed / 14 skipped** |
| MongoDB 7.0.45 standalone | **234 passed / 0 failed / 0 skipped** |
| MongoDB 7.0.45 replica set | **234 passed / 0 failed / 0 skipped** |
| New frontend/security regressions | **27 passed**, included in default count |
| Actual HTTP app | **56 HTML pages**, **135** distinct page/resource targets: all 200; readiness 200 |
| Current dependency audit | **0 vulnerabilities** |

All 14 default native-entry skips were executed in separate explicit loopback runs, including after dependency updates. Counts overlap in coverage. Tests use random `norda_test_*` databases and disposable mail/media/restore targets. No owner database or real provider records were used. Standalone compensation does not provide crash atomicity; production requires a transaction-capable deployment.

## Update and release preparation

Retain **current working** environment files and uploads, including laptop-only email/provider values newer than the archive. Stop the old NORDA process and copy source while preserving private/runtime data. From `server/`:

```bash
npm ci
npm run verify
npm run dev
```

Open `http://localhost:5000`. No setup, reseed or manual migration is required. Upgrade all app instances sharing the database; use compatible 2.13 code for rollback after activating 2.13 records. Run optional `npm run acceptance:preflight` on your intended installation for a read-only configuration/database check.

Follow [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md) for actual inbox links, original/exchange sandbox payments/refunds, visible account isolation and A4 invoice/credit-note/adjustment printing. Configure services privately; secrets need not be shared in chat. Additional optional product features are separate from this source release. Public provider and production acceptance remain gates before actual sales.

Prepared release title: **NORDA v2.13.1 — Final maintenance release**. Suggested commit/tag after reviewing and staging source in the existing repository, excluding credentials/runtime files:

```bash
git commit -m "fix: harden guest checkout, security and release UI"
git tag -a v2.13.1 -m "NORDA v2.13.1 final maintenance release"
```

Push the reviewed branch/tag and create the release when ready. No remote commit/tag or public deployment was created here. Preserve these acceptance limits in release notes.
