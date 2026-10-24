# NORDA 2.14.3 — local acceptance update

Baseline: delivered **Norda-Main-v2.14.2-Local-Final.zip**. Scope: the owner's selected customer/admin/mobile/printing, email delivery and reverse-pickup/settlement service areas, while reserving the three deferred integrations.

Added a runnable private localhost connector with durable idempotent booking, explicit demo tracking/cancellation, immutable balanced statement pages and cursor-safe acknowledgement. Demo/merchant job/feed identities are separated; background work avoids the other mode, actual parcel booking is disabled in explicit demo mode and demo statement financial imports are rejected. The existing real merchant HTTPS path and manual tools are retained.

Added one-recipient SMTP probes with private receipts, clear file-preview diagnostics and separate operator-observed Inbox/Spam confirmation. Remote authenticated SMTP now requires TLS. Existing account/reset/guest-recovery and notification implementations/credentials are retained. The archived ZIP has no SMTP settings: no actual inbox delivery was performed or claimed.

Added mobile-menu Escape/focus, semantic progress-list CSS isolation and narrow invoice/print refinements. Full frontend/Express/native journeys pass, but the prior browser access restriction prevented visible desktop/mobile/keyboard/PDF inspection. A manual acceptance guide states exact expected behavior without marking those observations passed.

Measured: **345 syntax files**, **608 default passes / 0 failures / 15 deliberate native skips**, **274 native passes per topology**, **0 audit vulnerabilities** and actual CLI/HTTP smoke of **61 pages / 148 targets**, all 200. The connector is a functioning local demonstration; no actual reverse/statement provider was selected or connected.

All original source files, 42 assets and environment/config/seed bytes are retained; dependency selections remain unchanged. No owner database was connected, no external recipient was contacted and no real booking/payment/refund was performed. Preserve newer laptop settings/uploads; no setup/reseed/manual data migration or credential rotation is needed.

Suggested commit: `feat: add local operations connector and email delivery checks`
