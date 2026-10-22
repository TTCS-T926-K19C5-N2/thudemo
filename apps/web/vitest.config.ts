import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx", "tests/**/*.test.ts"],
    environment: "node",
    // Exhaustive QR mutation checks share CPU with the parallel API/web suites.
    // Keep all cases and default worker concurrency; allow a bounded test budget.
    testTimeout: 15_000,
  },
});
