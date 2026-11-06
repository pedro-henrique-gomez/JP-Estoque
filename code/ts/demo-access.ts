import {
  canManage,
  canReadContract,
  hasGlobalRead,
  roleLabels,
  hasPermission,
} from "./access";
import { contracts, demoUsers } from "./demo-data";
import { roles, type User } from "./types";

let selected: User | null = demoUsers[0] ?? null;
let refresh = () => {};
export const refreshDemoAccess = () => refresh();
export const currentDemoUser = () => selected;
export function canReadMaterial(contractName: string): boolean {
  const contract = contracts.find((item) => item.name === contractName);
  return !!contract && canReadContract(selected, contract.id);
}
export function mountDemoAccess(onChange: () => void): void {
  const select = document.getElementById("demoUser") as HTMLSelectElement;
  const update = () => {
    const selectedId = select.value || selected?.id;
    select.replaceChildren(
      ...demoUsers.map(
        (user) =>
          new Option(
            `${user.name} — ${roleLabels[user.role]} (${user.status})`,
            user.id,
          ),
      ),
    );
    selected =
      demoUsers.find((user) => user.id === selectedId) ?? demoUsers[0] ?? null;
    if (selected) select.value = selected.id;
    else select.add(new Option("Nenhum usuário disponível", ""));
    select.disabled = !selected;
    const profileLabel = document.getElementById("demoActiveProfile");
    if (profileLabel)
      profileLabel.textContent = selected
        ? roleLabels[selected.role]
        : "Nenhum perfil";
    const summary = document.getElementById("demoSummary")!;
    summary.textContent = selected
      ? `${selected.id} · ${selected.email} · ${selected.status === "ativo" ? "Ativo" : "Inativo"} · ${hasGlobalRead(selected) ? "Consulta a todos os contratos cadastrados" : "Consulta aos contratos autorizados"}`
      : "Nenhum usuário cadastrado. Os dados existentes permanecem preservados; não há perfil selecionado para consulta.";
    const body = document.getElementById("permissionRows")!;
    const header = document.getElementById("permissionHead")!;
    header.replaceChildren(
      ...[
        "Perfil",
        ...contracts.map((contract) => contract.name),
        "Materiais",
        "Fornecedores",
        "Contratos",
        "Usuários e permissões",
        "Ativar/desativar",
        "Histórico",
        "Configurações",
      ].map((text) => {
        const cell = document.createElement("th");
        cell.textContent = text;
        return cell;
      }),
    );
    body.replaceChildren(
      ...(selected ? roles : []).map((role) => {
        const row = document.createElement("tr");
        const example: User = { ...selected!, role };
        for (const value of [
          roleLabels[role],
          ...contracts.map((contract) =>
            canReadContract(example, contract.id) ? "Permitido" : "Sem acesso",
          ),
          canManage(example)
            ? "Cadastrar, editar e excluir"
            : "Sem administração",
          ...(
            [
              "manage_suppliers",
              "manage_contracts",
              "manage_users",
              "change_user_status",
              "view_history",
              "manage_settings",
            ] as const
          ).map((permission) =>
            hasPermission(example, permission) ? "Permitido" : "Sem acesso",
          ),
        ]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        row.classList.toggle("selected-role", role === selected?.role);
        return row;
      }),
    );
    document.getElementById("permissionContext")!.textContent =
      `Matriz usando o status e os vínculos do usuário selecionado. Contratos autorizados: ${selected?.authorizedContractIds.map((id) => contracts.find((contract) => contract.id === id)?.name ?? id).join(", ") || "Nenhum"}. Proprietário e Administrador possuem administração completa. Inativos não possuem acesso.`;
    document
      .getElementById("adminLock")!
      .classList.toggle("hidden", canManage(selected));
    document
      .getElementById("adminArea")!
      .classList.toggle("hidden", !canManage(selected));
    onChange();
  };
  select.addEventListener("change", update);
  refresh = update;
  update();
}
