import { beforeEach, describe, it, expect, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});
describe("seleção de infraestrutura v0.5", () => {
  it("mantém os mesmos adaptadores locais sem realizar leitura/escrita ou rede na criação", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const read = vi.spyOn(Storage.prototype, "getItem"),
      write = vi.spyOn(Storage.prototype, "setItem");
    const { createBackend } = await import("../code/ts/data/backend");
    const { demoStorage } = await import("../code/ts/demo-storage");
    const { demoAdminStorage } = await import("../code/ts/demo-admin-storage");
    const backend = createBackend();
    expect(backend.mode).toBe("demo");
    expect(backend.materials).toBe(demoStorage);
    expect(backend.administration).toBe(demoAdminStorage);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("nega ativação online e modo desconhecido, sem fallback silencioso ou conexão", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { createBackend } = await import("../code/ts/data/backend");
    expect(() => createBackend({ mode: "online" })).toThrow(
      /online desativado/,
    );
    expect(() => createBackend({ mode: "unknown" })).toThrow(
      /online desativado/,
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("não utiliza URL, ambiente ou localStorage para ativar o modo online", async () => {
    const { backendConfiguration } = await import("../code/ts/data/config");
    expect(backendConfiguration).toEqual({ mode: "demo" });
    expect(Object.isFrozen(backendConfiguration)).toBe(true);
  });
});
