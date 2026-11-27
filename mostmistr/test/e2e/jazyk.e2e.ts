// Druhý jazyk v bezhlavém prohlížeči: angličtina podle jazyka prohlížeče, přepínač, uložená
// volba a kontrola, že na obrazovkách anglické hry nezůstala česká věta.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { EN, NAZVY_UROVNI_EN } from "../../src/ui/slovnik-en";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];

async function novyHrac(locale: string): Promise<{ kontext: BrowserContext; stranka: Page }> {
  const kontext = await prohlizec.newContext({ locale, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const stranka = await kontext.newPage();
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  return { kontext, stranka };
}

/**
 * Viditelné texty stránky, ve kterých zůstalo české písmeno. Měna (Kč) a přepínač jazyka
 * (Česky) česky být mají; všechno ostatní je zapomenutý překlad.
 */
async function ceskeTexty(stranka: Page): Promise<string[]> {
  return stranka.evaluate(() => {
    const nalezene: string[] = [];
    const ceske = /[ěščřžýůďťňĚŠČŘŽÝŮĎŤŇ]/;
    const pruchod = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let uzel = pruchod.nextNode(); uzel; uzel = pruchod.nextNode()) {
      const rodic = uzel.parentElement;
      if (!rodic || rodic.closest('[data-akce="jazyk"], script, style')) continue;
      if (!rodic.checkVisibility()) continue;
      const text = (uzel.textContent ?? "").replace(/Kč/g, "").trim();
      if (ceske.test(text)) nalezene.push(text);
    }
    for (const prvek of document.querySelectorAll<HTMLElement>("[title], [aria-label], [placeholder]")) {
      if (prvek.closest('[data-akce="jazyk"]') || !prvek.checkVisibility()) continue;
      for (const atribut of ["title", "aria-label", "placeholder"]) {
        const text = (prvek.getAttribute(atribut) ?? "").replace(/Kč/g, "");
        if (ceske.test(text)) nalezene.push(`${atribut}: ${text}`);
      }
    }
    return nalezene;
  });
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4205, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("jazyk hry", () => {
  it("český prohlížeč dostane češtinu a přepínač nabízí angličtinu", async () => {
    const { kontext, stranka } = await novyHrac("cs-CZ");
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator("body").getAttribute("data-jazyk")).toBe("cs");
    expect(await stranka.locator("html").getAttribute("lang")).toBe("cs");
    expect(await stranka.locator(".karta__nazev").first().innerText()).toBe("Lávka přes potok");
    const prepinac = stranka.locator('#obrazovka-prehled [data-akce="jazyk"]');
    expect(await prepinac.innerText()).toBe("English");

    // Přepnutí stránku načte znovu anglicky a volba vydrží i další návštěvu.
    await prepinac.click();
    await stranka.locator('body[data-jazyk="en"]').waitFor();
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator(".karta__nazev").first().innerText()).toBe(NAZVY_UROVNI_EN["1-01"]);
    await stranka.goto(`${adresa}?uroven=1-01`);
    await stranka.locator(PLATNO).waitFor();
    expect(await stranka.locator("body").getAttribute("data-jazyk")).toBe("en");
    expect(await stranka.title()).toContain(NAZVY_UROVNI_EN["1-01"]!);

    // A zpátky: adresa jazyk vnutí a uloží.
    await stranka.goto(`${adresa}?jazyk=cs`);
    await stranka.locator('body[data-jazyk="cs"]').waitFor();
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator("body").getAttribute("data-jazyk")).toBe("cs");
    await kontext.close();
  });

  it("slovenský prohlížeč dostane češtinu, německý angličtinu", async () => {
    for (const [locale, jazyk] of [
      ["sk-SK", "cs"],
      ["de-DE", "en"],
    ] as const) {
      const { kontext, stranka } = await novyHrac(locale);
      await stranka.goto(adresa);
      await stranka.locator(".karta").first().waitFor();
      expect(await stranka.locator("body").getAttribute("data-jazyk"), locale).toBe(jazyk);
      await kontext.close();
    }
  });

  it("anglická hra nemá na přehledu, v zadání, při stavbě ani ve výsledku českou větu", async () => {
    const { kontext, stranka } = await novyHrac("en-US");
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator("body").getAttribute("data-jazyk")).toBe("en");
    expect(await stranka.locator("html").getAttribute("lang")).toBe("en");
    expect(await stranka.locator('#obrazovka-prehled [data-akce="jazyk"]').innerText()).toBe("Česky");
    expect(await stranka.locator("#obrazovka-prehled h1, #obrazovka-prehled h2").first().innerText()).not.toMatch(/Kampaň/);
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-prehled-en.png` });

    // Zadání úrovně: anglicky, čísla s desetinnou tečkou a čárkou mezi tisíci.
    await stranka.goto(`${adresa}?uroven=1-01`);
    await stranka.locator(PLATNO).waitFor();
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await ceskeTexty(stranka)).toEqual([]);
    // Vysvětlení, seznam prvků a výzvy jsou v zadání sbalené: rozbalené se kontrolují taky.
    const souhrny = stranka.locator("#okno-zadani details > summary");
    const sbalenych = await souhrny.count();
    expect(sbalenych).toBe(3);
    for (let i = 0; i < sbalenych; i++) {
      const souhrn = souhrny.nth(i);
      expect(await souhrn.evaluate((prvek) => (prvek.parentElement as HTMLDetailsElement).open)).toBe(false);
      await souhrn.click();
    }
    expect(await ceskeTexty(stranka)).toEqual([]);
    const vyzvy = (await stranka.locator('[data-udaj="zadani-vyzvy"] li').allInnerTexts()).map((v) => v.replace(/[\u00a0\u202f]/g, " "));
    expect(vyzvy[0]).toContain("31,100 Kč");
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-zadani-en.png` });
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();

    // Stavba s mostem a otevřenou analýzou.
    await rozbalPaletu(stranka);
    await stranka.locator('[data-akce="import"]').click();
    await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
    await stranka.locator('[data-akce="okno-nacist"]').click();
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-stavba-en.png` });
    // Nápověda: soupis mostu a věta o ceně.
    await stranka.locator('[data-akce="napoveda"]').click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.keyboard.press("Escape");

    // Zkouška a výsledek.
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await stranka.locator('[data-akce="na-konec"]').click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    const nadpis = await stranka.locator('[data-udaj="vysledek-nadpis"]').innerText();
    expect(nadpis.toLowerCase()).toBe(EN["vysledek.obstal"]!.toLowerCase());
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-vysledek-en.png` });

    // Most, který spadne: věty o porušení jsou taky anglicky.
    await stranka.locator('[data-akce="upravit"]').click();
    await rozbalPaletu(stranka);
    await stranka.locator('[data-akce="import"]').click();
    await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pady[0]!.navrh));
    await stranka.locator('[data-akce="okno-nacist"]').click();
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await stranka.locator('[data-akce="na-konec"]').click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect((await stranka.locator('[data-udaj="vysledek-nadpis"]').innerText()).toLowerCase()).toBe(EN["vysledek.neobstal"]!.toLowerCase());
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-pad-en.png` });
    await kontext.close();
  }, 240_000);

  it("úroveň s analýzou, zkouška do zlomu a pohyblivý most jsou anglicky", async () => {
    const { kontext, stranka } = await novyHrac("en-US");
    // Lávka s rezonanční křivkou: analytický panel je otevřený hned.
    await stranka.goto(`${adresa}?uroven=5-01`);
    await stranka.locator(PLATNO).waitFor();
    await stranka.locator('#okno-zadani[open] button[value="zavrit"]').click();
    await rozbalPaletu(stranka);
    await stranka.locator('[data-akce="import"]').click();
    await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI["5-01"]!.pruchod));
    await stranka.locator('[data-akce="okno-nacist"]').click();
    await stranka.locator('body[data-analyza="otevrena"]').waitFor();
    await stranka.locator('canvas[data-udaj="krivka"][data-vrcholu]').waitFor({ timeout: 60_000 });
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-analyza-en.png` });

    // Pohyblivý most: zadání s loděmi a zvedáním, popisky kotev, zkouška do zlomu.
    await stranka.goto(`${adresa}?uroven=7-01`);
    await stranka.locator(PLATNO).waitFor();
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    await rozbalPaletu(stranka);
    await stranka.locator('[data-akce="import"]').click();
    await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI["7-01"]!.pruchod));
    await stranka.locator('[data-akce="okno-nacist"]').click();
    await rozbalPaletu(stranka);
    await stranka.locator('[data-akce="zlom"]').click();
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await stranka.locator('[data-akce="na-konec"]').click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-zlom-en.png` });
    await kontext.close();
  }, 300_000);

  it("anglická zkušebna a sandbox jsou taky anglicky", async () => {
    const { kontext, stranka } = await novyHrac("en-GB");
    await stranka.goto(`${adresa}zkusebna.html`);
    await stranka.locator("canvas.vykres__platno").waitFor();
    expect(await stranka.locator("body").getAttribute("data-jazyk")).toBe("en");
    expect(await ceskeTexty(stranka)).toEqual([]);

    await stranka.goto(`${adresa}?sandbox=1`);
    await stranka.locator(PLATNO).waitFor();
    expect(await stranka.title()).toContain(NAZVY_UROVNI_EN["0-01"]!);
    const zavrit = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await zavrit.count()) > 0) await zavrit.click();
    await stranka.locator('[data-akce="sandbox"]').click();
    await stranka.locator("#okno-sandbox").waitFor({ state: "visible" });
    expect(await ceskeTexty(stranka)).toEqual([]);
    await stranka.screenshot({ path: `${SLOZKA}/jazyk-sandbox-en.png` });
    await kontext.close();
  });

  it("bez paměti prohlížeče drží zvolený jazyk adresa a odkazy ho nesou dál", async () => {
    const { kontext, stranka } = await novyHrac("cs-CZ");
    // Prohlížeč, který stránce paměť nedovolí (přísné soukromí): každý přístup vyhodí chybu.
    await kontext.addInitScript(() => {
      for (const jmeno of ["localStorage", "sessionStorage"] as const) {
        Object.defineProperty(window, jmeno, {
          get() {
            throw new DOMException("zakázáno", "SecurityError");
          },
        });
      }
    });
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator("html").getAttribute("lang")).toBe("cs");
    await stranka.locator('#obrazovka-prehled [data-akce="jazyk"]').click();
    await stranka.waitForURL(/jazyk=en/);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator("html").getAttribute("lang")).toBe("en");
    // Odkaz na úroveň jazyk ponese; bez toho by se hra na další stránce vrátila k češtině.
    await stranka.locator('.karta[data-uroven="1-01"] a.karta__obal').click();
    await stranka.waitForURL(/uroven=1-01/);
    expect(new URL(stranka.url()).searchParams.get("jazyk")).toBe("en");
    await stranka.locator(PLATNO).waitFor();
    expect(await stranka.locator("html").getAttribute("lang")).toBe("en");
    expect(await stranka.locator('#okno-zadani[open] button[value="zavrit"]').innerText()).toBe(EN["zadani.zacit"]);
    await kontext.close();
  });

  it("prohlížeč při přepínání jazyka nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
