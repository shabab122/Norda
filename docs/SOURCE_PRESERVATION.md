# Source preservation — NORDA 2.14.2

Input: delivered `Norda-Main-v2.14.1-Local-Final.zip`, SHA-256 `a469543b16c2b56bbe2ab8d5e9d6db7173f46e1858dbba285aa3df149c97ba16`. The update starts directly from this archive.

| Check | Result |
|---|---|
| Original files retained | **507 of 507**; no removals |
| Original files byte-identical | **476** |
| Modified original files | **31**, scoped UI/flow/search fixes, tests, metadata and documentation |
| Added files | **3**: shopping/admin guide, operator-only admin helper and focused frontend regressions |
| ZIP files | **510** |
| Catalog/brand assets | **All 42 byte-identical** |
| Environment/config/seed files | **All 11 byte-identical** |
| Dependencies | **Unchanged**; root package/lock version metadata becomes 2.14.2 and package.json adds the admin:ensure script |
| Owner database / real merchant actions | **None** |

No existing order/cart/payment/stock business record was altered. The new admin command is not executed against the owner database; its fixture tests prove that existing accounts/passwords and catalog counts remain intact. Existing customer/admin permissions and seed logic are retained. Necessary client changes clarify the requested search/password/guest/admin flow; category-name keyword matching extends existing read-only catalog search.

Installed dependencies, temporary uploads/mail, logs, backups and test databases are excluded. Every ZIP member's CRC and exact source bytes are checked after build. Keep newer working environment files and uploads when copying source. No setup/reseed/manual data migration or credential rotation is required.

See [manifest](UPDATE_FILES.json), [guide](SHOPPING_AND_ADMIN_GUIDE.md) and [verification](VERIFICATION_RESULTS.md).
