import { it, expect } from "vitest";
import {
  stockQuantity,
  stockProposed,
  stockCan,
  stockPermissions,
} from "../code/ts/stock-permissions";
it.each([
  ["1", "1.000000"],
  ["1,250001", "1.250001"],
  ["0001.2", "1.200000"],
  ["999999999999999999.999999", "999999999999999999.999999"],
])("normalizes exact decimal text %s", (v, expected) =>
  expect(stockQuantity(v)).toBe(expected),
);
it.each([
  "0",
  "-1",
  "1e3",
  "1.0000001",
  "1.234,56",
  "NaN",
  "1000000000000000000",
  "",
])("rejects invalid movement quantity %s", (v) =>
  expect(() => stockQuantity(v)).toThrow(),
);
it("subtracts per-contract amounts exactly without floating point", () =>
  expect(stockProposed("100", "30", "saida")).toBe("70.000000"));
it("adds fractions above JavaScript safe integer precision exactly", () =>
  expect(
    stockProposed("999999999999999998.999998", "1.000001", "entrada"),
  ).toBe("999999999999999999.999999"));
it("rejects insufficient balance and overflow", () => {
  expect(() => stockProposed("1", "2", "saida")).toThrow();
  expect(() =>
    stockProposed("999999999999999999.999999", "0.000001", "entrada"),
  ).toThrow();
});
it("does not infer frontend authority from job names", () => {
  expect(stockCan(["entrada.registrar"], "saida.registrar")).toBe(false);
  expect(Object.keys(stockPermissions)).toHaveLength(13);
});
