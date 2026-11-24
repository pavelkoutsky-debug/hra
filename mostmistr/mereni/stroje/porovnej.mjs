// Bitová shoda fyziky mezi stroji JavaScriptu: pustí sestavený `vystup/otisky.js` ve V8 (Node),
// v JavaScriptCore (`jsc`, jádro Safari) a ve SpiderMonkey (`js115` a podobné, jádro Firefoxu)
// a porovná výpisy řádek po řádku. Stroj, který v systému není, přeskočí a řekne to.
// Na Ubuntu: apt-get install libjavascriptcoregtk-bin libmozjs-115-dev. Spouští `npm run stroje`.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const soubor = fileURLToPath(new URL("./vystup/otisky.js", import.meta.url));
const STROJE = [
  { jmeno: "V8 (Node)", prikazy: [[process.execPath, [soubor]]] },
  { jmeno: "JavaScriptCore", prikazy: [["jsc", [soubor]]] },
  { jmeno: "SpiderMonkey", prikazy: ["js140", "js128", "js115", "js102", "js"].map((p) => [p, ["-f", soubor]]) },
];

function pust(stroj) {
  for (const [prikaz, parametry] of stroj.prikazy) {
    const beh = spawnSync(prikaz, parametry, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    if (beh.error && beh.error.code === "ENOENT") continue;
    if (beh.status !== 0) return { chyba: `${prikaz} skončil s kódem ${beh.status}: ${(beh.stderr ?? "").slice(0, 400)}` };
    return { radky: beh.stdout.trimEnd().split("\n"), prikaz };
  }
  return null;
}

let vzor = null;
let chyb = 0;
for (const stroj of STROJE) {
  const vysledek = pust(stroj);
  if (vysledek === null) {
    console.log(`${stroj.jmeno}: v systému není, přeskočeno`);
    continue;
  }
  if (vysledek.chyba) {
    console.log(`${stroj.jmeno}: ${vysledek.chyba}`);
    chyb += 1;
    continue;
  }
  const { radky } = vysledek;
  if (radky.at(-1) !== "hotovo") {
    console.log(`${stroj.jmeno}: výpis neskončil řádkem „hotovo“ (${radky.length} řádků)`);
    chyb += 1;
    continue;
  }
  if (vzor === null) {
    vzor = radky;
    console.log(`${stroj.jmeno}: ${radky.length - 1} otisků (vzor)`);
    continue;
  }
  const ruzne = vzor.map((r, i) => (r === radky[i] ? null : i)).filter((i) => i !== null);
  if (ruzne.length === 0 && radky.length === vzor.length) console.log(`${stroj.jmeno}: shoda ve všech ${radky.length - 1} otiscích`);
  else {
    chyb += 1;
    console.log(`${stroj.jmeno}: NESHODA v ${ruzne.length} řádcích (řádků ${radky.length} proti ${vzor.length})`);
    for (const i of ruzne.slice(0, 5)) console.log(`  vzor: ${vzor[i]}\n  tady: ${radky[i] ?? "(chybí)"}`);
  }
}
process.exit(chyb === 0 ? 0 : 1);
