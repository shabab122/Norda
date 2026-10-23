const httpError = require("./httpError");
module.exports = function readCsv(input) {
  if (typeof input !== "string" || !input.trim() || input.includes("\0") || Buffer.byteLength(input) > 300000) throw httpError(400, "Choose a UTF-8 catalog CSV up to 300 KB");
  const csv = input.replace(/^\uFEFF/, ""), records = []; let row = [], cell = "", quoted = false, closed = false;
  const end = () => { row.push(cell); if (row.some(v => v !== "")) records.push(row); if (records.length > 201) throw httpError(400, "Use up to 200 catalog rows"); row = []; cell = ""; closed = false; };
  for (let i = 0; i < csv.length; i++) { const c = csv[i]; if (quoted) { if (c === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; } if (closed && ![",", "\r", "\n"].includes(c)) throw httpError(400, "Unexpected text after a CSV quote"); if (c === '"') { if (cell || closed) throw httpError(400, "Invalid CSV quote"); quoted = true; } else if (c === ",") { row.push(cell); cell = ""; closed = false; } else if (["\r", "\n"].includes(c)) { if (c === "\r" && csv[i + 1] === "\n") i++; end(); } else cell += c; }
  if (quoted) throw httpError(400, "Unclosed CSV quote"); end(); return records;
};
