import {
  canManage,
  canReadContract,
  hasGlobalRead,
  roleLabels,
} from "./access";
import { contracts, demoUsers } from "./demo-data";
import { roles, type User } from "./types";

let selected: User = demoUsers[0];
export const currentDemoUser = () => selected;
export function canReadMaterial(contractName: string): boolean {
  const contract = contracts.find((item) => item.name === contractName);
  return !!contract && canReadContract(selected, contract.id);
}
export function mountDemoAccess(onChange: () => void): void {
  const select = document.getElementById("demoUser") as HTMLSelectElement;
  select.replaceChildren(
    ...demoUsers.map(
      (user) => new Option(`${user.name} — ${roleLabels[user.role]}`, user.id),
    ),
  );
  const update = () => {
    selected =
      demoUsers.find((user) => user.id === select.value) ?? demoUsers[0];
    const summary = document.getElementById("demoSummary")!;
    summary.textContent = `${selected.id} · ${selected.email} · ${selected.status === "ativo" ? "Ativo" : "Inativo"} · ${hasGlobalRead(selected) ? "Consulta a todos os contratos cadastrados" : "Consulta aos contratos autorizados"}`;
    const body = document.getElementById("permissionRows")!;
    body.replaceChildren(
      ...roles.map((role) => {
        const row = document.createElement("tr");
        const example: User = { ...selected, role };
        for (const value of [
          roleLabels[role],
          ...contracts.map((contract) =>
            canReadContract(example, contract.id) ? "Permitido" : "Sem acesso",
          ),
          canManage(example) ? "Gerenciar" : "Somente consulta",
        ]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        row.classList.toggle("selected-role", role === selected.role);
        return row;
      }),
    );
    document.getElementById("permissionContext")!.textContent =
      `Matriz usando o status e os vínculos do usuário selecionado. Contratos autorizados: ${selected.authorizedContractIds.map((id) => contracts.find((contract) => contract.id === id)?.name ?? id).join(", ") || "Nenhum"}. Administradores consultam todos para gerenciar cadastros. Inativos não possuem acesso.`;
    document
      .getElementById("adminLock")!
      .classList.toggle("hidden", canManage(selected));
    document
      .getElementById("adminArea")!
      .classList.toggle("hidden", !canManage(selected));
    onChange();
  };
  select.addEventListener("change", update);
  update();
}
