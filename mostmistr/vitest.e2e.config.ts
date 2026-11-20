import { defineConfig } from "vitest/config";

// Průchod hrou v bezhlavém prohlížeči. Předpokládá hotové sestavení v dist/.
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
