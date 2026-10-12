# Verification results — NORDA 2.1.0

Command: `npm run verify` from `server/`.

- JavaScript syntax: 86 files passed.
- Automated tests: 54 total; 53 passed; 0 failed; 1 skipped.
- Skipped: real MongoDB integration, because `NORDA_TEST_MONGO_URI` was not set and no MongoDB service was available.
- HTTP regression coverage includes all 17 pages, authenticated journeys, admin/ownership gates, uploads, COD, invoice/review flow, simulated gateway callbacks and initialization failure.
- HTML nesting/local-resource checks passed.
- Twelve SVG assets parsed successfully; CSS delimiters are balanced.
- Environment setup generates unique credentials and preserves an existing environment.

The HTTP/business tests use a test-only model adapter and controlled gateway responses. Real MongoDB persistence/transactions, public SSLCOMMERZ sandbox processing and browser/device visual QA must still be checked in the target environment. No claim of live financial acceptance is made.

Native database check: `NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27017' npm run test:integration`.
