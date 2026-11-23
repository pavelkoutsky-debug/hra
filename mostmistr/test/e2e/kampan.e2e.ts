// Průchod celou kampaní v bezhlavém prohlížeči: z čisté paměti prohlížeče od první úrovně
// do poslední s referenčními mosty. Kritérium milníku M7: každá úroveň se odemkne průchodem
// té předchozí, referenční most ji projde a po poslední je kampaň dokončená.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { nactiKampan } from "../../urovne/index";
import { RESENI } from "../../urovne/reseni";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const kampan = nactiKampan();

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const udaj = async (jmeno: string): Promise<string> =>
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[  ]/g, " ");
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const zamceno = (id: string): Promise<string | null> => stranka.locator(`[data-uroven="${id}"]`).getAttribute("data-zamceno");

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4204, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
  stranka = await prohlizec.newPage({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("kampaň od první úrovně do poslední", () => {
  it("na začátku je odemčená jen první úroveň a postup je nula", async () => {
    await stranka.goto(adresa);
    await stranka.locator('body[data-rezim="prehled"]').waitFor();
    expect(await stranka.locator(".karta").count()).toBe(kampan.length);
    expect(await zamceno(kampan[0]!.id)).toBe("false");
    for (const uroven of kampan.slice(1)) expect(await zamceno(uroven.id), uroven.id).toBe("true");
    expect(await udaj("prehled-postup")).toMatch(/^Projito 0 z 28 úrovní · medaile 0 z 84 · výzvy 0 z 252$/);
  });

  it(
    "každou úroveň projde referenční most a odemkne tím další",
    async () => {
      for (const [poradi, uroven] of kampan.entries()) {
        const dalsi = kampan[poradi + 1];
        // Do úrovně se jde z přehledu kliknutím na kartu: jen tak se pozná, že je odemčená.
        await stranka.goto(adresa);
        await stranka.locator('body[data-rezim="prehled"]').waitFor();
        expect(await zamceno(uroven.id), `${uroven.id} má být odemčená`).toBe("false");
        if (dalsi) expect(await zamceno(dalsi.id), `${dalsi.id} má být ještě zamčená`).toBe("true");
        await stranka.locator(`[data-uroven="${uroven.id}"] a`).click();
        await stranka.locator(PLATNO).waitFor();
        const zavrit = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
        if ((await zavrit.count()) > 0) await zavrit.click();

        await akce("import").click();
        await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI[uroven.id]!.pruchod));
        await akce("okno-nacist").click();
        await stranka.locator(PLATNO).focus();
        await stranka.keyboard.press("Space");
        await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 180_000 });
        expect(await telo("zkouska"), uroven.id).toBe("hotovo");
        await akce("na-konec").click();
        await stranka.locator(".vysledek").waitFor({ state: "visible" });
        expect(await udaj("vysledek-nadpis"), uroven.id).toBe("MOST OBSTÁL");
        // Výsledek nabízí další úroveň; po poslední odkaz na dokončenou kampaň.
        const odkaz = akce("dalsi");
        expect(await odkaz.isVisible(), uroven.id).toBe(true);
        if (dalsi) {
          expect(await odkaz.getAttribute("href")).toBe(`?uroven=${dalsi.id}`);
          expect(await odkaz.innerText()).toContain("Další úroveň");
        } else {
          expect(await odkaz.getAttribute("data-posledni")).toBe("true");
          expect(await odkaz.innerText()).toBe("Kampaň dokončena · přehled");
          await stranka.screenshot({ path: `${SLOZKA}/k1-posledni-uroven.png` });
          await odkaz.click();
          await stranka.locator('body[data-rezim="prehled"]').waitFor();
        }
      }
    },
    1_500_000,
  );

  it("po poslední úrovni je kampaň dokončená a všechny úrovně mají medaili za průchod", async () => {
    await stranka.locator('body[data-rezim="prehled"]').waitFor();
    for (const uroven of kampan) expect(await zamceno(uroven.id), uroven.id).toBe("false");
    const postup = stranka.locator('[data-udaj="prehled-postup"]');
    expect(await postup.getAttribute("data-projito")).toBe(String(kampan.length));
    expect(await postup.getAttribute("data-dokonceno")).toBe("true");
    expect(await udaj("prehled-postup")).toContain("Kampaň je dokončená.");
    // Každá karta ukazuje aspoň jednu získanou medaili a součet stupňů výzev.
    for (const uroven of kampan) {
      expect(await stranka.locator(`[data-uroven="${uroven.id}"] .karta__medaile`).innerText(), uroven.id).toContain("◆");
      expect(await stranka.locator(`[data-uroven="${uroven.id}"] .karta__vyzvy`).count(), uroven.id).toBe(1);
    }
    await stranka.screenshot({ path: `${SLOZKA}/k2-kampan-dokoncena.png`, fullPage: true });
  });

  it("během celé kampaně prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
