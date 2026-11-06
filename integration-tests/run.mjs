import { mkdir, writeFile } from "node:fs/promises";
import { preflight } from "./preflight.mjs";
import { blockedReport } from "./cases.mjs";

try {
  const evidence = await preflight();
  const report = blockedReport(evidence);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/integration-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(`Supabase CLI: ${evidence.cliVersion ?? "unavailable"}`);
  console.log(
    `Local container engine: ${evidence.docker.reachable ? "reachable" : "unavailable"}`,
  );
  console.log(
    `Integration: BLOCKED; ${report.executed} Auth/PostgREST checks executed; ${report.blocked} required scenarios pending.`,
  );
  console.log(
    `Reason: ${report.reason}. Original config preserved: ${evidence.configUnchanged}.`,
  );
  if (evidence.runtimeReady)
    console.log(
      "Engine availability is not a passed integration suite. The real HTTP flow still requires execution in a disposable stack.",
    );
  process.exitCode = 2;
} catch (error) {
  console.error(`Integration preflight failed: ${error.message}`);
  process.exitCode = 1;
}
