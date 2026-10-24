# NORDA 2.14.2 — storefront and shopping-flow update

Starts directly from delivered **2.14.1 Local Final**. The update addresses the requested search box, password eye controls, guest order tracking and admin order processing.

Search has one complete border and a properly flexed input/button, stays inactive for empty text and matches category names. Password controls work independently on static/dynamic fields. Guest COD checkout opens its own history; full Order IDs, browser access/recovery guidance, refresh, stages and parcel details make the flow explicit. Signed-in users can still view private guest tracking/invoices without changing their account/cart identity.

Admin Orders shows guest/account labels and real contacts, sends dispatch to the courier form and points warehouse orders to parcel fulfillment. Identity/filter guards prevent stale responses and delayed actions. The optional admin:ensure CLI safely prepares a missing configured admin while retaining existing accounts/passwords and all catalog data. A Bangla shopping/admin guide and run instructions explain the exact flow; no future-feature backlog or domain requirement is added.

Measured: **337 syntax checks**, **590 default passes / 0 failures / 15 deliberate native skips**, **269 native passes per topology**, **0 audit vulnerabilities**, **61 pages / 146 HTTP targets**, plus a bounded browse smoke. See [verification](VERIFICATION_RESULTS.md) for methods and honest visible-browser/provider limits.

All original files, credentials/config/seed bytes, 42 assets and dependency selections are retained. No owner database, actual provider account or money was used. Keep current laptop settings/uploads; no setup, seed or manual migration is needed.

Suggested commit: `fix: improve search, password visibility and guest order workflows`
