import { execSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { HLAVICKY_WEBU } from "./hlavicky";

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

/**
 * Adresa webu pro náhled odkazu (`og:image` a `og:url` musí být absolutní). Netlify ji při sestavení
 * dává v proměnné `URL` (hlavní adresa webu, i u náhledů nasazení); lokálně zůstane cesta relativní.
 */
function adresaWebu(): string {
  return (process.env.URL ?? "").replace(/\/+$/, "");
}

/** Doplní adresu webu do `%ADRESA_WEBU%` ve stránkách. */
function doplnAdresuWebu(): Plugin {
  return {
    name: "mostmistr-adresa-webu",
    transformIndexHtml: (html) => html.replaceAll("%ADRESA_WEBU%", adresaWebu()),
  };
}

/**
 * Mapy zdrojů se sestavují skryté (žádný odkaz `sourceMappingURL`) a po sestavení se z `dist`
 * smažou, aby zdrojáky klienta nešly na web.
 */
function smazMapyZdroju(): Plugin {
  let slozka = "dist";
  return {
    name: "mostmistr-smaz-mapy",
    apply: "build",
    configResolved(nastaveni) {
      slozka = nastaveni.build.outDir;
      if (!isAbsolute(slozka)) slozka = join(nastaveni.root, slozka);
    },
    closeBundle() {
      for (const soubor of readdirSync(slozka, { recursive: true, encoding: "utf-8" })) {
        if (soubor.endsWith(".map")) rmSync(join(slozka, soubor));
      }
    },
  };
}

const balik = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __VERZE_HRY__: JSON.stringify(balik.version),
    __OTISK_SESTAVENI__: JSON.stringify(otiskSestaveni()),
  },
  plugins: [doplnAdresuWebu(), smazMapyZdroju()],
  // Náhledový server (i v testech v prohlížeči) posílá stejné bezpečnostní hlavičky jako Netlify.
  preview: {
    headers: { ...HLAVICKY_WEBU },
  },
  build: {
    target: "es2022",
    sourcemap: "hidden",
    rollupOptions: {
      // Vedle hry se sestavuje zkušebna, měřicí stránka, kontrola shody výpočtu, stránka se zvuky
      // a stránka správce (zpětná vazba a deník hraní).
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        zkusebna: fileURLToPath(new URL("./zkusebna.html", import.meta.url)),
        mereni: fileURLToPath(new URL("./mereni.html", import.meta.url)),
        otisky: fileURLToPath(new URL("./otisky.html", import.meta.url)),
        zvuky: fileURLToPath(new URL("./zvuky.html", import.meta.url)),
        sprava: fileURLToPath(new URL("./sprava.html", import.meta.url)),
      },
    },
  },
  worker: {
    format: "es",
  },
});
