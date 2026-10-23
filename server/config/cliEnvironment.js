const path = require("node:path");
const dotenv = require("dotenv");

// Match server startup: supplied environment and the working .env take
// precedence; optional integration settings only fill absent values.
function loadCliEnvironment({
  baseFile = path.resolve(process.cwd(), ".env"),
  integrationsFile = path.resolve(__dirname, "..", ".env.integrations"),
  env = process.env,
} = {}) {
  dotenv.config({ path: baseFile, processEnv: env });
  dotenv.config({ path: integrationsFile, processEnv: env });
  return env;
}

module.exports = { loadCliEnvironment };
