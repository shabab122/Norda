# Norda 2.14.0

Advanced operations source release built directly from `Norda-Main-v2.13.1.zip`.

- Independent parcel courier booking, labels/tracking and an authenticated merchant reverse-pickup connector, with explicit automatic-booking opt-in/cutoff.
- Scheduled reviewed/automatic settlement feeds, cursor/replay protection and balanced accounting journal CSV.
- Partial whole-order receipts, multiple receiving warehouses, snapshotted deductions and separate printable return credits tied to confirmed refunds.
- Distance/capacity/balanced routing, shared atomic reservation limits and previewed warehouse transfer batches.

Verified: **335** JavaScript syntax checks; **566 default passes**, no failures, 15 deliberate native skips without a test URI; **265 native passes on each** of standalone and replica-set MongoDB 7.0.45. Current audit: **0 vulnerabilities**. All 61 pages and 146 local page/resource URLs return 200 from the isolated application.

Existing credential/config/seed bytes, all 42 catalog/brand assets and dependency selections are retained. No owner database or real provider account was used. Keep your working local environment/uploads; no setup, reseed or manual data migration is needed. New workflows require all shared app instances to be upgraded.

Reverse pickup and automatic statement ingestion require an approved merchant connector/account contract. Live merchant, visible desktop/mobile/print and target-host acceptance are not certified by controlled-response tests. See [advanced operations](docs/ADVANCED_OPERATIONS.md) and [measured results](docs/VERIFICATION_RESULTS.md).
