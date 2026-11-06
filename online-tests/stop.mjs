import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { assertWorkspace } from "../integration-tests/safety.mjs";
import {
  localOnlyEnvironment,
  redactDiagnostic,
} from "../integration-tests/preflight.mjs";
const exec = promisify(execFile);
try {
  const p = JSON.parse(
    await readFile(".integration-local/manual-session.json", "utf8"),
  );
  assertWorkspace(process.cwd(), p.workspace);
  const lock = await readFile(".integration-local/run.lock", "utf8").catch(
    () => null,
  );
  if (lock && JSON.parse(lock).pid !== p.managerPid)
    throw Error("Another execution owns the lock; no resources were stopped");
  if (p.managerPid) {
    let alive = false;
    try {
      process.kill(p.managerPid, 0);
      alive = true;
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
    if (alive)
      throw Error(
        "Stop the manual launcher with Ctrl+C before closing its Docker environment",
      );
  }
  const config = await readFile(
    join(p.workspace, "supabase/config.toml"),
    "utf8",
  );
  if (!/^project_id\s*=\s*"jp-e2e-[0-9a-f-]{36}"$/m.test(config))
    throw Error("Unrecognized disposable project");
  const env = localOnlyEnvironment(process.env, p.workspace);
  await exec(
    process.execPath,
    [
      join(process.cwd(), "node_modules/supabase/dist/supabase.js"),
      "stop",
      "--workdir",
      p.workspace,
    ],
    { env, windowsHide: true, timeout: 60000 },
  );
  if (/^jp-v06-[0-9a-f-]{36}$/.test(p.network || "")) {
    const exists = await exec(
      "docker",
      ["network", "inspect", "--format", "{{.Name}}", p.network],
      { env, windowsHide: true },
    ).then(
      () => true,
      () => false,
    );
    if (exists)
      await exec("docker", ["network", "rm", p.network], {
        env,
        windowsHide: true,
      });
  }
  if (lock !== null) await unlink(".integration-local/run.lock");
  await writeFile(
    ".integration-local/manual-results.json",
    JSON.stringify(
      { status: "stopped", explicitStop: true, executed: 0, passed: 0 },
      null,
      2,
    ),
  );
  console.log(
    "Only the recorded disposable local project was stopped; backups preserved",
  );
} catch (e) {
  console.error(redactDiagnostic(e.message));
  process.exitCode = 1;
}
