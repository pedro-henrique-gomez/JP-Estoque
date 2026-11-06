import { beforeEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  profile: {
    id: "user",
    name: "Ficticio",
    role: "funcionario_autorizado",
    active: true,
  },
  user: { id: "user" },
  authError: null,
  tables: [],
  options: null,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url, _key, options) => {
    mock.options = options;
    return {
      auth: {
        getSession: async () => ({
          data: { session: { access_token: "unit-only" } },
        }),
        getUser: async () => ({
          data: { user: mock.user },
          error: mock.authError,
        }),
      },
      from: (table) => {
        mock.tables.push(table);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mock.profile, error: null }),
            }),
            order: () => ({ range: async () => ({ data: [], error: null }) }),
          }),
        };
      },
    };
  },
}));
import { createOnlineBackend } from "../code/ts/data/online";
const config = {
  mode: "online",
  url: "http://127.0.0.1:56321",
  publicKey: "unit-test-only",
};
beforeEach(() => {
  mock.tables = [];
  mock.profile = {
    id: "user",
    name: "Ficticio",
    role: "funcionario_autorizado",
    active: true,
  };
  mock.authError = null;
  mock.user = { id: "user" };
  vi.restoreAllMocks();
});
describe("online adapter unit checks, separate from real Auth evidence", () => {
  it("uses explicit sessionStorage, never reads localStorage on construction", () => {
    const get = vi.spyOn(Storage.prototype, "getItem"),
      set = vi.spyOn(Storage.prototype, "setItem");
    createOnlineBackend(config, sessionStorage);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(mock.options.auth.storage).toBe(sessionStorage);
    expect(mock.options.auth.detectSessionInUrl).toBe(false);
  });
  it("rejects remote factory destinations before client construction", () =>
    expect(() =>
      createOnlineBackend(
        { ...config, url: "https://remote.supabase.co" },
        sessionStorage,
      ),
    ).toThrow());
  it("rejects forged/unverified identity before any data request", async () => {
    mock.authError = { status: 401 };
    await expect(
      createOnlineBackend(config, sessionStorage).snapshot(),
    ).rejects.toMatchObject({ kind: "session" });
    expect(mock.tables).toEqual([]);
  });
  it("denies inactive and missing profiles before inventory queries", async () => {
    mock.profile.active = false;
    await expect(
      createOnlineBackend(config, sessionStorage).snapshot(),
    ).rejects.toMatchObject({ kind: "inactive" });
    expect(mock.tables).toEqual(["profiles"]);
    mock.profile = null;
    await expect(
      createOnlineBackend(config, sessionStorage).snapshot(),
    ).rejects.toMatchObject({ kind: "permission" });
  });
  it("reads text-quantity RLS view and verifies profile again", async () => {
    const snapshot = await createOnlineBackend(
      config,
      sessionStorage,
    ).snapshot();
    expect(snapshot.balances).toEqual([]);
    expect(mock.tables).toContain("contract_balances_api");
    expect(mock.tables.filter((t) => t === "profiles")).toHaveLength(2);
  });
  it("refuses request redirection to a remote API", async () => {
    createOnlineBackend(config, sessionStorage);
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(
      mock.options.global.fetch("https://remote.supabase.co/rest/v1/contracts"),
    ).rejects.toThrow(/permitido/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
