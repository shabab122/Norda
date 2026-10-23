# Norda 2.12.0

Built directly from `Norda-Main-v2.11.0.zip`. Adds deployment/restart/staging/rollback tooling, private off-host backup retention and restore drills, independent uptime monitoring, staff invitations/authenticator MFA, and new-catalog CSV/warehouse/low-stock email tools.

The input `.env`, database/JWT/admin/SMTP/gateway credentials, dependency selections, seed data and all catalog/brand assets are retained. Keep the working laptop `.env` and uploads; no reseed or manual migration is required. All app servers sharing the database must upgrade before MFA is enabled and use the same new MFA encryption key.

New infrastructure needs the owner's host/domain/storage/alert settings and separate private keys. Code/configuration and isolated tests are included; real deployment/provider/browser acceptance is not implied. See [RELEASE_AUTOMATION.md](docs/RELEASE_AUTOMATION.md) and [verification results](docs/VERIFICATION_RESULTS.md).
