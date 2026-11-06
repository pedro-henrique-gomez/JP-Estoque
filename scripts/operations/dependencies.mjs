import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const inventory = [];
const notices = [
  "JP Estoque - runtime third-party notices. Generated from installed packages and lockfile.\n",
];
const missingRuntimeNotices = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  const installed = await readFile(path + "/package.json", "utf8")
    .then(JSON.parse)
    .catch(() => null);
  inventory.push({
    name: installed?.name || path.split("node_modules/").at(-1),
    version: entry.version,
    license: installed?.license || entry.license || "REVIEW_REQUIRED",
    dev: !!entry.dev,
    optional: !!entry.optional,
    installed: !!installed,
    integrity: entry.integrity || null,
  });
  if (!entry.dev) {
    const files = await readdir(path).catch(() => []);
    const licenseFiles = files.filter((name) =>
      /^(license|copyright|notice)(\.|$)/i.test(name),
    );
    if (!installed || !licenseFiles.length) missingRuntimeNotices.push(path);
    for (const name of licenseFiles)
      notices.push(
        `\n===== ${installed?.name || path} ${entry.version} / ${name} =====\n` +
          (await readFile(path + "/" + name, "utf8")),
      );
  }
}
const audit = await new Promise((resolve, reject) => {
  if (!process.env.npm_execpath)
    throw Error("Run using npm run audit:dependencies");
  const child = spawn(
    process.execPath,
    [process.env.npm_execpath, "audit", "--json"],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let body = "";
  child.stdout.on("data", (b) => (body += b.toString()));
  child.on("error", reject);
  child.on("exit", () => {
    try {
      resolve(JSON.parse(body));
    } catch {
      reject(Error("Registry audit unavailable"));
    }
  });
});
const report = {
  recordedAt: new Date().toISOString(),
  vulnerabilities: audit.metadata?.vulnerabilities || null,
  registryAuditComplete: !!audit.metadata?.vulnerabilities,
  advisories: audit.vulnerabilities || {},
  inventory,
  scope:
    "npm registry advisories only; SheetJS tarball separately checked against publisher CVE advisories. Container images and bundled binaries are not scanned.",
  licenseApproval: "Inventory only; corporate legal approval is external.",
  missingRuntimeNotices,
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/dependencies-v10.json",
  JSON.stringify(report, null, 2),
);
await mkdir("public/licenses", { recursive: true });
await writeFile("public/licenses/THIRD-PARTY-v10.txt", notices.join("\n"));
console.log(
  JSON.stringify({
    packages: inventory.length,
    licenses: [...new Set(inventory.map((x) => JSON.stringify(x.license)))],
    vulnerabilities: report.vulnerabilities,
  }),
);
if (
  !report.registryAuditComplete ||
  report.vulnerabilities.total ||
  missingRuntimeNotices.length
)
  process.exitCode = 1;
