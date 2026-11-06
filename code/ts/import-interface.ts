import { hasPermission } from "./access";
import { readSpreadsheet } from "./spreadsheet-reader";
import {
  applyImportPlan,
  buildImportPlan,
  detectHeaderRow,
  fieldLabels,
  setImportPolicy,
  suggestMapping,
} from "./import-service";
import {
  importFields,
  type ImportAction,
  type ImportHost,
  type ImportPlan,
  type Spreadsheet,
  type ColumnMapping,
} from "./import-types";

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};
export function mountImport(host: ImportHost): { reset(): void } {
  const byId = (id: string) => document.getElementById(id)!;
  const fileInput = byId("file") as HTMLInputElement,
    sheetSelect = byId("sheetSelect") as HTMLSelectElement;
  const header = byId("headerRow") as HTMLInputElement,
    policy = byId("importPolicy") as HTMLSelectElement;
  const commit = byId("commit") as HTMLButtonElement;
  let spreadsheet: Spreadsheet | null = null,
    plan: ImportPlan | null = null,
    generation = 0,
    page = 0;
  const pageSize = 50;
  const allowed = () =>
    hasPermission(host.currentUser(), "import_spreadsheets");
  const message = (text: string) => (byId("importMessage").textContent = text);
  const hidePlan = () => {
    plan = null;
    page = 0;
    byId("previewArea").classList.add("hidden");
    commit.disabled = true;
  };
  function reset(): void {
    generation++;
    spreadsheet = null;
    hidePlan();
    fileInput.value = "";
    sheetSelect.replaceChildren();
    byId("workbookControls").classList.add("hidden");
    byId("mapping").classList.add("hidden");
    byId("mapFields").replaceChildren();
    byId("previewRows").replaceChildren();
    message("");
    byId("importReports").replaceChildren();
    if (allowed()) renderReports();
  }
  function renderReports(): void {
    const container = byId("importReports");
    container.replaceChildren();
    if (!allowed()) return;
    container.append(element("h4", "Relatórios locais de importação"));
    host
      .getReports()
      .slice()
      .reverse()
      .forEach((report) => {
        const details = element("details");
        details.append(
          element(
            "summary",
            `${new Date(report.date).toLocaleString("pt-BR")} · ${report.fileName} · ${report.sheetName}`,
          ),
        );
        details.append(
          element("p", report.summary),
          element(
            "p",
            `${report.added + report.updated} sucessos · ${report.warnings} linhas com avisos · ${report.errors} linhas com erros ignoradas · ${report.ignored} ignoradas. Autor fictício: ${report.actorId}. Cabeçalho: linha ${report.headerRow}.`,
          ),
        );
        // Full results remain available locally; expandable rows avoid enormous initial DOMs.
        const lines = element("details");
        lines.append(
          element("summary", `Ver ${report.lines.length} resultados por linha`),
        );
        lines.addEventListener("toggle", () => {
          if (!lines.open || lines.children.length > 1) return;
          report.lines.forEach((line) =>
            lines.append(
              element(
                "p",
                `Linha ${line.line} · ${line.code} · ${line.status === "success" ? "Sucesso" : line.status === "error" ? "Erro (ignorada)" : "Ignorada"} · ${line.action} · ${line.messages.join(" ")}`,
              ),
            ),
          );
        });
        details.append(lines);
        container.append(details);
      });
  }
  function mapHeaders(): void {
    hidePlan();
    const sheet = spreadsheet?.sheets.find(
      (sheet) => sheet.name === sheetSelect.value,
    );
    const index = Number(header.value) - 1;
    if (
      !sheet ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= sheet.rows.length
    ) {
      message("Selecione uma linha de cabeçalho existente.");
      return;
    }
    const headers = sheet.rows[index],
      suggested = suggestMapping(headers);
    const fields = byId("mapFields");
    fields.replaceChildren();
    for (const field of importFields) {
      const label = element("label", fieldLabels[field]);
      label.className = "label";
      const select = element("select");
      select.dataset.map = field;
      select.add(new Option("Não importar", ""));
      headers.forEach((name, index) =>
        select.add(
          new Option(
            `${index + 1}: ${typeof name === "object" ? "(cabeçalho inválido)" : name || "(vazio)"}`,
            String(index),
          ),
        ),
      );
      select.value =
        suggested[field] === undefined ? "" : String(suggested[field]);
      select.onchange = hidePlan;
      label.append(select);
      fields.append(label);
    }
    byId("mapping").classList.remove("hidden");
    message(
      "Revise o cabeçalho e o mapeamento. Nenhuma alteração foi aplicada.",
    );
  }
  fileInput.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    reset();
    if (!allowed()) {
      message("Somente Proprietário e Administrador ativos podem importar.");
      return;
    }
    if (!file) return;
    const token = generation;
    message("Lendo arquivo localmente…");
    try {
      const result = await readSpreadsheet(file);
      if (token !== generation || !allowed()) return;
      spreadsheet = result;
      sheetSelect.replaceChildren(
        ...result.sheets.map((sheet) => new Option(sheet.name, sheet.name)),
      );
      byId("workbookControls").classList.remove("hidden");
      header.value = String(detectHeaderRow(result.sheets[0]) + 1);
      mapHeaders();
    } catch (error) {
      if (token === generation) message(`Erro: ${(error as Error).message}`);
    }
  };
  sheetSelect.onchange = () => {
    const sheet = spreadsheet?.sheets.find(
      (sheet) => sheet.name === sheetSelect.value,
    );
    if (sheet) header.value = String(detectHeaderRow(sheet) + 1);
    mapHeaders();
  };
  header.onchange = mapHeaders;
  function renderPlan(): void {
    if (!plan) return;
    const selected = plan.rows.filter((row) => row.action !== "ignore"),
      errors = plan.rows.filter((row) => row.errors.length).length;
    byId("previewInfo").textContent =
      `${plan.rows.length} linhas · ${errors} com erros · ${plan.rows.filter((row) => row.warnings.length).length} com avisos · ${selected.filter((row) => row.action === "add").length} para adicionar · ${selected.filter((row) => row.action === "update").length} para atualizar. ${plan.rows.length - selected.length} ignoradas. Quantidades atualizadas substituem o saldo registrado; não são somadas e não geram movimentações.`;
    commit.disabled =
      !selected.length || selected.some((row) => row.errors.length > 0);
    const body = byId("previewRows");
    body.replaceChildren();
    const context = host.getContext();
    for (const row of plan.rows.slice(page * pageSize, (page + 1) * pageSize)) {
      const tr = element("tr");
      const before = context.materials.find(
        (material) => material.id === row.existingId,
      );
      const select = element("select");
      select.dataset.actionLine = String(row.line);
      select.setAttribute("aria-label", `Ação para linha ${row.line}`);
      select.add(new Option("Ignorar", "ignore"));
      if (!row.errors.length)
        select.add(
          new Option(
            row.existingId ? "Atualizar existente" : "Adicionar novo saldo",
            row.existingId ? "update" : "add",
          ),
        );
      select.value = row.action;
      select.disabled = row.errors.length > 0;
      select.onchange = () => {
        row.action = select.value as ImportAction;
        renderPlan();
      };
      const issues = element(
        "div",
        [...row.errors, ...row.warnings].join(" ") ||
          "Novo cadastro/saldo válido.",
      );
      const details = element("details");
      details.append(element("summary", "Ver dados e alterações"));
      const currentProduct = context.materials.find(
        (material) =>
          material.code.trim().toUpperCase() ===
          row.material.code.trim().toUpperCase(),
      );
      details.append(
        element(
          "pre",
          JSON.stringify(
            {
              antes: before ?? currentProduct ?? null,
              proposto: row.material,
              alteracoesGlobais: row.globalChanges,
              contratosAfetados: row.affectedContracts,
            },
            null,
            2,
          ),
        ),
      );
      issues.append(details);
      for (const value of [
        String(row.line),
        row.material.code,
        row.material.name,
        row.material.unit,
        row.material.contract,
        before ? String(before.qty) : "—",
        String(row.material.qty),
        issues,
        select,
      ]) {
        const td = element("td");
        if (typeof value === "string") td.textContent = value;
        else td.append(value);
        tr.append(td);
      }
      body.append(tr);
    }
    byId("previewPage").textContent =
      `Página ${page + 1} de ${Math.ceil(plan.rows.length / pageSize)} · até 50 linhas por página`;
    (byId("previousPreview") as HTMLButtonElement).disabled = page === 0;
    (byId("nextPreview") as HTMLButtonElement).disabled =
      (page + 1) * pageSize >= plan.rows.length;
  }
  byId("previousPreview").onclick = () => {
    if (page > 0) {
      page--;
      renderPlan();
    }
  };
  byId("nextPreview").onclick = () => {
    if (plan && (page + 1) * pageSize < plan.rows.length) {
      page++;
      renderPlan();
    }
  };
  policy.onchange = () => {
    if (plan) {
      setImportPolicy(plan, policy.value as ImportAction);
      renderPlan();
    }
  };
  byId("preview").onclick = () => {
    if (!allowed()) return;
    try {
      const sheet = spreadsheet?.sheets.find(
        (sheet) => sheet.name === sheetSelect.value,
      );
      if (!sheet || !spreadsheet)
        throw new Error("Selecione primeiro um arquivo e uma aba.");
      const mapping: ColumnMapping = {};
      document
        .querySelectorAll<HTMLSelectElement>("[data-map]")
        .forEach((select) => {
          if (select.value !== "")
            mapping[select.dataset.map as keyof ColumnMapping] = Number(
              select.value,
            );
        });
      plan = buildImportPlan(
        sheet,
        spreadsheet.fileName,
        Number(header.value) - 1,
        mapping,
        host.getContext(),
      );
      page = 0;
      policy.value = "ignore";
      byId("previewArea").classList.remove("hidden");
      renderPlan();
      message(
        "Prévia pronta. Escolha as ações; registros existentes nunca serão substituídos automaticamente.",
      );
    } catch (error) {
      hidePlan();
      message((error as Error).message);
    }
  };
  commit.onclick = () => {
    if (!allowed() || !plan) return;
    try {
      const adds = plan.rows.filter((row) => row.action === "add").length,
        updates = plan.rows.filter((row) => row.action === "update").length;
      if (!adds && !updates)
        throw new Error("Escolha ao menos uma linha válida.");
      if (
        !confirm(
          `Confirmar importação local de ${plan.fileName}, aba ${plan.sheetName}? ${adds} saldo(s) novo(s), ${updates} saldo(s) atualizado(s). Atualizações podem alterar dados globais do produto em outros contratos e substituir somente os saldos selecionados, sem somar quantidades. Não haverá movimentações. Revise a prévia antes de confirmar.`,
        )
      )
        return;
      const result = applyImportPlan(
        plan,
        host.getContext(),
        host.currentUser(),
        true,
      );
      if (!host.apply(result.materials, result.report))
        throw new Error(
          "Falha no armazenamento local. Nada foi aplicado. Libere espaço e tente novamente.",
        );
      hidePlan();
      byId("mapping").classList.add("hidden");
      byId("workbookControls").classList.add("hidden");
      spreadsheet = null;
      fileInput.value = "";
      message(`Importação concluída. ${result.report.summary}`);
      renderReports();
    } catch (error) {
      message((error as Error).message);
    }
  };
  reset();
  return { reset };
}
