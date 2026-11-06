export const onlineImportFields = {
  code: "Código",
  description: "Descrição",
  unit: "Unidade",
  quantity: "Quantidade",
  contract: "Contrato",
  location: "Localização (código)",
  supplier: "Fornecedor (nome)",
  oc: "OC existente",
  nf: "NF existente",
  category: "Categoria",
  manufacturer: "Fabricante",
  model: "Modelo",
} as const;
export type OnlineImportField = keyof typeof onlineImportFields;
export interface ImportCell {
  text: string;
  error?: string;
}
export interface OnlineWorkbook {
  fileName: string;
  sha256: string;
  sheets: { name: string; rows: ImportCell[][] }[];
}
export interface ImportLimits {
  bytes: number;
  rows: number;
  columns: number;
  sheets: number;
  expanded: number;
  timeout: number;
}
export const hardImportLimits: ImportLimits = {
  bytes: 2 * 1024 * 1024,
  rows: 500,
  columns: 50,
  sheets: 10,
  expanded: 8 * 1024 * 1024,
  timeout: 8000,
};
export function onlineImportLimits(
  env: Record<string, unknown> = {},
): ImportLimits {
  const limits = { ...hardImportLimits };
  for (const key of ["bytes", "rows", "columns"] as const) {
    const value = env[`VITE_JP_IMPORT_MAX_${key.toUpperCase()}`];
    if (value !== undefined && value !== "") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > hardImportLimits[key])
        throw Error("Limite de importação inválido: " + key);
      limits[key] = n;
    }
  }
  return limits;
}
export interface ImportSourceRow
  extends Partial<Record<OnlineImportField, string>> {
  line: number;
  action: "ignore" | "add" | "replace";
  discard: boolean;
  decided: boolean;
  cell_error?: string;
}
export interface OnlineImportRequest {
  destination: string;
  file_name: string;
  file_sha256: string;
  sheet_name: string;
  rows: ImportSourceRow[];
}
export interface ImportPlannedRow {
  line: number;
  code: string;
  description: string;
  unit: string;
  quantity: string;
  action: "ignore" | "add" | "replace";
  discard: boolean;
  product_id: string | null;
  balance_id: string | null;
  errors: string[];
  warnings: string[];
  before: {
    quantity: string;
    location_id: string | null;
    supplier_id: string | null;
  } | null;
}
export interface ImportReceipt {
  batch_id: string;
  actor: string;
  file_name: string;
  sheet_name: string;
  date: string;
  applied: number;
  ignored: number;
  reused: boolean;
  rows: ImportPlannedRow[];
}
export interface OnlineImportPreview {
  token: string;
  expires: number;
  destination: string;
  contract: string;
  invalid: number;
  applied: number;
  ready: boolean;
  fingerprint: string;
  duplicate: ImportReceipt | null;
  rows: ImportPlannedRow[];
}
