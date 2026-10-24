# NORDA 2.14.3 — fixed localhost scope

The release starts directly from **2.14.2 Local Final** and retains the existing commerce feature set. This update addresses the three selected acceptance areas as far as the available environment permits. It does not claim unobserved visual/inbox results or an unconfigured actual provider integration.

| Selected area | Delivered / verified | Boundary |
|---|---|---|
| Customer/admin, mobile and printing | Existing full Express/native journeys pass. Mobile-menu Escape/focus, semantic progress CSS and invoice/print refinements added. Actual CLI/HTTP smoke serves 61 pages / 148 targets. | Visible desktop/mobile/keyboard/printed-PDF inspection remains unperformed under the earlier browser access restriction. |
| Actual email delivery | SMTP protocol tests pass; explicit probe/diagnosis and private operator-observed Inbox/Spam receipts are supplied. Remote authenticated SMTP requires TLS. | Archived SMTP settings are absent. No actual test recipient/inbox receipt was supplied or obtained; retain the laptop's working SMTP settings and use the documented commands. |
| Reverse-pickup / statement service | A runnable private **local-demo** service now supplies the contract, durable booking/query/cancel/control and immutable statement pages. Actual app HTTP/native integration passes. Demo statement financial imports are blocked. | No actual provider/API was selected. Real reverse collection/remittance integration is not claimed; manual tools remain available. |

The three owner-deferred areas are preserved separately in [reserved integrations](reserved/README.md): **actual SSLCOMMERZ**, **domain/production deployment**, **real courier/cloud/remote-backup activation**. Their existing optional code and credentials remain intact. No additional feature phase is assigned.

## Measured verification

24 October 2026, Asia/Dhaka; Node 24.22.1, npm 11.9.0, MongoDB 7.0.45:

- 345 JavaScript syntax files; 608 default passes, 0 failures, 15 native entry points deliberately skipped without a test URI.
- 274 native standalone passes and 274 native replica-set passes, no failures/skips.
- 0 reported dependency vulnerabilities; actual connector/app CLI and local HTTP resource smoke passed.
- Prior commerce/security/provider-protocol/backup/worker/restart checks retained. No owner database or external message/booking/money movement was used.

## Run

Keep the laptop's current environment files, uploads and Git history. No setup, reseed, credential change or manual migration is needed.

```bash
cd server
npm ci
npm run verify
npm run dev
```

Open `http://localhost:5000`; ports 3000/3002 remain reserved for GitStack/Gitea. Optional demo/email commands and the remaining observation steps are in [Local acceptance](LOCAL_ACCEPTANCE.md) and [Local connector](LOCAL_CONNECTOR.md). See [verification](VERIFICATION_RESULTS.md) and [source preservation](SOURCE_PRESERVATION.md).
