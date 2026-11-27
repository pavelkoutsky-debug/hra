// Rada po druhém stejném nezdaru v bezhlavém prohlížeči: most, který na 1-03 dvakrát po sobě
// spadne na vzpěr lehkého dřeva, dostane u výsledku radu s tlačítkem do nápovědy; potřetí rada zůstává,
// po jiné příčině ne, na zkouškové úrovni ne. Anglicky a na telefonu se rada vejde.
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import type { DavkaDeniku, UdalostDeniku } from "../../src/denik/udalosti";
import { RESENI } from "../../urovne/reseni";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];
/** Události deníku, které hra poslala na server (i ty odeslané při opouštění stránky). */
const denik: UdalostDeniku[] = [];

const udaj = (s: Page, jmeno: string) => s.locator(`[data-udaj="${jmeno}"]`);
const akce = (s: Page, jmeno: string) => s.locator(`[data-akce="${jmeno}"]`);
const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);
const pad = (uroven: string, poradi: number): string => navrhNaText(RESENI[uroven]!.pady[poradi]!.navrh);

async function otevri(s: Page, dotaz: string): Promise<void> {
  await s.goto(`${adresa}?${dotaz}`);
  await s.locator(PLATNO).waitFor();
  const tlacitko = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(s: Page, text: string): Promise<void> {
  await rozbalPaletu(s);
  await akce(s, "import").click();
  await s.locator("#okno-obsah").fill(text);
  await akce(s, "okno-nacist").click();
}

/** Pustí zkoušku, počká na výpočet, skočí na konec a vrátí, jestli se u výsledku ukázala rada. */
async function zkus(s: Page): Promise<boolean> {
  await akce(s, "zkouska").click();
  expect(await telo(s, "rezim")).toBe("zkouska");
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo(s, "zkouska")).toBe("hotovo");
  await akce(s, "na-konec").click();
  await s.locator(".vysledek").waitFor({ state: "visible" });
  expect(await udaj(s, "vysledek-nadpis").innerText()).toBe((await telo(s, "jazyk")) === "en" ? "THE BRIDGE FAILED" : "MOST NEOBSTÁL");
  return udaj(s, "vysledek-rada").isVisible();
}

/** Počká, až deník na serveru dostane událost daného druhu. */
async function udalostDeniku(druh: string): Promise<UdalostDeniku> {
  await expect.poll(() => denik.some((u) => u.druh === druh), { timeout: 20_000 }).toBe(true);
  return denik.find((u) => u.druh === druh)!;
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4219, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  // Deník si test nechá posílat a čte ho: dávky z prohlížeče i ty odeslané při odchodu ze stránky.
  const prijmi = (zadost: IncomingMessage, odpoved: ServerResponse): void => {
    let data = "";
    zadost.on("data", (kus: Buffer) => (data += kus.toString("utf8")));
    zadost.on("end", () => {
      try {
        denik.push(...(JSON.parse(data) as DavkaDeniku).udalosti);
      } catch {
        // Nečitelná dávka testu nevadí; hra posílá jen JSON.
      }
      odpoved.statusCode = 204;
      odpoved.end();
    });
  };
  server.middlewares.stack.unshift({ route: "/api/denik", handle: prijmi });
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

describe("rada po druhém stejném nezdaru", () => {
  it("1-03: podruhé vzpěr lehkého dřeva ukáže radu s tlačítkem nápovědy u výsledku i u prutu a potřetí zůstává", async () => {
    await otevri(stranka, "uroven=1-03");
    await nactiMost(stranka, pad("1-03", 1));
    expect(await zkus(stranka)).toBe(false);
    await akce(stranka, "upravit").click();
    expect(await telo(stranka, "rada-u-prutu")).toBeNull();

    expect(await zkus(stranka)).toBe(true);
    const rada = udaj(stranka, "vysledek-rada");
    expect(await rada.getAttribute("data-druh")).toBe("vzper");
    const text = await udaj(stranka, "vysledek-rada-text").innerText();
    // Co se stalo a co s tím: stávající rada k vzpěru (úroveň má i těžké dřevo, smí tedy radit silnější prvek).
    expect(text).toMatch(/^Podruhé za sebou stejně: lehký trám, vzpěr\. Byl stlačený a vybočil do strany.+silnější prvek/);
    expect(await akce(stranka, "rada-napoveda").isVisible()).toBe(true);
    expect(await akce(stranka, "rada-napoveda").innerText()).toBe("Otevřít nápovědu");
    // Rada je v pruhu, ne v okně: podrobnosti zůstávají sbalené a prut, o kterém je řeč, je pod pruhem vidět.
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ano");
    expect(await stranka.locator("dialog[open]").count()).toBe(0);
    const misto = await telo(stranka, "oznaceny-misto");
    expect(misto).not.toBeNull();
    const [, y] = misto!.split(";").map(Number) as [number, number];
    const [, ky, meritko] = ((await stranka.locator(PLATNO).getAttribute("data-kamera")) ?? "").split(";").map(Number) as [number, number, number];
    const platno = (await stranka.locator(PLATNO).boundingBox())!;
    const prutNaStrance = platno.y + platno.height / 2 - (y - ky) * meritko;
    const spodekPruhu = (await stranka.locator(".vysledek__pruh").boundingBox())!;
    expect(prutNaStrance).toBeGreaterThan(spodekPruhu.y + spodekPruhu.height);
    await stranka.screenshot({ path: `${SLOZKA}/rada-1-03.png` });

    // Po návratu ke stavbě rada zůstává u značky prvního porušení, dokud se most nezmění.
    await akce(stranka, "upravit").click();
    expect(await telo(stranka, "rada-u-prutu")).toBe("vzper");
    expect(await telo(stranka, "prvni-porucha")).toMatch(/vzpěr/);
    await stranka.screenshot({ path: `${SLOZKA}/rada-1-03-stavba.png` });

    // Potřetí stejně: rada zůstává (kdo ji napoprvé nepochopil, nemá dostat míň než podruhé),
    // jen nadpis už neříká „podruhé“.
    expect(await zkus(stranka)).toBe(true);
    expect(await udaj(stranka, "vysledek-rada-text").innerText()).toMatch(/^Zase stejně: lehký trám, vzpěr\. Byl stlačený a vybočil do strany/);
    await akce(stranka, "upravit").click();
    expect(await telo(stranka, "rada-u-prutu")).toBe("vzper");
    // Hlášení „Nedaří se?“ po třetím nezdaru nepřijde: nápovědu už nabídla rada.
    expect(await udaj(stranka, "hlaseni").innerText()).not.toContain("Nedaří se?");
  }, 300_000);

  it("tlačítko u rady vrátí ke stavbě a otevře nápovědu; deník zapíše radu i nápovědu z ní", async () => {
    // Nová návštěva úrovně: rada smí zaznít znovu.
    await otevri(stranka, "uroven=1-03");
    expect(await zkus(stranka)).toBe(false);
    await akce(stranka, "upravit").click();
    expect(await zkus(stranka)).toBe(true);
    await akce(stranka, "rada-napoveda").click();
    expect(await telo(stranka, "rezim")).toBe("stavba");
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await telo(stranka, "napoveda")).toBe("princip");
    await stranka.screenshot({ path: `${SLOZKA}/rada-napoveda.png` });
    // Odchod ze stránky dávku s posledními událostmi odešle.
    await stranka.goto("about:blank");
    const ukazana = await udalostDeniku("rada.ukazana");
    expect(ukazana).toMatchObject({ uroven: "1-03", data: { druh: "vzper", prvek: "drevo-lehke", napoveda: true } });
    expect(await udalostDeniku("rada.napoveda")).toMatchObject({ uroven: "1-03", data: { druh: "vzper" } });
  }, 300_000);

  it("jiná příčina než minule radu neukáže; kdo si rozbalil podrobnosti, tomu se nevnucuje", async () => {
    await otevri(stranka, "uroven=1-03");
    expect(await zkus(stranka)).toBe(false);
    await akce(stranka, "upravit").click();
    // Jen mostovka: povolí jinak než příhrada z lehkého dřeva.
    await nactiMost(stranka, pad("1-03", 0));
    expect(await zkus(stranka)).toBe(false);
    expect(await telo(stranka, "pricina")).not.toMatch(/vzpěr/);
    // Podrobnosti s celou větou o radě si hráč přečetl sám: podruhé stejně už pruh radu nepřidá.
    await akce(stranka, "vysledek-sbalit").click();
    await akce(stranka, "upravit").click();
    expect(await zkus(stranka)).toBe(false);
  }, 300_000);

  it("zkoušková úroveň 1-05 neradí ani podruhé stejně", async () => {
    await otevri(stranka, "uroven=1-05");
    expect(await akce(stranka, "napoveda").isVisible()).toBe(false);
    await nactiMost(stranka, pad("1-05", 0));
    expect(await zkus(stranka)).toBe(false);
    await akce(stranka, "upravit").click();
    expect(await zkus(stranka)).toBe(false);
    expect(await udaj(stranka, "vysledek-rada").getAttribute("data-druh")).toBeNull();
    expect(chyby).toEqual([]);
  }, 300_000);

  it("anglicky na telefonu 390 × 844 se rada s tlačítkem vejde a most pod pruhem zůstane", async () => {
    const telefon = await prohlizec.newContext({ locale: "en-GB", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const s = await telefon.newPage();
    const chybyTelefonu: string[] = [];
    s.on("pageerror", (chyba) => chybyTelefonu.push(chyba.message));
    await otevri(s, "uroven=1-03&jazyk=en");
    expect(await telo(s, "jazyk")).toBe("en");
    await nactiMost(s, pad("1-03", 1));
    expect(await zkus(s)).toBe(false);
    await akce(s, "upravit").click();
    expect(await zkus(s)).toBe(true);
    await s.screenshot({ path: `${SLOZKA}/rada-telefon-en.png` });
    const text = await udaj(s, "vysledek-rada-text").innerText();
    expect(text).toMatch(/^Same failure twice in a row: light timber, buckling\. It was compressed and buckled sideways/);
    expect(text).not.toMatch(/[ěščřžýáíéůú]/);
    const tlacitko = (await akce(s, "rada-napoveda").boundingBox())!;
    expect(await akce(s, "rada-napoveda").innerText()).toBe("Open the hint");
    // Nic nepřetéká: stránka není širší než okno, tlačítko je celé vidět a pruh nechá výkresu většinu výšky.
    expect(await s.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(tlacitko.x).toBeGreaterThanOrEqual(0);
    expect(tlacitko.x + tlacitko.width).toBeLessThanOrEqual(390);
    expect(tlacitko.height).toBeGreaterThanOrEqual(44);
    const platno = (await s.locator(PLATNO).boundingBox())!;
    const pruh = (await s.locator(".vysledek").boundingBox())!;
    expect(tlacitko.y + tlacitko.height).toBeLessThanOrEqual(pruh.y + pruh.height);
    expect(pruh.y + pruh.height - platno.y).toBeLessThan(platno.height * 0.6);
    // Prut, o kterém rada mluví, leží mezi pruhem a legendou dole na výkresu.
    const [, y] = (await telo(s, "oznaceny-misto"))!.split(";").map(Number) as [number, number];
    const [, ky, meritko] = ((await s.locator(PLATNO).getAttribute("data-kamera")) ?? "").split(";").map(Number) as [number, number, number];
    const prutNaStrance = platno.y + platno.height / 2 - (y - ky) * meritko;
    const legenda = (await s.locator("#obrazovka-uroven .legenda").boundingBox())!;
    expect(prutNaStrance).toBeGreaterThan(pruh.y + pruh.height);
    expect(prutNaStrance).toBeLessThan(legenda.y);
    expect(chybyTelefonu).toEqual([]);
    await telefon.close();
  }, 300_000);
});
