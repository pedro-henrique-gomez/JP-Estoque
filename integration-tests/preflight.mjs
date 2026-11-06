import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { request } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const execute = promisify(execFile);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function localDockerSocket(platform = process.platform) {
  return platform === "win32"
    ? "\\\\.\\pipe\\docker_engine"
    : "/var/run/docker.sock";
}
export function localOnlyEnvironment(
  parent,
  workspace,
  platform = process.platform,
) {
  const env = { ...parent };
  for (const key of Object.keys(env))
    if (/^(SUPABASE_|DOCKER_|PG[A-Z_]|HTTPS?_PROXY|ALL_PROXY)/i.test(key))
      delete env[key];
  return {
    ...env,
    DOCKER_HOST:
      platform === "win32"
        ? "npipe:////./pipe/docker_engine"
        : "unix:///var/run/docker.sock",
    DOCKER_CONFIG: join(workspace, ".docker"),
    SUPABASE_HOME: join(workspace, ".state"),
    SUPABASE_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    NO_PROXY: "localhost,127.0.0.1,::1",
  };
}
export function redactDiagnostic(text) {
  return text
    .replace(/(?:sb_secret_|sb_publishable_)[\w-]+/g, "[REDACTED_KEY]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED_JWT]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, "$1[REDACTED]")
    .replace(
      /((?:password|service_role|secret_key|access_token)\s*[:=]\s*)\S+/gi,
      "$1[REDACTED]",
    );
}
export function probeDockerSocket(platform = process.platform, timeout = 1800) {
  return new Promise((done) => {
    const req = request(
      {
        socketPath: localDockerSocket(platform),
        path: "/version",
        method: "GET",
        timeout,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 65536) req.destroy(new Error("response too large"));
        });
        response.on("end", () => {
          try {
            const value = JSON.parse(body);
            done({
              reachable:
                response.statusCode === 200 &&
                typeof value.Version === "string",
              version: typeof value.Version === "string" ? value.Version : null,
            });
          } catch {
            done({ reachable: false, error: "invalid_local_engine_response" });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("local_engine_timeout")));
    req.on("error", (error) =>
      done({
        reachable: false,
        error: error.code || "local_engine_unavailable",
      }),
    );
    req.end();
  });
}
export async function prepareWorkspace(root = process.cwd()) {
  const workspace = resolve(
    root,
    ".integration-local",
    `preflight-${randomUUID()}`,
  );
  await mkdir(join(workspace, "supabase", "migrations"), { recursive: true });
  const originalConfig = await readFile(join(root, "supabase", "config.toml"));
  const isolatedConfig = originalConfig
    .toString("utf8")
    .replace(/^project_id\s*=.*$/m, `project_id = "jp-e2e-${randomUUID()}"`);
  await writeFile(join(workspace, "supabase", "config.toml"), isolatedConfig);
  const migrations = [];
  for (const name of (await readdir(join(root, "supabase", "migrations")))
    .filter((name) => /^\d{14}_[\w-]+\.sql$/.test(name))
    .sort()) {
    const bytes = await readFile(join(root, "supabase", "migrations", name));
    await writeFile(join(workspace, "supabase", "migrations", name), bytes);
    migrations.push({ name, sha256: digest(bytes) });
  }
  return { workspace, originalConfigHash: digest(originalConfig), migrations };
}
export async function preflight(root = process.cwd(), tools = {}) {
  const platform = tools.platform ?? process.platform;
  const prepared = await prepareWorkspace(root),
    env = localOnlyEnvironment(process.env, prepared.workspace, platform);
  const cli = join(root, "node_modules", "supabase", "dist", "supabase.js");
  const invoke = (args) =>
    (tools.execute ?? execute)(process.execPath, [cli, ...args], {
      cwd: prepared.workspace,
      env,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
  let cliVersion = null,
    status = { ok: false, exitCode: null, message: "CLI unavailable" };
  try {
    const { stdout } = await invoke(["--version"]);
    cliVersion =
      stdout.trim().match(/^\d+\.\d+\.\d+(?:[-.\w]*)?$/m)?.[0] ?? null;
  } catch {
    /* Report unavailable, never fall back to a hosted CLI. */
  }
  const docker = await (tools.probeEngine ?? probeDockerSocket)(platform);
  if (cliVersion) {
    try {
      // Read-only, isolated project, fixed local engine. Successful stdout may
      // contain keys: deliberately discard it rather than logging or persisting it.
      await invoke([
        "status",
        "--workdir",
        prepared.workspace,
        "--output",
        "json",
      ]);
      status = {
        ok: true,
        exitCode: 0,
        message: "Local status command completed; credentials discarded",
      };
    } catch (error) {
      status = {
        ok: false,
        exitCode: typeof error.code === "number" ? error.code : null,
        message: redactDiagnostic(String(error.stderr || error.message)).slice(
          0,
          1200,
        ),
      };
    }
  }
  const configUnchanged =
    digest(await readFile(join(root, "supabase", "config.toml"))) ===
    prepared.originalConfigHash;
  let migrationsUnchanged = true;
  for (const migration of prepared.migrations) {
    const original = await readFile(
      join(root, "supabase", "migrations", migration.name),
    );
    const copied = await readFile(
      join(prepared.workspace, "supabase", "migrations", migration.name),
    );
    if (
      digest(original) !== migration.sha256 ||
      digest(copied) !== migration.sha256
    )
      migrationsUnchanged = false;
  }
  const reasons = [];
  if (!cliVersion) reasons.push("CLI_UNAVAILABLE");
  if (!docker.reachable) reasons.push("NO_LOCAL_DOCKER_COMPATIBLE_ENGINE");
  if (platform === "win32" && !docker.reachable)
    reasons.push("NATIVE_SUPABASE_STACK_UNSUPPORTED_ON_WINDOWS");
  if (!configUnchanged)
    throw new Error("Original Supabase configuration changed unexpectedly");
  if (!migrationsUnchanged)
    throw new Error("Source or copied migrations changed unexpectedly");
  return {
    platform,
    architecture: process.arch,
    cliVersion,
    docker,
    status,
    configUnchanged,
    migrationsUnchanged,
    migrations: prepared.migrations,
    runtimeReady: !!cliVersion && docker.reachable,
    reasons,
    actions: {
      stackStarted: false,
      remoteConnected: false,
      authFixturesApplied: false,
      existingDataModified: false,
    },
  };
}
