// Herní režimy v bezhlavém prohlížeči: výzvy o efektivitu a zkouška do zlomu.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
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

/** Text údaje s obyčejnými mezerami: hra v číslech a před jednotkami píše nezlomitelné. */
const udaj = async (jmeno: string): Promise<string> =>
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[  ]/g, " ");
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

async function pockejNaZkousku(): Promise<void> {
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo("zkouska")).toBe("hotovo");
}

async function spust(): Promise<void> {
  await stranka.locator(PLATNO).focus();
  await stranka.keyboard.press("Space");
  await pockejNaZkousku();
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

/** Stupně výzev ve výsledku: cena, hmotnost, únosnost na korunu. */
const stupne = (): Promise<(string | null)[]> =>
  stranka.locator('[data-udaj="vysledek-vyzvy"] li').evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-stupen")));
const textVyzvy = async (druh: string): Promise<string> =>
  (await stranka.locator(`[data-udaj="vysledek-vyzvy"] li[data-vyzva="${druh}"]`).innerText()).replace(/[  ]/g, " ");

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4203, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
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

describe("výzvy o efektivitu", () => {
  it("zadání úrovně vypisuje prahy tří výzev a paleta má zkoušku do zlomu", async () => {
    await otevri("1-01", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    const vyzvy = (await stranka.locator('[data-udaj="zadani-vyzvy"] li').allInnerTexts()).map((v) => v.replace(/[  ]/g, " "));
    expect(vyzvy).toHaveLength(3);
    expect(vyzvy[0]).toMatch(/^Nejlevnější most, který projde: bronz do [\d ]+ Kč, stříbro do [\d ]+ Kč, zlato do 31 100 Kč\.$/);
    expect(vyzvy[1]).toMatch(/^Nejlehčí most, který projde: bronz do \d+ kg, stříbro do \d+ kg, zlato do 914 kg\.$/);
    expect(vyzvy[2]).toMatch(/^Zkouška do zlomu, únosnost na korunu: bronz od [\d,]+ t na 100 000 Kč, stříbro od .* zlato od [\d,]+ t na 100 000 Kč\.$/);
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    const tlacitko = akce("zlom");
    expect(await tlacitko.isVisible()).toBe(true);
    expect(await tlacitko.innerText()).toContain("Do zlomu");
  });

  it("most, který projde, se měří ve výzvách o cenu a hmotnost; únosnost čeká na zkoušku do zlomu", async () => {
    await nactiMost(navrhNaText(RESENI["1-01"]!.pruchod));
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await stranka.locator('[data-cast="vyzvy"]').isVisible()).toBe(true);
    // Most pro průchod je dražší a těžší než nejlepší referenční: stříbro nebo bronz, ne zlato.
    const prvni = await stupne();
    expect(prvni[2]).toBe("0");
    expect(Number(prvni[0])).toBeLessThan(3);
    expect(await textVyzvy("cena")).toMatch(/33 133 Kč · .* · .* do [\d ]+ Kč/);
    expect(await textVyzvy("zlom")).toContain("zatím nezkoušeno");

    // Úspornější most: zlato za cenu i za hmotnost.
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["1-01"]!.rozpocet));
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await stupne()).toEqual(["3", "3", "0"]);
    expect(await textVyzvy("cena")).toContain("31 095 Kč · zlato");
    expect(await textVyzvy("hmotnost")).toContain("914 kg · zlato");
    await stranka.screenshot({ path: `${SLOZKA}/r1-vyzvy-po-zkousce.png` });
  }, 240_000);

  it("zkouška do zlomu přikládá zátěž, dokud most nepovolí, a řekne, kolik unesl na korunu", async () => {
    await akce("upravit").click();
    await akce("zlom").click();
    await pockejNaZkousku();
    await nastavCas(6);
    await stranka.screenshot({ path: `${SLOZKA}/r2-zkouska-do-zlomu.png` });
    expect(await naKonec()).toBe("ZKOUŠKA DO ZLOMU");
    const shrnuti = await udaj("vysledek-shrnuti");
    expect(shrnuti).toMatch(/^Most unesl [\d,]+ t \(\d+ kN, tedy [\d,]+ kN na metr mostovky\)\. Při ceně 31 095 Kč je to [\d,]+ t na 100 000 Kč\.$/);
    // Úsporný most z nízkého věšadla unese asi 70 kN, tedy 7 tun.
    const unesl = Number(await telo("zlom"));
    expect(unesl).toBeGreaterThan(55);
    expect(unesl).toBeLessThan(85);
    // Medaile se u zkoušky do zlomu neudělují; výzva dostala první stupeň.
    expect(await stranka.locator('[data-udaj="vysledek-medaile"]').isVisible()).toBe(false);
    expect(await stupne()).toEqual(["3", "3", "1"]);
    expect(await textVyzvy("zlom")).toMatch(/[\d,]+ t na 100 000 Kč · bronz · stříbro od [\d,]+ t na 100 000 Kč/);
    // Co povolilo první, říká záznam porušení.
    expect(await udaj("vysledek-prvni")).toContain("Jako první selhal prut");
    await stranka.screenshot({ path: `${SLOZKA}/r3-vysledek-do-zlomu.png` });

    // Podvěšený most unese skoro dvakrát víc za stejnou cenu: zlato.
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["1-01"]!.mistrovska));
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("d");
    await pockejNaZkousku();
    expect(await naKonec()).toBe("ZKOUŠKA DO ZLOMU");
    expect(Number(await telo("zlom"))).toBeGreaterThan(100);
    expect(await stupne()).toEqual(["3", "3", "3"]);
  }, 240_000);

  it("slabší most rekord nezhorší a přehled kampaně ukazuje součet stupňů", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["1-01"]!.rozpocet));
    await akce("zlom").click();
    await pockejNaZkousku();
    expect(await naKonec()).toBe("ZKOUŠKA DO ZLOMU");
    expect(await stupne()).toEqual(["3", "3", "3"]);

    await stranka.goto(adresa);
    await stranka.locator('body[data-rezim="prehled"]').waitFor();
    const karta = stranka.locator('[data-uroven="1-01"] .karta__vyzvy');
    expect(await karta.innerText()).toBe("výzvy 9/9");
    expect(await karta.getAttribute("title")).toBe("Nejlevnější most: zlato; Nejlehčí most: zlato; Únosnost na korunu: zlato");
    // Úroveň, kterou hráč ještě neprošel, výzvy neukazuje.
    expect(await stranka.locator('[data-uroven="1-02"] .karta__vyzvy').count()).toBe(0);
    await stranka.screenshot({ path: `${SLOZKA}/r4-prehled-s-vyzvami.png` });
  }, 240_000);

  it("most nad rozpočet zkoušku do zlomu nedostane", async () => {
    await otevri("1-01");
    // Mostovka a nad ní zbytečně mnoho těžkého dřeva: dražší, než úroveň dovolí.
    const drahy = JSON.parse(navrhNaText(RESENI["1-04"]!.mistrovska)) as { uroven: string };
    drahy.uroven = "1-01";
    await nactiMost(JSON.stringify(drahy));
    if ((await telo("pruty")) !== "0") {
      await akce("zlom").click();
      expect(await telo("rezim")).toBe("stavba");
    }
  });

  it("během celého průchodu prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});

describe("sandbox", () => {
  /** Hodnota pole nebo výběru v okně sandboxu. */
  const pole = (volic: string) => stranka.locator(`#okno-sandbox ${volic}`);

  it("přehled kampaně vede do pískoviště; napoprvé se otevře zadání a paleta má všechny prvky", async () => {
    await stranka.goto(adresa);
    await stranka.locator('body[data-rezim="prehled"]').waitFor();
    await akce("otevrit-sandbox").click();
    await stranka.locator(PLATNO).waitFor();
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-nazev")).toBe("Pískoviště");
    expect(await udaj("zadani-text")).toContain("žádný rozpočet, žádné medaile");
    // Výchozí provoz: dvě osobní auta zleva a nákladní auto zprava.
    const provoz = await udaj("zadani-provoz");
    expect(provoz).toContain("2× osobní auto");
    expect(provoz).toContain("nákladní auto");
    // Výzvy o efektivitu sandbox nemá: nemá referenční mosty.
    expect(await stranka.locator('ul[data-udaj="zadani-vyzvy"]').isVisible()).toBe(false);
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();

    const prvky = await stranka.locator(".paleta__prvky [data-prvek]").evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-prvek")));
    expect(prvky).toEqual([
      "mostovka-drevo",
      "mostovka-ocelobeton",
      "mostovka-ocel",
      "drevo-lehke",
      "drevo-tezke",
      "ocel-lehka",
      "ocel-tezka",
      "lano",
      "lano-nosne",
      "pilir",
      "tlumic",
      "pruzina",
    ]);
    // Bez rozpočtu: ukazatel má jen cenu.
    expect(await stranka.locator(".rozpocet").innerText()).not.toContain("/");
    expect(await akce("sandbox").isVisible()).toBe(true);
    expect(await akce("budic").isVisible()).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/r5-sandbox.png` });
  });

  it("okno nastavení mění údolí i provoz; změna provozu most nechá", async () => {
    // Most přes výchozí údolí 24 m: ocelobetonová mostovka a příhrada nad ní.
    const most = {
      verze: 4,
      uroven: "0-01",
      stycniky: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 6, y: 0 },
        { id: 2, x: 12, y: 0 },
        { id: 3, x: 18, y: 0 },
        { id: 4, x: 24, y: 0 },
        { id: 5, x: 6, y: 5 },
        { id: 6, x: 12, y: 5 },
        { id: 7, x: 18, y: 5 },
      ],
      pruty: [
        { id: 0, a: 0, b: 1, prvek: "mostovka-ocelobeton" },
        { id: 1, a: 1, b: 2, prvek: "mostovka-ocelobeton" },
        { id: 2, a: 2, b: 3, prvek: "mostovka-ocelobeton" },
        { id: 3, a: 3, b: 4, prvek: "mostovka-ocelobeton" },
        { id: 4, a: 0, b: 5, prvek: "ocel-tezka" },
        { id: 5, a: 5, b: 6, prvek: "ocel-tezka" },
        { id: 6, a: 6, b: 7, prvek: "ocel-tezka" },
        { id: 7, a: 7, b: 4, prvek: "ocel-tezka" },
        { id: 8, a: 1, b: 5, prvek: "ocel-lehka" },
        { id: 9, a: 2, b: 6, prvek: "ocel-lehka" },
        { id: 10, a: 3, b: 7, prvek: "ocel-lehka" },
        { id: 11, a: 5, b: 2, prvek: "ocel-lehka" },
        { id: 12, a: 7, b: 2, prvek: "ocel-lehka" },
      ],
    };
    await nactiMost(JSON.stringify(most));
    expect(await telo("pruty")).toBe("13");
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (3).");
    // Sandbox nemá další úroveň ani výzvy.
    expect(await akce("dalsi").isVisible()).toBe(false);
    expect(await stranka.locator('[data-cast="vyzvy"]').isVisible()).toBe(false);
    await akce("upravit").click();

    // Jiný provoz: přidat autobus; most zůstane.
    await akce("sandbox").click();
    await stranka.locator("#okno-sandbox").waitFor({ state: "visible" });
    expect(await pole("#sandbox-rozpeti").inputValue()).toBe("24");
    expect(await pole('[data-udaj="sandbox-provoz"] li').count()).toBe(2);
    await akce("sandbox-pridat").click();
    const novy = pole('[data-udaj="sandbox-provoz"] li').nth(2);
    await novy.locator('[data-pole="druh"]').selectOption("autobus");
    expect(await novy.locator('[data-pole="cas"]').inputValue()).toBe("9");
    await stranka.screenshot({ path: `${SLOZKA}/r6-sandbox-nastaveni.png` });
    await Promise.all([stranka.waitForEvent("load"), akce("sandbox-pouzit").click()]);
    await stranka.locator(PLATNO).waitFor();
    expect(await telo("pruty")).toBe("13");
    // Podruhé se zadání samo neotvírá; jízdní řád na liště má tři položky.
    expect(await stranka.locator("#okno-zadani[open]").count()).toBe(0);
    expect(await udaj("jizdni-rad")).toContain("autobus");
  }, 240_000);

  it("změna údolí se ptá, protože most smaže; pak je údolí jiné a trať má vlak a kolejiště", async () => {
    await akce("sandbox").click();
    await stranka.locator("#okno-sandbox").waitFor({ state: "visible" });
    await pole("#sandbox-rozpeti").fill("36");
    await pole("#sandbox-druh").selectOption("kolej");
    // Silniční provoz po koleji nejezdí: z jízdního řádu zmizel.
    expect(await pole('[data-udaj="sandbox-provoz"] li').count()).toBe(0);
    await akce("sandbox-pridat").click();
    expect(await pole('[data-udaj="sandbox-provoz"] li [data-pole="druh"]').inputValue()).toBe("vlak-osobni");
    expect(await pole('[data-udaj="sandbox-provoz"] li [data-pole="pocet"]').inputValue()).toBe("4");
    await akce("sandbox-pouzit").click();
    // První kliknutí jen varuje, že most zmizí.
    expect(await udaj("sandbox-hlaseni")).toContain("smaže se");
    expect(await akce("sandbox-pouzit").innerText()).toBe("Smazat most a použít");
    await Promise.all([stranka.waitForEvent("load"), akce("sandbox-pouzit").click()]);
    await stranka.locator(PLATNO).waitFor();
    expect(await telo("pruty")).toBe("0");
    const prvky = await stranka.locator(".paleta__prvky [data-prvek]").evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-prvek")));
    expect(prvky).toContain("kolejiste");
    expect(prvky).not.toContain("mostovka-ocelobeton");
    expect(await udaj("jizdni-rad")).toContain("vlak");
    // Nastavení mimo meze okno odmítne a řekne proč.
    await akce("sandbox").click();
    await pole("#sandbox-rozpeti").fill("500");
    await akce("sandbox-pouzit").click();
    expect(await udaj("sandbox-hlaseni")).toBe("Rozpětí údolí musí být celé číslo od 6 do 72 m.");
    await stranka.screenshot({ path: `${SLOZKA}/r7-sandbox-trat.png` });
    await stranka.keyboard.press("Escape");
  }, 240_000);

  it("během sandboxu prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
