import { defineConfig, loadEnv } from "vite";
import { resolveOnlineConfiguration } from "./code/ts/data/online-config.ts";
import { resolve } from "node:path";

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (
    env.VITE_JP_ONLINE_LOCAL === "true" ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY
  ) {
    resolveOnlineConfiguration({
      ...env,
      VITE_JP_ONLINE_LOCAL: "true",
      DEV: true,
    });
  }
  if (env.VITE_JP_ONLINE_LOCAL === "true" && (command !== "serve" || isPreview))
    throw new Error(
      "Online experimental exige Vite de desenvolvimento; build/preview online proibidos.",
    );
  return {
    server: {
      fs: {
        strict: true,
        allow: ["code", "img", "public", "node_modules"].map((path) =>
          resolve(path),
        ),
        deny: [
          "**/.env",
          "**/.env.*",
          "**/*.{crt,pem}",
          "**/.git/**",
          "**/.integration-local/**",
          "**/.local-db/**",
          "**/test-results/**",
          "**/imports/**",
        ],
      },
    },
    base: "./",
    build: { rollupOptions: { input: "code/html/index.html" } },
    test: { environment: "jsdom", include: ["tests/**/*.test.js"] },
  };
});
