import type { DemoSnapshot, Material } from "./types";
import type { ImportReport } from "./import-types";
import { toInventory } from "./inventory";
import { contracts } from "./demo-data";
import { readLocal } from "./local-state";

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
  load(_seed: Material[] = []): DemoSnapshot {
    let read = readLocal(key),
      origin = key;
    if (read.state === "missing") {
      read = readLocal("jp_estoque_demo_v01");
      origin = "jp_estoque_demo_v01";
    }
    const empty = {
      materials: [],
      updated: "Sem atualização registrada",
      importReports: [],
      state: read.state,
      source: origin,
    };
    if (read.state !== "ready") return empty;
    const snapshot =
      origin.endsWith("v01") && Array.isArray(read.value)
        ? { materials: read.value }
        : read.value;
    if (!snapshot || typeof snapshot !== "object")
      return { ...empty, state: "incompatible" };
    const value = snapshot as Record<string, unknown>;
    if (
      value.version !== undefined &&
      ![2, 3].includes(value.version as number)
    )
      return { ...empty, state: "incompatible" };
    if (!Array.isArray(value.materials) || !value.materials.every(isMaterial))
      return { ...empty, state: "incompatible" };
    if (
      value.importReports !== undefined &&
      (!Array.isArray(value.importReports) ||
        !value.importReports.every(isReport))
    )
      return { ...empty, state: "incompatible" };
    let legacyDate: string | null = null;
    if (origin.endsWith("v01")) {
      try {
        legacyDate = localStorage.getItem("jp_estoque_updated_v01");
      } catch {
        /* Keep the material records readable. */
      }
    }
    return {
      materials: value.materials,
      updated:
        typeof value.updated === "string" && value.updated.trim()
          ? value.updated
          : legacyDate || "Data não informada na base salva",
      importReports: (value.importReports as ImportReport[]) || [],
      state: value.materials.length ? "ready" : "empty",
      source: origin,
    };
  },
  save(
    materials: Material[],
    updated: string,
    importReports: ImportReport[] = [],
  ): boolean {
    try {
      const state = this.load().state;
      if (state === "incompatible" || state === "unavailable") return false;
      const read = readLocal(key);
      const previous =
        read.value && typeof read.value === "object" ? read.value : {};
      const inventory = toInventory(materials, contracts);
      localStorage.setItem(
        key,
        JSON.stringify({
          ...previous,
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
