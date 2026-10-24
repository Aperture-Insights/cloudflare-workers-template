import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        // The plugin must live in this project's own plugins, never the root.
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
        test: { name: "worker", include: ["worker/test/**/*.test.ts"] },
      },
      {
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/test/**/*.test.mjs"],
        },
      },
    ],
  },
});
