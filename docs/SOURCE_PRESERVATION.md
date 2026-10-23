# Source preservation — NORDA 2.13.0

Input: delivered `Norda-Main-v2.12.1.zip`. Output starts from that exact archive.

| Check | Result |
|---|---|
| Original files retained | 425 of 425 |
| Original files unchanged | 306 |
| Original files changed | 119; necessary integration, test, release/documentation updates |
| Existing credential file | Original `.env` bytes unchanged |
| Original images/brand/catalog assets | All 42 files unchanged |
| npm dependency selections | Unchanged; only release/root package metadata updated |
| Owner database/provider actions | None |

All existing pages include the shared private-guest-session client so cart behavior remains consistent. Other integration edits connect inventory, payment recovery/refunds, ownership, invoice identity, permission navigation, reports and backup workers to the six requested features. Existing configuration/seed values are retained. New operational state uses additive fields/models; startup initializes their indexes without a destructive manual migration.

The release archive excludes installed dependencies, private test mail, disposable test uploads, local backups, logs and temporary test databases. Preserve your own newer working environment and uploaded media when copying source. A byte comparison against the input and the completed archive CRC/content check accompany release preparation.

See [the complete operational guide](COMMERCE_EXPANSION.md) and [measured tests](VERIFICATION_RESULTS.md).
