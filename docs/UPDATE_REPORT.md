# NORDA 2.9.0 update report

Built directly from the latest `Norda-Main-v2.8.0.zip`, with the user-selected professional README retained as the documentation design. This release implements coupons/promo codes, personal wishlists, inventory CSV/low-stock tools and editable store settings.

Admin Coupon center manages fixed/percentage offers, caps, minimums, dates, public/private visibility and total/account limits. Checkout reprices the current cart/SKU selection on the server, reserves one usage per created order and records discount snapshots in orders/invoices. Confirmation mail, customer totals and order CSV explain the saving. Payment initiation/retry and refund ceilings use the recorded charged amount. Counter/redemption failures participate in the existing transaction/compensation unit; replay returns one order/invoice/use. Coupon use remains consumed after later cancellation/expiry/refund and does not repeat on payment retry.

Wishlist saves products privately by account, returns current catalog price/availability, supports removal and uses the existing cart flow. Variant products still require a chosen size/color. Guests return through sign-in to the selected save action; account/response guards prevent another identity's data from rendering.

Inventory tools show stock and low-stock thresholds by simple product/variant, export formula-protected stock CSVs, preview changes without writes and apply existing-inventory adjustments. Identifier/SKU, expected-stock and inventory-version guards detect stale edits. Per-product atomic updates retain untouched options and recalculate parent totals. Durable request keys/results recover interrupted updates or mark unknown outcomes for review; completed products do not reapply, and conflicts are reported separately. Imports do not create new catalog/SKU identities or change prices.

Store settings publishes validated banner/announcement/contact/FAQ/policy content and delivery prices to the existing storefront and new help page. Public config excludes secrets/admin metadata. Default reads do not seed settings or rewrite existing records. New order delivery uses the discounted subtotal and current configured charges; old orders/invoices retain snapshots. Policy text does not silently change operational eligibility rules.

The supplied `.env` remains byte-for-byte identical. No dependency version, seed/catalog image, logo or unrelated configuration is changed. Necessary cart/checkout/invoice/product/mail/report/navigation paths are extended and prior automated journeys pass. No baseline file is removed and no owner database, real merchant, inbox or courier is used.

Verification: 180 JS syntax files, 331 default passes/zero failures/seven opt-in native skips; 112 native passes on each MongoDB topology; zero audit vulnerabilities. Browser/device visual acceptance remains manual because the live browser tool could not complete. Exact evidence and boundaries are in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md).

Apply while preserving your working `.env`, current Atlas/local database URI, later SMTP edits, uploaded media and Git history. Run `npm ci`, `npm run verify`, `npm run dev` from `server/`. No setup, reseed/manual migration or new credentials are required. Read [COMMERCE_TOOLS.md](COMMERCE_TOOLS.md) and [run commands](../RUN_COMMANDS.md).

Suggested commit: `feat: add coupons, wishlists, inventory tools, and store settings`.
