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
await mkdir(".integration-local", { recursive: true });
await mkdir("test-results", { recursive: true });
const lock = await open(".integration-local/run.lock", "wx");
const invoke = (file, args, env = process.env) =>
  new Promise((done, reject) => {
    const child = spawn(file, args, {
      env,
      windowsHide: true,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? done() : reject(Error(`Child process failed (${code})`)),
    );
  });
let started = false;
try {
  const evidence = await preflight(root);
  if (!evidence.runtimeReady) {
    await writeFile(
      "test-results/integration-results.json",
      JSON.stringify(blockedReport(evidence), null, 2),
    );
    process.exitCode = 2;
  } else {
    await writeFile(
      "test-results/integration-results.json",
      JSON.stringify({ status: "running", executed: 0, passed: 0 }),
    );
    started = true;
    await invoke(process.execPath, ["integration-tests/start-local.mjs"]);
    await invoke(process.execPath, ["integration-tests/execute-local.mjs"]);
  }
} catch (e) {
  console.error(redactDiagnostic(e.message));
  const report = JSON.parse(
    await readFile("test-results/integration-results.json", "utf8").catch(
      () => "{}",
    ),
  );
  if (report.status === "running" || !report.status)
    await writeFile(
      "test-results/integration-results.json",
      JSON.stringify(
        {
          status: "blocked",
          reason: "LOCAL_STACK_SETUP_FAILED",
          executed: 0,
          passed: 0,
          blocked: 18,
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
