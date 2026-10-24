# Source preservation — NORDA 2.14.3

Input: delivered `Norda-Main-v2.14.2-Local-Final.zip`, SHA-256 `eb33b1d561cefcfd28cb02f167aa41f22fe0157253c99e630566b84f97d041d4`. Work starts directly from this archive.

| Check | Result |
|---|---|
| Original files retained | **510 of 510**, no removals |
| Original files byte-identical | **477** |
| Modified original files | **33**, selected connector/email/UI, tests, metadata and documentation |
| Added source/document files | **14** |
| ZIP members | **524** |
| Catalog/brand assets | All **42** byte-identical |
| Environment/config/seed files | All **11** byte-identical |
| Dependencies | Selection/lock graph unchanged; root version and optional CLI scripts updated |
| Owner database / external messages / actual merchant actions | None |

Necessary implementation changes add optional demo-mode fields to logistics/feed records, private localhost contract handling, preview-only demo statement safeguards, SMTP diagnostics/probes/TLS and targeted mobile/print behavior. Existing ordinary merchant mode, credentials, catalog/stock/order rules and source files are retained. The owner database was never connected; test DBs were randomized/isolated. No setup, reseed, credential rotation or manual migration is required.

The local service/private token, probe receipts, dependencies, logs, mail previews and runtime/backup fixtures are excluded. All ZIP member CRCs and exact source bytes are checked after construction. Preserve newer laptop environment settings/uploads when applying source.

See [manifest](UPDATE_FILES.json), [verification](VERIFICATION_RESULTS.md), [local acceptance](LOCAL_ACCEPTANCE.md) and [reserved integrations](reserved/README.md). Actual visible browser/inbox/provider acceptance is not implied by source preservation or passing automated tests.
