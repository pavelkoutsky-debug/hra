// Měřicí stránka v bezhlavém prohlížeči: ověří, že měření doběhne, a vypíše výsledky.
// Čísla závisí na stroji, proto se tu neporovnávají s kritériem milníku;
// to se vyhodnocuje v docs/M1A-MERENI.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { VysledekMereni } from "../../mereni/vykon";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const TRVANI_MS = Number(process.env.MM_TRVANI ?? 300);

let server: PreviewServer;
let prohlizec: Browser;

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4189, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

it("měření výkonu doběhne v prohlížeči pro všech šest variant mostů", async () => {
  const adresa = server.resolvedUrls?.local[0];
  if (!adresa) throw new Error("Náhledový server neoznámil adresu.");
  const stranka = await prohlizec.newPage({ viewport: { width: 1400, height: 700 } });
  const chyby: string[] = [];
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));

  await stranka.goto(`${adresa}mereni.html?trvani=${TRVANI_MS}`);
  await stranka.locator("#spustit").click();
  await stranka.locator('#stav[data-stav="hotovo"], #stav[data-stav="chyba"]').waitFor({ timeout: 150_000 });
  expect(await stranka.locator("#stav").innerText()).toBe("Hotovo.");

  const vysledky = (await stranka.evaluate(() =>
    (window as unknown as { vysledkyMereni: () => unknown }).vysledkyMereni(),
  )) as VysledekMereni[];
  expect(vysledky).toHaveLength(6);
  expect(await stranka.locator("#vysledky tbody tr").count()).toBe(6);
  for (const v of vysledky) {
    expect(v.holeJadro.nasobekRealnehoCasu).toBeGreaterThan(0);
    expect(v.sProvozem.nasobekRealnehoCasu).toBeGreaterThan(0);
  }
  expect(chyby).toEqual([]);

  const prostredi = await stranka.locator("#prostredi").innerText();
  writeFileSync(`${SLOZKA}/mereni.json`, JSON.stringify({ prostredi, vysledky }, null, 1));
  await stranka.screenshot({ path: `${SLOZKA}/04-mereni.png`, fullPage: true });

  const f = (cislo: number, mist: number): string => cislo.toFixed(mist);
  console.log(
    [
      prostredi,
      "most | styčníky | st/pr/kol | neznámých | kroků/s | f1 Hz | µs/krok | × reálný | µs/krok s provozem | × reálný | příprava ms (ω/rovnováha/tvary)",
      ...vysledky.map((v) =>
        [
          v.nazev,
          v.svarene ? "svařený" : "kloubový",
          `${v.stycniku}/${v.prutu}/${v.kol}`,
          v.stupnu,
          f(v.krokuNaSekundu, 0),
          f(v.prvniFrekvence, 2),
          f(v.holeJadro.mikrosekundNaKrok, 2),
          f(v.holeJadro.nasobekRealnehoCasu, 1),
          f(v.sProvozem.mikrosekundNaKrok, 2),
          f(v.sProvozem.nasobekRealnehoCasu, 1),
          `${f(v.priprava.nejvyssiFrekvence, 0)}/${f(v.priprava.rovnovaha, 0)}/${f(v.priprava.vlastniTvary, 0)}`,
        ].join(" | "),
      ),
    ].join("\n"),
  );
}, 180_000);
