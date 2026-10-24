# Verification results — NORDA 2.14.3 · Local Acceptance

Verified **24 October 2026, Asia/Dhaka**, using Node.js **24.22.1**, npm **11.9.0** and native MongoDB **7.0.45**. Baseline: delivered **2.14.2 Local Final**. No owner database or actual merchant/SMTP account was used.

| Executed check | Result |
|---|---|
| `npm run verify` | **345 JavaScript syntax files; 623 results: 608 passed, 0 failed, 15 deliberate native skips** without an explicit URI |
| Full native standalone suite | **274 passed, 0 failed, 0 skipped** |
| Full native single-member replica-set suite | **274 passed, 0 failed, 0 skipped** |
| Focused connector/SMTP/frontend/operations suite | **73 passed, 0 failed**, included in the full default coverage |
| Actual CLI startup + isolated Express HTTP | Connector and demo-app entry points start; health 200; **61 pages / 148 distinct local targets**, all 200 |
| Dependency audit | **0 vulnerabilities**, dependency graph retained |
| Archived mail diagnosis | **File preview, SMTP absent, inbox unconfirmed**; expected exit 2; no external message sent |

## Current coverage

The new private service is exercised through actual loopback HTTP and the unmocked merchant client. Tests cover private authentication/origin rejection, production/URL gates, concurrent same-reference booking, changed-intent/duplicate-pickup rejection, restart/replay, exact tracking identity, explicit monotonic stage control, cancellation, immutable balanced statement pages, stable/idle/unknown cursors and fail-closed disk-write recovery. The real app routes and both native topologies cover booking → tracking, no automatic stock/refund on arrival, demo/merchant job/feed isolation, preview-only statement data, permissions, ledger import rejection, acknowledgement replay and recovery from a failed cursor write.

A disposable SMTP receiver exercises Nodemailer itself. Tests retain account/operations/monitor mail and add one-recipient probes, SMTP acceptance versus operator-observed Inbox/Spam receipt, recipient failure/uncertainty, file-preview refusal and remote-authenticated TLS requirements. The test mailbox never relays to an external recipient.

Frontend controlled-DOM tests retain prior search/password/guest/admin behavior and add mobile-menu Escape/focus. Narrow invoice/print CSS and semantic order-progress collision fixes are present. All earlier customer/admin, stock/warehouse, payment, cancellation/return/exchange/refund/credit/settlement, security/MFA/session, notification, backup/monitor and server restart suites pass.

The CLI smoke starts the real connector and app with a randomized test database on a separate loopback MongoDB instance, reads the local pages/resources, stops both processes and drops only its fixture database. It is an HTTP smoke, not browser rendering or a production load benchmark.

## Evidence limits

The earlier cloud-browser access/policy restriction was respected. **Visible desktop/mobile, keyboard-navigation observation and printed-PDF inspection were not completed.** Executing controlled DOM scripts and serving HTTP resources do not certify visible layout.

The archived configuration contains no SMTP settings and no actual test recipient was supplied. **No actual inbox/spam receipt was obtained.** The new commands allow the owner to test with their retained laptop SMTP settings and record an observation. SMTP acceptance alone never appears as inbox confirmation.

No actual reverse-pickup/settlement provider was selected. The shipped service is **local-demo**: no courier booking, provider PDF or real remittance is fabricated; demo financial imports are blocked. Actual provider integration still needs its approved API/account when selected.

Actual SSLCOMMERZ acceptance, public domain/deployment and courier/cloud/remote-backup activation remain the owner's three [reserved integrations](reserved/README.md). These are explicitly deferred, not newly added features. See [local acceptance](LOCAL_ACCEPTANCE.md), [connector instructions](LOCAL_CONNECTOR.md) and [source preservation](SOURCE_PRESERVATION.md).
