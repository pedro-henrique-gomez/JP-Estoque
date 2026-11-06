import {
  createOnlineBackend,
  OnlineError,
  type OnlineSnapshot,
  type OnlineRow,
} from "./data/online";
import type { OnlineConfiguration } from "./data/online-config";
import { roleLabels } from "./access";
import { mountOnlineAdministration } from "./online-admin-interface";

export async function mountOnline(configuration: OnlineConfiguration) {
  const backend = createOnlineBackend(configuration, window.sessionStorage);
  const main = document.querySelector<HTMLElement>("main")!;
  document.querySelector(".nav")!.innerHTML =
    '<button class="active" id="onlineConsult">Consultar materiais</button><button id="onlineAdmin">Administração</button>';
  document.querySelector(".sidefoot")!.textContent =
    "v1.0 experimental · Supabase local · Somente dados fictícios";
  main.innerHTML = `<header class="top"><div><p class="eyebrow">JP ENGENHARIA E PROJETOS / ESTOQUE</p><h1>Consulta de materiais</h1><p>Ambiente experimental de desenvolvimento. Sem uso em produção.</p></div><span class="pill">Supabase local · Consulta online</span></header>
    <p id="onlineStatus" class="notice" role="status" aria-live="polite">Verificando sessão…</p>
    <section id="onlineLogin" class="panel online-login" hidden aria-labelledby="loginTitle"><h2 id="loginTitle">Entrar no Supabase local</h2><p>Use uma identidade fictícia provisionada no ambiente local. Este formulário realiza autenticação real.</p><form id="loginForm"><label class="label" for="email">Email</label><input id="email" type="email" autocomplete="username" required /><label class="label" for="password">Senha</label><input id="password" type="password" autocomplete="current-password" required /><button type="submit" class="btn primary">Entrar</button></form></section>
    <div id="sessionControls" class="online-session" hidden><span id="onlineIdentity"></span><button id="refreshOnline" class="btn">Atualizar consulta</button><button id="logoutOnline" class="btn">Sair</button></div>
    <section id="onlineInventory" class="panel search-panel" hidden><h2>Encontre o material que você precisa</h2><div class="filters"><div><label class="label" for="search">Pesquisar material, código, fabricante, OC ou NF</label><input id="search" type="search" placeholder="Pesquisar materiais…" /></div><div><label class="label" for="contract">Contrato</label><select id="contract"></select></div><div><label class="label" for="category">Categoria</label><select id="category"></select></div></div><button id="clearOnlineFilters" class="btn">Limpar filtros</button><p id="onlineCount" aria-live="polite"></p><div id="onlineResults" class="online-results"></div></section>
    <section id="onlineAdministration" class="panel" hidden><h2>Administração online</h2><p id="onlineAdminMessage"></p></section>
    <dialog id="onlineDetail" class="online-detail" aria-labelledby="detailTitle"><h2 id="detailTitle">Detalhes do material</h2><div id="detailBody"></div><form method="dialog"><button class="btn">Fechar</button></form></dialog>`;
  const el = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const login = el("onlineLogin"),
    controls = el("sessionControls"),
    inventory = el("onlineInventory"),
    administration = el("onlineAdministration"),
    status = el("onlineStatus");
  const search = el<HTMLInputElement>("search"),
    contract = el<HTMLSelectElement>("contract"),
    category = el<HTMLSelectElement>("category");
  const dialog = el<HTMLDialogElement>("onlineDetail");
  let snapshot: OnlineSnapshot | null = null,
    generation = 0,
    loading = false,
    signedOut = false;
  const setStatus = (text: string) => {
    status.textContent = text;
  };
  const administrativeUI = mountOnlineAdministration(
    administration,
    backend.administration,
    (error) => {
      snapshot = null;
      inventory.hidden = true;
      el("onlineResults").replaceChildren();
      el("detailBody").replaceChildren();
      el("onlineIdentity").textContent = "";
      contract.replaceChildren();
      category.replaceChildren();
      if (dialog.open) dialog.close();
      setStatus(error.message);
      login.hidden = error.kind !== "session";
      controls.hidden = error.kind === "session";
    },
  );
  function protect() {
    administrativeUI.close();
    snapshot = null;
    inventory.hidden = true;
    administration.hidden = true;
    el("onlineResults").replaceChildren();
    el("detailBody").replaceChildren();
    el("onlineIdentity").textContent = "";
    contract.replaceChildren();
    category.replaceChildren();
    if (dialog.open) dialog.close();
  }
  function selectOptions(
    select: HTMLSelectElement,
    values: { id: string; name: string }[],
    label: string,
  ) {
    const previous = select.value;
    select.replaceChildren(
      new Option(label, ""),
      ...values.map((v) => new Option(v.name, v.id)),
    );
    if (values.some((v) => v.id === previous)) select.value = previous;
  }
  function details(row: OnlineRow) {
    if (!snapshot) return;
    const product = snapshot.products.find((p) => p.id === row.product_id)!;
    const location = snapshot.locations.find((l) => l.id === row.location_id);
    const refs = snapshot.references.filter((r) => r.balance_id === row.id);
    const body = el("detailBody");
    body.replaceChildren();
    const values: Record<string, string> = {
      Código: product.code,
      Descrição: product.description,
      Categoria: product.category || "Não informada",
      Fabricante: product.manufacturer || "Não informado",
      Unidade: product.unit,
      Contrato:
        snapshot.contracts.find((c) => c.id === row.contract_id)?.name ||
        "Não disponível",
      Saldo: row.quantity,
      Localização: location
        ? `${location.code} · ${location.description}`
        : "Não informada",
      Fornecedor:
        snapshot.suppliers.find((s) => s.id === row.supplier_id)?.name ||
        "Não informado",
      "OC / NF":
        refs
          .map((r) => `${r.kind.toUpperCase()}: ${r.reference}`)
          .join(" · ") || "Sem referências",
      "Última atualização": row.updated_at
        ? new Date(row.updated_at).toLocaleString("pt-BR")
        : "Não disponível",
    };
    for (const [label, text] of Object.entries(values)) {
      const p = document.createElement("p"),
        b = document.createElement("strong");
      b.textContent = label + ": ";
      p.append(b, document.createTextNode(text));
      body.append(p);
    }
    const heading = document.createElement("h3");
    heading.textContent = "Saldos nos contratos autorizados";
    body.append(heading);
    for (const balance of snapshot.balances.filter(
      (b) => b.product_id === row.product_id,
    )) {
      const p = document.createElement("p");
      p.textContent = `${snapshot.contracts.find((c) => c.id === balance.contract_id)?.name || "Contrato"}: ${balance.quantity} ${product.unit}`;
      body.append(p);
    }
    dialog.showModal();
  }
  function render() {
    if (!snapshot) return;
    const results = el("onlineResults");
    results.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase("pt-BR");
    const rows = snapshot.balances.filter((row) => {
      const p = snapshot!.products.find((p) => p.id === row.product_id);
      if (!p) return false;
      const refs = snapshot!.references
        .filter((r) => r.balance_id === row.id)
        .map((r) => r.reference)
        .join(" ");
      return (
        (!contract.value || contract.value === row.contract_id) &&
        (!category.value || category.value === p.category) &&
        [p.code, p.description, p.manufacturer, refs]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(query)
      );
    });
    el("onlineCount").textContent =
      `${rows.length} saldo(s) em contratos autorizados`;
    if (!rows.length) {
      const p = document.createElement("p");
      p.className = "notice";
      p.textContent =
        snapshot.contracts.length === 0
          ? "Nenhum contrato autorizado. Solicite acesso ao responsável."
          : snapshot.balances.length === 0
            ? "Não há saldos disponíveis nos contratos autorizados."
            : "Nenhum material encontrado. Revise a pesquisa ou limpe os filtros.";
      results.append(p);
    }
    for (const row of rows) {
      const p = snapshot.products.find((p) => p.id === row.product_id)!;
      const card = document.createElement("article");
      card.className = "panel online-material";
      const title = document.createElement("h3");
      title.textContent = p.description;
      const code = document.createElement("p");
      code.textContent = `${p.code} · ${p.category || "Sem categoria"}`;
      const balance = document.createElement("p");
      balance.textContent = `${snapshot.contracts.find((c) => c.id === row.contract_id)?.name || "Contrato"} · ${row.quantity} ${p.unit}`;
      const button = document.createElement("button");
      button.className = "btn";
      button.textContent = "Ver detalhes";
      button.setAttribute("aria-label", `Ver detalhes de ${p.code}`);
      button.onclick = () => details(row);
      card.append(title, code, balance, button);
      results.append(card);
    }
  }
  async function refresh() {
    if (loading || signedOut) return;
    if (administrativeUI.isOpen()) {
      await administrativeUI.revalidate();
      return;
    }
    loading = true;
    const ticket = ++generation;
    const previousContract = contract.value,
      previousCategory = category.value;
    // Hide previously fetched data while identity and current authorization are checked.
    protect();
    setStatus("Verificando sessão e consultando permissões no servidor…");
    try {
      const next = await backend.snapshot();
      if (ticket !== generation || signedOut) return;
      snapshot = next;
      login.hidden = true;
      controls.hidden = false;
      inventory.hidden = false;
      el("onlineIdentity").textContent =
        `${next.profile.name} · ${roleLabels[next.profile.role]}`;
      selectOptions(contract, next.contracts, "Todos os contratos autorizados");
      selectOptions(
        category,
        [...new Set(next.products.map((p) => p.category).filter(Boolean))]
          .sort()
          .map((name) => ({ id: name, name })),
        "Todas as categorias",
      );
      if ([...contract.options].some((o) => o.value === previousContract))
        contract.value = previousContract;
      if ([...category.options].some((o) => o.value === previousCategory))
        category.value = previousCategory;
      setStatus("Consulta atualizada. Acesso controlado pelo servidor (RLS).");
      render();
    } catch (error) {
      if (ticket !== generation) return;
      protect();
      const e =
        error instanceof OnlineError
          ? error
          : new OnlineError(
              "connection",
              "Conexão indisponível. Tente atualizar a consulta.",
            );
      setStatus(e.message);
      login.hidden = e.kind !== "session";
      controls.hidden = e.kind === "session";
    } finally {
      loading = false;
    }
  }
  el<HTMLFormElement>("loginForm").onsubmit = async (event) => {
    event.preventDefault();
    const button = el<HTMLButtonElement>("loginForm").querySelector("button")!;
    button.disabled = true;
    try {
      await backend.login(
        el<HTMLInputElement>("email").value.trim(),
        el<HTMLInputElement>("password").value,
      );
      el<HTMLInputElement>("password").value = "";
      signedOut = false;
      await refresh();
    } catch (error) {
      setStatus(
        error instanceof OnlineError
          ? error.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      el<HTMLInputElement>("password").value = "";
      button.disabled = false;
    }
  };
  el("logoutOnline").onclick = async () => {
    signedOut = true;
    ++generation;
    protect();
    controls.hidden = true;
    login.hidden = false;
    const enter = el<HTMLFormElement>("loginForm").querySelector("button")!;
    enter.disabled = true;
    setStatus("Encerrando a sessão…");
    try {
      await backend.logout();
      setStatus("Sessão encerrada. Entre novamente para consultar.");
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Não foi possível confirmar o logout.",
      );
    } finally {
      enter.disabled = false;
    }
    el<HTMLInputElement>("email").focus();
  };
  el("refreshOnline").onclick = () => {
    signedOut = false;
    void refresh();
  };
  el("onlineConsult").onclick = () => {
    administrativeUI.close();
    void refresh();
  };
  el("onlineAdmin").onclick = () => {
    inventory.hidden = true;
    void administrativeUI.open();
  };
  search.oninput = render;
  contract.onchange = render;
  category.onchange = render;
  el("clearOnlineFilters").onclick = () => {
    search.value = "";
    contract.value = "";
    category.value = "";
    render();
  };
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !inventory.hidden &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName,
      )
    ) {
      e.preventDefault();
      search.focus();
    }
  });
  // Never await another Auth operation inside this callback.
  backend.client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      ++generation;
      protect();
      controls.hidden = true;
      login.hidden = false;
      setStatus("Sessão encerrada ou expirada. Entre novamente.");
    }
    if (event === "TOKEN_REFRESHED" && !signedOut)
      setTimeout(() => void refresh(), 0);
  });
  window.addEventListener("focus", () => {
    if (!signedOut) void refresh();
  });
  window.setInterval(() => {
    if (!document.hidden && !signedOut) void refresh();
  }, 30000);
  await refresh();
}
