# NORDA 2.4.1 simulated payment guide

The checkout now provides a local simulator for **Mobile Banking/bKash** and **Card/Bank**. This is a NORDA demonstration, separate from the real SSLCOMMERZ hosted checkout. No money is transferred, and the simulator never requests a card number, account password, PIN or OTP.

## Start with your existing installation

Preserve `server/.env`, its working MongoDB URI and all existing credentials/uploads. With the usual development environment, no new configuration is needed. Demo is enabled outside production unless `PAYMENT_DEMO_ENABLED=false`; production always disables it. MongoDB must still be running because orders, invoices and stock are persisted.

```bash
cd server
npm ci
npm run acceptance:preflight
npm run verify
npm run dev
```

Open http://localhost:5000. Add products, sign in and checkout. Select either demo payment category, confirm delivery details, then choose an outcome on the demo page. Check **My Orders** and **Open invoice** afterwards. Existing COD and real-provider configuration are retained. The read-only preflight reports simulator availability separately from real merchant setup.

## Recorded outcomes

| Action | Payment / invoice | Order | Stock |
|---|---|---|---|
| Start or resume demo | Initiated / pending | Pending | Reserved once |
| Simulate success | Paid / paid, clearly simulated | Processing | Reservation retained |
| Simulate failure | Failed / failed | Cancelled | Restored once |
| Cancel demo | Cancelled / cancelled | Cancelled | Restored once |
| Repeat the same outcome | Original state | Original state | No extra change |
| Change a finished outcome | Rejected with 409 | Original state | No extra change |

All simulated orders/invoices include a compact no-charge note in customer and admin views, including printed invoices and order CSVs. Simulated payments are excluded from the administrator's revenue total. The simulator uses the configured development database's inventory; use a separate development database for demonstrations alongside a real store.

Leaving the page does not cancel a reservation automatically. My Orders offers **Resume or cancel payment** until completion/cancellation. An administrator can also cancel an unpaid demo. Automatic reservation expiry is future work. If initiation was interrupted after creating an order, the customer can resume from My Orders; a new cart is not consumed.

## API boundaries

| Endpoint | Use |
|---|---|
| `GET /api/payments/config` | Reports demo availability, channels and separate provider configuration |
| `POST /api/payments/demo/initiate` | Signed-in owner; shipping address, checkout key and `mobile_banking` or `card_bank` |
| `GET /api/payments/demo/:orderId` | Read-only owner-scoped session and recorded amount |
| `POST /api/payments/demo/:orderId/complete` | Owner-scoped outcome: `success`, `failure` or `cancel` |

Amounts and stock come from the server. Client-supplied amounts or payment statuses are not trusted. Another account and the demo endpoints cannot pay a genuine COD/SSLCOMMERZ order. Public SSLCOMMERZ callbacks cannot modify demo transactions. Order locks, transaction support and compensating writes protect repeats and handled failures; a replica set remains necessary for atomic recovery across a process crash/database outage.

## Real SSLCOMMERZ remains separate

The screenshot's disabled provider choice came from the existing `isConfigured()` check: merchant ID/password and valid server/client URLs must all be configured. The previous build had no independent local simulator, so unconfigured checkout offered COD only. This release adds that simulator without changing the real integration's requirements or existing credentials.

Real SSLCOMMERZ uses the existing `/sslcommerz/*` endpoints, server validation and configured merchant account. Its option appears only when configuration checks pass. That flag does not prove the provider accepts the credentials or can reach the callbacks. A successful local simulation does not establish real SSLCOMMERZ or bKash connectivity. Public provider acceptance still uses `ACCEPTANCE_CHECKLIST.md`.

Official provider reference: https://developer.sslcommerz.com/doc/v4/ . Local demo behavior is implemented and tested by this project, rather than supplied by the provider.

Version 2.4.1 uses clean payment headings and removes repeated Demo badges. The payment environment and invoice still disclose that no real money was transferred. See `BRANDING.md` for the logo and styling changes.
