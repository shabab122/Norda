const protectSpreadsheetCell = (value) => {
  const cell = value === null || value === undefined ? "" : String(value);
  return /^[\s\uFEFF]*[=+\-@]/.test(cell) ? "'" + cell : cell;
};

const escapeCsvCell = (value) => {
  const protectedValue = protectSpreadsheetCell(value);
  return '"' + protectedValue.replace(/"/g, '""') + '"';
};

const rowsToCsv = (headers, rows) => {
  const firstLine = headers.map((header) => escapeCsvCell(header.label)).join(",");
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvCell(row[header.key])).join(",")
  );
  return [firstLine, ...dataLines].join("\r\n");
};

module.exports = { escapeCsvCell, rowsToCsv };
