import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";

export default defineConfig({
  plugins: [
    {
      // .md soubory se v Workeru importují jako text (wrangler rule Text) — totéž pro testy
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
    include: ["test/**/*.test.ts"],
    exclude: ["test/smoke.live.test.ts", "**/node_modules/**"],
  },
});
