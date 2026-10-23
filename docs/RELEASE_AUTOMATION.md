# Release automation, recovery and team inventory — 2.12

Patch 2.12.1 makes `npm run acceptance:preflight` and `npm run mail:check`/`mail:preview`/`mail:orders` load the same optional `.env.integrations` as server startup. Existing process/base `.env` values retain priority; no file or credential is rewritten. See [current acceptance evidence](VERIFICATION_RESULTS.md).

Built directly from `Norda-Main-v2.11.0.zip`. The five selected development areas are implemented: deployment/release tooling, private off-host backups, independent uptime monitoring, staff invitations/authenticator MFA and advanced catalog/warehouse/email inventory tools.

## Existing installations and shared MongoDB

Preserve your current `server/.env`, MongoDB/Atlas URI, JWT/admin/payment/SMTP credentials, uploads and Git history. The input `.env` is unchanged byte-for-byte. No reseed or manual migration is required; additive collections/indexes initialize at startup.

From `server/`:

```bash
npm ci
npm run verify
npm run dev
```

New secrets/settings belong in the optional private **`server/.env.integrations`**. Merge the new entries from `.env.integrations.example`; do not replace a working private file. Existing process/`.env` values retain priority. No new service activates just by updating the source.

**For your two-computer/shared-Atlas setup:** update both running NORDA servers before enabling MFA. Both need the same securely shared `MFA_ENCRYPTION_KEY`; servers creating/restoring the same backups also need the appropriate `BACKUP_ENCRYPTION_KEY`. Keep these keys separate from JWT/SMTP/payment secrets. Old application versions do not enforce the new MFA policy and must be stopped. A verified MFA session is also checked server-side on this version; an old-style password-only token cannot open an MFA account on an upgraded server.

The sample `.env` in an archive may predate laptop-only Atlas/SMTP fixes. Retain **your working laptop file** when copying source. Development remains on port **5000**; GitStack/Gitea ports **3000/3002** are never used by the deployment stack.

## 1. Deployment, staging, restart and rollback

### Included implementation

- Root `Dockerfile`: Node.js 22, committed lockfile, non-root user, liveness check and no embedded environment files.
- `deploy/compose.yml`: private app network, persistent uploads/backup/work directories, bounded container logs, automatic restart, and Caddy HTTP→HTTPS/TLS renewal.
- `deploy/release.sh`: serialized releases keyed by full commit SHA, environment checks, local/public readiness verification, current/previous release pointers and automatic code rollback after a failed candidate health check.
- `.github/workflows/deploy.yml`: verified staging deployment from `main`, explicit production selection and manual rollback through GitHub Environments. It is disabled until `NORDA_DEPLOY_ENABLED=true` is configured.
- Shared secrets/data live outside release folders. Releases never reseed, replace environment files, erase media or restore a database as part of rollback.

### Prepare the target

Use a dedicated Ubuntu VM with Docker Engine, the current Compose plugin, Bash, `flock`, SSH and sufficient disk/RAM. Use separate staging and production VMs for the supplied Compose setup: each proxy binds public ports 80/443. The backend's 5000 port is internal to Docker. Existing GitStack/Gitea services and databases are unrelated.

Point the selected domain's DNS at the VM and allow inbound 80/443. Add the VM's outgoing IP to the appropriate Atlas network allowlist. MongoDB must be reachable from inside the container; the container's `127.0.0.1` is not your laptop/VM MongoDB. Production preflight requires a replica set and an explicit database name in `MONGO_URI`.

Prepare, for each environment:

```text
/opt/norda/production/shared/.env
/opt/norda/production/shared/.env.integrations
/opt/norda/production/shared/deploy.env
/opt/norda/production/shared/uploads/
/opt/norda/production/shared/backups/
/opt/norda/production/shared/backup-tmp/
/opt/norda/production/shared/mail-preview/
/opt/norda/production/releases/
```

Use `staging` instead of `production` on the staging VM. Copy your private environment deliberately; do not commit it. Start `deploy.env` from `deploy/deploy.env.example` and set the domain and ACME contact. Keep secret files mode 600 and parent directories private. Persistent data directories must be writable by container **UID/GID 1000**, with mode 700. Copy existing uploads before the first production start. Caddy certificate volumes are persistent and separate per Compose project.

Compose sets production mode, port 5000 and the public client/server/SEO origin for that environment. It reads `.env.integrations` first and the existing `.env` second, preserving the base file's priority; neither is baked into the image. A separate disk-backed private backup work directory supports recovery without relying on a small `/tmp` allocation.

**Staging isolation:** use a different database ending `_staging`; production rejects that suffix. Staging preflight rejects live SSLCOMMERZ and automatic courier booking. If eCourier is configured, its mode must be sandbox. Optional staging off-host backup uses a unique namespace ending `-staging/`. Use separate sandbox mail/provider settings. This tooling cannot identify a misleading production dataset that someone manually copied into a staging-named database; choose environment accounts carefully.

### GitHub configuration

Create `staging` and `production` repository Environments. Configure deployment branch restrictions and production required reviewers according to your team policy. Set repository variable `NORDA_DEPLOY_ENABLED=true` only after both environments are ready.

Each Environment supplies:

| Secret | Purpose |
|---|---|
| `NORDA_DEPLOY_HOST` | VM hostname/IP |
| `NORDA_DEPLOY_USER` | Dedicated deployment user, with access to its release/shared directories and Docker |
| `NORDA_DEPLOY_SSH_KEY` | Private deployment key |
| `NORDA_DEPLOY_KNOWN_HOSTS` | Independently verified pinned SSH host-key entry |

Do not disable host-key checking. Database/SMTP/MFA/storage secrets remain on the target host; the workflow transfers tracked source with environment/runtime data excluded, verifies its SHA-256 and invokes the release script.

Push to `main` for configured staging. Use **Actions → Deploy NORDA → Run workflow** and select production when ready. Before promotion, inspect the staging customer/admin journeys and provider settings. Production approval is a repository configuration, not a hard-coded shared password.

### Rollback

Choose the workflow's `rollback` action, or run the current release's script on the VM:

```bash
bash /opt/norda/production/releases/FULL_CURRENT_COMMIT_SHA/deploy/release.sh production --rollback
```

Replace the placeholder with the real full commit SHA. The recorded previous application release is restored and checked. Rollback remains available when the latest candidate verification fails. Retain both release directories and their Docker images; this version does not prune them automatically.

Rollback changes application code only. It preserves live database/media changes and does not undo orders. Use compatible releases built with this tooling; the required `mfa-v1` capability prevents a release without authenticator support from passing preflight. Do not manually roll back to 2.11 after enabling MFA or using the new warehouse features. Deployment can involve a short restart interval; zero-downtime blue/green migration is not claimed. If the previous release is unavailable/unhealthy, the workflow fails visibly for operator attention.

No VM, DNS, public certificate or actual GitHub deployment was created during ZIP verification. Docker/Caddy artifacts, YAML, environment guards and shell rollback were checked; the actual image build and public-domain run require your configured host.

## 2. Off-host backup, retention and recovery drills

The existing encrypted `.ndb` BSON/index/local/cloud-media backup remains the source. A new S3-compatible adapter signs server-side HTTPS requests with SigV4; it never uploads plaintext database dumps or environment files.

Configure your private bucket/account:

```dotenv
OFFSITE_BACKUP_ENABLED=true
OFFSITE_S3_ENDPOINT=https://s3.REGION.amazonaws.com
OFFSITE_S3_REGION=YOUR_REGION
OFFSITE_S3_BUCKET=YOUR_PRIVATE_BUCKET
OFFSITE_S3_PREFIX=norda/my-store-production/
OFFSITE_S3_ACCESS_KEY=
OFFSITE_S3_SECRET_KEY=
OFFSITE_S3_SESSION_TOKEN=
OFFSITE_RETENTION_ENABLED=false
OFFSITE_RETENTION_DAYS=30
OFFSITE_MIN_COPIES=3
BACKUP_DRILL_INTERVAL_HOURS=0
```

Use the endpoint/region required by your provider. This implementation uses path-style requests, standard private S3 operations and a unique installation namespace `norda/<name>/`. Staging uses a different name ending `-staging/`. Credential permissions need Get/Put and Head for this namespace; retention also needs Delete. Read access must distinguish missing objects from denied access. Keep public access blocked. A bucket lifecycle rule must not delete retained recovery points earlier than the application policy. In versioned buckets, deleting a current object may retain older versions; configure provider lifecycle rules separately.

Configure the existing `BACKUP_ENCRYPTION_KEY` and optionally `BACKUP_INTERVAL_HOURS` for local capture. Off-host replication automatically picks up completed local backups while the app is running. The provider limit here is one archive of at most **5 GiB**; larger stores need a multipart/storage extension.

### Verification and uncertain responses

The uploader first authenticates the local archive, saves one destination/key/hash identity, then uses conditional upload. It checks an existing object before retrying a failed request and downloads the result to verify its complete bytes/SHA-256. A lost upload response never causes a second object with a new identity. Mismatched remote metadata/bytes fail without overwrite. The private `latest.json` recovery pointer is updated only for a verified archive, with source time ordering; pointer failures remain recoverable.

Admin **System health → Off-host recovery** displays replication and drill outcomes. The CLI offers:

```bash
# From server/, after local creation returns its BackupRun _id:
npm run backup:create
npm run backup:upload -- --run ACTUAL_BACKUP_RUN_ID

# Download/authenticate the latest off-host archive into a NEW private path:
npm run backup:fetch -- --output /absolute/private/recovery/latest.ndb

# Explicit isolated restore, using the existing new-target safeguards:
npm run backup:restore -- --file /absolute/private/recovery/latest.ndb --database norda_restore_owner_check_20261023 --output /absolute/private/new-restored-media
```

Create the private parent directory first. Fetch does not connect to the application MongoDB, so recovery is possible while it is unavailable. Keep the backup key separately; the bucket cannot recover an archive without it. After a disaster, preserve the actual key ID/version corresponding to each archive. Restored cloud image bytes still need deliberate provider re-upload/reference promotion if the original cloud objects were lost.

### Retention and regular drills

Enable `OFFSITE_RETENTION_ENABLED=true` after a successful owner recovery test. The worker deletes only tracked, verified archives in the current destination, older than the configured 7–3650 days, while keeping at least 2–100 newest verified copies (`OFFSITE_MIN_COPIES`, default 3). It does not delete another installation's namespace or local archives. Failed/unverified uploads are not counted as recovery points. Local retention and cleanup of abandoned remote objects remain operator policies.

```bash
npm run backup:retention
npm run backup:drill
```

A drill downloads a verified off-host archive, restores into a randomly named new `norda_restore_drill_*` database and private folder, checks the existing BSON/index/document/media restoration rules, drops only that new database and records cleanup. It never starts the restored application or redirects the production URI. `BACKUP_DRILL_INTERVAL_HOURS=168` schedules weekly drills while the application is running; allowed enabled intervals are 24–8760 hours. The database account needs permission for those isolated targets. Failed drills/cleanup are visible; inspect any recorded leftover target before resuming. Do not use a drill to automatically promote or overwrite production.

## 3. Independent uptime monitoring

The new `ops/uptime.js` requires neither application MongoDB nor the running store. It probes public HTTPS `/api/health/ready` URLs with bounded timeouts/body sizes and no redirects. Two consecutive failed observations create one outage; recovery creates one recovery alert. Backup maintenance has a finite 20-minute grace. Persistent per-target state prevents repeated transition alerts, with bounded notification retry.

Choose either included execution route:

1. **GitHub-hosted Actions:** `.github/workflows/uptime.yml` runs from outside the VM, keeps state in workflow artifacts and accepts manual execution. Set `NORDA_MONITOR_ENABLED=true`, `NORDA_MONITOR_TARGETS_JSON` and the alert secrets. Scheduled checks are best effort and can be delayed/disabled by GitHub; this is not a guaranteed five-minute SLA.
2. **Another host:** build the Dockerfile there, prepare private settings from `ops/monitor.env.example`, then use `deploy/monitor-compose.yml`. Its container restarts independently, keeps `/state` on persistent storage and probes about once per minute. Running it on the store's own host cannot detect that entire host going offline.

Example repository variable:

```json
[{"name":"production","url":"https://shop.your-domain.com/api/health/ready"}]
```

Alert secrets: `MONITOR_ALERT_WEBHOOK_URL` **or** `MONITOR_ALERT_EMAIL` plus `MONITOR_SMTP_HOST`, `MONITOR_SMTP_USER`, `MONITOR_SMTP_PASS`, `MONITOR_MAIL_FROM`; optional variable `MONITOR_SMTP_PORT`. A webhook has priority. Use your own monitored receiver/account; no third-party recipient is preconfigured. Configure actual SMTP for email, not local file previews. Uptime payloads contain operational target names/status/time, without database credentials, cookies or order data.

For a configured standalone monitor:

```bash
node --env-file=/absolute/private/monitor.env ops/uptime.js --once
node --env-file=/absolute/private/monitor.env ops/uptime.js
```

Run these from the project root. Check actual receipt of both outage and recovery notifications by stopping a staging app, not by disrupting production. A failed alert remains visible/pending; verify your receiver rather than assuming SMTP/API acceptance means inbox delivery.

## 4. Staff invitations and authenticator MFA

### Invitations

Open **Admin → Staff invitations**. Select tools, email and whether authenticator setup is required (default on). This creates an expiring 48-hour, single-use invitation with only a hash stored. Private email links keep the token in the fragment. Existing accounts must sign in as the invited email; accepting preserves their password, saved data and shopping history. New staff can create their account through the invitation. Accepting verifies possession of the invited email and writes the existing staff audit.

An expired/revoked/accepted link cannot grant access. Resend rotates the token and invalidates the old one, with a cooldown. A delivery failure leaves a visible pending invitation; it does not falsely report mail receipt. Only full administrators can invite/revoke/resend, and administrator accounts cannot be overwritten through this flow. The existing staff-access editor remains available for already registered accounts.

Invited staff requiring MFA can sign in to enroll but cannot open operational tools until setup is complete. Removing staff access clears that requirement, while leaving their authenticator enabled as a personal account choice.

### MFA configuration and use

Generate a new separate 32-byte base64 key locally:

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'
```

Put it in `MFA_ENCRYPTION_KEY` in the private integration file. Preserve it securely with your recovery materials, separately from archives/JWT secrets. Do not rotate/delete it casually: existing encrypted authenticator secrets depend on it. Never publish it or put it in browser JavaScript.

Open **Account & devices → Authenticator security**:

1. Enter your current password and start setup.
2. Use your authenticator app's manual setup-key option: account Norda, time-based, six digits, 30 seconds. Copy the displayed secret; setup expires after ten minutes.
3. Confirm with a current code, then save the ten recovery codes displayed once. Each works once. Codes are stored hashed; authenticator secrets are encrypted and excluded from profile/admin list responses.
4. Future sign-in checks the password first, then requires a fresh authenticator or recovery code before issuing a session. The verification challenge expires in five minutes, has bounded attempts and cannot replay. Used TOTP steps cannot replay; use the next code after setup. IP rate limits and account/revision checks also apply.

MFA enable/disable/recovery replacement require password plus the appropriate proof, rotate account/session versions and preserve other account data. Protected device sessions carry verified MFA revision, including session rotation. Password reset alone does not remove MFA. Lost authenticator users can use an unused recovery code; staff still subject to the required policy cannot disable it. Losing all recovery methods/key needs an identity-verified operator recovery procedure, not a public bypass endpoint. Passkeys/SMS MFA and automatic key rotation are not included.

Existing users/staff are not silently enrolled and their credentials are unchanged. Actual invitation inbox delivery and authenticator use on the two intended computers remain owner acceptance checks.

## 5. Advanced inventory

### New product/SKU CSV creation

Open **Warehouse & catalog tools → Create products & SKUs from CSV**, available to catalog staff/full administrators. Download the exact template, fill it, preview and confirm. It supports 50 new products / 200 rows / 300 KB per import.

Columns: `productKey,name,description,categoryId,brandId,price,discountPrice,stock,sku,size,color,images`. Product keys are new lowercase URL slugs; category/brand IDs identify existing managed entries. Fetch the existing category/brand list or use the management tools to identify them. Images use valid URLs separated by `|`, up to six. UTF-8 quoted fields support commas/newlines/quotes.

Use one row without SKU/size/color for a simple product. For variants, use one row per unique SKU/size/color and repeat the product key/name/description/category/brand consistently; option prices and stock can differ. Products/SKUs cannot overwrite existing identities. The importer reuses the editor's validation, checks managed media references and global SKU uniqueness, requires the exact preview hash and retains one request-key result/history. A handled failure rolls back new records; public production uses replica-set transactions for crash atomicity.

The existing **Inventory tools** CSV remains the way to update current online stock/thresholds. Bulk creation does not replace that update workflow or rewrite existing catalog prices/images.

### Warehouse stock and transfers

Inventory staff/full administrators can create named warehouses with permanent unique codes, edit details and archive/reopen empty locations. Nonzero stock blocks archiving. Movements have reasons, actors and durable request keys; repeated identical requests do not move stock twice.

**Stock model:** existing product/SKU stock is the **online fulfillment location** used by carts, orders, expiry, cancellation, returns and exchanges. Satellite warehouse quantities are independent ledger balances and are not added to storefront availability. Transfer satellite → online to make stock saleable, online → satellite to hold it, or satellite → satellite to relocate it. Online variant and product totals change together using the existing stock service; historical order/invoice behavior is retained.

Count adjustments require the observed balance and reject stale updates. Existing online stock adjustments still use the editor/stock CSV. Per-location thresholds can be set during warehouse adjustments. Existing SKU identities cannot be removed/reassigned, and base warehouse stock blocks converting that product into variant inventory without reconciliation. Multi-location order splitting and automatic fulfillment routing are future scope, not implicit behavior.

### Low-stock email

Inventory staff subscribe their own registered email, optionally including tracked satellite balances. Online variants have their own thresholds; satellite alerts apply to SKU balances explicitly held/tracked there. Archived/inactive products/options/locations are excluded.

A durable notice queues on entering a low-stock episode, rearms only after stock rises above its threshold and respects subscription/permission changes. Atomic claims, stable message IDs, bounded retries and stale-claim recovery support SMTP delivery. Mail is outside commerce transactions; a mail failure does not undo stock/order changes. Inspect notice status and retry a failed current notice from the workspace. `local` means private development preview; `smtp` means provider acceptance, not confirmed inbox delivery. SMTP is at least-once delivery; stable IDs help recipients/providers deduplicate an uncertain send.

## API and verification

New routes cover `/api/auth/mfa`, `/api/auth/invitation`, full-admin `/api/admin/staff-invitations`, inventory-scoped `/api/admin/warehouses`, `/api/admin/inventory/movements|subscription|notices`, catalog-scoped `/api/admin/catalog-import`, and full-admin `/api/admin/system/offsite`. List routes use existing page/limit conventions. Secrets/raw invitation links never appear in admin history or profile responses. Backup archives remain CLI/private storage only.

Run `npm run verify`. Use a dedicated `NORDA_TEST_MONGO_URI` and `npm run test:integration` for the thirteen serial native entry points. They create/drop only isolated test/drill databases. [Recorded results](VERIFICATION_RESULTS.md) distinguish actual Node/Express/MongoDB tests, controlled provider responses, frontend VM checks and shell rollback simulation from real VM/provider/browser acceptance.

The release did not contact the owner's database, send real invitations/alerts, activate paid storage, book parcels or move money. Live Docker/TLS/GitHub deployment, S3-compatible account acceptance/permissions, real alert receipt and browser/mobile/keyboard/print checks require the owner's environment. All prior SSLCOMMERZ/courier/cloud acceptance boundaries remain.

## Official references

- [Docker Compose services](https://docs.docker.com/reference/compose-file/services/) and [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [GitHub workflow events/schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and repository Environment configuration
- [AWS S3 Signature Version 4](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html) and [HeadObject semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)
- [RFC 6238 TOTP](https://www.rfc-editor.org/rfc/rfc6238)
