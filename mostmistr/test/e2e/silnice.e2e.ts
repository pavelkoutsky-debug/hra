// Třetí kapitola v bezhlavém prohlížeči: ocelobetonová mostovka, těžký profil, užitková
// vozidla, příhrada pod mostovkou, pohodlí v autobusu a brzdící kolona.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";

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

async function otevri(id: string, zavritZadani = true): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator(PLATNO).waitFor();
  if (!zavritZadani) return;
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(text: string): Promise<void> {
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(text);
  await akce("okno-nacist").click();
}

async function spust(): Promise<void> {
  await stranka.locator(PLATNO).focus();
  await stranka.keyboard.press("Space");
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo("zkouska")).toBe("hotovo");
}

async function naKonec(): Promise<string> {
  await akce("na-konec").click();
  await stranka.locator(".vysledek").waitFor({ state: "visible" });
  return udaj("vysledek-nadpis");
}

async function nastavCas(sekundy: number): Promise<void> {
  await stranka.locator("#cas").evaluate((tahlo, cas) => {
    (tahlo as HTMLInputElement).value = String(cas);
    tahlo.dispatchEvent(new Event("input", { bubbles: true }));
  }, sekundy);
  await stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
}

const ziskaneMedaile = (): Promise<number> => stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="true"]').count();

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4198, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
  stranka = await prohlizec.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("okresní silnice: ocelobetonová mostovka a vlastní tíha", () => {
  it("zadání popisuje mostovku, vozovku a co se smí stavět; paleta nabízí mostovku a ocel", async () => {
    await otevri("3-01", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-nazev")).toBe("Okresní silnice");
    expect(await udaj("zadani-text")).toContain("sama váží přes čtyři tuny na metr");
    const provoz = await udaj("zadani-provoz");
    expect(provoz).toContain("dodávka zleva");
    expect(provoz).toContain("autobus zleva");
    expect(provoz).toContain("Vozovka je nová a hladká");
    expect(await udaj("zadani-stavba")).toContain("Ocelobetonová mostovka: 12 000 Kč/m · do 6 m");
    expect(await udaj("zadani-skutecnost")).toContain("Québecu");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    const prvky = await stranka.locator(".paleta__prvky button").allInnerTexts();
    expect(prvky).toHaveLength(2);
    expect(prvky[0]).toContain("Ocelobetonová mostovka");
    expect(prvky[1]).toContain("Lehký ocelový profil");
    // Úroveň bez kmitání lidí nemá pokusy ani osu frekvencí.
    expect(await stranka.locator('[data-cast="pokusy"]').isVisible()).toBe(false);
  });

  it("metr vysoká příhrada se zlomí pod vlastní tíhou; čtyřmetrová získá mistrovskou medaili", async () => {
    await nactiMost(navrhNaText(RESENI["3-01"]!.pady[1]!.navrh));
    // Most váží přes sto tun, skoro všechno je mostovka.
    expect(await udaj("hmotnost")).toMatch(/^10\d,\d\st$/);
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-prvni")).toMatch(/^Jako první selhal prut \d+ \(lehký ocelový profil\)/);
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["3-01"]!.mistrovska));
    await spust();
    await nastavCas(6.5);
    await stranka.screenshot({ path: `${SLOZKA}/80-silnice-autobus.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (4).");
    expect(await ziskaneMedaile()).toBe(2);
    // Jel autobus, takže výsledek říká i to, jak se v něm jelo.
    expect(await udaj("vysledek-autobus")).toMatch(/^0,\d\d m\/s² · výborný komfort · v čase \d+,\d s/);
    expect(await stranka.locator('[data-udaj="vysledek-kmitani"]').isVisible()).toBe(false);
  }, 180_000);
});

describe("pod vedením: vzpěr a těžký profil", () => {
  it("paleta nabízí těžký profil; lehký horní pás neobstojí, těžký ano", async () => {
    await otevri("3-02");
    const prvky = await stranka.locator(".paleta__prvky button").allInnerTexts();
    expect(prvky).toHaveLength(3);
    expect(prvky[2]).toContain("Těžký ocelový profil");
    expect(prvky[2]).toContain("9 500 Kč/m");
    await nactiMost(navrhNaText(RESENI["3-02"]!.pady[1]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-prvni")).toContain("lehký ocelový profil");
    await stranka.screenshot({ path: `${SLOZKA}/81-vzper.png` });
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["3-02"]!.mistrovska));
    await spust();
    await nastavCas(3.2);
    await stranka.screenshot({ path: `${SLOZKA}/82-nakladni-auta.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await ziskaneMedaile()).toBe(2);
  }, 240_000);
});

describe("linka přes rokli: příhrada pod mostovkou a pohodlí v autobusu", () => {
  it("hluboká příhrada pod mostovkou dá cestujícím klidnou jízdu a mistrovskou medaili", async () => {
    await otevri("3-03", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-medaile")).toContain("zrychlení v autobusu nejvýš 0,15 m/s²");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    await nactiMost(navrhNaText(RESENI["3-03"]!.mistrovska));
    await spust();
    await nastavCas(3.6);
    await stranka.screenshot({ path: `${SLOZKA}/83-pod-mostovkou.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await ziskaneMedaile()).toBe(2);
    const pohodli = stranka.locator('[data-udaj="vysledek-autobus"]');
    expect(Number(await pohodli.getAttribute("data-zrychleni"))).toBeLessThan(0.15);
    await stranka.screenshot({ path: `${SLOZKA}/84-pohodli-v-autobusu.png` });
  }, 180_000);

  it("mělká příhrada projde, ale autobus se na ní houpe víc, než mistrovská medaile dovolí", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["3-03"]!.rozpocet));
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(Number(await stranka.locator('[data-udaj="vysledek-autobus"]').getAttribute("data-zrychleni"))).toBeGreaterThan(0.15);
    // Průchod a rozpočet ano, mistrovská ne; druhý pokus se porovná s prvním.
    expect(await ziskaneMedaile()).toBe(2);
    expect(await udaj("vysledek-autobus")).toContain("minule 0,13 m/s²");
  }, 180_000);
});

describe("kolona: brzdění a pilíř", () => {
  it("zadání říká, že kolona na mostě zabrzdí; brzdná síla je vidět v reakci pevné podpory", async () => {
    await otevri("3-04", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-provoz")).toContain("4× nákladní auto zleva, vyráží v čase 0 s; na mostě zabrzdí, 3 s stojí a rozjede se");
    expect(await udaj("zadani-provoz")).toContain("Vozovka je běžná");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    expect(await udaj("jizdni-rad")).toContain("na mostě zabrzdí");
    await nactiMost(navrhNaText(RESENI["3-04"]!.pruchod));
    await spust();
    await stranka.keyboard.press("a");
    expect(await telo("analyza")).toBe("otevrena");
    await nastavCas(7);
    await stranka.screenshot({ path: `${SLOZKA}/85-kolona-stoji.png` });
    // Skála uprostřed je jediný pevný bod: nese svislou i vodorovnou sílu.
    const reakce = await udaj("reakce");
    expect(reakce).toContain("x = 24 m");
    expect(reakce).toMatch(/↔ \d{3},\d kN/);
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (5).");
  }, 180_000);

  it("pilíř z lehkého profilu se pod brzdící kolonou podlomí", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["3-04"]!.pady[2]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-prvni")).toMatch(/lehký ocelový profil\): vzpěr/);
    await stranka.screenshot({ path: `${SLOZKA}/86-pilir-se-podlomil.png` });
  }, 180_000);

  it("za celý průchod stránka nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
