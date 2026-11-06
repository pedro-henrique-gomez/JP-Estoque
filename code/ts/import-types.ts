import type { Contract, Material, User } from "./types";

export const importFields = [
  "code",
  "name",
  "unit",
  "contract",
  "qty",
  "category",
  "brand",
  "model",
  "location",
  "supplier",
  "oc",
  "nf",
] as const;
export type ImportField = (typeof importFields)[number];
export type ColumnMapping = Partial<Record<ImportField, number>>;
export type CellValue = string | number | boolean | null | { error: string };
export interface WorkbookSheet {
  name: string;
  rows: CellValue[][];
}
export interface Spreadsheet {
  fileName: string;
  sheets: WorkbookSheet[];
}
export interface GlobalProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  brand: string;
  model: string;
}
export interface ContractBalance {
  id: number;
  productId: string;
  contractId: string;
  qty: number;
  location: string;
  supplier: string;
  oc: string;
  nf: string;
}
export interface Inventory {
  products: GlobalProduct[];
  balances: ContractBalance[];
}
export type ImportAction = "add" | "update" | "ignore";
export interface ImportRow {
  line: number;
  material: Material;
  existingId?: number;
  productExists: boolean;
  errors: string[];
  warnings: string[];
  action: ImportAction;
  globalChanges: string[];
  affectedContracts: number;
}
export interface ImportPlan {
  fileName: string;
  sheetName: string;
  headerRow: number;
  rows: ImportRow[];
  fingerprint: string;
  mapping: ColumnMapping;
  source: WorkbookSheet;
}
export interface ImportResultLine {
  line: number;
  code: string;
  status: "success" | "ignored" | "error";
  action: ImportAction;
  messages: string[];
}
export interface ImportReport {
  id: string;
  date: string;
  fileName: string;
  sheetName: string;
  headerRow: number;
  actorId: string;
  added: number;
  updated: number;
  ignored: number;
  errors: number;
  warnings: number;
  productsCreated: number;
  productsUpdated: number;
  summary: string;
  lines: ImportResultLine[];
}
export interface ImportContext {
  materials: Material[];
  contracts: Contract[];
}
export interface ImportHost {
  currentUser(): User | null;
  getContext(): ImportContext;
  getReports(): ImportReport[];
  apply(materials: Material[], report: ImportReport): boolean;
}
