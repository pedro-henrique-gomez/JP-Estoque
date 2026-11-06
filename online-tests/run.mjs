import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactDiagnostic } from "../integration-tests/preflight.mjs";
import { prepareOnlineFixture } from "./environment.mjs";
try {
  const { fixture, env, workspace } = await prepareOnlineFixture();
  if (process.argv.includes("--serve")) {
    await writeFile(
      join(workspace, "fictitious-users.json"),
      JSON.stringify(fixture.users, null, 2),
    );
    console.log(
      "Local fictitious credentials file (do not commit): " +
        join(workspace, "fictitious-users.json"),
    );
    console.log(
      "Experimental UI: http://127.0.0.1:5183/code/html/index.html ; after Ctrl+C, run npm run dev:online:stop to confirm Docker cleanup",
    );
    process.env.VITE_JP_ONLINE_LOCAL = "true";
    process.env.VITE_SUPABASE_URL = fixture.api;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = fixture.anon;
    const { createServer } = await import("vite");
    const server = await createServer({
      server: { host: "127.0.0.1", port: 5183, strictPort: true },
    });
    await server.listen();
    try {
      await new Promise((done) => {
        process.once("SIGINT", done);
        process.once("SIGTERM", done);
      });
    } finally {
      await server.close();
    }
  } else {
    const code = await new Promise((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "playwright.online.config.js",
        ],
        {
          windowsHide: true,
          stdio: "inherit",
          env: {
            ...env,
            JP_ONLINE_FIXTURE: JSON.stringify(fixture),
            JP_ONLINE_PUBLIC_KEY: fixture.anon,
          },
        },
      );
      child.on("error", reject);
      child.on("exit", done);
    });
    const results = JSON.parse(
      await readFile("test-results/online-browser-results.json", "utf8"),
    );
    const passed =
      code === 0 &&
      results.status === "passed" &&
      results.stats.expected === 18 &&
      results.stats.unexpected === 0 &&
      results.stats.skipped === 0;
    await writeFile(
      "test-results/online-results.json",
      JSON.stringify(
        {
          version: "0.7.0",
          status: passed ? "passed" : "failed",
          executed: results.stats.expected + results.stats.unexpected,
          passed: results.stats.expected,
          failed: results.stats.unexpected,
          skipped: results.stats.skipped,
          configUnchanged: true,
          migrationsUnchanged: true,
          realAuth: true,
          realPostgrest: true,
          traceEnabled: false,
          stats: results.stats,
        },
        null,
        2,
      ),
    );
    if (!passed) process.exitCode = 1;
  }
} catch (e) {
  console.error(redactDiagnostic(e.message));
  process.exitCode = 1;
}
