import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./online-tests",
  testMatch: "*.spec.js",
  outputDir: "test-results/online-playwright",
  workers: 1,
  fullyParallel: false,
  reporter: [["./online-tests/reporter.mjs"]],
  timeout: 45000,
  use: {
    browserName: "chromium",
    headless: true,
    baseURL: "http://127.0.0.1:5183",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "online-desktop", testIgnore: "**/import.spec.js" },
    {
      name: "online-mobile",
      testIgnore: "**/import.spec.js",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "online-import-desktop",
      testMatch: "**/import.spec.js",
      dependencies: ["online-desktop", "online-mobile"],
    },
    {
      name: "online-import-mobile",
      testMatch: "**/import.spec.js",
      dependencies: ["online-desktop", "online-mobile"],
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5183 --strictPort",
    url: "http://127.0.0.1:5183/code/html/index.html",
    reuseExistingServer: false,
    env: {
      VITE_JP_ONLINE_LOCAL: "true",
      VITE_SUPABASE_URL: "http://127.0.0.1:56321",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.JP_ONLINE_PUBLIC_KEY,
    },
  },
});
