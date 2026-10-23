# Coupons, wishlist, inventory tools and store settings — 2.9.0

> v2.12 extension: [RELEASE_AUTOMATION.md](RELEASE_AUTOMATION.md) adds release automation, private off-host recovery, independent monitoring, invitations/MFA and advanced warehouse/catalog/email tools. Earlier workflows below remain supported.


This update starts from the latest `Norda-Main-v2.8.0.zip`, including the user-selected professional README. It adds four connected customer/admin features without resetting the database, replacing credentials or reseeding existing products. Existing orders, invoices, payments, accounts, recovery links, saved addresses, variants, courier history, refunds and email settings remain compatible.

## Apply the update

Preserve the working `server/.env`, uploaded media and Git history when copying the source. Keep the current local/Atlas database URI and all JWT/admin/SMTP/SSLCOMMERZ values. Later settings changed only on a laptop cannot be recovered from an older archive, so retain that working environment file.

```bash
cd server
npm ci
npm run verify
npm run dev
```

Open http://localhost:5000. No setup, reseed or manual migration is required. The API initializes additive indexes/collections. No dependency package or environment credential is added/changed. NORDA continues to reject reserved GitStack/Gitea ports 3000 and 3002.

## Coupon center and checkout

Administrator: **Coupon center → New coupon**. Choose an immutable code (3–32 letters/numbers/underscore/hyphen), title, percentage or fixed BDT amount, minimum product subtotal, optional discount cap, local start/end times, total/account limits, active switch and public/private visibility. Zero usage limit means unlimited; per-account default is one. Existing coupon edits require the latest revision. Disable an offer rather than deleting historical evidence.

Customers open **Offers**, copy a public code or follow **Use at checkout**. Private codes can be entered directly. The checkout coupon field supports apply/remove, shows the saving and asks the server to reprice the current cart/SKU selection. Coupon previews never consume a use. One code applies per order and can combine with the catalog's existing sale price; the coupon uses that effective price.

Discounts are calculated in integer paisa, with percentage rounding to the nearest paisa, capped by the configured maximum and the product subtotal. A coupon never discounts delivery or produces a negative order total. Delivery/free-delivery eligibility uses the discounted product subtotal. Real SSLCOMMERZ's existing supported amount range still applies; use COD where a fully discounted total is outside that gateway range.

**Usage policy:** one use is recorded when an order is successfully created. Cancellation, abandoned-reservation expiry, refunds and retries retain that recorded use. Failed order creation rolls back the counter/redemption with stock/order/invoice changes. This policy is displayed in the admin editor and public offers page. A coupon does not require a successful payment to consume the use.

Cart and coupon locks serialize account/global usage checks. A repeated checkout key returns the existing order/invoice/redemption; changing that key's coupon conflicts. Coupon expiry/edits after order creation do not rewrite recorded totals. Eligible same-order payment retry honors the original discount without consuming another use. Refund limits and paid revenue use the charged discounted total. Invoice lines retain original item prices, with a separate coupon saving in the totals; customer order totals, confirmation mail and order CSV retain the code/saving too.

New browser checkouts also submit the totals shown to the customer. A price, discount or delivery change before submission returns a conflict and leaves the cart intact for review. No client-supplied discount or subtotal determines the charged amount.

## Wishlist

The heart button on cards and **Save to wishlist** on product details save products to the signed-in account. Guests are sent to sign-in with a return to the selected wishlist action. The pending URL is consumed before saving; repeated saves remain idempotent.

**Wishlist** supports up to 200 products, pagination, current price/stock and removal. It keeps the product saved after adding to cart. Simple products use the existing guarded cart action; variant products link to **Choose options** so the selected size/color/SKU reaches the cart correctly. Archived/missing products remain removable and cannot be purchased. API operations scope every read/write to the current account. Changing accounts prevents an older response from rendering another customer's list.

## Inventory tools

Administrator: **Inventory tools**. Search by product/SKU, inspect each simple-product/variant stock, switch **Low stock only** and export matching inventory. Alerts use each option's own threshold, include zero stock and exclude retired variants/archived products. Existing records without a threshold use five. Thresholds can be edited in the product/variant editor or stock CSV.

### Export and preview

Export up to 500 stock rows per file; narrow the search for larger catalogs. The UTF-8 CSV has a BOM, quoted cells, spreadsheet-formula protection and the exact ordered header:

```csv
productId,variantId,sku,productName,size,color,stock,lowStockThreshold,expectedStock,inventoryVersion,active
```

Edit **only `stock` and `lowStockThreshold`**. Keep the header, identifiers/SKU, `expectedStock` and `inventoryVersion` unchanged. For simple products the variant/SKU cells stay empty. Negative/fractional/non-safe numbers, duplicate rows, malformed quoting, unknown/mismatched options, stale product revisions or oversized files fail validation. The import limit is 500 rows / 700 KB. CSV tools adjust existing inventory; they do not create products or new SKU identities, change prices or resurrect archived products.

Choose the edited file, select **Preview changes** and review every old/new stock and threshold. Preview writes no stock or import ledger. The server rechecks the file and its preview hash before importing.

### Apply, conflicts and recovery

**Each product updates atomically**, including selected SKU quantities, option thresholds and parent stock total. Unlisted SKU rows retain their current state. A file containing several products is processed per product; it is not one all-or-nothing file transaction. If checkout/admin activity changes a product during import, its comparison fails and that product is reported as a conflict; already successful product updates remain applied.

The import has a durable unique request key, file hash, actor and per-product results. A timeout/repeated click with the same file/key resumes or returns the recorded result instead of applying stock twice. The browser retains the key by account and file hash for retries. A key cannot be reused for a different file/admin.

Before a stock write, the job records that the product is being applied. An interrupted update is recovered from the product's import marker. If the write result cannot be established, it becomes **review** and is never blindly repeated. Compare a fresh export and the recorded result before intentionally starting a new correction import. Do not reset expected stock/revision in an old CSV to force it through. Successful imports increment the inventory revision, preventing stale product editors/CSV files from overwriting current stock.

## Store settings and published help

Administrator: **Store settings**. The editor manages:

- Support email, phone, address and hours.
- Delivery charge and free-delivery threshold for new orders.
- Optional announcement text/link.
- Homepage banner visibility, heading, copy, button/link and image URL or validated image upload.
- Up to 20 FAQ questions/answers.
- Delivery, returns/refunds, privacy and shopping-terms text.

Saving publishes a new revision; a stale editor must reload before saving. Public `/store/config` includes only the public content/pricing fields. It never exposes environment secrets or administrator metadata. Without a saved override, existing storefront content and environment delivery defaults remain in use. Reading the configuration does not seed or rewrite the database.

The homepage/header/footer render published content. **Contact & help** opens `help.html` with contacts, expandable FAQ and policy sections. Text is escaped, links are restricted to safe local/HTTPS destinations and images use validated asset/upload/HTTP(S) paths. Policy content is plain text; saving policy wording does not change return eligibility/payment/refund rules. Blank policies display an honest unpublished message rather than inventing merchant terms. Refresh an already open storefront to load newly published settings.

## API additions

All routes below begin with `/api`. Normal authentication remains the existing HTTP-only cookie or supported bearer token.

| Method / route | Access and purpose |
|---|---|
| `GET /coupons` | Public currently available, public offers; no usage/admin metadata |
| `POST /coupons/preview` | Signed in; `{code}` quotes current cart and authoritative totals without redemption |
| `GET/POST /admin/coupons` | Admin list/create |
| `PUT /admin/coupons/:id` | Admin edit with `revision`; code remains immutable |
| `GET /wishlist`, `GET /wishlist/ids` | Current account's paginated products/selected IDs |
| `PUT/DELETE /wishlist/:productId` | Current account save/remove, idempotent |
| `DELETE /wishlist/entries/:id` | Owner-scoped removal, including a missing product |
| `GET /admin/inventory` | Admin options/alerts; `keyword`, `low=true`, `page`, `limit` |
| `GET /admin/inventory/export.csv` | Admin matching stock CSV |
| `POST /admin/inventory/preview` | Admin `{csv}` validation/preview/hash |
| `POST /admin/inventory/import` | Admin `{csv, sourceHash, requestKey}`; durable per-product results |
| `GET /admin/inventory/imports/:id` | Admin recorded import outcome |
| `GET /store/config` | Public content and delivery defaults/overrides |
| `GET/PUT /admin/store-settings` | Admin read/save with `revision` |

Existing COD, simulated and real payment initiation bodies additionally accept `couponCode` and optional `expectedTotals`. Totals contain `subtotal`, `discountAmount`, `shippingFee`, `totalAmount`; the server calculates its own values and rejects mismatches. Existing clients without these optional fields keep their prior behavior. Unknown request fields do not configure credentials.

## Acceptance

1. Create a percentage coupon with a maximum saving and a fixed coupon. Check minimum subtotal, start/expiry, inactive/private visibility and total/account limits. Apply/remove from checkout and inspect the invoice, email and CSV. A repeated request must retain one order/invoice/use. Try a COD return/refund and an expired real-payment retry: the original discount stays unchanged.
2. Save products from cards/details, reload Wishlist and use another browser profile/account. Lists must remain separate. Check sold-out/archived items, removal and choosing an exact size/color before cart addition.
3. Export simple/SKU stock, edit quantities/thresholds and preview. Verify no stock changes until Apply. Check parent/selected-SKU stock and low-stock filters after applying. Reuse the same request/file, submit stale exports, change stock from another session, and inspect partial/conflict/review results. Never use actual sale inventory for fault injection.
4. Publish contact, banner, announcement, FAQ and policy content. Verify homepage/footer/help links and safe text, then try saving from a stale second editor. Change delivery pricing after opening checkout; it must ask for refreshed totals. Existing orders/invoices must retain their original amounts.
5. Repeat desktop/mobile/keyboard and invoice print checks on your target browser. Automated tests cover routes, persistence, state/ownership/failure handling and frontend VM/resource behavior. Live visual browser checks could not be completed in this build environment.

See [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md) for recorded tests. Public merchant settlement, external inbox placement, carrier automation, cloud media and production operations retain their previous environment-specific scope.
