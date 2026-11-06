import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  preflight,
  localOnlyEnvironment,
  redactDiagnostic,
} from "./preflight.mjs";
import { blockedReport } from "./cases.mjs";
import { assertWorkspace } from "./safety.mjs";
const root = process.cwd();
const readiness = process.argv.includes("--readiness");
const manual = process.argv.includes("--serve-online");
const online = manual || process.argv.includes("--online-ui");
if (readiness && online) throw Error("Select only one isolated stack mode");
const reportPath = readiness
  ? "test-results/readiness-results.json"
  : manual
    ? ".integration-local/manual-results.json"
    : online
      ? "test-results/online-results.json"
      : "test-results/integration-results.json";
await mkdir(".integration-local", { recursive: true });
await mkdir("test-results", { recursive: true });
const lock = await open(".integration-local/run.lock", "wx");
await lock.writeFile(JSON.stringify({ pid: process.pid, manual }));
const invoke = (file, args, env = process.env) =>
  new Promise((done, reject) => {
    const child = spawn(file, args, {
      env,
      windowsHide: true,
      stdio: "inherit",
    });
    activeChild = child;
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ||
      (manual && stopping && args.includes("online-tests/run.mjs"))
        ? done()
        : reject(Error(`Child process failed (${code})`)),
    );
  });
let started = false;
let activeChild;
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  activeChild?.kill("SIGTERM");
});
try {
  const evidence = await preflight(root);
  if (!evidence.runtimeReady) {
    await writeFile(
      reportPath,
      JSON.stringify(
        readiness
          ? {
              version: "1.0.0",
              status: "blocked",
              pilotReady: false,
              executed: 0,
              passed: 0,
              blocked: 11,
              reason: "LOCAL_RUNTIME_UNAVAILABLE",
            }
          : blockedReport(evidence),
        null,
        2,
      ),
    );
    process.exitCode = 2;
  } else {
    await writeFile(
      reportPath,
      JSON.stringify({ status: "running", executed: 0, passed: 0 }),
    );
    started = true;
    await invoke(process.execPath, ["integration-tests/start-local.mjs"], {
      ...process.env,
      JP_LOCAL_JWT_TTL: online || readiness ? "180" : "60",
      JP_READINESS: readiness ? "1" : "0",
    });
    if (manual) {
      const p = JSON.parse(
        await readFile(".integration-local/current.json", "utf8"),
      );
      await writeFile(
        ".integration-local/manual-session.json",
        JSON.stringify({ ...p, managerPid: process.pid }, null, 2),
      );
    }
    await invoke(process.execPath, [
      readiness
        ? "readiness-tests/run.mjs"
        : online
          ? "online-tests/run.mjs"
          : "integration-tests/execute-local.mjs",
      ...(manual ? ["--serve"] : []),
    ]);
    if (manual)
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            status: "stopped",
            scope: "manual-local-experiment",
            executed: 0,
            passed: 0,
          },
          null,
          2,
        ),
      );
  }
} catch (e) {
  console.error(redactDiagnostic(e.message));
  const report = JSON.parse(
    await readFile(reportPath, "utf8").catch(() => "{}"),
  );
  if (report.status === "running" || !report.status)
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          status: "blocked",
          reason: "LOCAL_STACK_SETUP_FAILED",
          executed: 0,
          passed: 0,
          blocked: readiness ? 11 : 18,
          message: redactDiagnostic(e.message),
        },
        null,
        2,
      ),
    );
  process.exitCode = 1;
} finally {
  if (started) {
    try {
      const p = JSON.parse(
        await readFile(".integration-local/current.json", "utf8"),
      );
      assertWorkspace(root, p.workspace);
      await invoke(
        process.execPath,
        [
          join(root, "node_modules/supabase/dist/supabase.js"),
          "stop",
          "--workdir",
          p.workspace,
        ],
        localOnlyEnvironment(process.env, p.workspace),
      );
      if (/^jp-v06-[0-9a-f-]{36}$/.test(p.network ?? ""))
        await invoke(
          "docker",
          ["network", "rm", p.network],
          localOnlyEnvironment(process.env, p.workspace),
        );
    } catch {
      console.error(
        "Disposable stack cleanup requires review; no existing containers were targeted",
      );
      process.exitCode = 1;
    }
  }
  await lock.close();
  await unlink(".integration-local/run.lock");
}
