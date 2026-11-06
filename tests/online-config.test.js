import { describe, it, expect } from "vitest";
import {
  resolveOnlineConfiguration,
  localApiUrl,
} from "../code/ts/data/online-config";
const anon = [
  "eyJ0eXAiOiJKV1QifQ",
  btoa(JSON.stringify({ role: "anon" })),
  "unit-test-placeholder",
].join(".");
const configured = {
  DEV: true,
  VITE_JP_ONLINE_LOCAL: "true",
  VITE_SUPABASE_URL: "http://127.0.0.1:56321",
  VITE_SUPABASE_PUBLISHABLE_KEY: anon,
};
describe("gate online local v0.7 (not an authorization mechanism)", () => {
  it("defaults to demo even with URL and key, without explicit opt-in", () => {
    expect(resolveOnlineConfiguration({})).toBeNull();
    expect(
      resolveOnlineConfiguration({
        ...configured,
        VITE_JP_ONLINE_LOCAL: undefined,
      }),
    ).toBeNull();
  });
  it("requires a development server even when configured", () => {
    expect(() =>
      resolveOnlineConfiguration({ ...configured, DEV: false }),
    ).toThrow(/desenvolvimento/);
  });
  it("accepts only explicit loopback endpoints and public keys", () => {
    expect(resolveOnlineConfiguration(configured)?.mode).toBe("online");
    expect(
      resolveOnlineConfiguration({
        ...configured,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testonly",
      })?.url,
    ).toBe("http://127.0.0.1:56321");
  });
  for (const url of [
    "https://example.supabase.co",
    "http://127.0.0.1.evil:56321",
    "http://localhost:56321",
    "http://192.168.1.1:56321",
    "http://127.0.0.1:56321@evil",
    "http://user:password@127.0.0.1:56321",
    "http://127.0.0.1:56321/rest/v1/",
    "http://127.0.0.1:56321?remote=1",
    "http://127.0.0.1:80",
  ])
    it("rejects destination " + url, () =>
      expect(() => localApiUrl(url)).toThrow(),
    );
  for (const key of [
    "sb_secret_testonly",
    "invalid",
    ["e30", btoa(JSON.stringify({ role: "service_role" })), "test"].join("."),
  ])
    it("rejects secret/malformed config keys", () =>
      expect(() =>
        resolveOnlineConfiguration({
          ...configured,
          VITE_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      ).toThrow(/pública/));
});
