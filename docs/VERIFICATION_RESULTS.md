# Verification results — NORDA 2.14.4 · Local Final

Verified **25 October 2026, Asia/Dhaka**, using Node.js **24.22.1**, npm **11.9.0** and native MongoDB **7.0.45**. Baseline: delivered **2.14.3 Local Acceptance**. Tests use isolated/randomized databases and disposable local services; no owner database or actual merchant/SMTP account was used.

| Executed check | Result |
|---|---|
| Full `npm run verify` | **349 syntax files; 636 results: 620 passed, 0 failed, 16 deliberate native skips** without an explicit test URI |
| Full native standalone suite | **280 passed, 0 failed, 0 skipped** |
| Full native single-member replica-set suite | **280 passed, 0 failed, 0 skipped** |
| Focused frontend + HTTP/SMTP recovery checks | **66 passed, 0 failed**, included in full default coverage |
| Received application mail links | **5 shared HTTP/SMTP scenarios**, passed on the memory adapter and both native topologies |
| Actual CLI startup + isolated HTTP smoke | Connector/app startup and shutdown passed; **61 pages / 148 distinct local targets**, all 200; health 200 |
| Dependency audit | **0 vulnerabilities**, dependency selections unchanged |
| Current archived mail diagnosis | **File preview / SMTP absent / inbox unconfirmed**; expected exit 2; no external message sent |

## Whole-project coverage retained

Full suites cover public catalog/search/filters/variants, authentication/recovery/address book, guest/member cart/coupons/checkout, one-order/invoice replay and price/stock integrity. Existing administrative inventory/warehouse/parcel, cancellation, return/partial receipt, exchange, payment review/refund/credit-note, reconciliation, scoped staff, MFA/session and notification journeys pass. Provider-protocol, local connector, backup/isolated restore, monitor and actual server worker/restart checks remain covered. External providers are controlled fixtures, not real merchant acceptance.

## Final fixes and direct evidence

Guest email now uses the same trusted-origin/no-credentials/no-query/no-fragment URL checks as account email, including HTTPS in production. Validation runs before a recovery record is created. Mail rejection removes only the failed intent and logs a redacted diagnostic.

Actual Express requests register a customer, send through Nodemailer to a disposable SMTP receiver, extract the received verification link, open its application page and consume it once. The received reset link changes only its owner password, invalidates the old session/password and rejects reuse. A received guest link restores just its guest history/invoice; ordinary member access remains denied. Invalid configured origins send no mail and create no recovery intent. Rejected SMTP clears the intent and a fresh successful attempt works. These five scenarios also pass on native standalone/replica MongoDB.

Six controlled-DOM receipt scenarios execute invoice, credit-note and exchange-adjustment rendering and Print buttons. They verify escaped item names, branding and normal printing, then prove that account changes/guest expiry disable printing and clear stale document data/title. The browser-menu `beforeprint` path is covered. Existing mobile-menu/search/password/frontend identity/error/retry checks remain intact.

The CLI smoke uses the actual local connector and demo-app entry points, a separate MongoDB process and a randomized test database. It reads local pages/resources, gracefully stops the processes and drops only its fixture database. This is an HTTP smoke, not rendered browser acceptance or a load certification.

## Observation limits

The earlier browser access/policy restriction was respected. **Visible desktop/mobile layout, physical keyboard observation and rendered/printed A4 PDF were not observed in this session.** The user will manually inspect this final source and report concrete defects; controlled DOM and print CSS checks are not presented as visual proof.

The archived ZIP has no SMTP configuration and no actual recipient was supplied. **No external inbox/spam receipt is claimed.** Actual application delivery through local SMTP was verified; retain the laptop's working settings for external receipt and use the existing mail probe/confirmation commands. SMTP acceptance and operator-observed inbox receipt remain explicitly different.

The existing reverse-pickup/statement connector stays a functioning **local demo**, without a real courier/PDF/remittance. Actual SSLCOMMERZ, domain/deployment and courier/cloud/remote-backup activation remain the owner's three [reserved integrations](reserved/README.md). No new feature phase is assigned. See [update report](UPDATE_REPORT.md), [local acceptance](LOCAL_ACCEPTANCE.md) and [source preservation](SOURCE_PRESERVATION.md).
