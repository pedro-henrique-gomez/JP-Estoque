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
export function canManage(user: User | null | undefined): boolean {
  return isActive(user) && user.role === "administrador";
}
export function hasGlobalRead(user: User | null | undefined): boolean {
  return (
    isActive(user) &&
    ["diretor", "proprietario", "administrador"].includes(user.role)
  );
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
