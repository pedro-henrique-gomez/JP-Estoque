import { hasPermission } from "./access";
import {
  codeKey,
  textKey,
  globalFields,
  toInventory,
  fromInventory,
} from "./inventory";
import {
  importFields,
  type CellValue,
  type ColumnMapping,
  type ImportContext,
  type ImportPlan,
  type ImportReport,
  type ImportRow,
  type ImportAction,
  type WorkbookSheet,
} from "./import-types";
import type { Material, User } from "./types";

export const fieldLabels = {
  code: "Código",
  name: "Descrição global do produto",
  unit: "Unidade global",
  contract: "Contrato do saldo",
  qty: "Quantidade registrada no contrato",
  category: "Categoria",
  brand: "Fabricante",
  model: "Modelo",
  location: "Localização",
  supplier: "Fornecedor de referência",
  oc: "OC de referência",
  nf: "NF de referência",
};
const aliases: Record<string, string[]> = {
  code: ["codigo", "cod", "sku"],
  name: ["material", "produto", "descricao", "descricao do material", "nome"],
  unit: ["unidade", "und", "un"],
  contract: ["contrato", "obra", "centro de custo"],
  qty: ["quantidade", "qtd", "saldo", "estoque"],
  category: ["categoria", "grupo"],
  brand: ["marca", "fabricante"],
  model: ["modelo", "referencia"],
  location: ["localizacao", "posicao", "endereco"],
  supplier: ["fornecedor", "distribuidor"],
  oc: ["oc", "ordem de compra"],
  nf: ["nf", "nota fiscal"],
};
const required = ["code", "name", "unit", "contract", "qty"] as const;
export function suggestMapping(headers: CellValue[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of importFields) {
    const index = headers.findIndex((header) =>
      aliases[field].includes(textKey(String(header ?? ""))),
    );
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}
export function detectHeaderRow(sheet: WorkbookSheet): number {
  let best = 0,
    score = -1;
  sheet.rows.slice(0, 100).forEach((row, index) => {
    const current = Object.keys(suggestMapping(row)).length;
    if (current > score) {
      score = current;
      best = index;
    }
  });
  return best;
}
export function parseQuantity(value: CellValue): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER
      ? value
      : null;
  if (typeof value !== "string" || !value.trim()) return null;
  let text = value.trim();
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(text))
    text = text.replaceAll(".", "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(text))
    text = text.replaceAll(",", "");
  else if (/^\d+([.,]\d+)?$/.test(text)) text = text.replace(",", ".");
  else return null;
  const number = Number(text);
  return Number.isFinite(number) &&
    number >= 0 &&
    number <= Number.MAX_SAFE_INTEGER
    ? number
    : null;
}
export function normalizeUnit(value: string): string | null {
  const unit = textKey(value);
  const units: Record<string, string> = {
    un: "un",
    und: "un",
    unidade: "un",
    unidades: "un",
    pc: "un",
    pcs: "un",
    peca: "un",
    pecas: "un",
    m: "m",
    metro: "m",
    metros: "m",
    m2: "m²",
    "m²": "m²",
    m3: "m³",
    "m³": "m³",
    kg: "kg",
    g: "g",
    l: "l",
    litro: "l",
    litros: "l",
    ml: "ml",
    saco: "saco",
    sacos: "saco",
    cx: "caixa",
    caixa: "caixa",
    caixas: "caixa",
    rolo: "rolo",
    rolos: "rolo",
    par: "par",
    jogo: "jogo",
    pct: "pacote",
    pacote: "pacote",
    kit: "kit",
    ton: "t",
    t: "t",
  };
  return units[unit] ?? null;
}
const descriptionKey = (value: string) =>
  [...new Set(textKey(value).split(" "))].sort().join(" ");
function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const id = key(value);
    const group = groups.get(id);
    if (group) group.push(value);
    else groups.set(id, [value]);
  }
  return groups;
}
export const contextFingerprint = (context: ImportContext) =>
  JSON.stringify(context);
function cellText(cell: CellValue): string {
  return typeof cell === "object" && cell ? "" : String(cell ?? "").trim();
}
export function buildImportPlan(
  sheet: WorkbookSheet,
  fileName: string,
  headerRow: number,
  mapping: ColumnMapping,
  context: ImportContext,
): ImportPlan {
  if (
    !Number.isInteger(headerRow) ||
    headerRow < 0 ||
    headerRow >= sheet.rows.length
  )
    throw new Error("Linha de cabeçalho inválida.");
  if (required.some((field) => mapping[field] === undefined))
    throw new Error(
      "Associe Código, Descrição, Unidade, Contrato e Quantidade.",
    );
  const indexes = Object.values(mapping);
  if (
    new Set(indexes).size !== indexes.length ||
    indexes.some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= sheet.rows[headerRow].length,
    )
  )
    throw new Error(
      "Mapeie cada coluna uma única vez, dentro do cabeçalho selecionado.",
    );
  const rows: ImportRow[] = [];
  const knownProducts = groupBy(context.materials, (row) => codeKey(row.code));
  const knownDescriptions = groupBy(context.materials, (row) =>
    descriptionKey(row.name),
  );
  for (const [code, group] of knownProducts) {
    if (
      globalFields.some(
        (field) =>
          field !== "code" &&
          new Set(
            group.map((material) =>
              field === "unit"
                ? normalizeUnit(material.unit)
                : textKey(material[field]),
            ),
          ).size > 1,
      )
    )
      throw new Error(
        `A base existente contém dados globais conflitantes para ${code}. Reconcilie o cadastro manualmente antes de importar; nada será substituído automaticamente.`,
      );
    if (
      new Set(group.map((material) => textKey(material.contract))).size !==
      group.length
    )
      throw new Error(
        `A base existente contém saldos duplicados para ${code}. Corrija os registros antes de importar.`,
      );
  }
  sheet.rows.slice(headerRow + 1).forEach((source, index) => {
    if (
      !source.some(
        (cell) => cellText(cell) || (typeof cell === "object" && cell),
      )
    )
      return;
    const material = { id: 0 } as Material;
    const errors: string[] = [],
      warnings: string[] = [];
    for (const field of importFields) {
      const cell =
        mapping[field] === undefined ? "" : (source[mapping[field]!] ?? "");
      if (typeof cell === "object" && cell)
        errors.push(`${fieldLabels[field]}: ${cell.error}`);
      if (typeof cell === "boolean")
        errors.push(`${fieldLabels[field]}: valor lógico não aceito.`);
      if (field !== "qty") material[field] = cellText(cell);
    }
    const quantity = parseQuantity(source[mapping.qty!] ?? "");
    material.qty = quantity ?? 0;
    if (quantity === null)
      errors.push("Quantidade obrigatória, numérica, finita e não negativa.");
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._/ -]{0,79}$/u.test(material.code))
      errors.push(
        "Código obrigatório, até 80 caracteres (letras, números, ponto, espaço, /, _ e -).",
      );
    if (
      material.name.length < 2 ||
      material.name.length > 240 ||
      /[\x00-\x1f]/.test(material.name)
    )
      errors.push(
        "Descrição obrigatória, de 2 a 240 caracteres, sem caracteres de controle.",
      );
    const unit = normalizeUnit(material.unit);
    if (!unit)
      errors.push(
        "Unidade obrigatória e reconhecida (un, m, m², m³, kg, g, l, ml, saco, caixa, rolo, par, jogo, pacote, kit ou t).",
      );
    else material.unit = unit;
    const matches = context.contracts.filter(
      (contract) => textKey(contract.name) === textKey(material.contract),
    );
    if (matches.length !== 1)
      errors.push(
        "Contrato não cadastrado ou ambíguo. Cadastre-o na administração antes de importar.",
      );
    else material.contract = matches[0].name;
    const productRows = knownProducts.get(codeKey(material.code)) ?? [];
    const existing = productRows.find(
      (row) => row.contract === material.contract,
    );
    const product = productRows[0];
    const changes = product
      ? globalFields.filter(
          (field) =>
            field !== "code" &&
            material[field] &&
            material[field] !== product[field],
        )
      : [];
    if (product) {
      warnings.push(
        existing
          ? "Código e contrato já cadastrados; ignorado até você escolher Atualizar."
          : "Produto global já cadastrado. Adicionar criará apenas o saldo deste contrato.",
      );
      if (unit && normalizeUnit(product.unit) !== unit)
        errors.push(
          "Unidade diverge do produto global existente. A importação não converte unidades.",
        );
      if (changes.length)
        warnings.push(
          `Diferenças globais: ${changes.map((field) => fieldLabels[field]).join(", ")}. Atualizar afeta o cadastro em ${new Set(productRows.map((row) => row.contract)).size} contrato(s); Adicionar preserva os dados globais atuais.`,
        );
    }
    const similar = knownDescriptions
      .get(descriptionKey(material.name))
      ?.find((row) => codeKey(row.code) !== codeKey(material.code));
    if (similar)
      warnings.push(
        `Possível duplicidade por descrição com ${similar.code}; confira antes de adicionar. Não haverá fusão automática.`,
      );
    rows.push({
      line: headerRow + index + 2,
      material,
      existingId: existing?.id,
      productExists: !!product,
      errors,
      warnings,
      action: "ignore",
      globalChanges: changes,
      affectedContracts: new Set(productRows.map((row) => row.contract)).size,
    });
  });
  if (!rows.length) throw new Error("Aba sem registros após o cabeçalho.");
  if (rows.length > 10000)
    throw new Error("Limite de 10.000 registros por importação.");
  const byCode = groupBy(rows, (row) => codeKey(row.material.code));
  const byDescription = groupBy(rows, (row) =>
    descriptionKey(row.material.name),
  );
  const byPair = groupBy(rows, (row) =>
    JSON.stringify([
      codeKey(row.material.code),
      textKey(row.material.contract),
    ]),
  );
  const conflicting = new Set<string>();
  byCode.forEach((group, key) => {
    if (
      globalFields.some(
        (field) =>
          field !== "code" &&
          new Set(
            group.map((row) => textKey(row.material[field])).filter(Boolean),
          ).size > 1,
      )
    )
      conflicting.add(key);
  });
  for (const row of rows) {
    if (
      byPair.get(
        JSON.stringify([
          codeKey(row.material.code),
          textKey(row.material.contract),
        ]),
      )!.length > 1
    )
      row.errors.push(
        "Códigos duplicados para o mesmo contrato no arquivo. Corrija ou ignore essas linhas.",
      );
    if (conflicting.has(codeKey(row.material.code)))
      row.errors.push(
        "Código repetido com dados globais conflitantes no arquivo.",
      );
    const similar = byDescription
      .get(descriptionKey(row.material.name))
      ?.find(
        (other) => codeKey(other.material.code) !== codeKey(row.material.code),
      );
    if (similar)
      row.warnings.push(
        `Possível duplicidade por descrição com a linha ${similar.line} (${similar.material.code}).`,
      );
  }
  return {
    fileName,
    sheetName: sheet.name,
    headerRow,
    rows,
    fingerprint: contextFingerprint(context),
    mapping: { ...mapping },
    source: structuredClone(sheet),
  };
}
export function setImportPolicy(plan: ImportPlan, policy: ImportAction): void {
  plan.rows.forEach(
    (row) =>
      (row.action = row.errors.length
        ? "ignore"
        : policy === "add" && !row.existingId
          ? "add"
          : policy === "update" && row.existingId
            ? "update"
            : "ignore"),
  );
}
/** Revalidates, stages a new dataset and never mutates the caller's current stock. */
export function applyImportPlan(
  plan: ImportPlan,
  context: ImportContext,
  user: User | null,
  confirmed: boolean,
): { materials: Material[]; report: ImportReport } {
  if (!user || !hasPermission(user, "import_spreadsheets"))
    throw new Error("Perfil sem permissão para importar.");
  if (!confirmed) throw new Error("Confirmação explícita obrigatória.");
  if (contextFingerprint(context) !== plan.fingerprint)
    throw new Error(
      "A base mudou após a prévia. Analise novamente antes de confirmar.",
    );
  const checked = buildImportPlan(
    plan.source,
    plan.fileName,
    plan.headerRow,
    plan.mapping,
    context,
  );
  checked.rows.forEach(
    (row) =>
      (row.action =
        plan.rows.find((choice) => choice.line === row.line)?.action ??
        "ignore"),
  );
  if (checked.rows.some((row) => row.action !== "ignore" && row.errors.length))
    throw new Error(
      "Corrija ou ignore as linhas com erros antes de confirmar.",
    );
  if (!checked.rows.some((row) => row.action !== "ignore"))
    throw new Error(
      "Escolha ao menos uma linha válida para adicionar ou atualizar.",
    );
  const materials = structuredClone(context.materials);
  let nextId = Math.max(0, ...materials.map((material) => material.id)) + 1;
  const created = new Set<string>(),
    updated = new Set<string>();
  let added = 0,
    updates = 0;
  for (const row of checked.rows) {
    if (row.action === "ignore") continue;
    if (row.action !== "add" && row.action !== "update")
      throw new Error("Ação de importação inválida.");
    const existing = materials.find(
      (material) =>
        codeKey(material.code) === codeKey(row.material.code) &&
        material.contract === row.material.contract,
    );
    if (
      (row.action === "add" && existing) ||
      (row.action === "update" && !existing)
    )
      throw new Error("Ação incompatível com o cadastro. Analise novamente.");
    const product = materials.find(
      (material) => codeKey(material.code) === codeKey(row.material.code),
    );
    if (row.action === "add") {
      const addedMaterial = { ...row.material, id: nextId++ };
      if (product)
        globalFields.forEach(
          (field) => (addedMaterial[field] = product[field]),
        );
      else created.add(codeKey(row.material.code));
      materials.push(addedMaterial);
      added++;
    } else if (existing) {
      if (row.globalChanges.length) updated.add(codeKey(existing.code));
      // Update the global catalog explicitly, across every contract of that code.
      materials
        .filter(
          (material) => codeKey(material.code) === codeKey(row.material.code),
        )
        .forEach((material) => {
          globalFields.forEach((field) => {
            if (field !== "code" && row.material[field])
              material[field] = row.material[field];
          });
        });
      for (const field of ["location", "supplier", "oc", "nf"] as const)
        if (row.material[field]) existing[field] = row.material[field];
      existing.qty = row.material.qty;
      updates++;
    }
  }
  const errors = checked.rows.filter((row) => row.errors.length).length;
  const report: ImportReport = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    fileName: plan.fileName,
    sheetName: plan.sheetName,
    headerRow: plan.headerRow + 1,
    actorId: user.id,
    added,
    updated: updates,
    ignored: checked.rows.filter((row) => row.action === "ignore").length,
    errors,
    warnings: checked.rows.filter((row) => row.warnings.length).length,
    productsCreated: created.size,
    productsUpdated: updated.size,
    summary: `${added} saldo(s) adicionado(s), ${updates} saldo(s) atualizado(s), ${created.size} produto(s) global(is) criado(s), ${updated.size} produto(s) global(is) atualizado(s). Nenhuma movimentação gerada.`,
    lines: checked.rows.map((row) => ({
      line: row.line,
      code: row.material.code,
      status: row.errors.length
        ? "error"
        : row.action === "ignore"
          ? "ignored"
          : "success",
      action: row.action,
      messages: [...row.errors, ...row.warnings],
    })),
  };
  return {
    materials: fromInventory(
      toInventory(materials, context.contracts),
      context.contracts,
    ),
    report,
  };
}
