# Norda 2.11.0

Built directly from `Norda-Main-v2.10.0.zip`. Adds eCourier booking/package charges/labels/tracking and exception review, product SEO/sitemaps/structured data, optional Cloudinary storage/migration/cleanup, encrypted BSON/media backup and isolated restore, monitoring and optional alerts.

The original `.env`, database/JWT/admin/SMTP/gateway credentials, dependency versions, catalog and brand images are retained. Preserve your working laptop `.env`, optional private integration file and uploads when copying source. No reseed or manual migration is required. New collections/indexes initialize at startup.

New providers require the owner's credentials; automatic booking, scheduled backups and alerts are disabled by default. See [the production guide](docs/PRODUCTION_TOOLS.md) and [recorded verification](docs/VERIFICATION_RESULTS.md). Real merchant/cloud/alert acceptance and public deployment checks remain environment-specific.
