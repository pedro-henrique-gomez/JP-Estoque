import { downloadOnlineImportReport } from "./online-import-report";
import {
  onlineImportFields,
  onlineImportLimits,
  type OnlineImportField,
  type OnlineWorkbook,
  type ImportSourceRow,
  type OnlineImportPreview,
  type ImportReceipt,
} from "./online-import-types";
import { readOnlineWorkbook } from "./online-xlsx-reader";
import type { OnlineImportService } from "./data/online-import";
import { OnlineError } from "./data/online-error";
import type { AdministrativeRecord } from "./data/online-administration";

export function mountOnlineImport(
  host: HTMLElement,
  service: OnlineImportService,
  contracts: AdministrativeRecord[],
  onDenied: (e: OnlineError) => void,
) {
  const limits = onlineImportLimits({
    VITE_JP_IMPORT_MAX_BYTES: (
      import.meta as ImportMeta & { env: Record<string, unknown> }
    ).env.VITE_JP_IMPORT_MAX_BYTES,
    VITE_JP_IMPORT_MAX_ROWS: (
      import.meta as ImportMeta & { env: Record<string, unknown> }
    ).env.VITE_JP_IMPORT_MAX_ROWS,
    VITE_JP_IMPORT_MAX_COLUMNS: (
      import.meta as ImportMeta & { env: Record<string, unknown> }
    ).env.VITE_JP_IMPORT_MAX_COLUMNS,
  });
  const events = new AbortController();
  let epoch = 0,
    busy = false,
    book: OnlineWorkbook | null = null,
    current: OnlineImportPreview | null = null,
    last: OnlineImportPreview | null = null,
    receipt: ImportReceipt | null = null;
  const decisions = new Map<
    number,
    { action: ImportSourceRow["action"]; discard: boolean; decided: boolean }
  >();
  let mapping: Partial<Record<OnlineImportField, number>> = {};
  host.innerHTML = `<p class="notice">Fotografia de saldos absolutos, sem entradas, saídas ou movimentações. Materiais ausentes não são excluídos nem zerados. Catálogo existente, referências anteriores e associações vazias serão preservados.</p><p>Limites: ${limits.bytes} bytes, ${limits.rows} linhas de dados, ${limits.columns} colunas. Para alta precisão, armazene quantidades como texto no Excel.</p>
 <label class="label" for="onlineImportFile">Planilha fictícia .xlsx</label><input id="onlineImportFile" type="file" accept=".xlsx" /><p id="onlineImportStatus" role="status" aria-live="polite"></p>
 <div id="onlineImportSetup" hidden><label class="label" for="onlineImportSheet">Aba</label><select id="onlineImportSheet"></select><label class="label" for="onlineImportDestination">Contrato de destino obrigatório</label><select id="onlineImportDestination"></select><h4>Mapear colunas (primeira linha contém cabeçalhos)</h4><div id="onlineImportMapping" class="online-admin-form"></div><button class="btn" id="onlineImportPreview">Gerar prévia no servidor</button><p>Escolha explicitamente adicionar, substituir fotografia ou ignorar cada linha; descarte linhas inválidas de forma explícita. Depois gere uma nova prévia.</p><div class="online-session"><label>Novos saldos <select id="onlineImportNew"><option value="">Escolher…</option><option value="add">Adicionar novos</option><option value="ignore">Ignorar novos</option></select></label><label>Saldos existentes <select id="onlineImportExisting"><option value="">Escolher…</option><option value="replace">Substituir pela fotografia informada</option><option value="ignore">Ignorar existentes</option></select></label></div><p id="onlineImportSummary"></p><div id="onlineImportRows"></div><button class="btn primary" id="onlineImportApply" hidden>Revisar confirmação administrativa</button><button class="btn" id="onlineImportExport" hidden>Exportar relatório JSON</button></div>
 <dialog class="online-detail" id="onlineImportConfirmation" aria-labelledby="onlineImportConfirmTitle"><h3 id="onlineImportConfirmTitle">Confirmar fotografia de saldos</h3><pre id="onlineImportConfirmSummary"></pre><label><input id="onlineImportAcknowledge" type="checkbox" /> Confirmo os valores absolutos e as diferenças apresentadas. Ausências não zeram saldos.</label><div class="online-session"><button class="btn" id="onlineImportCancel">Cancelar</button><button class="btn primary" id="onlineImportCommit">Aplicar lote atômico</button></div></dialog>`;
  const el = <T extends HTMLElement>(id: string) =>
    host.querySelector<T>("#" + id)!;
  const file = el<HTMLInputElement>("onlineImportFile"),
    sheet = el<HTMLSelectElement>("onlineImportSheet"),
    destination = el<HTMLSelectElement>("onlineImportDestination"),
    status = el("onlineImportStatus"),
    setup = el("onlineImportSetup"),
    rowsHost = el("onlineImportRows"),
    dialog = el<HTMLDialogElement>("onlineImportConfirmation");
  destination.append(
    new Option("Selecione o destino…", ""),
    ...contracts.map((c) => new Option(String(c.name), c.id)),
  );
  const say = (value: string) => (status.textContent = value);
  const controls = (value: boolean) => {
    busy = value;
    host
      .querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLSelectElement
      >("input,select,button")
      .forEach((n) => (n.disabled = value));
  };
  function failure(error: unknown) {
    const e =
      error instanceof OnlineError
        ? error
        : new OnlineError(
            "validation",
            error instanceof Error
              ? error.message
              : "Arquivo ou operação inválida.",
          );
    say(e.message);
    if (["session", "inactive", "permission"].includes(e.kind)) onDenied(e);
  }
  function invalidate() {
    current = null;
    receipt = null;
    el("onlineImportApply").hidden = true;
    el("onlineImportExport").hidden = true;
    if (last)
      say("Prévia alterada. Gere nova prévia no servidor antes de confirmar.");
  }
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const aliases: Record<OnlineImportField, string[]> = {
    code: ["codigo", "code", "sku"],
    description: ["descricao", "material", "description"],
    unit: ["unidade", "unit"],
    quantity: ["quantidade", "saldo", "quantity"],
    contract: ["contrato", "contract"],
    location: ["localizacao", "local", "location"],
    supplier: ["fornecedor", "supplier"],
    oc: ["oc"],
    nf: ["nf"],
    category: ["categoria", "category"],
    manufacturer: ["fabricante", "marca", "manufacturer"],
    model: ["modelo", "model"],
  };
  function resetBulk() {
    el<HTMLSelectElement>("onlineImportNew").value = "";
    el<HTMLSelectElement>("onlineImportExisting").value = "";
  }
  function mapColumns() {
    resetBulk();
    mapping = {};
    const header = book!.sheets[Number(sheet.value)].rows[0] || [];
    const parent = el("onlineImportMapping");
    parent.replaceChildren();
    for (const [field, label] of Object.entries(onlineImportFields)) {
      const key = field as OnlineImportField;
      const select = document.createElement("select");
      select.id = "onlineMap-" + field;
      const labelNode = document.createElement("label");
      labelNode.htmlFor = select.id;
      labelNode.textContent = label;
      select.append(
        new Option("Não mapear", ""),
        ...header.map(
          (cell, i) => new Option(`${i + 1}: ${cell.text}`, String(i)),
        ),
      );
      const auto = header.findIndex((c) =>
        aliases[key].includes(normalize(c.text)),
      );
      if (auto >= 0) {
        mapping[key] = auto;
        select.value = String(auto);
      }
      select.onchange = () => {
        if (select.value === "") delete mapping[key];
        else mapping[key] = Number(select.value);
        decisions.clear();
        resetBulk();
        last = null;
        invalidate();
        renderRows();
      };
      parent.append(labelNode, select);
    }
    decisions.clear();
    last = null;
    invalidate();
    renderRows();
  }
  function sourceRows(): ImportSourceRow[] {
    if (!book) return [];
    return book.sheets[Number(sheet.value)].rows
      .slice(1)
      .map((cells, i) => {
        const row: ImportSourceRow = {
          line: i + 2,
          ...(decisions.get(i + 2) || {
            action: "ignore" as const,
            discard: false,
            decided: false,
          }),
        };
        const errors: string[] = [];
        for (const [field, column] of Object.entries(mapping)) {
          const cell = cells[column!];
          row[field as OnlineImportField] = cell?.text.trim() || "";
          if (cell?.error) errors.push(cell.error);
        }
        if (errors.length) row.cell_error = errors.join("; ").slice(0, 240);
        return row;
      })
      .filter((r, i) =>
        book!.sheets[Number(sheet.value)].rows[i + 1].some(
          (c) => c.text || c.error,
        ),
      );
  }
  function renderRows() {
    rowsHost.replaceChildren();
    for (const row of sourceRows()) {
      const planned = last?.rows.find((p) => p.line === row.line);
      const card = document.createElement("article");
      card.className = "online-admin-record";
      card.dataset.importLine = String(row.line);
      const heading = document.createElement("h4");
      heading.textContent = `Linha ${row.line}: ${row.code || "(sem código)"} · ${row.description || ""}`;
      card.append(heading);
      const p = document.createElement("p");
      p.textContent = `Saldo anterior: ${planned?.before?.quantity ?? "novo"} → informado: ${row.quantity || "(vazio)"} ${row.unit || ""}. ${planned?.product_id ? "Material existente" : "Material novo ou ainda não verificado"}`;
      card.append(p);
      for (const msg of [
        ...(row.cell_error ? [row.cell_error] : []),
        ...(planned?.errors || []),
        ...(planned?.warnings || []),
      ]) {
        const p = document.createElement("p");
        p.textContent = msg;
        card.append(p);
      }
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Decisão da linha ${row.line}`);
      select.append(
        new Option("Escolher decisão…", ""),
        new Option("Ignorar linha", "ignore"),
        new Option("Adicionar saldo novo", "add"),
        new Option("Substituir saldo pela fotografia", "replace"),
      );
      select.value = row.decided ? row.action : "";
      const discard = document.createElement("input");
      discard.type = "checkbox";
      discard.checked = row.discard;
      discard.setAttribute("aria-label", `Descartar linha ${row.line}`);
      const label = document.createElement("label");
      label.append(
        discard,
        document.createTextNode(" Descartar explicitamente esta linha"),
      );
      const changed = () => {
        decisions.set(row.line, {
          action: (select.value || "ignore") as ImportSourceRow["action"],
          discard: discard.checked,
          decided: select.value !== "",
        });
        invalidate();
      };
      select.onchange = changed;
      discard.onchange = changed;
      card.append(select, label);
      rowsHost.append(card);
    }
  }
  file.onchange = async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    const ticket = ++epoch;
    invalidate();
    book = null;
    last = null;
    rowsHost.replaceChildren();
    setup.hidden = true;
    controls(true);
    say("Lendo XLSX em worker isolado…");
    try {
      const next = await readOnlineWorkbook(selected, limits, events.signal);
      if (ticket !== epoch) return;
      book = next;
      sheet.replaceChildren(
        ...book.sheets.map((s, i) => new Option(s.name, String(i))),
      );
      sheet.value = "0";
      setup.hidden = false;
      mapColumns();
      say(
        `Arquivo fictício lido: ${book.fileName}. Nenhum cadastro ou saldo foi gravado.`,
      );
    } catch (e) {
      if (ticket === epoch) failure(e);
    } finally {
      if (ticket === epoch) controls(false);
    }
  };
  sheet.onchange = () => {
    last = null;
    mapColumns();
  };
  destination.onchange = () => {
    resetBulk();
    last = null;
    decisions.clear();
    invalidate();
    renderRows();
  };
  el("onlineImportPreview").onclick = async () => {
    if (!book || busy) return;
    const ticket = epoch;
    controls(true);
    invalidate();
    try {
      if (!destination.value) throw Error("Selecione um contrato de destino.");
      for (const field of ["code", "description", "unit", "quantity"] as const)
        if (mapping[field] === undefined)
          throw Error("Mapeie código, descrição, unidade e quantidade.");
      const result = await service.preview({
        destination: destination.value,
        file_name: book.fileName,
        file_sha256: book.sha256,
        sheet_name: book.sheets[Number(sheet.value)].name,
        rows: sourceRows(),
      });
      if (ticket !== epoch) return;
      current = result;
      last = result;
      resetBulk();
      receipt = result.duplicate;
      renderRows();
      el("onlineImportSummary").textContent =
        `Destino: ${result.contract}. ${result.rows.length} linhas; ${result.applied} selecionadas; ${result.invalid} inválidas não descartadas. ${result.rows.filter((r) => !r.product_id).length} materiais novos; ${result.rows.filter((r) => r.product_id).length} existentes. ${receipt ? "Conteúdo já aplicado: somente relatório histórico, sem nova gravação." : ""}`;
      el("onlineImportApply").hidden = !result.ready || !!receipt;
      el("onlineImportExport").hidden = false;
      say(
        result.ready
          ? "Prévia validada no servidor. Revise todas as diferenças antes de confirmar."
          : "Prévia disponível. Escolha decisões e descarte erros explicitamente; depois gere nova prévia.",
      );
    } catch (e) {
      failure(e);
    } finally {
      if (ticket === epoch) controls(false);
    }
  };
  function bulk(existing: boolean, action: ImportSourceRow["action"]) {
    if (!last) return;
    for (const row of last.rows)
      if (!!row.balance_id === existing)
        decisions.set(row.line, {
          action,
          discard: decisions.get(row.line)?.discard || false,
          decided: true,
        });
    invalidate();
    renderRows();
  }
  el<HTMLSelectElement>("onlineImportNew").onchange = (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value) bulk(false, value as ImportSourceRow["action"]);
  };
  el<HTMLSelectElement>("onlineImportExisting").onchange = (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value) bulk(true, value as ImportSourceRow["action"]);
  };
  el("onlineImportApply").onclick = () => {
    if (!current?.ready || busy) return;
    el("onlineImportConfirmSummary").textContent =
      `Arquivo: ${book!.fileName}\nAba: ${book!.sheets[Number(sheet.value)].name}\nContrato: ${current.contract}\n${current.rows.map((r) => `Linha ${r.line} ${r.code}: ${r.discard ? "descartada" : r.action}, ${r.before?.quantity ?? "novo"} → ${r.quantity}`).join("\n")}`;
    el<HTMLInputElement>("onlineImportAcknowledge").checked = false;
    dialog.showModal();
  };
  el("onlineImportCancel").onclick = () => dialog.close();
  el("onlineImportCommit").onclick = async () => {
    if (!current || busy) return;
    if (!el<HTMLInputElement>("onlineImportAcknowledge").checked) {
      say("Marque a confirmação da fotografia absoluta.");
      return;
    }
    const token = current.token,
      ticket = epoch;
    dialog.close();
    controls(true);
    say("Confirmando lote atômico no servidor…");
    try {
      const result = await service.commit(token);
      if (ticket !== epoch) return;
      receipt = result;
      el("onlineImportApply").hidden = true;
      el("onlineImportExport").hidden = false;
      say(
        result.reused
          ? "Lote já aplicado: recibo original recuperado, sem reaplicar saldos."
          : `Lote confirmado: ${result.batch_id}. ${result.applied} saldos informados, ${result.ignored} linhas ignoradas. Nenhuma movimentação criada.`,
      );
    } catch (e) {
      if (ticket === epoch) {
        failure(e);
        if (
          e instanceof OnlineError &&
          ["conflict", "validation", "permission"].includes(e.kind)
        ) {
          current = null;
          el("onlineImportApply").hidden = true;
        }
      }
    } finally {
      if (ticket === epoch) controls(false);
    }
  };
  el("onlineImportExport").onclick = async () => {
    if (busy || !last) return;
    const ticket = epoch;
    controls(true);
    try {
      await service.verify();
      if (ticket !== epoch) return;
      const report = receipt || {
        file_name: book!.fileName,
        sheet_name: book!.sheets[Number(sheet.value)].name,
        contract: last.contract,
        applied: last.applied,
        invalid: last.invalid,
        rows: last.rows,
      };
      downloadOnlineImportReport(report);
    } catch (e) {
      if (ticket === epoch) failure(e);
    } finally {
      if (ticket === epoch) controls(false);
    }
  };
  return {
    dispose() {
      ++epoch;
      events.abort();
      book = null;
      last = null;
      current = null;
      receipt = null;
      decisions.clear();
      if (dialog.open) dialog.close();
      host.replaceChildren();
    },
  };
}
