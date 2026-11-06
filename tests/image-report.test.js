// @vitest-environment node
import { it, expect } from "vitest";
import { summarizeImageScan } from "../scripts/operations/image-report.mjs";
const scan = (rules, results = []) => ({
  runs: [{ tool: { driver: { rules } }, results }],
});
it("image severity gate blocks critical findings independently of CLI success", () => {
  expect(
    summarizeImageScan(
      scan([
        { id: "CVE-FICTITIOUS", properties: { cvssV3_severity: "CRITICAL" } },
      ]),
    ).highCriticalGate,
  ).toBe("blocked");
});
it("empty scanner result means scoped absence, not universal security approval", () => {
  expect(summarizeImageScan(scan([])).highCriticalGate).toBe(
    "clear-in-scanner-scope",
  );
});
it("incomplete or unknown scanner data cannot silently pass", () => {
  expect(() => summarizeImageScan({})).toThrow();
  expect(() => summarizeImageScan(scan([], [{ruleId:'MISSING'}]))).toThrow();
  expect(() =>
    summarizeImageScan(
      scan([{ id: "FAKE", properties: { cvssV3_severity: "UNKNOWN" } }]),
    ),
  ).toThrow();
});
