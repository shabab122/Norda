# Source preservation — NORDA 2.14.0

Input: delivered `Norda-Main-v2.13.1.zip`, SHA-256 `4f42e2ba3c1f58cc9014e23f4c5f0e4020c7cb016dd3bb65d1b577c0ff3dc215`. Work starts directly from this archive.

| Check | Result |
|---|---|
| Original files retained | **473 of 473**; no removals |
| Original files byte-identical | **430** |
| Modified original files | **43**, scoped feature integration, tests and release documentation |
| New files | **33**, feature models/services/routes/screens, tests, guide and optional configuration reference |
| Packaged total | **506 files** |
| Catalog/brand assets | **All 42 byte-identical** |
| Credential/config/seed files | **All 10 byte-identical**, including the supplied working configuration |
| Dependency selections | **Unchanged**; only root package/lock version metadata changes to 2.14.0 |
| Owner database / real provider actions | **None** |

Backend edits are limited to these four features and their required inventory/cancellation/payment/return/worker/permission integrations. Existing source files are retained, including the professional README structure and historical release guides. Customer/admin authentication and shopping behavior are regression-tested. No existing credential is replaced or rotated. Keep newer working laptop settings/uploads when installing source; no setup/reseed/manual migration is needed.

All original 56 HTML pages remain and five new pages are added. Installed dependencies, fixture email/media, logs, backups and temporary test databases are excluded. Every archive member's CRC and exact source bytes are verified after packaging. See [file manifest](UPDATE_FILES.json), [current report](UPDATE_REPORT.md) and [measured verification](VERIFICATION_RESULTS.md).
