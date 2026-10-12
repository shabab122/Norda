const test = require("node:test");
const assert = require("node:assert/strict");

const { escapeCsvCell, rowsToCsv } = require("../utils/csv");

test("escapeCsvCell quotes commas and doubles embedded quotes", () => {
  assert.equal(escapeCsvCell('Dhaka, "North"'), '"Dhaka, ""North"""');
});

test("escapeCsvCell neutralizes spreadsheet formulas", () => {
  assert.equal(escapeCsvCell("=HYPERLINK(\"bad\")"), '"\'=HYPERLINK(""bad"")"');
  assert.equal(escapeCsvCell("+100"), '"\'+100"');
});

test("rowsToCsv emits stable headers and CRLF rows", () => {
  assert.equal(
    rowsToCsv(
      [
        { key: "id", label: "Order ID" },
        { key: "total", label: "Total" },
      ],
      [{ id: "NOR-1", total: 120 }]
    ),
    '"Order ID","Total"\r\n"NOR-1","120"'
  );
});

test("CSV formula protection includes leading spaces and control characters", () => {
  assert.equal(escapeCsvCell("\t=1+1"), '"\'\t=1+1"');
  assert.equal(escapeCsvCell("  +100"), '"\'  +100"');
});
