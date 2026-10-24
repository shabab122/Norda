# NORDA 2.14.4 — final local review

Baseline: delivered **Norda-Main-v2.14.3-Local-Acceptance.zip**. The owner requested one final whole-project verification and fixes within the existing scope, then will manually inspect the ZIP. No additional feature is assigned.

Fixed guest recovery link creation: use the same trusted URL validation as account recovery before persisting a recovery intent. Invalid origins no longer create a stuck retry/cooldown record; SMTP failures remain private, remove their failed intent and emit a redacted diagnostic.

Fixed stale receipt printing: invoice, credit-note and exchange-adjustment buttons/browser-menu printing verify the current shopping identity. Changed/expired access clears old private document data/title and disables its Print control. Normal current-owner printing and existing business totals/layout remain intact.

Added actual HTTP/SMTP/received-link tests for verification, password reset and guest recovery, including session revocation, reuse rejection, invoice ownership, invalid origin and rejected-mail retry. The same scenarios pass on native standalone/replica MongoDB. Added six controlled-DOM receipt rendering/Print/isolation scenarios. Full existing regression suites and actual CLI/resource smoke pass.

Measured: **349 syntax files**, **620 default passes / 0 failures / 16 deliberate native skips**, **280 native passes per topology**, **0 audit vulnerabilities**, **61 pages / 148 HTTP targets**, all 200. Source preservation retains every original file, all 42 assets and all environment/config/seed bytes, with unchanged dependency selections. The owner database was not connected and no external email, booking or money movement occurred.

Visible desktop/mobile/keyboard/A4 output and an external inbox receipt could not be observed under the existing browser restriction/absent laptop SMTP settings. Local application SMTP protocol/link behavior was verified; the retained commands support the owner's manual receipt check. Existing SSLCOMMERZ/deployment/courier-cloud-backup activation stays deferred; reverse/statement operations retain the local demonstration. This is a final maintenance package for the fixed local scope, not a claim of zero possible defects or real-provider acceptance.

Suggested commit: `fix: harden guest recovery emails and receipt printing`
