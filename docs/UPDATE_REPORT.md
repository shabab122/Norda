# NORDA 2.13.1 update report

Built directly from the delivered v2.13.0. Fixes guest payment/session recovery, private-response identity guards, failed form retry and appointment errors. Refines new-screen typography, responsive actions/forms, visible focus, pickup navigation and branded receipt print rules.

Updates only Multer 2.4.0 → 2.5.0 and transitive body-parser 1.20.8 → 1.20.9 for newly reviewed DoS advisories. Other dependencies, backend business source, credential/config/seed bytes and all 42 assets remain intact. All 470 baseline files are retained; no owner database/provider was used. Keep newer laptop settings and uploads; no setup/reseed/manual migration is needed.

Verification: 309 JS files, 527 default passes/0 failures/14 intentional native skips, 234 native passes per topology, zero current audit vulnerabilities, and all 56 pages/135 actual HTTP page-resource targets served. Twenty-seven new frontend/security checks are included in the default count.

Visible device/print, real merchant/provider and target-host acceptance remain unverified for the concrete access/configuration reasons in [FINAL_RELEASE.md](FINAL_RELEASE.md). See [measured verification](VERIFICATION_RESULTS.md) and [source preservation](SOURCE_PRESERVATION.md).

Suggested commit: `fix: harden guest checkout, security and release UI`.
