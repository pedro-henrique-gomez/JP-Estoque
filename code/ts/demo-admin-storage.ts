import {
  roles,
  type User,
  type Contract,
  type Supplier,
  type GeneralSettings,
  type AuditEntry,
} from "./types";
import { readLocal, type LocalState } from "./local-state";

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
  if (value.version !== undefined && ![2, 3].includes(value.version as number))
    return false;
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
  inspect(): {
    state: LocalState;
    snapshot: DemoAdministrationSnapshot | null;
  } {
    const read = readLocal(key);
    if (read.state !== "ready") return { state: read.state, snapshot: null };
    if (!valid(read.value)) return { state: "incompatible", snapshot: null };
    return {
      state:
        read.value.users.length || read.value.contracts.length
          ? "ready"
          : "empty",
      snapshot: read.value,
    };
  },
  load(): DemoAdministrationSnapshot | null {
    return this.inspect().snapshot;
  },
  save(snapshot: DemoAdministrationSnapshot): boolean {
    try {
      const state = this.inspect().state;
      if (state === "incompatible" || state === "unavailable") return false;
      const read = readLocal(key);
      const previous =
        read.value && typeof read.value === "object" ? read.value : {};
      localStorage.setItem(key, JSON.stringify({ ...previous, ...snapshot }));
      return true;
    } catch {
      return false;
    }
  },
};
