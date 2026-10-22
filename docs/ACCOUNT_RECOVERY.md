# Account recovery, email verification and delivery addresses

> Version 2.10 extension: see [Management, notifications, devices and item returns](MANAGEMENT_RETURNS.md) for scoped staff access, device revocation, return/refund email preferences, delivery outcomes, selected-item returns/exchanges and credit notes. Earlier workflows below remain available.

Introduced in **NORDA 2.5.0**. This update extends the existing Express/Mongoose authentication and checkout flows. No account, password, role, JWT secret, MongoDB URI or payment credential is replaced. Existing accounts and order history require no migration or reseed.

## Update an existing installation

Stop the previous NORDA process, copy the updated source while retaining your repository history, current `server/.env` and uploaded images, then run:

```bash
cd server
npm ci
npm run verify
npm run dev
```

Open `http://localhost:5000`. Keep your working MongoDB port, including `27018` if that is your existing Docker mapping. Ports `3000` and `3002` remain reserved for GitStack/Gitea.

## Customer flows

| Feature | Steps | Result |
|---|---|---|
| Forgot password | Sign in → Forgot your password → enter account email | A one-use reset link is requested; existing and absent accounts receive the same public response |
| Reset password | Open the email link → enter and confirm a new password | Password changes atomically, previous sessions are invalidated, and normal sign-in is required |
| Verify email | Open the registration email → click Verify email address | The account's verification timestamp is recorded; simply visiting the page does not consume the link |
| Resend verification | Profile → Email verification → Send verification email | Sends to the signed-in account's current email; already verified accounts show their status |
| Address book | Profile → Delivery addresses | Add, edit or delete up to 10 labeled addresses and choose a default |
| Saved-address checkout | Checkout → Saved delivery address | Pre-fills delivery fields; changes to those fields apply to the current order |

Reset links expire after **30 minutes**. Verification links expire after **24 hours**. Requesting a fresh eligible link invalidates the previous link for that purpose. Both are single use, including simultaneous submissions.

New passwords follow the existing policy: at least 8 characters and at most 72 UTF-8 bytes. Reset requires matching confirmation. An authenticated password change still requires the current password and now also invalidates pending reset links.

**Compatibility policy:** email verification is visible and functional, but does not block existing login, administrator access, cart or checkout. No existing account is silently marked verified. Mandatory verification before purchases can be introduced as a separate policy change later.

## Local email preview

No SMTP host was present in the supplied configuration. Outside production, `MAIL_TRANSPORT=auto` therefore saves account messages privately to `server/.local-mail/`. No real email is sent in this mode. The directory is not web-served, is excluded from Git and distributions, and uses restricted permissions. Raw action tokens appear only in the recipient's email or this private development preview; APIs never return them.

1. Keep NORDA running in one terminal.
2. Request a reset or verification email on the website.
3. Open another terminal in `server/` and run:

```bash
npm run mail:check
npm run mail:preview -- your-account@example.com
```

Open the printed link for your own account. The command shows up to five recent messages; links from a previous request may already have been replaced or used. Do not share the output. Request another link after one minute if needed. Previews older than a day are excluded, and local storage is bounded to recent messages.

The email preview is a development tool. A store's customers need configured SMTP to receive links in their inboxes.

## SMTP delivery

Add your email provider's settings to your private `server/.env`. Keep all existing MongoDB, JWT, admin and payment settings unchanged. These settings are also documented in `.env.example`:

```dotenv
MAIL_TRANSPORT=smtp
MAIL_FROM="Norda <your-verified-sender@example.com>"
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
```

Use the sender address and credentials issued by your provider. On port **587**, `SMTP_SECURE=false` allows STARTTLS; on **465**, use `SMTP_SECURE=true` for TLS from the connection start. Authentication can be omitted only for a mail relay that supports that configuration. Production requires TLS and valid certificates; certificate verification is never disabled by the application.

Restart NORDA and run:

```bash
npm run mail:check
```

This checks connection, TLS where applicable and authentication. Then request a verification email from your profile and check the recipient inbox/spam folder. A connection check does not prove sender acceptance or inbox delivery.

`MAIL_TRANSPORT` accepts `auto`, `smtp` or `file`. `auto` chooses SMTP when `SMTP_HOST` is set; otherwise it chooses private development files. In production, file mode is rejected and the configured `CLIENT_APP_URL` must use HTTPS. Configure `CLIENT_APP_URL` as your actual storefront origin so email links point to the correct site. Links are built from configuration rather than the request's Host header.

Delivery failure does not undo a successfully created registration or a completed password reset. An unsuccessful link delivery removes only that failed pending link, allowing a new request. Public forgot-password responses remain generic; SMTP exceptions are logged without provider credentials or message contents. Profile resend reports delivery failure to the signed-in account. A reset notification is best effort after the password change; a failed notification never restores the old password.

SMTP sends for anonymous recovery requests run outside the response path to reduce account-existence timing differences. A durable email queue with automatic delivery retries is a future operational enhancement.

## Address compatibility and checkout

- Labels such as Home, Office or Family identify saved addresses. Street, city, district, postal code and a valid phone number are required. Country defaults to Bangladesh; apartment/landmark is optional.
- The first saved address becomes the default. Choosing another default preserves every other entry. Deleting the default selects the first remaining entry; deleting the last leaves an empty book.
- The previous single delivery profile appears as a **Saved address** entry without changing the database on reads. Its first address-book mutation assigns a permanent ID and preserves the original fields. An incomplete old entry can be completed through Edit.
- Checkout initially uses the default entry. Selecting another saved address or editing order fields does not rewrite the book's entries or preferred ID. With no book, checkout retains its earlier behavior of keeping the latest delivery profile for the next order.
- Orders and invoices contain their own shipping snapshots. Editing/deleting a saved address never rewrites historical delivery details.
- Address operations are restricted to the authenticated owner. Concurrent writes share a database-backed lock so the limit and one-default rule remain consistent across API processes.
- Existing clients can still use `profile.address`. When a book exists, that field resolves to its default, and a legacy `PUT /auth/profile` address update updates that default entry. The new profile form saves contact/security separately to avoid submitting stale addresses.

## API contract

All paths below start with `/api`; use JSON and the existing session cookie. Public link endpoints do not automatically sign a user in.

| Method | Path | Body | Access |
|---|---|---|---|
| POST | `/auth/forgot-password` | `{ "email": "buyer@example.com" }` | Public |
| POST | `/auth/reset-password` | `{ "token": "64-hex-character-token", "password": "NewPassword123", "confirmPassword": "NewPassword123" }` | Public |
| POST | `/auth/send-verification` | `{}` | Authenticated |
| POST | `/auth/verify-email` | `{ "token": "64-hex-character-token" }` | Public |
| GET | `/auth/addresses` | — | Authenticated owner |
| POST | `/auth/addresses` | Complete address and `label`; optional boolean `isDefault` | Authenticated owner |
| PUT | `/auth/addresses/:id` | Complete replacement address and `label`; optional boolean `isDefault` | Authenticated owner |
| PUT | `/auth/addresses/:id/default` | `{}` | Authenticated owner |
| DELETE | `/auth/addresses/:id` | — | Authenticated owner |

Address example:

```json
{
  "label": "Home",
  "line1": "12 Lake Road",
  "line2": "Apartment 4B",
  "city": "Dhaka",
  "district": "Dhaka",
  "postCode": "1205",
  "country": "Bangladesh",
  "phone": "+8801712345678",
  "isDefault": true
}
```

Profile/session responses retain `_id`, `name`, `email`, `role` and `address`, adding `addresses`, `defaultAddressId`, `emailVerified` and `emailVerifiedAt`. Each address has its own `_id`, `label`, delivery fields and calculated `isDefault`. Address mutation responses return the refreshed profile; `GET /auth/addresses` returns the list, default ID and `limit: 10`.

Account email requests share a limit of **10 per IP per 15 minutes**, with a **60-second per-account/per-purpose cooldown**. Token confirmation/reset attempts share a limit of **30 per IP per 15 minutes**. Existing API/login limits still apply. Errors use the existing `{ "message": "..." }` contract. Foreign or missing address IDs return 404; concurrent address operations can return 409 and can be retried after refreshing.

## Verification and manual acceptance

Automated results are in [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md). Tests cover real Express requests, MongoDB persistence on both supported topologies, concurrent token/address operations, expiry/replay, credential/session behavior, legacy data, snapshot preservation, injected mail/database failures, actual SMTP protocol delivery to a local listener, frontend handlers and asset links.

Before sharing the installation, complete these checks in your browser:

1. Request a reset, open its email, enter matching new passwords, sign in again, and confirm the old password/session fails.
2. Verify an account; reopen the same link and confirm that it cannot be reused. Check verified status in Profile.
3. Add Home and Office, change the default, edit and delete an entry, then choose a saved address at checkout.
4. Place a COD/test order, edit/delete the original saved address, and confirm the old invoice still shows its recorded address.
5. Check keyboard navigation, form error messages and small-screen layouts. Repeat the email flow with your actual SMTP provider and recipient inbox.

Actual browser/device rendering and external inbox delivery were not certified in this workspace. The existing public SSLCOMMERZ acceptance checks remain separate; this update does not change payment or fulfillment behavior.

Implementation references: [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) and [Nodemailer SMTP transport](https://nodemailer.com/smtp).
