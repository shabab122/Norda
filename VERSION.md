# Norda 2.14.4 · Local Final

Built directly from delivered `Norda-Main-v2.14.3-Local-Acceptance.zip`, with no new feature phase.

- Validate guest recovery email origins before creating a recovery intent; retain private one-use links and redacted mail failure/retry behavior.
- Protect invoice, credit-note and exchange-adjustment Print buttons/browser-menu printing after shopping identity changes.
- Verify actual application HTTP → local SMTP → received verification/reset/guest recovery links, plus focused receipt rendering/printing tests.
- Retain all earlier storefront/customer/admin/commerce and local operations tools; the three deferred integrations remain reserved.

Measured: **349 JS files**, **620 default passes / 0 failures / 16 deliberate native skips**, **280 native passes per topology**, **0 audit vulnerabilities**, actual CLI/HTTP smoke of **61 pages / 148 targets**, all 200. Credentials/config/seed files, 42 catalog/brand assets and dependency selections are retained. No owner database, external inbox, real courier or merchant account was used.

Visible browser/mobile/A4 inspection and actual external inbox receipt were not observed here. The owner plans to manually test this release. These limits are evidence boundaries, not newly added feature work. Keep current laptop settings/uploads; no setup/reseed, credential rotation or manual database migration is needed. See [verification](docs/VERIFICATION_RESULTS.md) and [run commands](RUN_COMMANDS.md).
