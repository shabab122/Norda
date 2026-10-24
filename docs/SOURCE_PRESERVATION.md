# Source preservation — NORDA 2.14.1 · Local Final

Input: delivered `Norda-Main-v2.14.0.zip`, SHA-256 `b1ac5f155db8ed9aeb847f251b0686d5e0f14c6ee840b2117f30d17f64d88a28`. Work starts from this archive with no replacement baseline.

| Check | Result |
|---|---|
| Original files retained | **506 of 506**; no removals |
| Original files byte-identical | **483** |
| Modified original files | **23**, targeted bug fixes/tests/release metadata/documentation |
| Added files | **1**, the fixed-scope local final guide |
| Total ZIP files | **507** |
| Catalog/brand assets | **All 42 byte-identical** |
| Environment/config/seed files | **All 11 byte-identical**, including optional reference files |
| Dependency selections | **Unchanged**; only root package/lock version metadata moves to 2.14.1 |
| Owner database / real merchant actions | **None** |

Product feature scope remains 2.14.0. Business/frontend changes are limited to partial receipt identity/error handling, truthful stock wording, existing refund/credit retry synchronization and unsuccessful HTTP responses. All other source files and original pages remain. The professional README structure is retained with a fixed localhost closure policy; earlier guides remain available.

Installed dependencies, fixture mail/media, backup artifacts, logs and temporary databases are excluded. Every ZIP member's CRC and exact final source bytes are verified after build. Keep newer working laptop environment files/uploads when updating source; no setup, reseed or manual data migration is required. See [manifest](UPDATE_FILES.json), [fixed scope](LOCAL_FINAL_RELEASE.md) and [verification](VERIFICATION_RESULTS.md).
