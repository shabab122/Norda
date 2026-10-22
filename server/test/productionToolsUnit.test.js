const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const seo = require("../services/seoService");
const backup = require("../services/backupService");
const courier = require("../services/courierService");
test("SEO escapes script terminators and publishes only real prices/ratings and configured canonicals", () => {
  const id = "a".repeat(24), data = seo.productMetadata({ _id: id, name: 'A </script><script>alert(1)</script> "item"', description: "A useful product", stock: 0, price: 1000, discountPrice: 900, images: ["/assets/photo.png"], ratingAverage: 4.5, ratingCount: 2 }, "https://norda.example");
  assert.equal(data.data.offers.price, "900.00"); assert.equal(data.data.offers.availability, "https://schema.org/OutOfStock"); assert.equal(data.data.aggregateRating.reviewCount, 2);
  const html = seo.injectHead('<html><head><title>Old</title><meta name="description" content="Old" /></head></html>', data, "test-nonce"); const json = html.match(/application\/ld\+json[^>]*>([^]*?)<\/script>/)[1]; assert.ok(!json.includes("</script>")); assert.equal(JSON.parse(json).name, data.data.name); assert.equal((html.match(/<title>/g) || []).length, 1);
  const variants = seo.productMetadata({ _id: id, name: "Shirt", variants: [{ isActive: true, price: 1000, discountPrice: 800, stock: 1 }, { isActive: true, price: 1200, stock: 0 }, { isActive: false, price: 1, stock: 10 }] }, "https://norda.example"); assert.equal(variants.data.offers.lowPrice, "800.00"); assert.equal(variants.data.offers.highPrice, "1200.00"); assert.equal(variants.data.offers.offerCount, 2); assert.equal(variants.data.aggregateRating, undefined);
  assert.equal(seo.indexable("http://localhost:5000"), false);
});
test("Backup frame paths reject traversal, duplicate roots and unbounded sizes", () => {
  const e = { path: "media/local/image.png", size: 10, sha256: "a".repeat(64) }; assert.equal(backup.safeEntry(e), true);
  for (const p of ["../server/.env", "/etc/passwd", "media/local/../../secret", "media//image.png", "media/local/./image.png", "https://other.example/image.png"]) assert.equal(backup.safeEntry({ ...e, path: p }), false);
  assert.equal(backup.safeEntry({ ...e, size: -1 }), false); assert.equal(backup.safeEntry({ ...e, size: Infinity }), false);
});
test("Encrypted backup verification checks auth tag, SHA-256, entry bounds and trailing data", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "norda-backup-unit-")); const key = crypto.randomBytes(32); process.env.BACKUP_ENCRYPTION_KEY = key.toString("base64");
  try {
    await fs.mkdir(path.join(dir, "media/local"), { recursive: true }); const bytes = Buffer.from("a reproducible media fixture"); await fs.writeFile(path.join(dir, "media/local/a.png"), bytes); const entry = { path: "media/local/a.png", kind: "media", size: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") }, manifest = { format: 1, collections: [], entries: [entry] };
    const good = path.join(dir, "good.ndb"); await backup.encryptBundle(dir, manifest, good, key); assert.deepEqual(await backup.verifyBackup(good), { verified: true, collections: 0, documents: 0, mediaFiles: 1 });
    const badHash = path.join(dir, "bad-hash.ndb"); await backup.encryptBundle(dir, { ...manifest, entries: [{ ...entry, sha256: "b".repeat(64) }] }, badHash, key); await assert.rejects(backup.verifyBackup(badHash), /checksum/);
    const badPath = path.join(dir, "bad-path.ndb"); await fs.writeFile(path.join(dir, "unsafe"), bytes); await backup.encryptBundle(dir, { ...manifest, entries: [{ ...entry, path: "unsafe" }] }, badPath, key); await assert.rejects(backup.verifyBackup(badPath), /manifest/);
    const corrupt = path.join(dir, "bad-tag.ndb"), data = await fs.readFile(good); data[data.length - 1] ^= 1; await fs.writeFile(corrupt, data); await assert.rejects(backup.verifyBackup(corrupt), /authentication/);
  } finally { delete process.env.BACKUP_ENCRYPTION_KEY; await fs.rm(dir, { recursive: true, force: true }); }
});
test("Text indexes are restored using logical text fields, weights and language settings", () => {
  const spec = backup.indexSpecification({ v: 2, name: "search_text", key: { category: 1, _fts: "text", _ftsx: 1 }, weights: { name: 5, description: 1 }, default_language: "english", textIndexVersion: 3 }); assert.deepEqual(spec.key, { category: 1, name: "text", description: "text" }); assert.equal(spec.weights.name, 5); assert.equal(spec.v, undefined);
});
test("Partial/cancelled/unknown courier statuses never mean full delivered payment", () => {
  assert.equal(courier.normalizedStatus("Delivered"), "delivered"); assert.equal(courier.normalizedStatus("In Transit"), "in_transit");
  for (const status of ["Partially Delivered", "Cancelled", "Returned", "Unknown", "Delivery Failed"]) assert.equal(courier.normalizedStatus(status), "exception");
});
