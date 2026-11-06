import { it, expect } from "vitest";
import { resolve } from "node:path";
import { assertWorkspace, checkPorts } from "../integration-tests/safety.mjs";
it("rejects existing project and external cleanup targets", () => {
  for (const path of ["supabase", "..", "C:/", "other/preflight-123"])
    expect(() => assertWorkspace(process.cwd(), path)).toThrow();
  expect(
    assertWorkspace(
      process.cwd(),
      resolve(
        ".integration-local/preflight-12345678-1234-1234-1234-123456789abc",
      ),
    ),
  ).toContain(".integration-local");
});
it("checks an ephemeral local port without external services", async () => {
  await expect(checkPorts([0])).resolves.toBeUndefined();
});
