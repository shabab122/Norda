# Verification results — NORDA 2.12.1

Recorded **23 October 2026 (Asia/Dhaka)** using Node.js 24.19.0, npm 11.9.0 and native MongoDB 7.0.45. This acceptance patch starts from the exact delivered `Norda-Main-v2.12.0.zip`.

## Result and change

The automated commerce/security/recovery checks pass. One configuration mismatch was found: application startup reads `.env.integrations`, but the acceptance and mail CLI commands previously read only `.env`. Those commands now load the optional integration file using the same precedence as startup. Existing process values and base `.env` values, including explicit empty values, retain priority. No environment file is rewritten.

There is no storefront or commerce behavior change. All original client files, assets, credential files, seed/config values and dependency selections are retained. The package version, native test command, relevant documentation and additional tests are updated.

## Measured checks

| Check | Result |
|---|---|
| JavaScript syntax | **273 files passed** |
| Default `npm run verify` | **467 reported: 454 passed, 0 failed, 13 native entry points skipped** without an explicit test URI |
| Native standalone | **198 passed**, 0 failed/skipped; handled-failure compensation |
| Native single-member replica set | **198 passed**, 0 failed/skipped; transaction path |
| Dependencies | **0 vulnerabilities** in the fresh npm audit; dependency selections unchanged |
| Pages/resources | All **48 HTML pages**, local script/style/asset references and unique static IDs checked by retained HTTP/static tests |
| Frontend | Retained VM tests for rendering, account/session guards, MFA, cart/checkout recovery, returns and inventory passed |
| Configuration and shell | All three workflow YAML files and both Compose files parsed; Bash syntax and the controlled candidate-failure/rollback harness passed |
| Preservation | Every original archive file retained; original `.env`, client files/assets and dependency selections compared against the input |

Thirteen native entries run serially on independently started standalone and single-member replica-set servers. They use explicit loopback test URIs and create/drop only random `norda_test_*` databases and isolated restore targets. No owner's Atlas/local database was contacted. No credential was rotated; no real mail, money, parcel or storage-provider action was submitted.

## Requested acceptance areas

| Area | Verified here | Still pending |
|---|---|---|
| Customer/admin journey | Actual Express HTTP and MongoDB: registration/login, account isolation, categories/SKUs/cart, totals, COD, invoice snapshots, inventory/delivery/cancellation, returns, refund/credit-note synchronization and replay/failure safeguards | Visible journey with the owner's existing accounts in the target browser/environment |
| SSLCOMMERZ sandbox | Actual adapter request formats and endpoint selection; callback/IPN, validation, failure/cancel/replay, late/risky payments, retry/expiry and refund state handling with controlled responses and real database persistence | Real hosted merchant sandbox success/failure/cancel/repeated IPN/refund settlement and public callback reachability |
| Browser/mobile/keyboard/print | HTTP/static resources, markup/reference checks, frontend VM behavior and retained responsive/print CSS | Live visual checks at 360/768/1024/1440 px, keyboard/zoom, actual phone and invoice/credit-note print acceptance |
| Deployment/recovery | Actual server/all workers, graceful stop/restart and cookie/cart persistence; production preflight rejects standalone and accepts replica set; YAML/Bash/controlled rollback; actual encrypted archive/index/media verification and isolated restore | Actual Docker build/container run, domain/DNS/HTTPS/Caddy, SSH/GitHub deployment, target-host rollback and promotion from recovery |
| External services | Actual Nodemailer SMTP protocol against a disposable local receiver; account/operations/independent-monitor mail, rejection and required-TLS failure; native invitation/MFA tests; courier/cloud/S3 protocol and recovery fixtures | Owner inbox/Spam, authenticator device enrollment, real courier/Cloudinary/S3 permissions and notifications from a genuinely independent host |

## Additional coverage in this patch

- Optional integration settings are recognized without overwriting a supplied JWT secret, MongoDB URI or base SMTP identity; the private files remain byte-for-byte intact. An absent optional file keeps local development working.
- A loopback SMTP receiver exercises real Nodemailer greeting, mail DATA, recipient rejection and production STARTTLS requirements. Account action links survive MIME wrapping. Operations and independent uptime alerts use the same SMTP transport. This receiver does not relay messages or prove public inbox placement.
- Hosted-session creation preserves order snapshots, callback/IPN URLs, identity and server-only credentials. Invalid JSON, failed/unsafe gateway responses and absent merchant settings fail safely. Validation requests select sandbox/live endpoints correctly. No public payment request is made.
- The opt-in runtime test launches the actual `server.js` with all workers on a disposable port/database, logs in, saves a cart, shuts down cleanly, restarts and confirms its cookie/cart and untouched stock. It also runs the actual production preflight against each native topology.
- The retained suites cover customer/staff permissions, MFA/recovery/session revocation, inventory/coupons/wishlist/settings, reports, payment review, cancellation/returns/refunds/exchanges/credit notes, courier events, queued email, cloud references, monitoring and encrypted local/off-host recovery. Deliberate fault-injection diagnostics are expected in passing runs.

## Concrete environment limits

The supplied ZIP has no configured SSLCOMMERZ merchant ID/password and no actual SMTP or optional provider credentials. The owner's later laptop `.env` may contain newer working settings; retain it when copying this patch. Public gateway/provider acceptance cannot be inferred from mocks, configuration flags or local simulations.

The available cloud browser could not reach the isolated loopback test server; the browser access was blocked. No browser/mobile/keyboard/print journey is marked passed, and no alternate browser path was used to bypass the restriction. HTTP/static/VM tests do not establish visual acceptance.

No Docker/Podman/build daemon, target VM/domain or configured public staging host was available. Compose/workflow parsing and a controlled Docker shell harness do not establish a real image build, certificate or live deployment. The store has not been published by this work.

S3-compatible recovery uses real encrypted archives and real isolated MongoDB restore with intercepted provider traffic. It does not prove the owner's bucket policy, network or lifecycle settings. Email tests prove local SMTP acceptance/rejection, not arrival in an external inbox. MFA math/HTTP/replay/session checks do not replace actual authenticator setup on the intended devices.

## Target-environment follow-up

1. Retain your working `.env`, optional `.env.integrations` and uploaded media; no setup, reseed or manual migration is needed. From `server/`, run `npm ci`, `npm run verify`, `npm run acceptance:preflight` and `npm run mail:check` as applicable. These read your configured environment; do not post their private files or tokens.
2. Complete the customer/admin, two-account, mobile/keyboard/print and public gateway matrix in [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md). Keep sandbox credentials in your own environment and confirm real public callbacks/refunds before live payments.
3. Before enabling new external integrations, follow [RELEASE_AUTOMATION.md](RELEASE_AUTOMATION.md) and [PRODUCTION_TOOLS.md](PRODUCTION_TOOLS.md) on isolated staging. Confirm actual inbox/alert receipt, courier/media/storage behavior and a recovery drill before production promotion.
4. Upgrade every app server sharing the database before enabling MFA and use the same private MFA key. Keep GitStack/Gitea ports 3000/3002 separate; NORDA's normal port remains 5000.
