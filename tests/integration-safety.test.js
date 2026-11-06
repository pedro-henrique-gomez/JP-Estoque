import { it, expect } from "vitest";
import { resolve } from "node:path";
import { assertWorkspace, checkPorts } from "../integration-tests/safety.mjs";
import { createServer } from "node:net";
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
it("rejects an already occupied loopback port", async () => {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    await expect(checkPorts([server.address().port])).rejects.toThrow(
      /unavailable/,
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});
