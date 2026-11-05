import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { rollupOptions: { input: "code/html/index.html" } },
  test: { environment: "jsdom", include: ["tests/**/*.test.js"] },
});
