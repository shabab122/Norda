const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "uploads"].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(filename);
    else if (entry.name.endsWith(".js")) files.push(filename);
  }
}
collect(path.join(__dirname, "..")); collect(path.join(__dirname, "..", "..", "client"));
for (const filename of files) {
  const result = spawnSync(process.execPath, ["--check", filename], { encoding: "utf8" });
  if (result.status) { console.error(result.stderr); process.exit(1); }
}
console.log(`Syntax passed for ${files.length} JavaScript files.`);
