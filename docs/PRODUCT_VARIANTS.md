# Product variants — NORDA 2.8

Products can now have up to **50 size/color options**, each with its own globally unique SKU, BDT price, optional discount, up to six photos, availability switch and independent stock. Existing simple products keep their current behavior. No catalog reseed, credential change or manual data migration is required.

## Create a product with options

1. Sign in as administrator and open **Products → New product**. Select its name, category and brand as before.
2. Enable **Use size / color variants**. Add one row per valid combination, for example `M / Forest` and `L / Cream`.
3. Give every row a unique SKU, price and stock. A size or a color is required; you may leave the other attribute blank. A discount must be lower than that option's regular price.
4. Upload variant photos or supply valid image URLs. With no variant photos, the product gallery supplies the fallback. Existing uploads still receive signature/type/size validation.
5. Save. The product's base price and total inventory are derived from its options; edit prices and stock on the individual options afterward.

Example inventory:

| SKU | Size | Color | Price | Discount | Stock |
|---|---|---|---|---|---|
| NOR-TEE-FOREST-M | M | Forest | 1,000 | 0 | 4 |
| NOR-TEE-CREAM-L | L | Cream | 1,800 | 1,500 | 3 |

These are instructions, not records automatically imported into your existing database. Your 24 sample products/photos and any custom catalog entries are left unchanged.

## Customer shopping

- Catalog cards show **From** pricing and **Choose options**. An unspecified variant cannot be quick-added as the base product.
- Product detail requires selecting the exact size/color combination. Its price, SKU, photo gallery, stock and quantity ceiling update together. Sold-out options remain visible but cannot be selected.
- Two options from one product remain separate cart lines. Adding the same option again increases only that line's quantity, within its own stock.
- Guest product/quantity/option selection survives login or registration once, with the existing 15-minute intent expiry and account guards.
- Cart and checkout re-read current option availability/prices. A deactivated/missing option blocks checkout and can be removed; the server never silently substitutes a different size/color.
- Orders and invoices snapshot option ID, SKU, size/color, original unit price and product/variant photo. Subsequent catalog edits cannot rewrite those purchases.

## Stock, cancellation, retry and returns

The option stock and product total change atomically in the same MongoDB document. Checkout, expiration/cancellation, same-order retry, payment-review stock recovery and returned-goods receipt all use the same helper. Restoring two M/Forest units increases only that option, not L/Cream. Whole-order return approval alone does not change inventory; physical receipt/restocking follows the 2.7 policy.

A price/description edit does not reset sold inventory. Variant edits use the expected stock for each existing row plus an inventory revision check, so a purchase between loading and saving produces a conflict instead of lost stock. Reopen the product before retrying an inventory conflict.

The administrator's product stock is total inventory across all retained options. Public available stock sums active options only. Retired options retain their stored stock and accept historical returns, but cannot fund a new checkout or expired-order reservation. Existing dashboard product-level low-stock reporting remains an aggregate; dedicated per-SKU alerts are future work.

## Compatibility and constraints

- SKU format: 3–64 uppercase letters, digits, underscore or hyphen; input is normalized to uppercase. SKU uniqueness applies across products and retired options.
- Size/color: up to 40 characters each; duplicate combinations are rejected within a product. Stock is a non-negative safe whole number; prices support at most two decimal places.
- Keep existing option IDs when editing. Existing SKU, size and color identify physical inventory and cannot be reassigned after creation; add a new option and retire the old one instead. Price, discount, photos, stock and availability remain editable. Existing options cannot be deleted or replaced with arbitrary IDs; deactivate them instead. Once a product has options, it cannot be switched back to simple mode.
- An existing simple product with any order history cannot be converted to variants. Create a new variant product instead. This preserves old base-product inventory and the stock required by cancellation/returns. Unordered simple products can be converted; old unselected cart lines then require reselection/removal.
- The existing seed/import is unchanged and does not convert historical products or reset quantities.
- One product remains one review target; reviews are still gated by delivered purchases. Exchanges, per-item returns and multi-warehouse stock are not introduced here.

## API additions

Existing `/api/products` create/update routes accept `variants`. Existing read/manage routes include the options. Public responses omit retired options but set `hasVariants:true` even if every option is retired; the product cannot fall back to base checkout. Catalog price filters/sorting use the cheapest active option, and keyword search includes SKU.

Example additional create fields, alongside the existing name/category/brand/base fields:

```json
{
  "price": 1000,
  "stock": 7,
  "variants": [
    {"sku":"NOR-TEE-FOREST-M","size":"M","color":"Forest","price":1000,"discountPrice":0,"stock":4,"images":[],"isActive":true},
    {"sku":"NOR-TEE-CREAM-L","size":"L","color":"Cream","price":1800,"discountPrice":1500,"stock":3,"images":[],"isActive":true}
  ]
}
```

For updates include all existing rows, their `_id` and `expectedStock` matching the loaded value. Use `isActive:false` to retire an option. A normal description-only update can omit variants. Direct base price/stock edits on a variant product are rejected.

Cart add:

```json
{"productId":"PRODUCT_ID","variantId":"OPTION_ID","quantity":2}
```

The cart item ID remains the identifier for quantity/removal routes. Cart reads expose selected `stock`, `price`, `image`, `sku`, `size`, `color`, `variantId` and `unavailable`. Clients must use selected stock, not combined product stock, for quantity controls. Checkout request keys now include the selected option in the browser's cart signature; server checkout replay retains the saved order as before.

## Acceptance

1. Create the two-option example and verify catalog From pricing, both option labels and SKU search.
2. Select each option and inspect its price, stock, quantity maximum and different uploaded photos. Check a sold-out and a retired option.
3. Signed out, select quantity two of one option and finish login/signup. Confirm that exact option/quantity arrives once in the cart.
4. Buy two M and one L, check the corresponding stock decrements, original invoice SKU/price snapshots and one confirmation email.
5. Cancel a separate unpaid order twice; expire/retry a real test order; approve/receive a paid delivered return. Check the same SKU's stock changes once through each path.
6. Edit an option in one tab while another customer purchases it. A stale stock save must conflict; a description-only edit must preserve inventory.
7. Keep an ordered product's old invoice open, edit price/photos/product description, then reload the invoice. Its original snapshot must remain unchanged.
8. Inspect at 360/768/1024/1440 px with keyboard and print an invoice containing variant labels.

Automated tests include exact-option stock races, stale admin stock, inactive restock, source rollback, expiry/retry, physical return receipt and snapshot preservation on standalone and replica-set MongoDB. Browser/device visual acceptance remains a target-environment check.
