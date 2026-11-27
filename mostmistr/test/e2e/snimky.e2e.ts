// Plynulost přehrávání v bezhlavém prohlížeči (kritérium M8: největší úroveň drží 60 snímků
// za sekundu). Měří se čas, který hra na snímek stráví ve skriptu, a rozestupy snímků; čísla
// se ukládají do `snimky.json`. Kontejner kreslí bez grafické karty, takže rozestupy jsou
// horní odhad toho, co uvidí hráč. Hlídají se mediány: jednotlivý dlouhý snímek dělá i úklid
// paměti prohlížeče.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
/** Jak dlouho se přehrávání měří. */
const DOBA_MS = Number(process.env.MM_TRVANI ?? 4000);

interface Mereni {
  skript: number[];
  rozestup: number[];
}

interface Vysledek {
  uroven: string;
  okno: string;
  prutu: number;
  snimku: number;
  skriptMedian: number;
  skript95: number;
  rozestupMedian: number;
  rozestup95: number;
  pomalych: number;
}

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const vysledky: Vysledek[] = [];

const kvantil = (pole: readonly number[], q: number): number =>
  [...pole].sort((a, b) => a - b)[Math.min(pole.length - 1, Math.floor(pole.length * q))] ?? 0;

/** Otevře úroveň s mistrovským mostem, pustí zkoušku a vrátí stránku s hotovým záznamem. */
async function pripravZkousku(id: string, sirka: number, vyska: number, hustota: number): Promise<Page> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: sirka, height: vyska }, deviceScaleFactor: hustota });
  const s = await kontext.newPage();
  // Měřič obalí každé volání snímku: sečte čas skriptu v jednom snímku a rozestup od minulého.
  await s.addInitScript(() => {
    const puvodni = window.requestAnimationFrame.bind(window);
    const m = { skript: [] as number[], rozestup: [] as number[], posledni: -1, soucet: 0, bezi: false };
    (window as unknown as { mereniSnimku: typeof m }).mereniSnimku = m;
    window.requestAnimationFrame = (obsluha) =>
      puvodni((cas) => {
        if (cas !== m.posledni) {
          if (m.bezi && m.posledni >= 0) {
            m.skript.push(m.soucet);
            m.rozestup.push(cas - m.posledni);
          }
          m.posledni = cas;
          m.soucet = 0;
        }
        const od = performance.now();
        obsluha(cas);
        m.soucet += performance.now() - od;
      });
  });
  await s.goto(`${adresa}?uroven=${id}&zaznam=vypnout`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await zavrit.count()) > 0) await zavrit.click();
  await rozbalPaletu(s);
  await s.locator('[data-akce="import"]').click();
  await s.locator("#okno-obsah").fill(navrhNaText(RESENI[id]!.mistrovska));
  await s.locator('[data-akce="okno-nacist"]').click();
  await s.locator(PLATNO).focus();
  await s.keyboard.press("Space");
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 200_000 });
  expect(await s.locator("body").getAttribute("data-zkouska")).toBe("hotovo");
  return s;
}

async function nastavCas(s: Page, podil: number): Promise<void> {
  await s.locator("#cas").evaluate((tahlo, kolik) => {
    const pole = tahlo as HTMLInputElement;
    pole.value = String(Number(pole.max) * kolik);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  }, podil);
}

const snimek = (s: Page): Promise<void> =>
  s.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));

async function zmer(id: string, sirka: number, vyska: number, hustota: number): Promise<Vysledek> {
  const s = await pripravZkousku(id, sirka, vyska, hustota);
  await nastavCas(s, 0.3);
  const prehrat = s.locator('[data-akce="prehrat"]');
  if ((await prehrat.getAttribute("data-bezi")) !== "true") await prehrat.click();
  await s.evaluate(() => {
    (window as unknown as { mereniSnimku: { bezi: boolean } }).mereniSnimku.bezi = true;
  });
  await s.waitForTimeout(DOBA_MS);
  const m = (await s.evaluate(() => {
    const mereni = (window as unknown as { mereniSnimku: { skript: number[]; rozestup: number[]; bezi: boolean } }).mereniSnimku;
    mereni.bezi = false;
    return { skript: mereni.skript, rozestup: mereni.rozestup };
  })) as Mereni;
  await s.context().close();
  const vysledek: Vysledek = {
    uroven: id,
    okno: `${sirka}×${vyska}@${hustota}`,
    prutu: RESENI[id]!.mistrovska.pruty.length,
    snimku: m.skript.length,
    skriptMedian: kvantil(m.skript, 0.5),
    skript95: kvantil(m.skript, 0.95),
    rozestupMedian: kvantil(m.rozestup, 0.5),
    rozestup95: kvantil(m.rozestup, 0.95),
    pomalych: m.rozestup.filter((r) => r > 20).length,
  };
  vysledky.push(vysledek);
  return vysledek;
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4207, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  writeFileSync(`${SLOZKA}/snimky.json`, JSON.stringify(vysledky, null, 1));
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("plynulost přehrávání", () => {
  // Největší most kampaně (5-01), největší dav (5-04) a dva vlaky na dvou patrech (6-04).
  for (const id of ["5-01", "5-04", "6-04"]) {
    it(`úroveň ${id} drží v okně 1280 × 720 šedesát snímků za sekundu`, async () => {
      const v = await zmer(id, 1280, 720, 1);
      expect(v.snimku).toBeGreaterThan(DOBA_MS / 40);
      // Skript smí sníst nejvýš čtvrtinu snímku (16,7 ms), zbytek patří prohlížeči.
      expect(v.skriptMedian).toBeLessThan(4.2);
      expect(v.rozestupMedian).toBeLessThan(20);
    }, 300_000);
  }

  it("na hustém displeji (1920 × 1080, dva pixely na bod) přehrávání neklesne pod 30 snímků", async () => {
    // Plátno má přes osm milionů pixelů a kontejner je kreslí procesorem; s grafickou kartou je to 60.
    const v = await zmer("5-04", 1920, 1080, 2);
    expect(v.skriptMedian).toBeLessThan(4.2);
    expect(v.rozestupMedian).toBeLessThan(34);
  }, 300_000);

  it("uložená spodní vrstva výkresu vypadá na pixel stejně jako kreslená přímo", async () => {
    const s = await pripravZkousku("4-04", 1280, 720, 1);
    const prehrat = s.locator('[data-akce="prehrat"]');
    if ((await prehrat.getAttribute("data-bezi")) === "true") await prehrat.click();
    await nastavCas(s, 0.4);
    await snimek(s);
    await nastavCas(s, 0.5);
    await snimek(s);
    // Pohled se dva snímky nezměnil: tohle je obraz z uložené vrstvy.
    await s.locator(PLATNO).focus();
    const ulozena = await s.locator(PLATNO).screenshot();
    // Změna pohledu a zpět (klávesami, ať plátno neztratí zaměření): první snímek po změně
    // se kreslí přímo.
    await s.keyboard.press("+");
    await snimek(s);
    await s.keyboard.press("Home");
    await snimek(s);
    const prima = await s.locator(PLATNO).screenshot();
    expect(ulozena.equals(prima)).toBe(true);
    await s.locator(PLATNO).screenshot({ path: `${SLOZKA}/snimky-vrstva.png` });
    await s.context().close();
  }, 300_000);
});
