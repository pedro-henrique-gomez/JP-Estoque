import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { summarizeImageScan } from "./image-report.mjs";
const exec = promisify(execFile),
  scanEnvironment = {
    ...process.env,
    DOCKER_HOST:
      process.platform === "win32"
        ? "npipe:////./pipe/docker_engine"
        : "unix:///var/run/docker.sock",
  };
delete scanEnvironment.DOCKER_CONTEXT;
const refs = [
  "public.ecr.aws/supabase/postgrest:v16.5",
  "public.ecr.aws/supabase/gotrue:v2.197.0",
  "public.ecr.aws/supabase/kong:2.8.1",
  "public.ecr.aws/supabase/postgres:17.11.0.011",
];
await mkdir("test-results", { recursive: true });
const report = {
  recordedAt: new Date().toISOString(),
  scope:
    "Existing public images only, local:// prevents registry image lookup/pull. Scout advisory service consulted; no application directory or database volume scanned.",
  status: "running",
  pilotReady: false,
  images: [],
};
try {
  const version = await exec("docker", ["scout", "version"], {
    env: scanEnvironment,
    windowsHide: true,
  });
  report.scanner = /version:\s*(\S+)/.exec(version.stdout)?.[1] || "unknown";
  for (const reference of refs) {
    const name = reference.split("/").at(-1).split(":")[0],
      path = "test-results/" + name + "-v10.sarif.json";
    const image = JSON.parse(
      (
        await exec("docker", ["image", "inspect", reference], {
          env: scanEnvironment,
          windowsHide: true,
        })
      ).stdout,
    )[0];
    await exec(
      "docker",
      [
        "scout",
        "cves",
        "--format",
        "sarif",
        "--output",
        path,
        "local://" + reference,
      ],
      {
        env: scanEnvironment,
        windowsHide: true,
        timeout: 300000,
        maxBuffer: 4 * 1024 ** 2,
      },
    );
    const bytes = await readFile(path);
    report.images.push({
      reference,
      imageId: image.Id,
      repoDigests: image.RepoDigests || [],
      sarifSha256: createHash("sha256").update(bytes).digest("hex"),
      ...summarizeImageScan(JSON.parse(bytes.toString("utf8"))),
    });
  }
  report.status = report.images.some((i) => i.highCriticalGate === "blocked")
    ? "blocked-high-critical-findings"
    : "complete-no-high-critical-in-scanner-scope";
} catch {
  report.status = "blocked-scan-incomplete";
  process.exitCode = 1;
}
await writeFile(
  "test-results/images-v10.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    status: report.status,
    images: report.images.map((i) => ({
      reference: i.reference,
      severities: i.severities,
    })),
  }),
);
if (report.status === "blocked-high-critical-findings") process.exitCode = 2;
