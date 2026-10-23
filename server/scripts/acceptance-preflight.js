const mongoose = require("mongoose");

function isPublicHttps(value) {
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !["localhost", "::1", "[::1]"].includes(host)
      && !/^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) && !host.endsWith(".localhost") && host.includes(".");
  } catch { return false; }
}
function describeConfig(env) {
  let databaseAddress = "Not configured";
  try { const uri = new URL(env.MONGO_URI); databaseAddress = uri.hostname + (uri.port ? ":" + uri.port : "") + uri.pathname; } catch { if (env.MONGO_URI) databaseAddress = "Configured (host display unavailable)"; }
  const port = Number(env.PORT) || 5000;
  return {
    databaseAddress,
    databaseConfigured: Boolean(env.MONGO_URI),
    port,
    portAllowed: ![3000, 3002].includes(port),
    secretConfigured: Boolean(env.JWT_SECRET && env.JWT_SECRET.length >= 32 && !env.JWT_SECRET.startsWith("replace_")),
    sandboxMode: env.SSLCOMMERZ_IS_LIVE !== "true",
    demoEnabled: env.NODE_ENV !== "production" && env.PAYMENT_DEMO_ENABLED !== "false",
    gatewayCredentialsPresent: Boolean(env.SSLCOMMERZ_STORE_ID?.trim() && env.SSLCOMMERZ_STORE_PASSWORD?.trim()),
    publicCallbackFormat: isPublicHttps(env.SERVER_URL) && isPublicHttps(env.CLIENT_APP_URL),
  };
}
async function main() {
  require("../config/cliEnvironment").loadCliEnvironment();
  const config = describeConfig(process.env);
  console.log("NORDA acceptance preflight — read only; no accounts, credentials or inventory are changed.");
  console.log("MongoDB target:", config.databaseAddress);
  console.log("Application port:", config.port, config.portAllowed ? "(allowed)" : "(reserved for GitStack/Gitea)");
  console.log("JWT secret:", config.secretConfigured ? "configured" : "missing or placeholder; keep your existing working secret");
  if (!config.databaseConfigured || !config.portAllowed || !config.secretConfigured) process.exitCode = 1;
  if (config.databaseConfigured) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      console.log("MongoDB connection: PASS");
      console.log("Write topology:", hello.setName || hello.msg === "isdbgrid" ? "transactions supported" : "standalone; handled-error compensation");
      for (const [label, collection] of [["Products", "products"], ["Categories", "categories"], ["Administrator accounts", "users"]]) {
        console.log(label + ":", await mongoose.connection.db.collection(collection).countDocuments(collection === "users" ? { role: "admin" } : {}));
      }
    } catch {
      console.error("MongoDB connection: FAIL. Check that MongoDB is running and MONGO_URI uses its actual host port (for example 27018 when Docker maps 27018 to 27017).");
      process.exitCode = 1;
    } finally { await mongoose.disconnect(); }
  }
  console.log("Local demo payments:", config.demoEnabled ? "enabled; no merchant credentials needed" : "disabled");
  console.log("SSLCOMMERZ mode:", config.sandboxMode ? "sandbox" : "LIVE — use your sandbox environment for acceptance");
  console.log("Gateway credentials:", config.gatewayCredentialsPresent ? "present (values hidden)" : "not configured; the provider option is hidden; local demo/COD are separate");
  console.log("Public HTTPS callback/client URL format:", config.publicCallbackFormat ? "configured; internet reachability is not yet verified" : "not ready for public gateway callbacks");
  console.log("Public SSLCOMMERZ acceptance: PENDING until the real sandbox success/failure/cancel/IPN matrix is completed.");
  console.log("Browser/mobile/keyboard/print acceptance: manual checklist in docs/ACCEPTANCE_CHECKLIST.md.");
}
if (require.main === module) main().catch(() => { console.error("Preflight could not finish. Review your local configuration."); process.exitCode = 1; });
module.exports = { describeConfig, isPublicHttps };
