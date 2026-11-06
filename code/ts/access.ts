import { roles, type User, type Role } from "./types";

export const roleLabels: Record<Role, string> = {
  funcionario_autorizado: "Funcionário autorizado",
  almoxarife: "Almoxarife",
  coordenador: "Coordenador",
  planejamento: "Planejamento",
  diretor: "Diretor",
  proprietario: "Proprietário",
  administrador: "Administrador",
};
export function isActive(user: User | null | undefined): user is User {
  return !!user && user.status === "ativo" && roles.includes(user.role);
}
export const permissions = [
  "read_all_contracts",
  "manage_materials",
  "delete_materials",
  "manage_suppliers",
  "manage_contracts",
  "manage_users",
  "manage_permissions",
  "change_user_status",
  "view_history",
  "manage_settings",
] as const;
export type Permission = (typeof permissions)[number];

const fullAdministration: readonly Permission[] = permissions;
/** The only role-to-capability mapping in the client. UI simulation, not security. */
export const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  funcionario_autorizado: [],
  almoxarife: [],
  coordenador: [],
  planejamento: [],
  diretor: ["read_all_contracts"],
  proprietario: fullAdministration,
  administrador: fullAdministration,
};
export function hasPermission(
  user: User | null | undefined,
  permission: Permission,
): boolean {
  return isActive(user) && rolePermissions[user.role].includes(permission);
}
export function canManage(user: User | null | undefined): boolean {
  return hasPermission(user, "manage_materials");
}
export function hasGlobalRead(user: User | null | undefined): boolean {
  return hasPermission(user, "read_all_contracts");
}
/** Presentation rules only: these functions do not secure local or remote data. */
export function canReadContract(
  user: User | null | undefined,
  contractId: string,
): boolean {
  return (
    isActive(user) &&
    (hasGlobalRead(user) || user.authorizedContractIds.includes(contractId))
  );
}
