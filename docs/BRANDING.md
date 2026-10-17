# Norda identity and payment presentation — 2.4.2

The new identity pairs an AI-generated forest-green/terracotta N symbol with a live-text **Norda** wordmark. The complete name remains selectable and readable if an image or external font fails. The logo has no added CSS background tile in the admin workspace. The same shared markup is used in the storefront header/footer, payment page, invoice and administrator workspace.

## Assets and generation

- Mode: built-in imagegen tool; generated on 2026-10-18 in the user's Asia/Dhaka timezone.
- Original unmodified output: `client/assets/brand/norda-logo-original.png`.
- Optimized transparent mark: `client/assets/brand/norda-mark.webp` and `norda-mark.png`.
- Tab icon: pages use the existing transparent `client/assets/brand/norda-mark.png`. The old `norda-icon.png` path remains compatible and now contains the same transparent bytes; the off-white tile was removed in 2.4.2.
- Web preparation only trims transparent margins and resizes/encodes the supplied artwork. The original is retained. The wordmark is rendered in existing Space Grotesk typography with the existing fallback font stack; no paid font or extra dependency was added.
- Shared rendering: `brandLogoHtml()` in `client/js/layout.js`; dedicated styles in `client/css/branding.css`.

The old invoice used `NOR<span>DA</span>`, and a broad `.invoice-header span` rule shrank the second half of the brand into an invoice label. The new wordmark is one intact text element with explicit typography, and the label selector is restricted to the invoice document details. Header wrapping, long invoice IDs and long email/address values are handled at small widths and in print styles.

## Exact generation prompt

```text
Use case: logo-brand.
Asset type: the primary standalone brand symbol for the NORDA e-commerce website, to sit beside a separately typeset Norda wordmark.
Primary request: create one polished, distinctive, minimal geometric N monogram. Suggest a folded shopping ribbon or shopping-bag form subtly within the N without adding an obvious generic cart. The symbol must feel premium, welcoming, contemporary and memorable for a lifestyle store.
Style/medium: flat vector-like brand design, precise optical balance, clean bold edges, extremely simple silhouette readable at 32 pixels. No 3D, gradients, texture or shadows.
Color palette: deep forest green #244c3b as the main color, with one restrained warm terracotta #bf6042 accent at most; match a warm neutral storefront.
Scene/backdrop: genuinely transparent background, preserve alpha.
Composition/framing: one centered near-square mark taking roughly 75–80 percent of the canvas, generous even breathing room. A single finished symbol only.
Text: no wordmark, slogan, captions or lettering other than the N-shaped monogram itself.
Constraints: original identity; no existing brand imitation, no mockups, no stationery, no border, no watermark, no multiple variants.
```

## Payment wording

Customer headings, buttons, order summaries, result pages and invoices no longer repeat the word “Demo”. A compact **Test environment / simulated payment / no real charge** note remains near the payment and on the invoice. The large yellow invoice banner and payment badges were removed. Existing system-generated cancellation notes are normalized for display without altering stored orders or customer-written text.

Internal `demo` mode values, existing URLs/API contracts, financial safeguards, production disablement and revenue exclusion remain compatible. This is a presentation update; it does not turn the simulator into a real payment processor. Real merchant credentials/configuration are not changed.

The supplied screenshots and generated assets were inspected, and rendering behavior is covered by VM/static/HTTP checks. Actual browser/mobile/print visual acceptance remains a manual check in this managed environment.
