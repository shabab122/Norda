# Source preservation — NORDA 2.14.4

Input: delivered `Norda-Main-v2.14.3-Local-Acceptance.zip`, SHA-256 `b28882471a2f7506c5c730d07a231f73eb727b4fe85cae0f2df4aa802529a0bf`. Work starts directly from this archive.

| Check | Result |
|---|---|
| Original files retained | **524 of 524**, no removals |
| Original files byte-identical | **500** |
| Modified original files | **24**, guest recovery/receipt print fixes, tests, metadata and documentation |
| Added source/document files | **4** |
| ZIP members | **528** |
| Catalog/brand assets | All **42** byte-identical |
| Environment/config/seed files | All **11** byte-identical |
| Dependencies | Selection/lock graph unchanged; root version and optional CLI scripts updated |
| Owner database / external messages / actual merchant actions | None |

Necessary implementation changes validate guest email URLs before intent creation, add redacted mail failure handling and guard existing receipt printing after identity changes. Existing local connector, ordinary merchant mode, credentials, catalog/stock/order rules and source files are retained. Added files are isolated HTTP/SMTP recovery tests and a separate native test entry point; no new product feature is added. The owner database was never connected; test DBs were randomized/isolated. No setup, reseed, credential rotation or manual migration is required.

The local service/private token, probe receipts, dependencies, logs, mail previews and runtime/backup fixtures are excluded. All ZIP member CRCs and exact source bytes are checked after construction. Preserve newer laptop environment settings/uploads when applying source.

See [manifest](UPDATE_FILES.json), [verification](VERIFICATION_RESULTS.md), [local acceptance](LOCAL_ACCEPTANCE.md) and [reserved integrations](reserved/README.md). Actual visible browser/inbox/provider acceptance is not implied by source preservation or passing automated tests.
