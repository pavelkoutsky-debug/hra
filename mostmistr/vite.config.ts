import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** Krátký otisk commitu: na Netlify z proměnné COMMIT_REF, lokálně z gitu. */
function otiskSestaveni(): string {
  const zNetlify = process.env.COMMIT_REF;
  if (zNetlify) return zNetlify.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "lokalni";
  }
}

const balik = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __VERZE_HRY__: JSON.stringify(balik.version),
    __OTISK_SESTAVENI__: JSON.stringify(otiskSestaveni()),
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      // Vedle hry se sestavuje zkušebna, měřicí stránka, kontrola shody výpočtu a stránka se zvuky.
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        zkusebna: fileURLToPath(new URL("./zkusebna.html", import.meta.url)),
        mereni: fileURLToPath(new URL("./mereni.html", import.meta.url)),
        otisky: fileURLToPath(new URL("./otisky.html", import.meta.url)),
        zvuky: fileURLToPath(new URL("./zvuky.html", import.meta.url)),
      },
    },
  },
  worker: {
    format: "es",
  },
});
