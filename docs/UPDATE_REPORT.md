# NORDA 2.14.1 · Local Final update

Starts directly from the delivered **2.14.0** ZIP. Keeps the existing feature set and fixes only observed receipt/refund/error behavior plus release documentation.

- Different physical partial-return parcels with matching entered details no longer reuse one prior receipt key. Retries of a single failed submission remain stable.
- Item receipt forms recover from preparation/storage errors; mixed restock quantities are displayed correctly to customers.
- A confirmed failed whole-return refund retry preserves its saved credit entitlement, re-links the existing credit/request, rolls back link failures and settles on confirmed repayment. Pending/unknown and incorrect-amount attempts are blocked.
- Unexpected exceptions no longer return a controller's provisional success HTTP status.
- README, run commands and the local final guide now define a fixed localhost scope. Domain/production and real-account merchant activation are deferred; optional ideas are not added to this release backlog.

Measured: **335 syntax checks**, **571 default passes / 0 failures / 15 explicit native skips**, **266 native passes per topology**, **0 audit vulnerabilities**, **61 pages / 146 local page-resource URLs**, plus a bounded concurrent browse smoke. See [verification](VERIFICATION_RESULTS.md) for the exact methods and cloud-browser/live-provider limits.

All existing source files, credentials/config/seed files, catalog/brand assets and dependency selections are retained. No owner database or actual merchant account was used. Keep your newer working laptop environment and uploads; no setup, seed or manual migration is required.

Suggested commit: `fix: finalize localhost release and harden return workflows`
