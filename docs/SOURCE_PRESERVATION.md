# Source preservation — NORDA 2.13.1

Input: delivered `Norda-Main-v2.13.0.zip`, SHA-256 `7e06934574bd7f28ba9614800d5e2a76c24d432e6343700bb5976ce46eecba89`. The update starts directly from that archive.

| Check | Result |
|---|---|
| Baseline files retained | 470 of 470 |
| Baseline files byte-identical | 430 |
| Modified baseline files | 40; scoped frontend fixes/styles and release documentation/metadata |
| Added tests/documentation | 3 files |
| Original catalog/brand assets | All 42 byte-identical |
| Credential/config/seed files | All 10 byte-identical, including the supplied `.env` |
| Backend routes/models/controllers/services/middleware/utils and app/startup | All 155 source files byte-identical |
| Dependency changes | Only body-parser 1.20.8 → 1.20.9 and Multer 2.4.0 → 2.5.0 for reviewed DoS advisories |
| Owner database/provider actions | None |

All 56 HTML pages remain. Frontend edits address guest access/payment verification, changed-identity private responses, failed form retry, pickup navigation and receipt/focus styling. Backend stock/payment/refund/business source and provider settings are unchanged. No setup, reseed or manual migration is required.

The private ZIP preserves existing credential bytes; keep environment files out of public Git history. Retain your newer working laptop environment and uploads when applying source. Installed dependencies, test mail/media, backups, logs and temporary databases are excluded.

Every archive member's CRC and exact source bytes, the full file set, private/config/asset preservation and two-package dependency delta are verified during build. See [manifest](UPDATE_FILES.json) and [six-area release report](FINAL_RELEASE.md).
