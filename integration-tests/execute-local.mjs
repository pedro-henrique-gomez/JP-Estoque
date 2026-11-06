import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import pg from "pg";
import { localOnlyEnvironment, redactDiagnostic } from "./preflight.mjs";
import { executeCases } from "./http-cases.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertWorkspace } from "./safety.mjs";
const exec = promisify(execFile),
  root = process.cwd();
const p = JSON.parse(await readFile(".integration-local/current.json", "utf8"));
assertWorkspace(root, p.workspace);
const env = localOnlyEnvironment(process.env, p.workspace);
try {
  const { stdout } = await exec(
    process.execPath,
    [
      join(root, "node_modules/supabase/dist/supabase.js"),
      "status",
      "--workdir",
      p.workspace,
      "--output",
      "json",
    ],
    { env, windowsHide: true },
  );
  const s = JSON.parse(stdout);
  const api = s.API_URL;
  if (new URL(api).hostname !== "127.0.0.1" || new URL(api).port !== "56321")
    throw Error("Non-loopback API rejected");
  const uri = new URL(s.DB_URL);
  if (uri.hostname !== "127.0.0.1" || uri.port !== "56322")
    throw Error("Non-disposable DB rejected");
  const db = new pg.Client({ connectionString: s.DB_URL });
  await db.connect();
  try {
    const version = (await db.query("select version()")).rows[0].version;
    const migrationRows = (
      await db.query(
        "select version from supabase_migrations.schema_migrations order by version",
      )
    ).rows;
    assert.deepEqual(
      migrationRows.map((r) => r.version),
      p.migrations.map((m) => m.name.split("_")[0]),
    );
    const digest = (b) => createHash("sha256").update(b).digest("hex");
    assert.equal(
      digest(await readFile(join(root, "supabase/config.toml"))),
      p.originalConfigHash,
    );
    for (const m of p.migrations) {
      for (const base of [root, p.workspace])
        assert.equal(
          digest(await readFile(join(base, "supabase/migrations", m.name))),
          m.sha256,
        );
    }
    const rls = (
      await db.query(
        "select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname",
      )
    ).rows;
    assert.equal(rls.length, 12);
    assert.ok(rls.every((t) => t.relrowsecurity && t.relforcerowsecurity));
    const { cases, http } = await executeCases({
      api,
      anon: s.ANON_KEY,
      service: s.SERVICE_ROLE_KEY,
      db,
    });
    const { stdout: containers } = await exec(
      "docker",
      ["ps", "--format", "{{.Names}} {{.Image}}"],
      { env, windowsHide: true },
    );
    const report = {
      version: "0.6.0",
      status: cases.every((c) => c.status === "passed") ? "passed" : "failed",
      executed: cases.length,
      passed: cases.filter((c) => c.status === "passed").length,
      failed: cases.filter((c) => c.status === "failed").length,
      blocked: 0,
      recordedAt: new Date().toISOString(),
      preservation: {
        configUnchanged: true,
        migrationsUnchanged: true,
        hashes: p.migrations,
      },
      rls,
      postgres: version,
      migrations: migrationRows,
      services: containers
        .trim()
        .split("\n")
        .filter((x) => x.includes("jp-e2e")),
      cases,
      http,
    };
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/integration-results.json",
      JSON.stringify(report, null, 2),
    );
    console.log(`Integration ${report.passed}/${report.executed}`);
    process.exitCode = report.failed ? 1 : 0;
  } finally {
    await db.end();
  }
} catch (e) {
  console.error(
    redactDiagnostic(String(e.stderr || e.stdout || e.message)).slice(-2000),
  );
  process.exitCode = 1;
}
