# NORDA 2.14.4 — final localhost maintenance

Starts directly from delivered **2.14.3 Local Acceptance**. Existing commerce rules, credentials, data and optional/local integration choices are retained. The final review fixes guest recovery email origin/retry handling and stale receipt printing; no new feature is assigned.

| Area | Executed evidence | Observation boundary |
|---|---|---|
| Customer/admin | Full default and native shopping/operations/isolation/stock/invoice/after-sales journeys pass. | The owner will manually inspect the delivered interface. |
| Mobile/keyboard/printing | Retained responsive/focus/print rules and controlled-DOM checks; six receipt render/Print/privacy scenarios; actual CLI/HTTP page/resource smoke. | Visible desktop/mobile/physical keyboard/rendered A4 output was not observed under the earlier browser restriction. |
| Email | Real application requests send through Nodemailer/local SMTP; received verification/reset/guest links work once and preserve ownership/retry guarantees. | Archived SMTP settings are absent; no external inbox receipt was observed. Retain working laptop SMTP and the existing probe commands. |
| Reverse/settlement | Existing private runnable local demonstration and full protocol/native coverage retained. | No real courier/merchant provider or money evidence is fabricated. |

The three [reserved integrations](reserved/README.md)—actual SSLCOMMERZ, domain/production deployment, courier/cloud/remote-backup activation—remain deferred by the owner. Existing optional code is preserved. These boundaries do not add another feature phase.

## Measured results

25 October 2026, Asia/Dhaka; Node 24.22.1, npm 11.9.0, MongoDB 7.0.45:

- 349 JavaScript syntax files; 620 default passes, 0 failures, 16 native entry points skipped without an explicit test URI.
- 280 native standalone passes and 280 native replica-set passes, no failures/skips.
- 0 reported dependency vulnerabilities; actual CLI smoke of 61 pages / 148 targets, all 200.
- No owner database connection, external message, actual courier/merchant action or real payment/refund.

Keep newer laptop environment files/uploads and Git history when applying source. No setup, reseed, credential change or manual migration is required.

```bash
cd server
npm ci
npm run verify
npm run dev
```

Open `http://localhost:5000`. Ports 3000/3002 remain reserved for GitStack/Gitea. See [verification](VERIFICATION_RESULTS.md), [run commands](../RUN_COMMANDS.md), [owner review](LOCAL_ACCEPTANCE.md) and [source preservation](SOURCE_PRESERVATION.md).
