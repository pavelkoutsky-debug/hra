import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __VERZE_HRY__: JSON.stringify("0.0.0-test"),
    __OTISK_SESTAVENI__: JSON.stringify("test"),
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e/**", "**/node_modules/**"],
    environment: "node",
  },
});
