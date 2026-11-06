import { it, expect } from "vitest";
import { safeCsvCell } from "../code/ts/csv-export";
it.each(["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "\t=1", "\r\n+1"])(
  "neutralizes spreadsheet formula prefix %j",
  (value) => expect(safeCsvCell(value)).toBe("\"'" + value + '"'),
);
it("quotes delimiters and text without changing stored values", () => {
  const value = 'Cabo; "ficticio"';
  expect(safeCsvCell(value)).toBe('"Cabo; ""ficticio"""');
  expect(value).toBe('Cabo; "ficticio"');
});
it("preserves nonformula codes and fractional quantities", () => {
  expect(safeCsvCell("0001")).toBe('"0001"');
  expect(safeCsvCell("1.250001")).toBe('"1.250001"');
});
