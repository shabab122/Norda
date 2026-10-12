# Norda v2

Norda is a full-stack e-commerce application for a Bangladesh-based catalog. Version 2 turns the original foundation into a complete, traceable commerce flow: administrators manage media, categories, brands, products, orders, invoices and reports; customers browse, register, maintain a delivery profile, use a stock-aware cart, check out, track purchases and review delivered products.

This revision is prepared on `feature/v2-complete-commerce-flow`. The `main` branch is intentionally unchanged until the project is ready for a final release.

## Stack

- Client: semantic HTML, responsive CSS and browser JavaScript; no build step
- API: Node.js 18+, Express and Mongoose
- Database: MongoDB
- Authentication: signed JWT in an HTTP-only cookie, with optional bearer-token mode for separated development clients
- Payments: cash on delivery and SSLCOMMERZ hosted checkout
- Product media: validated local image uploads with database metadata

## Delivered in v2

- Redesigned responsive storefront using BDT pricing and an original Norda hero visual
- Search, category, managed-brand, price and featured-product filters
- Server-priced cart with live quantity and stock validation
- Saved customer/shipping profile
- One invoice per order, with a printable customer view
- Separate order and payment lifecycles
- Server-side SSLCOMMERZ session initiation, callback/IPN processing and validation checks
- Inventory reservation during checkout and idempotent restoration when an unpaid order is cancelled
- Verified-purchase reviews, limited to delivered purchases
- Admin overview, category/brand/product management, order workflow, invoice register and protected CSV export
- Security headers, CORS allowlist, rate limiting, query sanitization, HTTP parameter pollution protection and constrained uploads
- Unit coverage for totals, address rules, status transitions, CSV safety, payment validation and general validators

## Quick start

Prerequisites: Node.js 18 or newer, npm and MongoDB.

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`. At minimum, set `MONGO_URI`, a unique `JWT_SECRET` of at least 32 characters (for example, generate one with `openssl rand -hex 32`), and an `ADMIN_PASSWORD` of at least 12 characters. Never commit `.env`.

```bash
npm run seed
npm test
npm run dev
```

Open [http://localhost:5000](http://localhost:5000). Express serves both the storefront and API, so that is the recommended local setup.

## Online payment setup

Cash on delivery works without gateway credentials. To enable SSLCOMMERZ sandbox checkout, set:

```dotenv
SERVER_URL=https://your-public-api.example
CLIENT_APP_URL=https://your-storefront.example
SSLCOMMERZ_STORE_ID=your_sandbox_store_id
SSLCOMMERZ_STORE_PASSWORD=your_sandbox_store_password
SSLCOMMERZ_IS_LIVE=false
```

`SERVER_URL` must be publicly reachable by the gateway for callbacks and IPN. Move to live mode only after sandbox acceptance testing, credential rotation and an operational review.

## Project map

```text
client/                 Storefront and admin workspace
server/app.js           Express composition and routes
server/controllers/     HTTP request handlers
server/services/        Order, invoice and payment rules
server/models/          MongoDB schemas
server/test/            Unit tests
docs/                   Requirements, API and test documentation
```

## Documentation

- [Project requirements](docs/PROJECT_REQUIREMENTS.md)
- [API reference](docs/API_REFERENCE.md)
- [Testing and release guide](docs/TESTING_GUIDE.md)
- [Architecture and data model](docs/ARCHITECTURE.md)
- [Visual asset notes](docs/ASSET_NOTES.md)
- [Changelog](CHANGELOG.md)

## Branch workflow

```bash
git switch feature/v2-complete-commerce-flow
git status
cd server && npm test
git push -u origin feature/v2-complete-commerce-flow
```

Open a pull request into `main` only after the acceptance checklist in `docs/TESTING_GUIDE.md` passes in the target environment. Do not place secrets, runtime uploads, `node_modules` or local `.env` files in version control.

