# Norda 2.14.2 · Local Final

Built directly from delivered `Norda-Main-v2.14.1-Local-Final.zip` for the requested storefront and shopping-flow corrections.

- One complete search border, correctly flexed input/button, inactive empty/whitespace search and category-name catalog matching.
- Independent accessible password show/hide controls, including dynamic forms and page-exit remasking.
- Clear guest order history, Order IDs, recovery guidance, refresh, delivery stages and individual parcel tracking; guest invoice/tracking stay private while a separate member is signed in.
- Guest/account badges and real customer contacts in the admin queue; dispatch opens its courier form, warehouse orders lead to their parcels and stale account/filter responses are discarded.
- Optional operator-only admin:ensure command creates a missing configured administrator without changing an existing administrator/customer/password/catalog. Public signup remains customer-only.

Verified **337 JS files**, **590 default passes / 0 failures / 15 deliberate native skips**, **269 native passes per topology**, **0 audit vulnerabilities**, and **61 pages / 146 local page-resource targets**, all 200. Nineteen new checks are included in the default count; three also run natively on each topology.

Existing credentials, all environment/config/seed bytes, all 42 catalog/brand assets and dependency selections are retained. No owner database, real provider account or actual money was used. Preserve newer working laptop settings/uploads; no setup, reseed, credential rotation or manual data migration is required. Localhost:5000 remains the application target.

Read [SHOPPING_AND_ADMIN_GUIDE.md](docs/SHOPPING_AND_ADMIN_GUIDE.md) for the complete customer/staff flow and [verification](docs/VERIFICATION_RESULTS.md) for actual evidence and limits. Real merchant activation/production hosting stay deferred. Visible browser/mobile/print inspection remains unperformed under the previously observed browser access restriction; static/VM/HTTP/native checks are not presented as visual acceptance.
