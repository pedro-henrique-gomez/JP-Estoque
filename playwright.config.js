import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-vite", use: { baseURL: "http://localhost:5180" } },
    { name: "chromium-build", use: { baseURL: "http://localhost:5181" } },
  ],
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js --host localhost --port 5180 --strictPort",
      url: "http://localhost:5180/code/html/index.html",
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js preview --host localhost --port 5181 --strictPort",
      url: "http://localhost:5181/code/html/index.html",
      reuseExistingServer: false,
    },
  ],
});
