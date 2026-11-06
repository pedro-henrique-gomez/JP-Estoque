import type { DemoSnapshot, Material } from "./types";
import type { ImportReport } from "./import-types";
import { toInventory } from "./inventory";
import { contracts } from "./demo-data";

const key = "jp_estoque_demo_v02";
function isReport(value: unknown): value is ImportReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    ["id", "date", "fileName", "sheetName", "actorId", "summary"].every(
      (key) => typeof report[key] === "string",
    ) &&
    [
      "headerRow",
      "added",
      "updated",
      "ignored",
      "errors",
      "warnings",
      "productsCreated",
      "productsUpdated",
    ].every(
      (key) =>
        typeof report[key] === "number" &&
        Number.isFinite(report[key]) &&
        (report[key] as number) >= 0,
    ) &&
    Array.isArray(report.lines) &&
    report.lines.every(
      (line) =>
        line &&
        typeof line === "object" &&
        typeof line.line === "number" &&
        typeof line.code === "string" &&
        ["success", "ignored", "error"].includes(line.status) &&
        ["add", "update", "ignore"].includes(line.action) &&
        Array.isArray(line.messages) &&
        line.messages.every((message: unknown) => typeof message === "string"),
    )
  );
}
function isMaterial(value: unknown): value is Material {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "number" &&
    Number.isFinite(row.id) &&
    typeof row.qty === "number" &&
    Number.isFinite(row.qty) &&
    row.qty >= 0 &&
    [
      "code",
      "name",
      "category",
      "contract",
      "unit",
      "location",
      "brand",
      "model",
      "supplier",
      "oc",
      "nf",
    ].every((field) => typeof row[field] === "string")
  );
}
/** Only a test adapter. Never store identities, sessions or production records here. */
export const demoStorage = {
  load(seed: Material[]): DemoSnapshot {
    try {
      const raw = localStorage.getItem(key);
      const snapshot = raw
        ? JSON.parse(raw)
        : {
            materials: JSON.parse(
              localStorage.getItem("jp_estoque_demo_v01") || "null",
            ),
            updated:
              localStorage.getItem("jp_estoque_updated_v01") ||
              "Dados demonstrativos",
          };
      if (
        Array.isArray(snapshot.materials) &&
        snapshot.materials.every(isMaterial) &&
        typeof snapshot.updated === "string"
      ) {
        const importReports = Array.isArray(snapshot.importReports)
          ? snapshot.importReports.filter(isReport)
          : [];
        return {
          materials: snapshot.materials,
          updated: snapshot.updated,
          importReports,
        };
      }
    } catch {
      /* Invalid or unavailable test storage: use isolated fixtures. */
    }
    return {
      materials: structuredClone(seed),
      updated: "Dados demonstrativos",
    };
  },
  save(
    materials: Material[],
    updated: string,
    importReports: ImportReport[] = [],
  ): boolean {
    try {
      const inventory = toInventory(materials, contracts);
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 3,
          ...inventory,
          materials,
          updated,
          importReports,
        }),
      );
      return true;
    } catch {
      return false;
    }
  },
};
