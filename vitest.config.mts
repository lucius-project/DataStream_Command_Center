import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Pure-logic unit tests only (scoring math, kpiStatus banding,
// business-hours/date math) — no DB, no network, so the default Node
// environment is all that's needed; no jsdom dependency to install.
// Everything else in this app is verified live against real data (see
// README), matching how this app has always been checked, rather than
// building out a mocked integration-test layer.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
