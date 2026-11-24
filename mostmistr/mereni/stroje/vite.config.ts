// Sestaví `vstup.ts` do jediného souboru bez modulů, který umí pustit i samostatný stroj
// JavaScriptu bez Node (viz `porovnej.mjs`).
import { defineConfig } from "vite";

export default defineConfig({
  logLevel: "warn",
  publicDir: false,
  build: {
    lib: { entry: new URL("./vstup.ts", import.meta.url).pathname, formats: ["iife"], name: "otiskyStroju", fileName: () => "otisky.js" },
    outDir: new URL("./vystup/", import.meta.url).pathname,
    emptyOutDir: true,
    minify: false,
    target: "es2020",
    sourcemap: false,
  },
});
