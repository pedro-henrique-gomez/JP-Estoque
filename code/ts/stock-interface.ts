import {
  stockCan,
  stockPermissions,
  stockQuantity,
  stockProposed,
  type StockPermission,
} from "./stock-permissions";
import type {
  StockService,
  StockContext,
  Movement,
  StockAdmin,
} from "./data/stock";
import { OnlineError } from "./data/online-error";

type Page =
  | "entrada"
  | "saida"
  | "history"
  | "users"
  | "roles"
  | "reports"
  | "dashboard"
  | "catalog";
const labels: Record<Page, string> = {
  entrada: "↘ Entrada de Materiais",
  saida: "↗ Saída de Materiais",
  history: "Histórico de Movimentações",
  users: "Usuários e Permissões",
  roles: "Cargos",
  reports: "Relatórios",
  dashboard: "Painel Geral",
  catalog: "Consultar Materiais",
};
export function mountStock(
  host: HTMLElement,
  nav: HTMLElement,
  service: StockService,
  onOpen: () => void,
) {
  let operationEpoch = -1;
  let ctx: StockContext | null = null,
    current: Page | null = null,
    epoch = 0,
    busy = false,
    confirmation: (() => Promise<void>) | null = null;
  const buttons = new Map<Page, HTMLButtonElement>();
  const text = (tag: string, value: string) => {
    const n = document.createElement(tag);
    n.textContent = value;
    return n;
  };
  const button = (label: string, action: () => void) => {
    const n = document.createElement("button");
    n.type = "button";
    n.className = "btn";
    n.textContent = label;
    n.onclick = action;
    return n;
  };
  const dialog = document.createElement("dialog");
  dialog.className = "online-detail";
  dialog.id = "stockConfirmation";
  dialog.setAttribute("aria-labelledby", "stockConfirmTitle");
  const title = text("h2", "Confirmar operação");
  title.id = "stockConfirmTitle";
  const summary = text("pre", "");
  summary.id = "stockConfirmSummary";
  const reason = document.createElement("textarea");
  reason.id = "stockReverseReason";
  reason.maxLength = 500;
  reason.minLength = 5;
  reason.placeholder =
    "Motivo do estorno (obrigatório, mínimo de cinco caracteres)";
  reason.setAttribute("aria-label", "Motivo do estorno");
  const confirm = button("Confirmar operação", () => {
    if (confirmation && !busy) void run(confirmation);
  });
  confirm.id = "stockConfirm";
  dialog.append(
    title,
    summary,
    reason,
    button("Cancelar", () => dialog.close()),
    confirm,
  );
  document.body.append(dialog);
  const allowed = (page: Page, c = ctx) =>
    !!c &&
    {
      entrada:
        stockCan(c.permissions, "entrada.visualizar") ||
        stockCan(c.permissions, "entrada.registrar"),
      saida:
        stockCan(c.permissions, "saida.visualizar") ||
        stockCan(c.permissions, "saida.registrar"),
      history:
        stockCan(c.permissions, "historico.visualizar_proprio") ||
        stockCan(c.permissions, "historico.visualizar_geral"),
      users: stockCan(c.permissions, "usuarios.visualizar"),
      roles:
        stockCan(c.permissions, "usuarios.visualizar") ||
        stockCan(c.permissions, "cargos.gerenciar"),
      reports: stockCan(c.permissions, "relatorios.exportar"),
      dashboard: stockCan(c.permissions, "estoque.visualizar"),
      catalog: stockCan(c.permissions, "estoque.visualizar"),
    }[page];
  const existingConsult =
    nav.querySelector<HTMLButtonElement>("#onlineConsult");
  const existingAdmin = nav.querySelector<HTMLButtonElement>("#onlineAdmin");
  nav.replaceChildren();
  for (const [group, pages] of [
    ["Consultas", ["dashboard", "catalog"]],
    ["Movimentações", ["entrada", "saida", "history"]],
    ["Administração", ["users", "roles", "reports"]],
  ] as [string, Page[]][]) {
    const heading = text("h3", group);
    heading.className = "stock-nav-group";
    heading.hidden = true;
    nav.append(heading);
    if (group === "Consultas" && existingConsult) {
      existingConsult.textContent = "Consultar Estoque";
      nav.append(existingConsult);
    }
    if (group === "Administração" && existingAdmin) {
      existingAdmin.textContent = "Cadastros e importação";
      nav.append(existingAdmin);
    }
    for (const page of pages) {
      const b = button(labels[page], () => void open(page));
      b.id = "stockNav-" + page;
      b.hidden = true;
      nav.append(b);
      buttons.set(page, b);
    }
  }
  function update(next: StockContext) {
    ctx = next;
    const identity = document.getElementById("onlineIdentity");
    if (identity) identity.textContent = `${next.actor.name} · ${next.role}`;
    const consult = nav.querySelector<HTMLButtonElement>("#onlineConsult");
    const admin = nav.querySelector<HTMLButtonElement>("#onlineAdmin");
    if (consult)
      consult.hidden = !stockCan(next.permissions, "estoque.visualizar");
    if (admin)
      admin.hidden = !stockCan(next.permissions, "usuarios.visualizar");
    for (const [page, b] of buttons) b.hidden = !allowed(page);
    nav.querySelectorAll<HTMLElement>(".stock-nav-group").forEach((h) => {
      let n = h.nextElementSibling,
        visible = false;
      while (n && !n.classList.contains("stock-nav-group")) {
        if (n instanceof HTMLButtonElement && !n.hidden) visible = true;
        n = n.nextElementSibling;
      }
      h.hidden = !visible;
    });
  }
  function message(value: string) {
    let n = host.querySelector<HTMLElement>("#stockStatus");
    if (!n) {
      n = text("p", "");
      n.id = "stockStatus";
      n.className = "notice";
      n.setAttribute("role", "status");
      host.prepend(n);
    }
    n.textContent = value;
  }
  function fail(error: unknown) {
    message(error instanceof Error ? error.message : "Operação indisponível.");
    if (
      error instanceof OnlineError &&
      ["session", "permission", "inactive"].includes(error.kind)
    ) {
      const ticket = ++epoch;
      current = null;
      host.replaceChildren();
      message(error.message);
      confirmation = null;
      summary.textContent = "";
      reason.value = "";
      if (dialog.open) dialog.close();
      void service
        .context()
        .then((next) => {
          if (ticket === epoch) update(next);
        })
        .catch(() => {
          if (ticket !== epoch) return;
          ctx = null;
          for (const b of buttons.values()) b.hidden = true;
        });
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    const ticket = epoch;
    operationEpoch = ticket;
    confirm.disabled = true;
    host
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((n) => (n.disabled = true));
    try {
      await action();
    } catch (e) {
      if (ticket === epoch) fail(e);
    } finally {
      operationEpoch = -1;
      busy = false;
      confirm.disabled = false;
      if (ticket === epoch)
        host
          .querySelectorAll<HTMLButtonElement>("button")
          .forEach((n) => (n.disabled = n.dataset.forbidden === "true"));
    }
  }
  async function refreshAfterChange(page: Page) {
    if (operationEpoch === epoch) await open(page);
  }
  function ask(value: string, action: () => Promise<void>, reversal = false) {
    summary.textContent = value;
    reason.hidden = !reversal;
    reason.value = "";
    confirmation = async () => {
      if (reversal && reason.value.trim().length < 5) {
        message("Informe o motivo do estorno com pelo menos cinco caracteres.");
        reason.focus();
        return;
      }
      dialog.close();
      await action();
    };
    dialog.showModal();
  }
  function field(
    form: HTMLElement,
    label: string,
    name: string,
    required = false,
    type = "text",
  ) {
    const wrap = document.createElement("label");
    wrap.textContent = label + (required ? " *" : "");
    const n =
      type === "textarea"
        ? document.createElement("textarea")
        : document.createElement("input");
    if (n instanceof HTMLInputElement) n.type = type;
    n.name = name;
    n.id = "stock-" + name;
    n.required = required;
    n.maxLength = name === "notes" ? 500 : 240;
    if (name === "recipient") n.minLength = 3;
    if (name === "destination" || name === "recipient_company") n.minLength = 2;
    wrap.append(n);
    form.append(wrap);
    return n;
  }
  function select(
    form: HTMLElement,
    label: string,
    name: string,
    values: { id: string; name: string }[],
    required = false,
  ) {
    const wrap = document.createElement("label");
    wrap.textContent = label + (required ? " *" : "");
    const n = document.createElement("select");
    n.id = "stock-" + name;
    n.name = name;
    n.required = required;
    n.append(
      new Option("Selecione…", ""),
      ...values.map((v) => new Option(v.name, v.id)),
    );
    wrap.append(n);
    form.append(wrap);
    return n;
  }
  const input = (form: HTMLFormElement, name: string) =>
    form.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
  function pageTitle(page: Page) {
    host.replaceChildren(
      text("h2", labels[page]),
      text(
        "p",
        "Supabase local experimental. As permissões e as transações são verificadas no servidor.",
      ),
    );
    message("Dados conferidos no servidor. Nenhuma alteração sem confirmação.");
  }
  function receipt(row: Movement, parent: HTMLElement) {
    const card = document.createElement("article");
    card.className = "online-admin-record";
    card.dataset.movementId = row.id;
    card.append(
      text(
        "h3",
        `${row.reversal_of ? "ESTORNO · " : ""}${row.kind.toUpperCase()} · ${row.product_code}`,
      ),
      text(
        "p",
        `${row.quantity} ${row.unit} · ${row.contract_name} · ${row.before_quantity} → ${row.after_quantity}`,
      ),
      text(
        "p",
        row.kind === "saida" && !row.reversal_of
          ? `${row.actor_name} acompanhou a retirada de ${row.quantity} ${row.unit} de ${row.product_description}, destinados a ${row.destination}, retirados por ${row.recipient}, da empresa ${row.recipient_company}.`
          : `Responsável: ${row.actor_name} · ${new Date(row.occurred_at).toLocaleString("pt-BR")}`,
      ),
    );
    const details = document.createElement("details");
    details.append(
      text("summary", "Comprovante e rastreabilidade"),
      text("pre", JSON.stringify(row, null, 2)),
    );
    card.append(details);
    if (stockCan(ctx!.permissions, "relatorios.exportar"))
      card.append(
        button(
          "Baixar comprovante JSON",
          () =>
            void run(async () => {
              const ticket = epoch,
                fresh = await service.context();
              update(fresh);
              if (!stockCan(fresh.permissions, "relatorios.exportar"))
                throw new OnlineError("permission", "Exportação revogada.");
              const visible = await service.report({ movement_id: row.id });
              if (ticket !== epoch) return;
              if (visible.rows.length !== 1)
                throw new OnlineError(
                  "permission",
                  "Comprovante indisponível para este acesso.",
                );
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(visible.rows[0], null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "jp-comprovante-" + row.id + ".json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }),
        ),
      );
    if (row.reversal)
      card.append(
        text(
          "p",
          `Estornado por ${row.reversal.actor_name}: ${row.reversal.reason}`,
        ),
      );
    if (
      stockCan(ctx!.permissions, "movimentacoes.estornar") &&
      !row.reversal_of &&
      !row.reversed_by
    )
      card.append(
        button("Estornar", () => {
          let idem = crypto.randomUUID();
          ask(
            `Estornar ${row.id}: ${row.quantity} ${row.unit}. O saldo atual será validado. O registro original será preservado.`,
            async () => {
              const ticket = epoch;
              const result = await service.reverse({
                movement_id: row.id,
                reason: reason.value.trim(),
                idempotency_key: idem,
              });
              if (ticket !== epoch) return;
              card.replaceChildren();
              receipt(result, card);
              message("Estorno confirmado. Histórico original preservado.");
            },
            true,
          );
        }),
      );
    parent.append(card);
  }
  async function movement(page: "entrada" | "saida") {
    const ticket = epoch,
      c = ctx!;
    const form = document.createElement("form");
    form.className = "online-admin-form";
    form.id = "stockMovementForm";
    const contract = select(
      form,
      page === "entrada" ? "Contrato de destino" : "Contrato de origem",
      "contract_id",
      c.contracts,
      true,
    );
    const product = select(
      form,
      "Material do catálogo",
      "product_id",
      [],
      true,
    );
    const code = field(form, "Código automático", "code");
    code.readOnly = true;
    const unit = field(form, "Unidade automática", "unit");
    unit.readOnly = true;
    const balance = field(form, "Saldo disponível no contrato", "balance");
    balance.readOnly = true;
    const quantity = field(
      form,
      page === "entrada" ? "Quantidade recebida" : "Quantidade retirada",
      "quantity",
      true,
    );
    quantity.inputMode = "decimal";
    quantity.maxLength = 25;
    if (page === "entrada") {
      select(form, "Fornecedor", "supplier_id", c.suppliers);
      field(form, "OC existente (permite entradas parciais)", "oc");
      field(form, "NF", "nf");
    } else {
      field(form, "Local de destino", "destination", true);
      field(form, "Nome completo de quem retirou", "recipient", true);
      field(form, "Empresa de quem retirou", "recipient_company", true);
    }
    const actor = field(form, "Almoxarife autenticado", "actor");
    actor.value = c.actor.name;
    actor.readOnly = true;
    const date = field(form, "Horário consultado no servidor", "date");
    date.readOnly = true;
    date.value = new Date(c.server_time).toLocaleString("pt-BR");
    field(form, "Observações", "notes", false, "textarea");
    form.append(
      text(
        "p",
        "Data/hora e responsável efetivos serão registrados pelo banco. OC e NF são referências; não há criação nem aprovação de OC.",
      ),
    );
    const submit = button("Revisar " + page, () => {});
    submit.type = "submit";
    submit.id = "stockReview";
    form.append(submit);
    const can = stockCan(
      c.permissions,
      (page + ".registrar") as StockPermission,
    );
    if (!can) {
      submit.disabled = true;
      submit.dataset.forbidden = "true";
      form
        .querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input,select,textarea")
        .forEach((n) => (n.disabled = true));
      form.prepend(text("p", "Consulta permitida. Registro não autorizado."));
    }
    let expected = "0.000000",
      pending: Record<string, unknown> | null = null,
      success = false;
    const fillProduct = () => {
      const p = c.products.find((p) => p.id === product.value);
      code.value = p?.code || "";
      unit.value = p?.unit || "";
      expected =
        c.balances.find(
          (b) =>
            b.contract_id === contract.value && b.product_id === product.value,
        )?.quantity || "0.000000";
      balance.value = expected;
      pending = null;
    };
    const fillOptions = () => {
      const previous = product.value;
      const products =
        page === "entrada"
          ? c.products
          : c.products.filter((p) =>
              c.balances.some(
                (b) =>
                  b.contract_id === contract.value && b.product_id === p.id,
              ),
            );
      product.replaceChildren(
        new Option("Selecione…", ""),
        ...products.map(
          (p) => new Option(`${p.code} · ${p.description}`, p.id),
        ),
      );
      if (products.some((p) => p.id === previous)) product.value = previous;
      fillProduct();
    };
    contract.onchange = fillOptions;
    product.onchange = fillProduct;
    form.oninput = () => {
      pending = null;
    };
    fillOptions();
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!can || success || busy || !form.reportValidity()) return;
      try {
        const q = stockQuantity(quantity.value),
          after = stockProposed(expected, q, page);
        if (!pending) {
          pending = {
            kind: page,
            contract_id: contract.value,
            product_id: product.value,
            quantity: q,
            expected_quantity: expected,
            idempotency_key: crypto.randomUUID(),
          };
          for (const name of page === "entrada"
            ? ["supplier_id", "oc", "nf", "notes"]
            : ["destination", "recipient", "recipient_company", "notes"])
            pending[name] = input(form, name).value.trim();
        }
        const request = { ...pending };
        ask(
          `${page.toUpperCase()}\nContrato: ${contract.selectedOptions[0].textContent}\nMaterial: ${product.selectedOptions[0].textContent}\nQuantidade: ${q} ${unit.value}\nSaldo: ${expected} → ${after}\nResponsável autenticado: ${c.actor.name}`,
          async () => {
            const result = await service.post(request);
            if (ticket !== epoch) return;
            success = true;
            balance.value = result.after_quantity;
            date.value = new Date(result.occurred_at).toLocaleString("pt-BR");
            actor.value = result.actor_name;
            form
              .querySelectorAll<
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              >("input,select,textarea")
              .forEach((n) => (n.disabled = true));
            submit.dataset.forbidden = "true";
            receipt(result, host);
            host.append(button("Nova " + page, () => void open(page)));
            message(
              result.reused
                ? "Comprovante recuperado. A movimentação não foi duplicada."
                : "Movimentação confirmada no banco; saldo e auditoria atualizados.",
            );
          },
        );
      } catch (e) {
        fail(e);
      }
    };
    host.append(
      form,
      button("Atualizar saldo / limpar formulário", () => void open(page)),
    );
    if (stockCan(c.permissions, (page + ".visualizar") as StockPermission)) {
      const previous = document.createElement("div");
      host.append(previous);
      const result = await service.history({ kind: page });
      if (ticket === epoch) {
        previous.append(text("h3", "Registros anteriores (últimos 100)"));
        if (!result.rows.length)
          previous.append(text("p", "Nenhuma movimentação visível."));
        for (const r of result.rows) receipt(r, previous);
      }
    }
  }
  async function history(page: Page) {
    const ticket = epoch;
    const form = document.createElement("form");
    form.className = "online-admin-form";
    form.id = "stockHistoryFilters";
    select(form, "Contrato", "contract_id", ctx!.contracts);
    const material = select(
      form,
      "Material",
      "product_id",
      ctx!.products.map((p) => ({
        id: p.id,
        name: p.code + " · " + p.description,
      })),
    );
    select(form, "Tipo", "kind", [
      { id: "entrada", name: "Entrada" },
      { id: "saida", name: "Saída" },
    ]);
    field(form, "A partir de", "from", false, "datetime-local");
    field(form, "Até", "to", false, "datetime-local");
    const actor = select(form, "Funcionário", "actor_id", []);
    const search = button("Filtrar histórico", () => {});
    search.type = "submit";
    form.append(search);
    host.append(
      form,
      text(
        "p",
        "Fotografias importadas são auditadas separadamente em Administração → Histórico. Não são entradas ou saídas.",
      ),
    );
    const rows = document.createElement("div");
    host.append(rows);
    let offset = 0,
      filters: Record<string, unknown> = {};
    const load = async () => {
      const result = await service.history({ ...filters, offset });
      if (ticket !== epoch) return;
      rows.replaceChildren(
        text(
          "p",
          `Página com ${result.rows.length} registros · posição ${offset}`,
        ),
      );
      for (const [selector, values] of [
        [actor, result.actors],
        [material, result.products],
      ] as [HTMLSelectElement, { id: string; name: string }[]][]) {
        const selected = selector.value;
        selector.replaceChildren(
          new Option("Todos", ""),
          ...values.map((v) => new Option(v.name, v.id)),
        );
        selector.value = selected;
      }
      for (const r of result.rows) receipt(r, rows);
      if (!result.rows.length)
        rows.append(
          text(
            "p",
            "Nenhum registro corresponde aos filtros e às permissões atuais.",
          ),
        );
      if (offset)
        rows.append(
          button("Anterior", () => {
            offset -= 100;
            void run(load);
          }),
        );
      if (result.rows.length === 100)
        rows.append(
          button("Próxima", () => {
            offset += 100;
            void run(load);
          }),
        );
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      filters = {};
      for (const name of [
        "contract_id",
        "product_id",
        "actor_id",
        "kind",
        "from",
        "to",
      ]) {
        const v = input(form, name).value;
        if (v)
          filters[name] = ["from", "to"].includes(name)
            ? new Date(v).toISOString()
            : v;
      }
      offset = 0;
      void run(load);
    };
    if (stockCan(ctx!.permissions, "relatorios.exportar"))
      host.append(
        button(
          "Exportar esta página / comprovantes JSON",
          () =>
            void run(async () => {
              const fresh = await service.context();
              update(fresh);
              if (!stockCan(fresh.permissions, "relatorios.exportar"))
                throw new OnlineError(
                  "permission",
                  "Exportação não autorizada.",
                );
              const result = await service.report({ ...filters, offset });
              if (ticket !== epoch) return;
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        date: fresh.server_time,
                        filters,
                        offset,
                        rows: result.rows,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "jp-movimentacoes.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }),
        ),
      );
    await load();
  }
  async function administration(page: Page) {
    const ticket = epoch,
      data = await (page === "roles" ? service.roles() : service.admin());
    if (ticket !== epoch) return;
    host.append(
      text(
        "p",
        "Cargo personalizado define padrões; o ajuste individual prevalece e não altera colegas. O perfil de sistema mantém o escopo de contratos. Autenticação/provisionamento Auth continuam em canal confiável.",
      ),
    );
    if (page === "roles") roles(data);
    else users(data);
    const audit = document.createElement("details");
    audit.append(
      text("summary", "Histórico de alterações de permissões (últimas 100)"),
      text("pre", JSON.stringify(data.audit, null, 2)),
    );
    host.append(audit);
  }
  function roles(data: StockAdmin) {
    const form = document.createElement("form");
    form.className = "online-admin-form";
    form.id = "stockRoleForm";
    const chosen = select(
      form,
      "Cargo para editar (vazio = novo)",
      "id",
      data.roles,
    );
    const name = field(form, "Nome do cargo", "name", true);
    const caps = document.createElement("fieldset");
    caps.append(text("legend", "Permissões padrão"));
    for (const [key, label] of Object.entries(stockPermissions)) {
      const wrap = document.createElement("label"),
        cb = document.createElement("input");
      cb.type = "checkbox";
      cb.name = key;
      wrap.append(cb, document.createTextNode(label));
      caps.append(wrap);
    }
    form.append(caps);
    const save = button("Salvar cargo", () => {});
    save.type = "submit";
    save.id = "stockSaveRole";
    form.append(save);
    const capable =
      stockCan(ctx!.permissions, "cargos.gerenciar");
    const refresh = () => {
      const r = data.roles.find((r) => r.id === chosen.value);
      name.value = r?.name || "";
      const immutable = !!r?.system_role;
      for (const cb of caps.querySelectorAll<HTMLInputElement>("input")) {
        cb.checked = data.role_permissions.some(
          (p) => p.role_id === r?.id && p.permission === cb.name,
        );
        cb.disabled =
          immutable ||
          !capable ||
          !ctx!.permissions.includes(cb.name as StockPermission);
      }
      save.disabled = immutable || !capable;
      save.dataset.forbidden = String(save.disabled);
      name.disabled = immutable || !capable;
    };
    chosen.onchange = refresh;
    refresh();
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!form.reportValidity() || save.disabled) return;
      const permissions = [
        ...caps.querySelectorAll<HTMLInputElement>("input:checked"),
      ].map((c) => c.name);
      ask(
        `Salvar cargo ${name.value} com ${permissions.join(", ")}? Alterações afetam seus usuários. O servidor impede alterações do próprio cargo e concessões acima do gestor.`,
        async () => {
          await service.saveRole({
            id: chosen.value,
            name: name.value.trim(),
            permissions,
          });
          await refreshAfterChange("roles");
        },
      );
    };
    host.append(
      text(
        "p",
        "Perfis de sistema são protegidos. Crie um cargo personalizado para adaptar os padrões.",
      ),
      form,
    );
  }
  function users(data: StockAdmin) {
    const form = document.createElement("div");
    form.className = "online-admin-form";
    const user = select(
      form,
      "Funcionário",
      "user_id",
      data.users.map((u) => ({
        id: u.id,
        name: u.name + (u.active ? "" : " (inativo)"),
      })),
    );
    const detail = document.createElement("div");
    form.append(detail);
    user.onchange = () => {
      detail.replaceChildren();
      const u = data.users.find((u) => u.id === user.value);
      if (!u) return;
      const own = u.id === ctx!.actor.id;
      detail.append(
        text(
          "p",
          `${u.email} · perfil de sistema: ${u.role}. ${own ? "Autoadministração bloqueada; outro gestor deve alterar." : ""}`,
        ),
      );
      const job = select(
        detail,
        "Cargo personalizado (vazio = padrão do perfil)",
        "role_id",
        data.roles.filter((r) => !r.system_role),
      );
      job.value =
        data.user_roles.find((r) => r.user_id === u.id)?.role_id || "";
      const assign = button("Atribuir cargo", () =>
        ask(`Atribuir cargo a ${u.name}?`, async () => {
          await service.assignRole({ user_id: u.id, role_id: job.value });
          await refreshAfterChange("users");
        }),
      );
      assign.disabled =
        own ||
        !stockCan(ctx!.permissions, "usuarios.gerenciar");
      assign.dataset.forbidden = String(assign.disabled);
      detail.append(assign);
      const permission = select(
          detail,
          "Permissão individual",
          "permission",
          Object.entries(stockPermissions).map(([id, name]) => ({ id, name })),
          true,
        ),
        decision = select(
          detail,
          "Ajuste específico deste usuário",
          "decision",
          [
            { id: "inherit", name: "Herdar do cargo" },
            { id: "allow", name: "Conceder" },
            { id: "deny", name: "Negar" },
          ],
          true,
        );
      decision.value = "inherit";
      permission.onchange = () => {
        const o = data.overrides.find(
          (o) => o.user_id === u.id && o.permission === permission.value,
        );
        decision.value = o ? (o.allowed ? "allow" : "deny") : "inherit";
      };
      const apply = button("Aplicar ajuste individual", () => {
        if (!permission.value || !decision.value) {
          message("Selecione a permissão e a decisão.");
          return;
        }
        ask(
          `${u.name}: ${permission.value} → ${decision.selectedOptions[0].textContent}. Outros usuários não serão alterados.`,
          async () => {
            await service.override({
              user_id: u.id,
              permission: permission.value,
              decision: decision.value,
            });
            await refreshAfterChange("users");
          },
        );
      });
      apply.disabled = own || !stockCan(ctx!.permissions, "permissoes.gerenciar");
      apply.dataset.forbidden = String(apply.disabled);
      detail.append(
        apply,
        text(
          "pre",
          JSON.stringify(
            {
              cargo: data.roles.find(
                (r) =>
                  r.id ===
                  (data.user_roles.find((r) => r.user_id === u.id)?.role_id ||
                    data.roles.find((r) => r.system_role === u.role)?.id),
              )?.name,
              ajustes: data.overrides.filter((o) => o.user_id === u.id),
            },
            null,
            2,
          ),
        ),
      );
      const activation = button(
        u.active ? "Desativar usuário" : "Ativar usuário",
        () =>
          ask(`${u.active ? "Desativar" : "Ativar"} ${u.name}?`, async () => {
            await service.status(u, !u.active);
            await refreshAfterChange("users");
          }),
      );
      activation.disabled = assign.disabled;
      activation.dataset.forbidden = String(activation.disabled);
      detail.append(activation, text("h3", "Contratos autorizados"));
      for (const contract of data.contracts) {
        const authorized = data.links.some(
          (l) => l.user_id === u.id && l.contract_id === contract.id,
        );
        const toggle = button(
          `${authorized ? "Revogar" : "Autorizar"} ${contract.name}`,
          () =>
            ask(
              `${authorized ? "Revogar" : "Autorizar"} ${contract.name} para ${u.name}?`,
              async () => {
                await service.link(u.id, contract.id, !authorized);
                await refreshAfterChange("users");
              },
            ),
        );
        toggle.disabled = assign.disabled;
        toggle.dataset.forbidden = String(toggle.disabled);
        detail.append(toggle);
      }
      detail.append(
        text(
          "p",
          "O servidor protege o proprietário e limita o administrador. Contas Auth novas são provisionadas em canal confiável, sem cadastro público.",
        ),
      );
    };
    host.append(form);
  }
  async function open(page: Page) {
    const ticket = ++epoch;
    try {
      const next = await service.context();
      if (ticket !== epoch) return;
      update(next);
      if (!allowed(page))
        throw new OnlineError(
          "permission",
          "Menu não autorizado para este usuário.",
        );
      current = page;
      nav.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
        b.classList.toggle("active", b === buttons.get(page));
        if (b === buttons.get(page)) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      onOpen();
      host.hidden = false;
      pageTitle(page);
      if (page === "entrada" || page === "saida") await movement(page);
      else if (["history", "reports"].includes(page)) await history(page);
      else if (page === "users" || page === "roles") await administration(page);
      else if (page === "dashboard") {
        host.append(
          text(
            "p",
            `${ctx!.products.length} materiais consultáveis · ${ctx!.contracts.length} contratos autorizados · ${ctx!.balances.length} saldos.`,
          ),
        );
      } else
        for (const p of ctx!.products) {
          const card = document.createElement("article");
          card.className = "online-admin-record";
          card.append(
            text("h3", p.code),
            text("p", p.description + " · " + p.unit),
          );
          host.append(card);
        }
    } catch (e) {
      if (ticket === epoch) {
        host.hidden = false;
        onOpen();
        fail(e);
      }
    }
  }
  return {
    update,
    open,
    isOpen: () => current !== null,
    async revalidate() {
      const ticket = epoch;
      try {
        const previous = JSON.stringify([
          ctx?.permissions,
          ctx?.contracts.map((c) => c.id),
        ]);
        const next = await service.context();
        if (ticket !== epoch) return;
        update(next);
        if (current && !allowed(current))
          throw new OnlineError("permission", "Acesso revogado.");
        if (
          current &&
          previous !==
            JSON.stringify([next.permissions, next.contracts.map((c) => c.id)])
        )
          await open(current);
      } catch (e) {
        if (ticket === epoch) fail(e);
      }
    },
    close() {
      ++epoch;
      current = null;
      host.hidden = true;
      host.replaceChildren();
      confirmation = null;
      summary.textContent = "";
      reason.value = "";
      if (dialog.open) dialog.close();
    },
    clear() {
      this.close();
      ctx = null;
      for (const b of buttons.values()) b.hidden = true;
    },
  };
}
