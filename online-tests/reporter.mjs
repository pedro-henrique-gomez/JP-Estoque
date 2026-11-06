import { writeFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { redactDiagnostic } from "../integration-tests/preflight.mjs";
export default class SafeOnlineReporter {
  constructor() {
    this.cases = [];
    this.started = Date.now();
  }
  safe(text) {
    let value = redactDiagnostic(String(text));
    const f = JSON.parse(process.env.JP_ONLINE_FIXTURE || "{}");
    for (const u of Object.values(f.users || {}))
      if (u.password)
        value = value.replaceAll(u.password, "[REDACTED_PASSWORD]");
    return value;
  }
  onBegin() {
    console.log(
      "Real online Chromium suite started (credentials and traces suppressed)",
    );
  }
  onError(error) {
    console.error(this.safe(error.message));
    this.globalError = true;
  }
  onTestEnd(test, result) {
    const passed = result.status === test.expectedStatus;
    const entry = {
      suite: test.location.file.endsWith("administration.spec.js")
        ? "administration"
        : "authentication",
      title: test.title,
      project: test.parent.project()?.name,
      status: passed ? "passed" : result.status,
      durationMs: result.duration,
    };
    if (!passed) entry.errors = result.errors.map((e) => this.safe(e.message));
    this.cases.push(entry);
    console.log(`${passed ? "PASS" : "FAIL"} ${test.title}`);
    if (entry.errors) for (const e of entry.errors) console.log(e);
  }
  async onEnd(result) {
    const scrub = async (dir) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(
        () => [],
      )) {
        const path = join(dir, e.name);
        if (e.isDirectory()) await scrub(path);
        else if (/\.(md|txt|json)$/.test(path))
          await writeFile(path, this.safe(await readFile(path, "utf8")));
      }
    };
    await scrub("test-results/online-playwright");
    const expected = this.cases.filter((c) => c.status === "passed").length,
      skipped = this.cases.filter((c) => c.status === "skipped").length;
    await writeFile(
      "test-results/online-browser-results.json",
      JSON.stringify(
        {
          status: result.status,
          stats: {
            expected,
            unexpected: this.cases.length - expected - skipped,
            skipped,
            duration: Date.now() - this.started,
          },
          cases: this.cases,
        },
        null,
        2,
      ),
    );
    console.log(
      `Online Chromium: status ${result.status}; ${expected} passed of ${this.cases.length} executed; ${skipped} skipped`,
    );
  }
}
