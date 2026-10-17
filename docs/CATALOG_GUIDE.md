# NORDA 2.2 catalog and shopping guide

## Load the provided products

Keep your existing `server/.env` and uploads, start MongoDB, then run from the project root:

```bash
cd server
npm ci
npm run seed:catalog
npm run dev
```

Visit **http://localhost:5000**. This import does not create/change the administrator. For a fresh database use `npm run setup`, configure `.env`, and run `npm run seed` instead; admin credentials are private values in your own `.env`.

The import adds missing demo products, brands and categories and refreshes empty/known starter artwork. It preserves existing IDs, descriptions, prices, stock, custom photo galleries, archive state and purchases. Existing edited records therefore need not match sample defaults. Custom categories/products are retained.

## Included catalog

| Category | Two sample products |
|---|---|
| Electronics | Wireless Bluetooth Headphones; Smartwatch Fitness Tracker |
| Fashion | Men's Casual Denim Jacket; Women's Running Shoes |
| Home & Kitchen | Non-Stick Cookware Set; Electric Kettle 1.7L |
| Sports & Outdoors | Yoga Mat with Carry Strap; Adjustable Dumbbell Set |
| Books | The Art of Clean Code; Mystery Island |
| Beauty & Personal Care | Everyday Hydration Serum; Gentle Daily Cleanser |
| Bags & Travel | Everyday Commuter Backpack; Weekend Cabin Suitcase |
| Furniture & Lighting | Lounge Accent Chair; Arc Desk Lamp |
| Office & Stationery | Dotted Journal and Pen; Modular Desk Organizer |
| Toys & Games | Wooden Building Blocks; Family Board Game Set |
| Grocery & Pantry | Roasted Coffee Beans 250g; Everyday Loose Leaf Tea |
| Garden & Living | Ceramic Planter with Houseplant; Garden Hand Tool Set |

Each product has a unique AI photo, description, brand, price and stock. The organizer starts sold out intentionally; smartwatch, suitcase and garden tools demonstrate low stock. Normal-price and discounted examples are included. Existing stock is not reset by importing again.

Images are AI-generated and inventory/brands/prices are demonstration data. Fictional book covers and beauty/food packaging do not establish actual publications, ingredients or specifications. Replace details with verified merchant inventory before sales. Final prompts/method are recorded in `client/assets/products/photos/AI_ASSETS.json`.

## Test the customer flow

1. Signed out, open Shop. Browse categories, brands, price sorting and both catalog pages.
2. Open a stocked product, choose quantity 2 and click Add to cart. Sign in, or follow Create account and register. The original selection is added once and the cart opens.
3. Change quantity, remove an item, add products from other categories, reload, sign out and sign in again. Your account's cart should remain.
4. Try the sold-out organizer and quantity above stock. These should be rejected without changing inventory.
5. Enter delivery details, select Cash on delivery and place an order. Check My Orders, the printable invoice, totals and cleared cart.
6. As admin, cancel the unpaid order and check stock restores once. Alternatively progress a separate COD order through processing, shipped and delivered; delivery marks it paid and allows a verified review.
7. Online payment needs SSLCOMMERZ sandbox credentials and public callback URLs; follow `TESTING_GUIDE.md`.

The pre-login selection is one short-lived intent in the same tab, not a separate guest cart. It expires after 15 minutes. If stock changes or a request fails, the cart shows a notice; inspect it before adding again.

## Add your own products

Sign in as the existing admin and use **Admin → Categories / Brands / Products**. Create the category and brand first, then add a product with name, description, regular price, optional lower sale price, stock and up to six uploaded photos. Choose the first/cover photo and mark featured for the homepage. Save, then check the storefront.

Edit stock/prices in admin. Archive and restore products when availability changes. Routine merchant products do not require editing seed files.
