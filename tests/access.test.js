import { describe, it, expect } from "vitest";
import {
  canReadContract,
  canManage,
  hasPermission,
  permissions,
} from "../code/ts/access";
import { roles } from "../code/ts/types";
import { demoUsers } from "../code/ts/demo-data";
import { demoStorage } from "../code/ts/demo-storage";

describe("regras demonstrativas", () => {
  for (const role of roles) {
    const user = { ...demoUsers[0], role };
    it(`${role}: escopo de consulta e escrita`, () => {
      expect(canReadContract(user, "contrato-a")).toBe(true);
      expect(canReadContract(user, "contrato-b")).toBe(
        ["diretor", "proprietario", "administrador"].includes(role),
      );
      const fullAccess = ["proprietario", "administrador"].includes(role);
      expect(canManage(user)).toBe(fullAccess);
      for (const permission of permissions) {
        expect(hasPermission(user, permission)).toBe(
          fullAccess ||
            (role === "diretor" && permission === "read_all_contracts"),
        );
        expect(hasPermission({ ...user, status: "inativo" }, permission)).toBe(
          false,
        );
        expect(hasPermission(null, permission)).toBe(false);
      }
      expect(
        canReadContract({ ...user, authorizedContractIds: [] }, "contrato-a"),
      ).toBe(["diretor", "proprietario", "administrador"].includes(role));
      expect(
        canReadContract({ ...user, status: "inativo" }, "contrato-a"),
      ).toBe(false);
      expect(canManage({ ...user, status: "inativo" })).toBe(false);
    });
  }
  it("nega identidade ausente e perfil desconhecido", () => {
    for (const user of [
      null,
      undefined,
      { ...demoUsers[0], role: "invalido" },
    ]) {
      expect(canReadContract(user, "contrato-a")).toBe(false);
      expect(canManage(user)).toBe(false);
    }
  });
  it("recupera dados inválidos sem quebrar o protótipo", () => {
    localStorage.clear();
    localStorage.setItem("jp_estoque_demo_v02", "{");
    expect(demoStorage.load([]).materials).toEqual([]);
    localStorage.setItem(
      "jp_estoque_demo_v02",
      JSON.stringify({ materials: [{}], updated: "hoje" }),
    );
    expect(demoStorage.load([]).materials).toEqual([]);
  });
});
