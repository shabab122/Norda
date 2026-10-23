# NORDA 2.12.0 update report

Built from the latest `Norda-Main-v2.11.0.zip`. The professional README structure and previous features remain. This release implements the five selected areas with existing credentials and dependencies retained.

**Deployment/release:** a non-root Docker image, persistent private storage, Caddy HTTPS/restart configuration, isolated staging/production checks and pinned SSH/GitHub Environment workflow. Source is transferred without credentials/runtime data and checked by SHA-256. Local/public readiness gates success; a failed candidate restores the previous recorded compatible application code. Rollback retains the live database/media and remains runnable when candidate verification fails. Activation requires the owner's actual VM/domain/SSH settings.

**Off-host recovery:** private signed S3-compatible replication of the existing authenticated encrypted archives, one retained key/hash per archive, conditional PUT and complete readback verification. Lost responses reconcile before any retry. A private recovery pointer supports fetch independently of application backup records. Explicit retention preserves the minimum verified recovery points and namespace boundaries. Optional scheduled drills restore and remove only fresh isolated targets; no production URI is changed.

**Independent monitoring:** a database-independent Node monitor and external GitHub-hosted workflow or separate-host container. Durable states, bounded probes, finite backup-maintenance grace, one outage/recovery transition and optional SMTP/HTTPS alert retry detect a stopped application/host when the runner is elsewhere. The runner/channel must be activated by the owner.

**Staff/MFA:** private expiring one-use invitations, registered-account ownership, preserved passwords/history, revoke/resend and staff audit. Optional TOTP uses encrypted secrets, hashed recovery codes, bounded opaque challenges and replay/version checks. Sessions store verified MFA revision. Required enrollment gates new staff tools; demotion removes the required policy while preserving personal account security. All shared database servers must upgrade and share the new MFA key before enrollment; old binaries cannot be made to enforce new rules remotely.

**Advanced inventory:** previewed new product/SKU CSV creation with exact validation/hash/replay/rollback and retained results. Satellite warehouse balances have permanent identities, audited transfers/counts, stale-write checks and edit/archive safeguards. Only existing online stock is saleable; a transfer moves inventory rather than double counting it. Original checkout/cancellation/return/exchange stock behavior remains. Opted-in staff receive queued low-stock episode emails with replenishment rearm, permission/preference checks and bounded retry.

Related routes, model startup, authentication/session proof, catalog validation, navigation and operation helpers are extended as necessary. A premature-success HTTP status on async tool errors was corrected. Unrelated behavior is covered by full prior regressions. The input `.env`, config/seed data, catalog/brand assets and dependency selections are retained; no baseline file is removed and no owner database is seeded/contacted.

Verification: 268 JS syntax checks; default suite 441 passed/0 failed/12 intentional native skips; standalone 197 passed and replica-set 197 passed; actual server/all-worker/preflight smoke passed on both; audit 0 vulnerabilities. Current results and real deployment/provider/browser limits are in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md).

Keep the working laptop `.env`, optional integrations file, uploads and Git history. Use `npm ci`, `npm run verify`, `npm run dev` from `server/`; no setup/reseed/manual migration is required. New infrastructure and keys remain optional/configured separately. See [RELEASE_AUTOMATION.md](RELEASE_AUTOMATION.md).

Suggested commit: `feat: add deployment, offsite backups, uptime monitoring, MFA and inventory tools`.
