import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src/client",
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // při `npm run dev` běží API na wrangler dev (port 8787)
      "/api": "http://localhost:8787",
    },
  },
});
