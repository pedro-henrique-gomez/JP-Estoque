import { beforeEach, describe, it, expect, vi } from "vitest";

let store, users, contracts, actor, materials;
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  const fixtures = await import("../code/ts/demo-data");
  users = fixtures.demoUsers;
  contracts = fixtures.contracts;
  actor = users[5];
  materials = [{ id: 1, contract: "Contrato A", supplier: "Fornecedor teste" }];
  const { DemoAdministration } = await import("../code/ts/demo-administration");
  store = new DemoAdministration(
    () => actor,
    () => materials,
    [
      {
        id: "supplier-1",
        name: "Fornecedor teste",
        areas: "Civil",
        contact: "Teste",
      },
    ],
  );
});
describe("administração local demonstrativa", () => {
  it("diretor, perfis restritos e inativos não alteram cadastros", () => {
    for (const user of [
      ...users.slice(0, 5),
      { ...users[5], status: "inativo" },
      { ...users[6], status: "inativo" },
    ]) {
      actor = user;
      expect(() => store.saveUser({ ...users[0], name: "Alterado" })).toThrow();
      expect(() =>
        store.saveContract({ id: "", name: "Contrato novo" }),
      ).toThrow();
      expect(() => store.removeContract("contrato-d")).toThrow();
      expect(() =>
        store.saveSupplier({ id: "", name: "Novo", areas: "", contact: "" }),
      ).toThrow();
      expect(() => store.removeSupplier("supplier-1")).toThrow();
      expect(() =>
        store.saveSettings({
          systemName: "Alterado",
          supportEmail: "teste@example.invalid",
        }),
      ).toThrow();
    }
    expect(store.history).toEqual([]);
  });
  it("protege último Proprietário ou Administrador ativo", () => {
    store.saveUser({ ...users[6], status: "inativo" });
    expect(() => store.saveUser({ ...users[5], status: "inativo" })).toThrow(
      /ao menos um/,
    );
    expect(() => store.saveUser({ ...users[5], role: "diretor" })).toThrow(
      /ao menos um/,
    );
    expect(users[5].status).toBe("ativo");
  });
  it("renomeia vínculos e bloqueia exclusão de cadastros em uso", () => {
    store.saveContract({ ...contracts[0], name: "Obra principal" });
    store.saveSupplier({ ...store.suppliers[0], name: "Fornecedor principal" });
    expect(materials[0].contract).toBe("Obra principal");
    expect(materials[0].supplier).toBe("Fornecedor principal");
    expect(users[0].authorizedContractIds).toContain("contrato-a");
    expect(() => store.removeContract("contrato-a")).toThrow(/vinculado/);
    expect(() => store.removeSupplier("supplier-1")).toThrow(/vinculado/);
    expect(store.history[0].before.name).toBe("Fornecedor teste");
    expect(store.history[0].after.name).toBe("Fornecedor principal");
  });
  it("valida emails duplicados e contratos inexistentes sem alterar usuário", () => {
    const before = structuredClone(users[0]);
    expect(() =>
      store.saveUser({ ...users[0], email: users[1].email }),
    ).toThrow(/Email/);
    expect(() =>
      store.saveUser({ ...users[0], authorizedContractIds: ["inexistente"] }),
    ).toThrow(/Contrato/);
    expect(users[0]).toEqual(before);
  });
  it("recarrega cadastros fictícios coerentes e não persiste seleção de perfil", async () => {
    store.saveContract({ ...contracts[0], name: "Contrato renomeado" });
    store.saveSettings({
      systemName: "Teste JP",
      supportEmail: "suporte@example.invalid",
    });
    expect(store.persist()).toBe(true);
    const saved = JSON.parse(localStorage.getItem("jp_estoque_admin_demo_v02"));
    expect(saved).not.toHaveProperty("selectedUser");
    expect(saved).not.toHaveProperty("session");
    const { DemoAdministration } = await import(
      "../code/ts/demo-administration"
    );
    const restored = new DemoAdministration(
      () => actor,
      () => materials,
      [],
    );
    expect(restored.settings.systemName).toBe("Teste JP");
    expect(restored.contracts[0].name).toBe("Contrato renomeado");
    expect(restored.history).toHaveLength(2);
  });
});
