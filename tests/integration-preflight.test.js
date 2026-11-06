import { afterEach, describe, it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep, basename } from "node:path";
import {
  localDockerSocket,
  localOnlyEnvironment,
  redactDiagnostic,
  prepareWorkspace,
  preflight,
} from "../integration-tests/preflight.mjs";
import { blockedReport, requiredCases } from "../integration-tests/cases.mjs";

const roots = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "jp-v06-"));
  roots.push(root);
  await mkdir(join(root, "supabase", "migrations"), { recursive: true });
  await mkdir(join(root, "db-tests", "support"), { recursive: true });
  await writeFile(
    join(root, "supabase", "config.toml"),
    'project_id = "original-project"\n[db]\nmajor_version = 17\n',
  );
  await writeFile(
    join(root, "supabase", "migrations", "20261105000100_model.sql"),
    "-- fictitious copy fixture, not executed\nselect 1;",
  );
  await writeFile(
    join(root, "db-tests", "support", "auth.sql"),
    "TEST AUTH STUB MUST NOT BE COPIED",
  );
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const absolute = resolve(root),
      base = resolve(tmpdir());
    if (
      !absolute.startsWith(base + sep) ||
      !basename(absolute).startsWith("jp-v06-")
    )
      throw new Error("Unsafe test cleanup target");
    await rm(absolute, { recursive: true, force: true });
  }
});
const unavailable = async () => ({ reachable: false, error: "ENOENT" });
const fakeCli = async (_command, args) => {
  if (args.includes("--version")) return { stdout: "3.0.0\n" };
  throw Object.assign(new Error("missing engine"), {
    code: 1,
    stderr: "docker command not found",
  });
};
describe("preflight local, não autenticação integrada", () => {
  it("usa apenas endpoints locais fixos para o engine", () => {
    expect(localDockerSocket("win32")).toBe("\\\\.\\pipe\\docker_engine");
    expect(localDockerSocket("linux")).toBe("/var/run/docker.sock");
  });
  it("remove contextos remotos, credenciais e proxies herdados", () => {
    const env = localOnlyEnvironment(
      {
        PATH: "preserved",
        DOCKER_HOST: "tcp://remote:2376",
        DOCKER_CONTEXT: "remote",
        SUPABASE_ACCESS_TOKEN: "example-only",
        PGHOST: "remote",
        HTTPS_PROXY: "http://remote",
      },
      "/isolated",
      "win32",
    );
    expect(env.DOCKER_HOST).toBe("npipe:////./pipe/docker_engine");
    expect(env.PATH).toBe("preserved");
    expect(env).not.toHaveProperty("DOCKER_CONTEXT");
    expect(env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
    expect(env).not.toHaveProperty("PGHOST");
    expect(env).not.toHaveProperty("HTTPS_PROXY");
    expect(env.DO_NOT_TRACK).toBe("1");
    expect(env.SUPABASE_TELEMETRY_DISABLED).toBe("1");
    expect(env.DOCKER_CONFIG).toContain(".docker");
  });
  it("copia somente configuração isolada e migrações, sem fixture Auth", async () => {
    const root = await fixture(),
      before = await readFile(join(root, "supabase", "config.toml"), "utf8");
    const result = await prepareWorkspace(root);
    expect(await readFile(join(root, "supabase", "config.toml"), "utf8")).toBe(
      before,
    );
    expect(
      await readFile(join(result.workspace, "supabase", "config.toml"), "utf8"),
    ).not.toBe(before);
    expect(await readdir(result.workspace)).toEqual(["supabase"]);
    expect(result.migrations).toHaveLength(1);
    expect(
      await readFile(
        join(
          result.workspace,
          "supabase",
          "migrations",
          result.migrations[0].name,
        ),
        "utf8",
      ),
    ).toContain("select 1");
  });
  it("registra o bloqueio sem iniciar stack ou comandos destrutivos", async () => {
    const root = await fixture(),
      commands = [];
    const evidence = await preflight(root, {
      platform: "win32",
      probeEngine: unavailable,
      execute: async (command, args, options) => {
        commands.push(args);
        return fakeCli(command, args, options);
      },
    });
    expect(evidence.runtimeReady).toBe(false);
    expect(evidence.configUnchanged).toBe(true);
    expect(evidence.migrationsUnchanged).toBe(true);
    expect(evidence.reasons).toContain(
      "NATIVE_SUPABASE_STACK_UNSUPPORTED_ON_WINDOWS",
    );
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("--version");
    expect(commands[1]).toContain("status");
    expect(commands.flat()).not.toContain("start");
    expect(commands.flat()).not.toContain("reset");
    expect(commands.flat()).not.toContain("login");
    expect(commands.flat()).not.toContain("link");
    expect(evidence.actions.stackStarted).toBe(false);
    expect(evidence.actions.remoteConnected).toBe(false);
  });
  it("CLI indisponível não provoca fallback para executável global ou remoto", async () => {
    const root = await fixture();
    let calls = 0;
    const evidence = await preflight(root, {
      platform: "win32",
      probeEngine: unavailable,
      execute: async () => {
        calls++;
        throw new Error("CLI missing");
      },
    });
    expect(calls).toBe(1);
    expect(evidence.cliVersion).toBe(null);
    expect(evidence.reasons).toContain("CLI_UNAVAILABLE");
  });
  it("status disponível nunca persiste stdout que pode conter chaves", async () => {
    const root = await fixture();
    const evidence = await preflight(root, {
      platform: "win32",
      probeEngine: async () => ({ reachable: true, version: "example" }),
      execute: async (_command, args) => ({
        stdout: args.includes("--version")
          ? "3.0.0"
          : "DO_NOT_PERSIST_STATUS_SECRET",
      }),
    });
    expect(evidence.status.ok).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain(
      "DO_NOT_PERSIST_STATUS_SECRET",
    );
    expect(blockedReport(evidence).status).toBe("blocked");
  });
  it("redige credenciais e JWTs em diagnósticos de erro", () => {
    const text = redactDiagnostic(
      "sb_secret_exampleonly eyJexample.example.example postgres://u:example@local/db password=example",
    );
    expect(text).not.toContain("sb_secret_exampleonly");
    expect(text).not.toContain("eyJexample");
    expect(text).not.toContain("u:example");
    expect(text).not.toContain("password=example");
  });
  it("detecta alteração da configuração original sem sobrescrevê-la", async () => {
    const root = await fixture();
    await expect(
      preflight(root, {
        platform: "win32",
        probeEngine: unavailable,
        execute: async (command, args) => {
          if (!args.includes("--version"))
            await writeFile(
              join(root, "supabase", "config.toml"),
              "changed externally",
            );
          return fakeCli(command, args);
        },
      }),
    ).rejects.toThrow(/configuration changed/);
    expect(await readFile(join(root, "supabase", "config.toml"), "utf8")).toBe(
      "changed externally",
    );
  });
  for (const runtimeReady of [false, true])
    it(`não marca autenticação como aprovada quando runtimeReady=${runtimeReady}`, () => {
      const report = blockedReport({ runtimeReady });
      expect(report.status).toBe("blocked");
      expect(report.executed).toBe(0);
      expect(report.passed).toBe(0);
      expect(report.blocked).toBe(18);
      expect(report.cases.every((test) => test.status === "blocked")).toBe(
        true,
      );
      expect(new Set(requiredCases.map((test) => test.id)).size).toBe(18);
    });
});
