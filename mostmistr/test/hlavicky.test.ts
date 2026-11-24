import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HLAVICKY_WEBU, POLITIKA_OBSAHU } from "../hlavicky";
import nastaveniVite from "../vite.config";

/** Pravidlo hlaviček z `netlify.toml`: cesta a hlavičky, jak jsou v souboru. */
interface Pravidlo {
  cesta: string;
  hlavicky: Record<string, string>;
}

/**
 * Přečte bloky `[[headers]]` z `netlify.toml`. Stačí na tvar, jaký v souboru je (řádky
 * `klic = "hodnota"`); parser TOML kvůli tomu projekt nepotřebuje.
 */
function pravidlaNetlify(): Pravidlo[] {
  const text = readFileSync(new URL("../netlify.toml", import.meta.url), "utf-8");
  const pravidla: Pravidlo[] = [];
  let aktualni: Pravidlo | null = null;
  let vHodnotach = false;
  for (const surovy of text.split("\n")) {
    const radek = surovy.trim();
    if (radek === "" || radek.startsWith("#")) continue;
    if (radek.startsWith("[")) {
      if (radek === "[[headers]]") {
        aktualni = { cesta: "", hlavicky: {} };
        pravidla.push(aktualni);
        vHodnotach = false;
      } else if (radek === "[headers.values]" && aktualni) {
        vHodnotach = true;
      } else {
        aktualni = null;
      }
      continue;
    }
    if (!aktualni) continue;
    const shoda = /^([A-Za-z-]+)\s*=\s*"(.*)"$/.exec(radek);
    if (!shoda) throw new Error(`Řádek netlify.toml, kterému test nerozumí: ${radek}`);
    const [, klic, hodnota] = shoda as unknown as [string, string, string];
    if (vHodnotach) aktualni.hlavicky[klic] = hodnota;
    else if (klic === "for") aktualni.cesta = hodnota;
  }
  return pravidla;
}

describe("hlavičky webu", () => {
  const pravidla = pravidlaNetlify();

  it("netlify.toml posílá všem cestám tytéž bezpečnostní hlavičky jako náhledový server", () => {
    const vse = pravidla.filter((p) => p.cesta === "/*");
    expect(vse).toHaveLength(1);
    expect(vse[0]?.hlavicky).toEqual(HLAVICKY_WEBU);
    expect(nastaveniVite.preview?.headers).toEqual(HLAVICKY_WEBU);
  });

  it("politika obsahu nepovoluje vložené skripty, eval ani vložení do cizí stránky", () => {
    const smernice = new Map(POLITIKA_OBSAHU.split("; ").map((s) => [s.split(" ")[0], s.split(" ").slice(1)]));
    expect(smernice.get("script-src")).toEqual(["'self'"]);
    expect(smernice.get("frame-ancestors")).toEqual(["'none'"]);
    expect(smernice.get("object-src")).toEqual(["'none'"]);
    expect(POLITIKA_OBSAHU).not.toContain("unsafe-eval");
  });

  it("soubory s otiskem jsou immutable a každá stránka se ověřuje u serveru", () => {
    const mezipamet = (cesta: string): string | undefined => pravidla.find((p) => p.cesta === cesta)?.hlavicky["Cache-Control"];
    expect(mezipamet("/assets/*")).toContain("immutable");
    // Hlavičky shodných pravidel se na Netlify slučují: mezipaměť nesmí být v pravidle pro všechny cesty.
    expect(mezipamet("/*")).toBeUndefined();
    const koren = readdirSync(new URL("..", import.meta.url)).filter((s) => s.endsWith(".html"));
    const verejne = readdirSync(new URL("../public", import.meta.url)).filter((s) => s.endsWith(".html"));
    expect(koren).toContain("index.html");
    expect(verejne).toContain("404.html");
    expect(mezipamet("/")).toBe("no-cache");
    for (const stranka of [...koren, ...verejne]) {
      expect(mezipamet(`/${stranka}`), stranka).toMatch(/^no-(cache|store)$/);
    }
  });
});
