import { beforeEach, describe, it, expect } from "vitest";
import { demoStorage } from "../code/ts/demo-storage";
import { demoAdminStorage } from "../code/ts/demo-admin-storage";

const stockKey = "jp_estoque_demo_v02",
  adminKey = "jp_estoque_admin_demo_v02";
const material = {
  id: 1,
  code: "EXISTENTE",
  name: "Material existente",
  unit: "un",
  contract: "Contrato A",
  qty: 5,
  category: "Civil",
  brand: "",
  model: "",
  location: "",
  supplier: "",
  oc: "",
  nf: "",
};
beforeEach(() => localStorage.clear());
describe("leitura não destrutiva e estados de inicialização", () => {
  it("ausência e base vazia não carregam fixtures automaticamente", () => {
    expect(demoStorage.load([material]).materials).toEqual([]);
    expect(localStorage.getItem(stockKey)).toBe(null);
    localStorage.setItem(
      stockKey,
      JSON.stringify({ materials: [], updated: "Base vazia" }),
    );
    expect(demoStorage.load([material]).state).toBe("empty");
  });
  it("preserva registros com data ausente e os bytes de origem", () => {
    const original = JSON.stringify({ materials: [material] });
    localStorage.setItem(stockKey, original);
    const read = demoStorage.load();
    expect(read.materials).toEqual([material]);
    expect(read.updated).toBe("Data não informada na base salva");
    expect(localStorage.getItem(stockKey)).toBe(original);
  });
  it.each([
    "{invalido",
    JSON.stringify({ version: 99, materials: [material] }),
    JSON.stringify({ materials: [{ id: 1 }] }),
  ])("incompatível não é substituído na leitura ou escrita", (original) => {
    localStorage.setItem(stockKey, original);
    expect(demoStorage.load([material]).state).toBe("incompatible");
    expect(demoStorage.save([material], "Agora")).toBe(false);
    expect(localStorage.getItem(stockKey)).toBe(original);
  });
  it("mantém campos adicionais de snapshot compatível na gravação explícita", () => {
    localStorage.setItem(
      stockKey,
      JSON.stringify({
        materials: [material],
        updated: "Antes",
        custom: "Preservado",
      }),
    );
    expect(demoStorage.save([material], "Depois")).toBe(true);
    expect(JSON.parse(localStorage.getItem(stockKey)).custom).toBe(
      "Preservado",
    );
  });
  it("aceita administração explicitamente vazia sem inventar usuários", () => {
    const snapshot = {
      users: [],
      contracts: [],
      suppliers: [],
      settings: { systemName: "JP", supportEmail: "teste@example.invalid" },
      history: [],
    };
    const original = JSON.stringify(snapshot);
    localStorage.setItem(adminKey, original);
    expect(demoAdminStorage.inspect().state).toBe("empty");
    expect(demoAdminStorage.load()).toEqual(snapshot);
    expect(localStorage.getItem(adminKey)).toBe(original);
  });
  it("bloqueia sobrescrita administrativa de JSON incompatível", () => {
    const original = "{admin-invalido";
    localStorage.setItem(adminKey, original);
    expect(demoAdminStorage.inspect().state).toBe("incompatible");
    expect(
      demoAdminStorage.save({
        users: [],
        contracts: [],
        suppliers: [],
        settings: { systemName: "JP", supportEmail: "teste@example.invalid" },
        history: [],
      }),
    ).toBe(false);
    expect(localStorage.getItem(adminKey)).toBe(original);
  });
});
