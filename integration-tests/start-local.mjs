import { checkPorts } from "./safety.mjs";
import {
  prepareWorkspace,
  localOnlyEnvironment,
  redactDiagnostic,
} from "./preflight.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
const exec = promisify(execFile);
const p = await prepareWorkspace();
p.network = "jp-v06-" + p.workspace.split("preflight-")[1];
await writeFile(".integration-local/current.json", JSON.stringify(p));
const environment = localOnlyEnvironment(process.env, p.workspace);
const info = JSON.parse(
  (
    await exec("docker", ["info", "--format", "{{json .}}"], {
      env: environment,
      windowsHide: true,
    })
  ).stdout,
);
if (info.OSType !== "linux" || info.MemTotal < 4 * 1024 ** 3)
  throw Error("Linux Docker with at least 4 GiB required");
await checkPorts([56320, 56321, 56322]);
console.log(
  "Resource check: Linux Docker, " +
    Math.round(info.MemTotal / 1024 ** 2) +
    " MiB; selected ports free",
);
let c = await readFile(join(p.workspace, "supabase/config.toml"), "utf8");
const jwtTtl = process.env.JP_LOCAL_JWT_TTL === "180" ? 180 : 60;
c = c
  .replace("[api]", "[api]\nport = 56321")
  .replace("[db]", "[db]\nport = 56322\nshadow_port = 56320")
  .replace("[auth]", `[auth]\njwt_expiry = ${jwtTtl}`);
c +=
  "\n[studio]\nenabled = false\n[storage]\nenabled = false\n[realtime]\nenabled = false\n[local_smtp]\nenabled = false\n[edge_runtime]\nenabled = false\n[db.pooler]\nenabled = false\n";
await writeFile(join(p.workspace, "supabase/config.toml"), c);
await writeFile(".integration-local/current.json", JSON.stringify(p));
await exec(
  "docker",
  [
    "network",
    "create",
    "--driver",
    "bridge",
    "--opt",
    "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
    p.network,
  ],
  { env: environment, windowsHide: true },
);
console.log(
  "Starting isolated stack; output captured and redacted on failure.",
);
try {
  await exec(
    process.execPath,
    [
      "node_modules/supabase/dist/supabase.js",
      "start",
      "--network-id",
      p.network,
      "--workdir",
      p.workspace,
      "--exclude",
      "studio,realtime,storage-api,imgproxy,mailpit,postgres-meta,edge-runtime,logflare,vector,supavisor",
    ],
    {
      env: localOnlyEnvironment(process.env, p.workspace),
      timeout: 1200000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    },
  );
  console.log("Stack started");
} catch (e) {
  console.log(
    redactDiagnostic(String(e.stderr || e.stdout || e.message)).slice(-5000),
  );
  process.exitCode = 1;
}
