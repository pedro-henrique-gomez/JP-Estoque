import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  createOnlineAdministration,
  administrativePayload,
  administrativeFailure,
} from "../code/ts/data/online-administration";
const owner = {
  id: "actor",
  name: "Ficticio",
  email: "unit@example.invalid",
  role: "proprietario",
  active: true,
};
let profile, verified, response, client, backend;
beforeEach(() => {
  profile = { ...owner };
  verified = vi.fn(async () => profile);
  response = { status: 200, error: null, data: [{ id: "record" }] };
  client = {
    rpc: vi.fn(async () => ({ error: null, status: 200 })),
    from: vi.fn(() => {
      const q = {
        select: vi.fn(() => q),
        order: () => q,
        range: async () => ({ status: 200, error: null, data: [] }),
        limit: async () => ({ status: 200, error: null, data: [] }),
        insert: vi.fn(() => q),
        update: vi.fn(() => q),
        delete: vi.fn(() => q),
        eq: vi.fn(() => q),
        then: (done, reject) => Promise.resolve(response).then(done, reject),
      };
      return q;
    }),
  };
  backend = createOnlineAdministration(client, verified);
});
describe("administrative adapter checks (unit mocks, not real Auth evidence)", () => {
  for (const role of [
    "funcionario_autorizado",
    "almoxarife",
    "coordenador",
    "planejamento",
    "diretor",
  ])
    it("rejects administrative operations for " + role, async () => {
      profile.role = role;
      await expect(
        backend.save("contracts", { name: "Ficticio" }),
      ).rejects.toMatchObject({ kind: "permission" });
      await expect(backend.snapshot()).rejects.toMatchObject({
        kind: "permission",
      });
      expect(client.from).not.toHaveBeenCalled();
    });
  it("rejects inactive managers", async () => {
    profile.active = false;
    await expect(backend.remove("contracts", "id")).rejects.toMatchObject({
      kind: "permission",
    });
    expect(client.from).not.toHaveBeenCalled();
  });
  for (const table of ["contract_balances", "audit_events", "__proto__"])
    it("does not expose writes to " + table, () => {
      expect(() => administrativePayload(table, {})).toThrow(/permitido/);
    });
  it("rejects protected or unexpected fields instead of forwarding them", () => {
    for (const input of [
      { name: "Teste", role: "proprietario" },
      { name: "Teste", created_at: "2000-01-01" },
      { name: "Teste", quantity: "1" },
    ])
      expect(() => administrativePayload("contracts", input)).toThrow(/Campo/);
  });
  it("requires mandatory values and rejects non-string input", () => {
    expect(() =>
      administrativePayload("products", {
        code: " ",
        description: "Ficticio",
        unit: "un",
      }),
    ).toThrow(/obrigatórios/);
    expect(() => administrativePayload("contracts", { name: 12 })).toThrow(
      /texto/,
    );
  });
  it("normalizes only approved fields", () =>
    expect(
      administrativePayload("products", {
        code: " TEST ",
        description: " Ficticio ",
        unit: "un",
      }),
    ).toEqual({
      code: "TEST",
      description: "Ficticio",
      unit: "un",
      category: "",
      manufacturer: "",
      model: "",
    }));
  it("does not treat zero affected rows as success", async () => {
    response.data = [];
    await expect(
      backend.save("contracts", { name: "Ficticio" }, "id"),
    ).rejects.toMatchObject({ kind: "permission" });
    await expect(backend.remove("contracts", "id")).rejects.toThrow(
      /Nenhuma alteração confirmada/,
    );
  });
  for (const role of ["proprietario", "administrador"])
    it("blocks self-administration for " + role, async () => {
      profile.role = role;
      await expect(backend.saveProfile(profile)).rejects.toMatchObject({
        kind: "permission",
      });
      await expect(
        backend.setUserContract("actor", "contract", true),
      ).rejects.toMatchObject({ kind: "permission" });
      expect(client.rpc).not.toHaveBeenCalled();
    });
  it("uses approved RPCs only to manage other users", async () => {
    const target = { ...owner, id: "other", role: "coordenador" };
    await backend.saveProfile(target);
    await backend.setUserContract("other", "contract", false);
    expect(client.rpc).toHaveBeenCalledWith("admin_save_profile", {
      target_id: "other",
      new_name: target.name,
      new_email: target.email,
      new_role: "coordenador",
      new_active: true,
    });
    expect(client.rpc).toHaveBeenCalledWith("admin_set_user_contract", {
      target_id: "other",
      target_contract: "contract",
      authorized: false,
    });
  });
  it("rechecks server profile after reading administrative data", async () => {
    verified
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce({ ...owner, role: "diretor" });
    await expect(backend.snapshot()).rejects.toMatchObject({
      kind: "permission",
    });
    expect(verified).toHaveBeenCalledTimes(2);
  });
  for (const [code, status, kind] of [
    ["23503", 409, "conflict"],
    ["23505", 409, "conflict"],
    ["23514", 400, "validation"],
    ["42501", 403, "permission"],
    ["", 401, "session"],
    ["", 0, "connection"],
  ])
    it("maps database failures safely " + code + status, () => {
      expect(administrativeFailure({ code }, status).kind).toBe(kind);
    });
});
