import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
      coverage: {
        provider: "v8",
        reporter: ["json", "json-summary", "text"],
        reportsDirectory:
          process.env.SPRINT1_COVERAGE_DIR ?? "./coverage/sprint1",
        include: [
          "src/components/event-editor.tsx",
          "src/components/login-form.tsx",
          "src/lib/api.ts",
          "src/lib/server/api-proxy.ts",
          "src/lib/server/login-transport.mjs",
          "src/lib/formatting/vietnam-input.ts",
        ],
        exclude: [],
      },
    },
  }),
);
