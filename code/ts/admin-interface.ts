import { hasPermission, roleLabels, type Permission } from "./access";
import { DemoAdministration } from "./demo-administration";
import { roles, type User } from "./types";

const node = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
};
export function mountAdministration(
  store: DemoAdministration,
  actor: () => User,
  onChange: () => void,
): () => void {
  const host = document.getElementById("adminFormHost")!;
  const button = (label: string, run: () => void) => {
    const element = node("button", label);
    element.type = "button";
    element.className = "btn alt smallbtn";
    element.onclick = run;
    return element;
  };
  function form(
    title: string,
    submit: (form: HTMLFormElement) => void,
  ): HTMLFormElement {
    host.replaceChildren();
    const element = node("form");
    element.id = "administrationForm";
    element.className = "panel";
    element.append(node("h3", title));
    element.onsubmit = (event) => {
      event.preventDefault();
      try {
        submit(element);
        onChange();
      } catch (error) {
        const message = element.querySelector('[role="alert"]')!;
        message.textContent = (error as Error).message;
      }
    };
    host.append(element);
    return element;
  }
  function field(
    form: HTMLFormElement,
    name: string,
    label: string,
    value: string,
    choices?: [string, string][],
    type = "text",
  ): void {
    const wrapper = node("label", label);
    wrapper.className = "admin-field";
    const input = choices ? node("select") : node("input");
    input.name = name;
    input.id = `admin-${name}`;
    if (input instanceof HTMLInputElement) {
      input.type = type;
      input.required = true;
    } else choices?.forEach(([id, text]) => input.append(new Option(text, id)));
    input.value = value;
    wrapper.append(input);
    form.append(wrapper);
  }
  function finish(form: HTMLFormElement): void {
    const error = node("p");
    error.setAttribute("role", "alert");
    form.append(error);
    const submit = node("button", "Salvar demonstração");
    submit.className = "btn";
    submit.type = "submit";
    form.append(
      submit,
      button("Cancelar", () => host.replaceChildren()),
    );
    form.querySelector<HTMLElement>("input,select")?.focus();
  }
  const value = (form: HTMLFormElement, name: string) =>
    (form.elements.namedItem(name) as HTMLInputElement).value;
  function editUser(id?: string): void {
    if (!hasPermission(actor(), "manage_users")) return;
    const user = store.users.find((item) => item.id === id);
    const editor = form(
      user ? "Editar usuário fictício" : "Novo usuário fictício",
      (form) =>
        store.saveUser({
          id: id ?? "",
          name: value(form, "name"),
          email: value(form, "email"),
          role: value(form, "role") as User["role"],
          status: value(form, "status") as User["status"],
          authorizedContractIds: [
            ...form.querySelectorAll<HTMLInputElement>(
              '[name="contracts"]:checked',
            ),
          ].map((input) => input.value),
        }),
    );
    if (user) editor.append(node("p", `ID: ${user.id}`));
    field(editor, "name", "Nome", user?.name ?? "");
    field(
      editor,
      "email",
      "Email fictício",
      user?.email ?? "",
      undefined,
      "email",
    );
    field(
      editor,
      "role",
      "Perfil",
      user?.role ?? roles[0],
      roles.map((role) => [role, roleLabels[role]]),
    );
    field(editor, "status", "Status", user?.status ?? "ativo", [
      ["ativo", "Ativo"],
      ["inativo", "Inativo"],
    ]);
    const group = node("fieldset");
    group.append(node("legend", "Contratos autorizados"));
    store.contracts.forEach((contract) => {
      const label = node("label", contract.name);
      const checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.name = "contracts";
      checkbox.value = contract.id;
      checkbox.checked =
        user?.authorizedContractIds.includes(contract.id) ?? false;
      label.prepend(checkbox);
      group.append(label);
    });
    editor.append(group);
    finish(editor);
  }
  function editContract(id?: string): void {
    if (!hasPermission(actor(), "manage_contracts")) return;
    const contract = store.contracts.find((item) => item.id === id);
    const editor = form("Contrato fictício", (form) =>
      store.saveContract({ id: id ?? "", name: value(form, "name") }),
    );
    field(editor, "name", "Nome do contrato", contract?.name ?? "");
    finish(editor);
  }
  function editSupplier(id?: string): void {
    if (!hasPermission(actor(), "manage_suppliers")) return;
    const supplier = store.suppliers.find((item) => item.id === id);
    const editor = form("Fornecedor fictício", (form) =>
      store.saveSupplier({
        id: id ?? "",
        name: value(form, "name"),
        areas: value(form, "areas"),
        contact: value(form, "contact"),
      }),
    );
    field(editor, "name", "Nome do fornecedor", supplier?.name ?? "");
    field(editor, "areas", "Atuação", supplier?.areas ?? "");
    field(editor, "contact", "Contato", supplier?.contact ?? "");
    finish(editor);
  }
  function remove(run: () => void): void {
    if (!confirm("Excluir este cadastro fictício?")) return;
    try {
      run();
      onChange();
    } catch (error) {
      alert((error as Error).message);
    }
  }
  function table(
    panel: HTMLElement,
    headers: string[],
    rows: (string | HTMLElement)[][],
  ): void {
    const wrapper = node("div");
    wrapper.className = "tablewrap";
    const table = node("table");
    const head = node("thead");
    const row = node("tr");
    headers.forEach((text) => row.append(node("th", text)));
    head.append(row);
    table.append(head);
    const body = node("tbody");
    rows.forEach((cells) => {
      const row = node("tr");
      cells.forEach((value) => {
        const cell = node("td");
        if (typeof value === "string") cell.textContent = value;
        else cell.append(value);
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    wrapper.append(table);
    panel.append(wrapper);
  }
  function panel(
    id: string,
    permission: Permission,
    title: string,
  ): HTMLElement | null {
    const panel = document.getElementById(id)!;
    panel.replaceChildren();
    const allowed = hasPermission(actor(), permission);
    document.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)!.disabled =
      !allowed;
    if (!allowed) return null;
    panel.append(node("h3", title));
    return panel;
  }
  return () => {
    host.replaceChildren();
    const users = panel(
      "users",
      "manage_users",
      "Usuários e permissões · demonstração",
    );
    if (users) {
      users.append(button("Novo usuário", () => editUser()));
      table(
        users,
        [
          "ID / Nome",
          "Email",
          "Perfil",
          "Status",
          "Contratos autorizados",
          "Ações",
        ],
        store.users.map((user) => [
          `${user.id} · ${user.name}`,
          user.email,
          roleLabels[user.role],
          user.status,
          user.authorizedContractIds
            .map(
              (id) =>
                store.contracts.find((contract) => contract.id === id)?.name ??
                id,
            )
            .join(", ") || "Nenhum",
          button(`Editar ${user.name}`, () => editUser(user.id)),
        ]),
      );
    }
    const suppliers = panel(
      "suppliersAdmin",
      "manage_suppliers",
      "Administração de fornecedores",
    );
    if (suppliers) {
      suppliers.append(button("Novo fornecedor", () => editSupplier()));
      table(
        suppliers,
        ["Nome", "Atuação", "Contato", "Editar", "Excluir"],
        store.suppliers.map((supplier) => [
          supplier.name,
          supplier.areas,
          supplier.contact,
          button(`Editar ${supplier.name}`, () => editSupplier(supplier.id)),
          button(`Excluir ${supplier.name}`, () =>
            remove(() => store.removeSupplier(supplier.id)),
          ),
        ]),
      );
    }
    const contracts = panel(
      "contractsAdmin",
      "manage_contracts",
      "Administração de contratos",
    );
    if (contracts) {
      contracts.append(button("Novo contrato", () => editContract()));
      table(
        contracts,
        ["ID", "Nome", "Editar", "Excluir"],
        store.contracts.map((contract) => [
          contract.id,
          contract.name,
          button(`Editar ${contract.name}`, () => editContract(contract.id)),
          button(`Excluir ${contract.name}`, () =>
            remove(() => store.removeContract(contract.id)),
          ),
        ]),
      );
    }
    const history = panel(
      "history",
      "view_history",
      "Histórico demonstrativo de alterações",
    );
    if (history) {
      history.append(
        node(
          "p",
          "Histórico local de teste, editável pelo navegador. Não é uma trilha de auditoria segura ou compartilhada.",
        ),
      );
      table(
        history,
        ["Data", "Autor", "Ação", "Cadastro", "Alteração"],
        store.history.map((entry) => {
          const details = node("details");
          details.append(
            node("summary", "Ver antes e depois"),
            node(
              "pre",
              JSON.stringify(
                { antes: entry.before, depois: entry.after },
                null,
                2,
              ),
            ),
          );
          return [
            new Date(entry.timestamp).toLocaleString("pt-BR"),
            `${entry.actorName} (${entry.actorId})`,
            entry.action,
            entry.entity,
            details,
          ];
        }),
      );
    }
    const settings = panel(
      "settings",
      "manage_settings",
      "Configurações gerais demonstrativas",
    );
    if (settings) {
      settings.append(
        node(
          "p",
          `${store.settings.systemName} · ${store.settings.supportEmail}`,
        ),
      );
      settings.append(
        button("Editar configurações", () => {
          if (!hasPermission(actor(), "manage_settings")) return;
          const editor = form("Configurações gerais", (form) =>
            store.saveSettings({
              systemName: value(form, "systemName"),
              supportEmail: value(form, "supportEmail"),
            }),
          );
          field(
            editor,
            "systemName",
            "Nome do sistema",
            store.settings.systemName,
          );
          field(
            editor,
            "supportEmail",
            "Email de suporte fictício",
            store.settings.supportEmail,
            undefined,
            "email",
          );
          finish(editor);
        }),
      );
    }
  };
}
