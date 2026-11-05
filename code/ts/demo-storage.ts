import type { DemoSnapshot, Material } from "./types";

const key = "jp_estoque_demo_v02";
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
      )
        return snapshot;
    } catch {
      /* Invalid or unavailable test storage: use isolated fixtures. */
    }
    return {
      materials: structuredClone(seed),
      updated: "Dados demonstrativos",
    };
  },
  save(materials: Material[], updated: string): boolean {
    try {
      localStorage.setItem(key, JSON.stringify({ materials, updated }));
      return true;
    } catch {
      return false;
    }
  },
};
