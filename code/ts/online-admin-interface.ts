import {
  administrativeEntities,
  administrativePayload,
  type AdministrativeEntity,
  type AdministrativeRecord,
  type AdministrativeSnapshot,
  type OnlineAdministration,
} from "./data/online-administration";
import { OnlineError } from "./data/online-error";
import { roleLabels } from "./access";
import { roles } from "./types";
import type { RemoteProfile } from "./data/contracts";

export function mountOnlineAdministration(
  host: HTMLElement,
  backend: OnlineAdministration,
  onInvalidated: (error: OnlineError) => void,
) {
  const message = host.querySelector<HTMLElement>("#onlineAdminMessage")!;
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.tabIndex = -1;
  const content = document.createElement("div");
  content.id = "onlineAdminContent";
  host.append(content);
  const confirmation = document.createElement("dialog");
  confirmation.className = "online-detail";
  confirmation.setAttribute("aria-labelledby", "adminConfirmationTitle");
  confirmation.innerHTML =
    '<h2 id="adminConfirmationTitle">Confirmar alteração</h2><pre id="adminConfirmationSummary"></pre><div class="online-session"><button class="btn" id="cancelAdminChange">Cancelar</button><button class="btn primary" id="confirmAdminChange">Confirmar alteração</button></div>';
  host.append(confirmation);
  let data: AdministrativeSnapshot | null = null,
    section: string = "products",
    generation = 0,
    opened = false,
    busy = false;
  let pending: { action: () => Promise<void>; ticket: number } | null = null;
  const text = (tag: string, value: string) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  const button = (label: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.textContent = label;
    b.onclick = action;
    return b;
  };
  const failure = (error: unknown) =>
    error instanceof OnlineError
      ? error
      : new OnlineError(
          "connection",
          "Operação não confirmada. Atualize antes de tentar novamente.",
        );
  function close() {
    ++generation;
    opened = false;
    data = null;
    content.replaceChildren();
    pending = null;
    confirmation.querySelector("pre")!.textContent = "";
    busy = false;
    if (confirmation.open) confirmation.close();
    host.hidden = true;
  }
  function fail(error: unknown) {
    const e = failure(error);
    message.textContent =
      e.kind === "session"
        ? `Entre com uma sessão ativa para acessar. ${e.message}`
        : e.message;
    if (["session", "inactive", "permission", "connection"].includes(e.kind)) {
      content.replaceChildren();
      data = null;
      if (confirmation.open) confirmation.close();
      pending = null;
      confirmation.querySelector("pre")!.textContent = "";
      onInvalidated(e);
    }
  }
  function ask(summary: string, action: () => Promise<void>) {
    if (busy) return;
    pending = { action, ticket: generation };
    confirmation.querySelector("pre")!.textContent = summary;
    confirmation.showModal();
  }
  confirmation
    .querySelector("#cancelAdminChange")!
    .addEventListener("click", () => {
      pending = null;
      confirmation.close();
    });
  confirmation.addEventListener("cancel", () => {
    pending = null;
  });
  confirmation
    .querySelector("#confirmAdminChange")!
    .addEventListener("click", async () => {
      const change = pending;
      if (!change || busy) return;
      pending = null;
      busy = true;
      confirmation.close();
      content
        .querySelectorAll<
          HTMLInputElement | HTMLButtonElement | HTMLSelectElement
        >("input,button,select")
        .forEach((n) => (n.disabled = true));
      message.textContent = "Aplicando alteração no servidor…";
      let committed = false;
      try {
        await change.action();
        committed = true;
        if (change.ticket !== generation || !opened) return;
        await load();
        if (change.ticket === generation)
          message.textContent =
            "Alteração confirmada pelo servidor. Histórico atualizado.";
      } catch (e) {
        if (change.ticket === generation && opened) {
          fail(e);
          if (committed)
            message.textContent = `Alteração confirmada pelo servidor. Falha ao atualizar a tela: ${failure(e).message}`;
          if (data) render();
        }
      } finally {
        if (change.ticket === generation) {
          busy = false;
          message.focus();
        }
      }
    });
  function input(
    form: HTMLFormElement,
    name: string,
    label: string,
    value: string,
    required = false,
    options?: { id: string; name: string }[],
  ) {
    const id = `adminField-${name}`,
      labelNode = text("label", label) as HTMLLabelElement;
    labelNode.className = "label";
    labelNode.htmlFor = id;
    const field = options
      ? document.createElement("select")
      : document.createElement("input");
    field.id = id;
    field.name = name;
    field.required = required;
    if (field instanceof HTMLSelectElement)
      field.append(
        new Option("Selecione…", ""),
        ...options!.map((o) => new Option(o.name, o.id)),
      );
    field.value = value;
    form.append(labelNode, field);
    return field;
  }
  function editor(entity: AdministrativeEntity, record?: AdministrativeRecord) {
    if (!data) return;
    const form = document.createElement("form");
    form.className = "online-admin-form";
    form.id = "onlineAdminForm";
    form.append(text("h3", record ? "Editar cadastro" : "Novo cadastro"));
    const definition = administrativeEntities[entity];
    for (const [field, label] of Object.entries(definition.fields)) {
      let options: { id: string; name: string }[] | undefined;
      if (field === "contract_id")
        options = data.contracts.map((c) => ({
          id: c.id,
          name: String(c.name),
        }));
      if (field === "unit")
        options = [
          "un",
          "m",
          "m²",
          "m³",
          "kg",
          "g",
          "l",
          "ml",
          "saco",
          "caixa",
          "rolo",
          "par",
          "jogo",
          "pacote",
          "kit",
          "t",
        ].map((id) => ({ id, name: id }));
      input(
        form,
        field,
        label,
        String(record?.[field] ?? ""),
        (definition.required as readonly string[]).includes(field),
        options,
      );
    }
    const submit = button("Salvar cadastro", () => {});
    submit.type = "submit";
    form.append(
      submit,
      button("Cancelar edição", () => render()),
    );
    form.onsubmit = (event) => {
      event.preventDefault();
      try {
        const payload = administrativePayload(
          entity,
          Object.fromEntries(new FormData(form)),
        );
        ask(
          `${record ? "Editar" : "Criar"} ${definition.label}\n${Object.entries(
            payload,
          )
            .map(
              ([k, v]) =>
                `${(definition.fields as Record<string, string>)[k]}: ${k === "contract_id" ? String(data?.contracts.find((c) => c.id === v)?.name || v) : v}`,
            )
            .join("\n")}`,
          () => backend.save(entity, payload, record?.id),
        );
      } catch (e) {
        fail(e);
      }
    };
    content.querySelector("#adminEditor")!.replaceChildren(form);
    form.querySelector("input,select")?.scrollIntoView({ block: "nearest" });
    (form.querySelector("input,select") as HTMLElement)?.focus();
  }
  function records(entity: AdministrativeEntity) {
    const definition = administrativeEntities[entity];
    if (entity === "products")
      content.append(
        text(
          "p",
          "Catálogo global: os dados do material valem para todos os contratos. Este painel não altera saldos ou movimentações.",
        ),
      );
    content.append(button("Novo cadastro", () => editor(entity)));
    const editorHost = document.createElement("div");
    editorHost.id = "adminEditor";
    content.append(editorHost);
    const rows = data![entity];
    if (!rows.length) content.append(text("p", "Nenhum cadastro encontrado."));
    for (const record of rows) {
      const article = document.createElement("article");
      article.className = "online-admin-record";
      article.dataset.recordId = record.id;
      const name = String(
        record.description || record.name || record.code || record.id,
      );
      article.append(text("h3", name));
      for (const [field, label] of Object.entries(definition.fields)) {
        const value =
          field === "contract_id"
            ? data!.contracts.find((c) => c.id === record[field])?.name
            : record[field];
        article.append(text("p", `${label}: ${String(value ?? "")}`));
      }
      article.append(
        button("Editar", () => editor(entity, record)),
        button("Excluir", () =>
          ask(
            `Excluir ${definition.label}: ${name}\nA exclusão será recusada se houver registros vinculados.`,
            () => backend.remove(entity, record.id),
          ),
        ),
      );
      content.append(article);
    }
  }
  function users() {
    content.append(
      text(
        "p",
        "Contas Auth devem ser provisionadas por mecanismo confiável. Perfis e vínculos abaixo usam RPCs; autoadministração é proibida.",
      ),
    );
    for (const profile of data!.users) {
      const article = document.createElement("article");
      article.className = "online-admin-record";
      article.dataset.userId = profile.id;
      article.append(
        text("h3", profile.name),
        text(
          "p",
          `${profile.email} · ${roleLabels[profile.role]} · ${profile.active ? "Ativo" : "Inativo"}`,
        ),
      );
      const self = profile.id === data!.profile.id;
      const form = document.createElement("form");
      form.className = "online-admin-form";
      input(form, `${profile.id}-name`, "Nome do usuário", profile.name, true);
      const email = input(
        form,
        `${profile.id}-email`,
        "Email do perfil",
        profile.email,
        true,
      ) as HTMLInputElement;
      email.type = "email";
      input(
        form,
        `${profile.id}-role`,
        "Perfil",
        profile.role,
        true,
        roles.map((id) => ({ id, name: roleLabels[id] })),
      );
      input(
        form,
        `${profile.id}-active`,
        "Status",
        String(profile.active),
        true,
        [
          { id: "true", name: "Ativo" },
          { id: "false", name: "Inativo" },
        ],
      );
      const save = button("Salvar perfil", () => {});
      save.type = "submit";
      form.append(save);
      form.onsubmit = (e) => {
        e.preventDefault();
        const values = new FormData(form);
        const next: RemoteProfile = {
          ...profile,
          name: String(values.get(`${profile.id}-name`)),
          email: String(values.get(`${profile.id}-email`)),
          role: String(
            values.get(`${profile.id}-role`),
          ) as RemoteProfile["role"],
          active: values.get(`${profile.id}-active`) === "true",
        };
        ask(
          `Alterar perfil de ${profile.name}\nNome: ${next.name}\nEmail cadastral: ${next.email} (não altera o email de login Auth)\nPerfil: ${roleLabels[next.role]}\nAtivo: ${next.active}`,
          () => backend.saveProfile(next),
        );
      };
      article.append(form);
      for (const contract of data!.contracts) {
        const authorized = data!.links.some(
          (l) => l.user_id === profile.id && l.contract_id === contract.id,
        );
        const b = button(
          `${authorized ? "Revogar" : "Autorizar"} ${String(contract.name)}`,
          () =>
            ask(
              `${authorized ? "Revogar" : "Autorizar"} vínculo\nUsuário: ${profile.name}\nContrato: ${String(contract.name)}`,
              () =>
                backend.setUserContract(profile.id, contract.id, !authorized),
            ),
        );
        b.disabled = self;
        article.append(b);
      }
      if (self) {
        article.append(
          text(
            "p",
            "Seu próprio perfil e vínculos só podem ser alterados por outro gestor.",
          ),
        );
        form
          .querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLButtonElement
          >("input,select,button")
          .forEach((n) => (n.disabled = true));
      }
      content.append(article);
    }
  }
  function history() {
    content.append(
      text(
        "p",
        "Até 100 eventos mais recentes. Auditoria e registros de importação existentes são somente leitura; não há importação online.",
      ),
    );
    for (const record of data!.audit) {
      const details = document.createElement("details");
      details.className = "online-admin-record";
      const summary = text(
        "summary",
        `${String(record.occurred_at)} · ${String(record.entity)} · ${String(record.operation)} · ${String(record.actor_role ?? "provisionamento")}`,
      );
      details.append(
        summary,
        text(
          "pre",
          JSON.stringify(
            {
              actor_id: record.actor_id,
              entity_id: record.entity_id,
              before: record.before_data,
              after: record.after_data,
            },
            null,
            2,
          ),
        ),
      );
      content.append(details);
    }
    content.append(
      text("h3", "Registros administrativos de importações existentes"),
    );
    if (!data!.imports.length)
      content.append(text("p", "Nenhum registro de importação online."));
    for (const record of data!.imports)
      content.append(text("pre", JSON.stringify(record, null, 2)));
  }
  function render() {
    if (!data || !opened) return;
    content.replaceChildren();
    const nav = document.createElement("nav");
    nav.className = "online-admin-nav";
    nav.setAttribute("aria-label", "Seções administrativas");
    for (const [id, label] of [
      ...Object.entries(administrativeEntities).map(([id, d]) => [id, d.label]),
      ["users", "Usuários e vínculos"],
      ["history", "Histórico"],
    ]) {
      const b = button(label, () => {
        section = id;
        render();
      });
      b.setAttribute("aria-pressed", String(section === id));
      nav.append(b);
    }
    nav.append(
      button("Atualizar administração", () => {
        if (!busy) void load().catch(fail);
      }),
    );
    content.append(
      nav,
      text(
        "h3",
        section === "users"
          ? "Usuários e vínculos"
          : section === "history"
            ? "Histórico de auditoria"
            : administrativeEntities[section as AdministrativeEntity].label,
      ),
    );
    if (section === "users") users();
    else if (section === "history") history();
    else records(section as AdministrativeEntity);
  }
  async function load() {
    const ticket = generation;
    const next = await backend.snapshot();
    if (ticket !== generation || !opened) return;
    data = next;
    render();
    message.textContent =
      "Perfil administrativo confirmado no banco. Cadastros online disponíveis; saldos e importação não são editados aqui.";
  }
  return {
    close,
    isOpen: () => opened,
    async open() {
      close();
      opened = true;
      host.hidden = false;
      message.textContent = "Verificando acesso administrativo no servidor…";
      try {
        await load();
      } catch (e) {
        fail(e);
      }
    },
    async revalidate() {
      if (!opened || busy) return;
      try {
        await backend.verify();
      } catch (e) {
        fail(e);
      }
    },
  };
}
