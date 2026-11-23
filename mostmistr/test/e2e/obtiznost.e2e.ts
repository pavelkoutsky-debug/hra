// Milník M12 v bezhlavém prohlížeči: klidné úseky zkoušky se přehrávají rychleji, vedený
// první krok, krátké zadání se slovníčkem, medaile po schodech a zlato výzev nad mostem autora.
// (Most s porušeným prutem, který projde jen s medailí za průchod, hlídá `test/vyhratelnost.test.ts`.)
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { sampionUrovne } from "../../urovne/vyzvy";
import { prijimejDenik } from "./server-deniku";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const udaj = (jmeno: string): Promise<string> => stranka.locator(`[data-udaj="${jmeno}"]`).innerText();
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const bezMezer = (text: string): string => text.replace(/[  ]/g, " ");
const cas = async (): Promise<number> => Number(await stranka.locator("#cas").inputValue());

async function otevri(id: string): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}&vyvoj=1`);
  await stranka.locator(PLATNO).waitFor();
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(navrh: NavrhMostu): Promise<void> {
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(navrhNaText(navrh));
  await akce("okno-nacist").click();
}

async function pust(): Promise<void> {
  await stranka.locator(PLATNO).focus();
  await stranka.keyboard.press("Space");
  expect(await telo("rezim")).toBe("zkouska");
}

async function dopocitej(): Promise<void> {
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo("zkouska")).toBe("hotovo");
}

async function naKonec(): Promise<string> {
  await akce("na-konec").click();
  await stranka.locator(".vysledek").waitFor({ state: "visible" });
  return udaj("vysledek-nadpis");
}

async function rozbalVysledek(): Promise<void> {
  if ((await stranka.locator(".vysledek").getAttribute("data-sbaleno")) === "true") await akce("vysledek-sbalit").click();
}

/**
 * Stav tří medailí ve výsledku v pořadí průchod, rozpočtová, mistrovská: „true“ získal tenhle
 * most, „drive“ ji hráč má z dřívějšího pokusu, „false“ chybí.
 */
async function medaile(): Promise<string> {
  return stranka.locator('[data-udaj="vysledek-medaile"]').evaluate((seznam) =>
    [...seznam.querySelectorAll<HTMLElement>("li")].map((m) => m.dataset.ziskana).join(","),
  );
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4212, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("klidné úseky zkoušky", () => {
  it("přehrávají se rychleji; popisek v legendě je vypínač a volba se pamatuje", async () => {
    await otevri("2-04");
    await nactiMost(RESENI["2-04"]!.pruchod);
    const tlacitko = akce("hlucho");
    // Při stavbě tlačítko není.
    expect(await tlacitko.isVisible()).toBe(false);
    await pust();
    await dopocitej();
    await expect.poll(() => tlacitko.isVisible(), { timeout: 10_000 }).toBe(true);
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("true");
    expect(bezMezer(await tlacitko.innerText())).toBe("klid 3×");
    // Klidný úsek se pozná na těle stránky: přehrávání v něm běží třikrát rychleji.
    await expect.poll(() => telo("cekani"), { timeout: 60_000, interval: 50 }).toBe("3");
    const zacatek = await cas();
    const kdy = Date.now();
    await stranka.waitForTimeout(1000);
    if ((await telo("cekani")) === "3") {
      // Za sekundu skutečného času uběhly aspoň dvě sekundy děje (rychlost 1× by dala jednu).
      const ubehlo = ((await cas()) - zacatek) / ((Date.now() - kdy) / 1000);
      expect(ubehlo).toBeGreaterThan(1.8);
    }
    await stranka.screenshot({ path: `${SLOZKA}/o1-klidny-usek.png` });
    // Vypnutí: zkouška běží celá zvolenou rychlostí.
    await tlacitko.click();
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("false");
    expect(bezMezer(await tlacitko.innerText())).toBe("klid 1×");
    await expect.poll(() => telo("cekani"), { timeout: 5_000 }).toBe("ne");
    // Přehrání znovu od začátku: žádný úsek se nezrychlí.
    await naKonec();
    await akce("prehrat-znovu").click();
    for (let i = 0; i < 10; i++) {
      await stranka.waitForTimeout(300);
      expect(await telo("cekani")).toBe("ne");
    }
    // Volba platí i po novém načtení hry.
    await otevri("2-04");
    await nactiMost(RESENI["2-04"]!.pruchod);
    await pust();
    await dopocitej();
    await expect.poll(() => tlacitko.isVisible(), { timeout: 10_000 }).toBe(true);
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("false");
    await tlacitko.click();
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("true");
    await naKonec();
    await akce("upravit").click();
    expect(await tlacitko.isVisible()).toBe(false);
    expect(await telo("cekani")).toBeNull();
  });

  it("zvedací most: čekání na loď se přehraje osmkrát rychleji", async () => {
    await otevri("7-01");
    await nactiMost(RESENI["7-01"]!.pruchod);
    await pust();
    await dopocitej();
    const tlacitko = akce("hlucho");
    await expect.poll(() => tlacitko.isVisible(), { timeout: 10_000 }).toBe(true);
    expect(bezMezer(await tlacitko.innerText())).toBe("klid 8×");
    await naKonec();
    await akce("upravit").click();
  });

  it("zkouška s klidným koncem doběhne sama až k výsledku", async () => {
    // Poslední lidé odešli a most doznívá: klidný úsek sahá do konce záznamu. Zrychlené
    // přehrávání se kdysi vracelo na jeho konec (pár milisekund před koncem děje), zastavilo
    // se tam a výsledek neukázalo, dokud hráč nestiskl Přehrát znovu.
    await otevri("2-04");
    await nactiMost(RESENI["2-04"]!.pruchod);
    await pust();
    await dopocitej();
    await stranka.locator('[data-rychlost="4"]').click();
    // Bez tlačítka Na konec: přehrávání musí dojít k výsledku samo (78 s děje, klidné úseky 8×).
    await stranka.locator(".vysledek").waitFor({ state: "visible", timeout: 60_000 });
    expect(await udaj("vysledek-nadpis")).toBe("MOST OBSTÁL");
    await rozbalVysledek();
    // Most pro průchod je nad inženýrským rozpočtem: jen medaile za průchod.
    expect(await medaile()).toBe("true,false,false");
    // Zastavené přehrávání nic nezrychluje.
    expect(await telo("cekani")).toBe("ne");
    await stranka.locator('[data-rychlost="1"]').click();
    await akce("upravit").click();
  }, 240_000);
});

describe("vedený první krok", () => {
  async function bodSveta(x: number, y: number): Promise<{ x: number; y: number }> {
    return stranka.evaluate(
      ([sx, sy, volic]) => {
        const platno = document.querySelector<HTMLCanvasElement>(volic as string)!;
        const [kx, ky, m] = platno.dataset.kamera!.split(";").map(Number) as [number, number, number];
        const o = platno.getBoundingClientRect();
        return { x: o.left + o.width / 2 + ((sx as number) - kx) * m, y: o.top + o.height / 2 - ((sy as number) - ky) * m };
      },
      [x, y, PLATNO] as const,
    );
  }

  async function tahni(od: [number, number], po: [number, number]): Promise<void> {
    const a = await bodSveta(...od);
    const b = await bodSveta(...po);
    await stranka.mouse.move(a.x, a.y);
    await stranka.mouse.down();
    await stranka.mouse.move(b.x, b.y, { steps: 4 });
    await stranka.mouse.up();
  }

  it("první úroveň ukáže, kudy táhnout první díly mostovky; s celou mostovkou vedení končí", async () => {
    // Čistá paměť: vedení je jen pro hráče, který první úroveň ještě neprošel.
    await stranka.goto(adresa);
    await stranka.evaluate(() => window.localStorage.clear());
    await otevri("1-01");
    await expect.poll(() => telo("vedeni"), { timeout: 5_000 }).toBe("0;0;4;0");
    await stranka.screenshot({ path: `${SLOZKA}/o3-vedeni.png` });
    await tahni([0, 0], [4, 0]);
    await expect.poll(() => telo("vedeni"), { timeout: 5_000 }).toBe("4;0;8;0");
    await tahni([4, 0], [8, 0]);
    await expect.poll(() => telo("vedeni"), { timeout: 5_000 }).toBeNull();
    // Smazaný most vedení vrátí; při zkoušce se neukazuje.
    await akce("smazat-vse").click();
    await expect.poll(() => telo("vedeni"), { timeout: 5_000 }).toBe("0;0;4;0");
    // Jiná úroveň vedení nemá.
    await otevri("1-02");
    await stranka.waitForTimeout(300);
    expect(await telo("vedeni")).toBeNull();
  });

  it("hráč, který první úroveň prošel, už vedení nevidí", async () => {
    await otevri("1-01");
    await nactiMost(RESENI["1-01"]!.pruchod);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await akce("upravit").click();
    await akce("smazat-vse").click();
    await stranka.waitForTimeout(300);
    expect(await telo("vedeni")).toBeNull();
  });
});

describe("krátké zadání a slovníček pojmů", () => {
  it("zadání jsou dvě věty; vysvětlení, prvky a výzvy jsou sbalené a okno se vejde na obrazovku", async () => {
    await stranka.goto(`${adresa}?uroven=4-04&vyvoj=1`);
    await stranka.locator(PLATNO).waitFor();
    const okno = stranka.locator("#okno-zadani");
    if ((await stranka.locator("#okno-zadani[open]").count()) === 0) await akce("zadani").click();
    const kratce = bezMezer(await stranka.locator('[data-udaj="zadani-text"]').innerText());
    expect(kratce).toMatch(/^Dvaasedmdesát metrů přes rokli/);
    // Dvě věty: tečka uprostřed a na konci.
    expect(kratce.split(/(?<=[.!?])\s+/).length).toBe(2);
    expect(await stranka.locator('[data-udaj="zadani-vice"]').isVisible()).toBe(false);
    expect(await stranka.locator('[data-udaj="zadani-stavba"]').isVisible()).toBe(false);
    // Celé okno je na obrazovce 1280 × 720 vidět bez posouvání.
    const rozmery = await okno.evaluate((o) => ({ obsah: o.scrollHeight, okno: o.clientHeight, vyska: o.getBoundingClientRect().height }));
    expect(rozmery.obsah).toBeLessThanOrEqual(rozmery.okno + 1);
    expect(rozmery.vyska).toBeLessThanOrEqual(720);
    await stranka.screenshot({ path: `${SLOZKA}/o4-kratke-zadani.png` });
    await stranka.locator("#okno-zadani .okno__hlavni summary").click();
    expect(bezMezer(await stranka.locator('[data-udaj="zadani-vice"]').innerText())).toContain("Nosné lano je čtyřikrát silnější");
    expect(await stranka.locator('[data-udaj="zadani-skutecnost"]').isVisible()).toBe(true);
    await stranka.locator("#okno-zadani .okno__vedlejsi summary").first().click();
    expect(await stranka.locator('[data-udaj="zadani-stavba"]').innerText()).toContain("Nosné lano");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
  });

  it("pojem v zadání je podtržený a kliknutím se vysvětlí; celý slovníček je pod odkazem v paletě", async () => {
    await stranka.goto(`${adresa}?uroven=3-02&vyvoj=1`);
    await stranka.locator(PLATNO).waitFor();
    if ((await stranka.locator("#okno-zadani[open]").count()) === 0) await akce("zadani").click();
    const pojem = stranka.locator('[data-udaj="zadani-text"] .pojem[data-pojem="pas"]');
    expect(bezMezer(await pojem.innerText())).toBe("Horní pás");
    expect(await pojem.getAttribute("title")).toContain("podélná řada prutů příhrady");
    await pojem.click();
    const bublina = stranka.locator("#pojem-bublina");
    await expect.poll(() => bublina.evaluate((b) => b.matches(":popover-open"))).toBe(true);
    expect(await udaj("pojem-nazev")).toBe("Pás");
    expect(await udaj("pojem-text")).toContain("je horní pás tlačený");
    // Bublina leží celá na obrazovce a nad oknem zadání.
    const obdelnik = await bublina.boundingBox();
    expect(obdelnik!.x).toBeGreaterThanOrEqual(0);
    expect(obdelnik!.x + obdelnik!.width).toBeLessThanOrEqual(1280);
    expect(obdelnik!.y + obdelnik!.height).toBeLessThanOrEqual(720);
    await stranka.screenshot({ path: `${SLOZKA}/o5-pojem.png` });
    // Esc zavře bublinu, okno zadání zůstane.
    await stranka.keyboard.press("Escape");
    await expect.poll(() => bublina.evaluate((b) => b.matches(":popover-open"))).toBe(false);
    expect(await stranka.locator("#okno-zadani[open]").count()).toBe(1);
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    // Celý slovníček.
    await akce("pojmy").click();
    expect(await stranka.locator("#okno-pojmy[open]").count()).toBe(1);
    expect(await stranka.locator("#okno-pojmy dt").count()).toBe(22);
    expect(await stranka.locator("#okno-pojmy dt").allInnerTexts()).toContain("Vzpěr");
    await stranka.locator('#okno-pojmy button[value="zavrit"]').click();
    expect(await stranka.locator("#okno-pojmy[open]").count()).toBe(0);
    // Kliknutí vedle okna (na ztmavené pozadí) slovníček zavře také.
    await akce("pojmy").click();
    expect(await stranka.locator("#okno-pojmy[open]").count()).toBe(1);
    await stranka.mouse.click(8, 8);
    await expect.poll(() => stranka.locator("#okno-pojmy[open]").count()).toBe(0);
  });
});

describe("medaile po schodech", () => {
  it("most pro rozpočtovou medaili mistrovskou nedostane, most pro mistrovskou má všechny tři", async () => {
    await otevri("3-01");
    await nactiMost(RESENI["3-01"]!.rozpocet);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await rozbalVysledek();
    expect(await medaile()).toBe("true,true,false");
    await stranka.screenshot({ path: `${SLOZKA}/o2-medaile-rozpocet.png` });
    await akce("upravit").click();
    await nactiMost(RESENI["3-01"]!.mistrovska);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await rozbalVysledek();
    expect(await medaile()).toBe("true,true,true");
    await akce("upravit").click();
    // Most pro průchod je nad inženýrským rozpočtem: má jen průchod, i kdyby bonus splnil.
    // Rozpočtovou a mistrovskou hráč už má z předchozích pokusů.
    await nactiMost(RESENI["3-01"]!.pruchod);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await rozbalVysledek();
    expect(await medaile()).toBe("true,drive,drive");
    await akce("upravit").click();
  });

  it("žádná chyba v konzoli", () => {
    expect(chyby).toEqual([]);
  });
});

describe("zlato výzev nad mostem autora", () => {
  /** Stupeň výzvy ve výsledku: 0 nic, 1 bronz, 2 stříbro, 3 zlato. */
  const stupen = (druh: string): Promise<string | null> =>
    stranka.locator(`[data-udaj="vysledek-vyzvy"] li[data-vyzva="${druh}"]`).getAttribute("data-stupen");

  it("nejlevnější most autora má v 2-03 za cenu stříbro; zlato dostane až most zeštíhlený strojem", async () => {
    await otevri("2-03");
    await nactiMost(RESENI["2-03"]!.rozpocet);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await rozbalVysledek();
    expect(await stupen("cena")).toBe("2");
    await stranka.screenshot({ path: `${SLOZKA}/o3-vyzvy-stribro.png` });
    await akce("upravit").click();
    await nactiMost(sampionUrovne("2-03", "cena")!);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await rozbalVysledek();
    expect(await stupen("cena")).toBe("3");
    await akce("upravit").click();
  }, 300_000);

  it("žádná chyba v konzoli", () => {
    expect(chyby).toEqual([]);
  });
});
