import {
  roles,
  type User,
  type Contract,
  type Supplier,
  type GeneralSettings,
  type AuditEntry,
} from "./types";

export interface DemoAdministrationSnapshot {
  users: User[];
  contracts: Contract[];
  suppliers: Supplier[];
  settings: GeneralSettings;
  history: AuditEntry[];
}
const key = "jp_estoque_admin_demo_v02";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";
const strings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof value[key] === "string");
const uniqueIds = (values: { id: string }[]) =>
  new Set(values.map((value) => value.id)).size === values.length;
function valid(value: unknown): value is DemoAdministrationSnapshot {
  if (!record(value)) return false;
  if (
    !Array.isArray(value.contracts) ||
    !value.contracts.every(
      (contract) => record(contract) && strings(contract, ["id", "name"]),
    )
  )
    return false;
  if (
    !Array.isArray(value.suppliers) ||
    !value.suppliers.every(
      (supplier) =>
        record(supplier) &&
        strings(supplier, ["id", "name", "areas", "contact"]),
    )
  )
    return false;
  const ids = new Set(value.contracts.map((contract) => contract.id));
  if (
    !Array.isArray(value.users) ||
    !value.users.length ||
    !value.users.every(
      (user) =>
        record(user) &&
        strings(user, ["id", "name", "email"]) &&
        roles.includes(user.role as User["role"]) &&
        ["ativo", "inativo"].includes(user.status as string) &&
        Array.isArray(user.authorizedContractIds) &&
        user.authorizedContractIds.every(
          (id) => typeof id === "string" && ids.has(id),
        ),
    )
  )
    return false;
  if (
    !uniqueIds(value.users) ||
    !uniqueIds(value.contracts) ||
    !uniqueIds(value.suppliers)
  )
    return false;
  if (
    !record(value.settings) ||
    !strings(value.settings, ["systemName", "supportEmail"])
  )
    return false;
  return (
    Array.isArray(value.history) &&
    value.history.every(
      (entry) =>
        record(entry) &&
        strings(entry, [
          "id",
          "timestamp",
          "actorId",
          "actorName",
          "action",
          "entity",
        ]),
    )
  );
}
/** Fictitious records only. Not an auth/session store and not secure auditing. */
export const demoAdminStorage = {
  load(): DemoAdministrationSnapshot | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || "null");
      return valid(value) ? value : null;
    } catch {
      return null;
    }
  },
  save(snapshot: DemoAdministrationSnapshot): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  },
};
