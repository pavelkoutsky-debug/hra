import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";

export default defineConfig({
  plugins: [
    {
      name: "md-as-text",
      enforce: "pre",
      load(id) {
        if (id.endsWith(".md")) {
          return `export default ${JSON.stringify(readFileSync(id, "utf-8"))};`;
        }
      },
    },
  ],
  test: {
    include: ["test/smoke.live.test.ts"],
  },
});
