import { describe, it, expect } from "vitest";
import {
  applyImportPlan,
  buildImportPlan,
  detectHeaderRow,
  suggestMapping,
  parseQuantity,
  normalizeUnit,
  setImportPolicy,
} from "../code/ts/import-service";
import { toInventory } from "../code/ts/inventory";
import { demoUsers, contracts } from "../code/ts/demo-data";

const headers = [
  "Código",
  "Descrição",
  "Unidade",
  "Contrato",
  "Quantidade",
  "Fabricante",
];
const mapping = suggestMapping(headers);
const base = {
  id: 1,
  code: "ELE-001",
  name: "Disjuntor bipolar 20A",
  unit: "un",
  contract: "Contrato A",
  qty: 60,
  category: "Elétrica",
  brand: "Schneider",
  model: "20A",
  location: "E01",
  supplier: "Obramax",
  oc: "OC-REF",
  nf: "123",
};
const context = () => ({
  materials: [{ ...base }, { ...base, id: 2, contract: "Contrato C", qty: 14 }],
  contracts: structuredClone(contracts),
});
const makePlan = (rows, ctx = context()) =>
  buildImportPlan(
    { name: "Materiais", rows: [headers, ...rows] },
    "dados-ficticios.xlsx",
    0,
    mapping,
    ctx,
  );
const owner = demoUsers[5];

describe("serviço de importação", () => {
  it.each([
    ["0", 0],
    [0, 0],
    ["12,5", 12.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["12.5", 12.5],
    ["", null],
    [" ", null],
    [-1, null],
    ["-1", null],
    ["R$ 10", null],
    ["1e4", null],
    [Infinity, null],
    [NaN, null],
    [true, null],
  ])("valida quantidade %s", (value, expected) =>
    expect(parseQuantity(value)).toBe(expected),
  );
  it("detecta cabeçalho após título, mapeia acentos e normaliza unidades", () => {
    expect(
      detectHeaderRow({ name: "Aba", rows: [["Título"], [], headers] }),
    ).toBe(2);
    expect(mapping).toEqual({
      code: 0,
      name: 1,
      unit: 2,
      contract: 3,
      qty: 4,
      brand: 5,
    });
    expect(normalizeUnit("peças")).toBe("un");
    expect(normalizeUnit("m2")).toBe("m²");
    expect(normalizeUnit("desconhecida")).toBe(null);
  });
  it("exige campos mapeados e colunas distintas", () => {
    const sheet = {
      name: "Aba",
      rows: [headers, ["A", "Produto", "un", "Contrato A", 1]],
    };
    expect(() =>
      buildImportPlan(sheet, "x.csv", 0, { code: 0 }, context()),
    ).toThrow(/Associe/);
    expect(() =>
      buildImportPlan(sheet, "x.csv", 0, { ...mapping, unit: 0 }, context()),
    ).toThrow(/uma única vez/);
  });
  it("não muda a base ao analisar; padrões ignoram inclusive os existentes", () => {
    const ctx = context(),
      before = structuredClone(ctx);
    const plan = makePlan(
      [["ELE-001", "Disjuntor alterado", "un", "Contrato A", 99]],
      ctx,
    );
    expect(plan.rows[0].action).toBe("ignore");
    expect(plan.rows[0].existingId).toBe(1);
    expect(ctx).toEqual(before);
    setImportPolicy(plan, "add");
    expect(plan.rows[0].action).toBe("ignore");
  });
  it("valida descrição, código, unidade, contrato e quantidade sem transformar vazio em zero", () => {
    const plan = makePlan([["", "x", "invalida", "Contrato novo", ""]]);
    expect(plan.rows[0].errors).toHaveLength(5);
    expect(plan.rows[0].action).toBe("ignore");
  });
  it("identifica duplicados na planilha e possíveis duplicidades por descrição", () => {
    const plan = makePlan([
      ["DUP", "Produto teste", "un", "Contrato A", 1],
      ["dup", "Produto teste", "un", "contrato a", 2],
      ["NOVO", "Disjuntor bipolar 20A", "un", "Contrato B", 2],
    ]);
    expect(plan.rows[0].errors.join(" ")).toContain("duplicados");
    expect(plan.rows[1].errors.join(" ")).toContain("duplicados");
    expect(plan.rows[2].warnings.join(" ")).toContain(
      "duplicidade por descrição",
    );
  });
  it("adiciona o mesmo produto em dois contratos sem duplicar cadastro global", () => {
    const ctx = context();
    const plan = makePlan(
      [
        ["NOVO", "Produto novo", "un", "Contrato A", 1],
        ["NOVO", "Produto novo", "un", "Contrato B", 3],
      ],
      ctx,
    );
    setImportPolicy(plan, "add");
    const result = applyImportPlan(plan, ctx, owner, true);
    const inventory = toInventory(result.materials, contracts);
    expect(inventory.products).toHaveLength(2);
    expect(inventory.balances).toHaveLength(4);
    expect(result.report.productsCreated).toBe(1);
    expect(result.report.added).toBe(2);
    expect(result.materials.slice(0, 2)).toEqual(ctx.materials);
    expect(result.report.fileName).toBe("dados-ficticios.xlsx");
    expect(result.report.sheetName).toBe("Materiais");
    expect(Number.isNaN(Date.parse(result.report.date))).toBe(false);
  });
  it("atualiza globalmente o produto e somente o saldo escolhido, sem somar ou apagar referências", () => {
    const ctx = context();
    const plan = makePlan(
      [["ELE-001", "Disjuntor revisado", "un", "Contrato A", 0, ""]],
      ctx,
    );
    expect(plan.rows[0].affectedContracts).toBe(2);
    setImportPolicy(plan, "update");
    const result = applyImportPlan(plan, ctx, owner, true);
    expect(result.materials[0].qty).toBe(0);
    expect(result.materials[1].qty).toBe(14);
    expect(
      result.materials.every(
        (material) => material.name === "Disjuntor revisado",
      ),
    ).toBe(true);
    expect(result.materials[0].brand).toBe("Schneider");
    expect(result.materials[0].oc).toBe("OC-REF");
    expect(result.report.updated).toBe(1);
    expect(result.report.productsUpdated).toBe(1);
    expect(ctx.materials[0].qty).toBe(60);
    expect(result.report.summary).toContain("Nenhuma movimentação");
  });
  it("adicionar saldo de produto existente preserva o cadastro global", () => {
    const ctx = context();
    const plan = makePlan(
      [["ELE-001", "Outro nome", "un", "Contrato B", 3]],
      ctx,
    );
    setImportPolicy(plan, "add");
    const result = applyImportPlan(plan, ctx, owner, true);
    expect(result.materials[2].name).toBe(base.name);
    expect(result.materials[2].qty).toBe(3);
    expect(result.report.productsCreated).toBe(0);
    expect(result.report.productsUpdated).toBe(0);
  });
  it("impede unidade incompatível e dados globais conflitantes no arquivo", () => {
    expect(
      makePlan([
        ["ELE-001", base.name, "kg", "Contrato A", 3],
      ]).rows[0].errors.join(" "),
    ).toContain("Unidade diverge");
    const plan = makePlan([
      ["NOVO", "Nome A", "un", "Contrato A", 1],
      ["NOVO", "Nome B", "un", "Contrato B", 3],
    ]);
    expect(
      plan.rows.every((row) => row.errors.join(" ").includes("conflitantes")),
    ).toBe(true);
  });
  it("não resolve automaticamente inconsistências no cadastro legado", () => {
    const ctx = context();
    ctx.materials[1].name = "Descrição conflitante";
    expect(() =>
      makePlan([["NOVO", "Produto novo", "un", "Contrato A", 1]], ctx),
    ).toThrow(/base existente.*conflitantes/);
    expect(ctx.materials[1].name).toBe("Descrição conflitante");
  });
  it("permite ignorar linhas inválidas e relata erros e sucessos sem aplicação parcial acidental", () => {
    const ctx = context();
    const plan = makePlan(
      [
        ["ERR", "Produto erro", "un", "Contrato A", -1],
        ["OK", "Produto bom", "un", "Contrato A", 2],
      ],
      ctx,
    );
    plan.rows[0].action = "add";
    plan.rows[1].action = "add";
    expect(() => applyImportPlan(plan, ctx, owner, true)).toThrow(
      /linhas com erros/,
    );
    expect(ctx.materials).toHaveLength(2);
    plan.rows[0].action = "ignore";
    const result = applyImportPlan(plan, ctx, owner, true);
    expect(result.report.errors).toBe(1);
    expect(result.report.ignored).toBe(1);
    expect(result.report.added).toBe(1);
    expect(result.report.lines[0].status).toBe("error");
  });
  it("exige confirmação e prévia atualizada; nega todos os outros perfis e inativos", () => {
    const ctx = context();
    const plan = makePlan([["OK", "Produto novo", "un", "Contrato A", 1]], ctx);
    setImportPolicy(plan, "add");
    expect(() => applyImportPlan(plan, ctx, owner, false)).toThrow(
      /Confirmação/,
    );
    for (const user of [
      ...demoUsers.slice(0, 5),
      { ...owner, status: "inativo" },
      { ...demoUsers[6], status: "inativo" },
    ])
      expect(() => applyImportPlan(plan, ctx, user, true)).toThrow(/permissão/);
    expect(applyImportPlan(plan, ctx, demoUsers[6], true).report.added).toBe(1);
    ctx.materials[0].qty++;
    expect(() => applyImportPlan(plan, ctx, owner, true)).toThrow(/base mudou/);
  });
});
