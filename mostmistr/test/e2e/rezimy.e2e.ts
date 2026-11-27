// Herní režimy v bezhlavém prohlížeči: výzvy o efektivitu a zkouška do zlomu.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { nactiMostImportem, rozbalPaletu } from "./pomoc";

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
  await rozbalPaletu(stranka);
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
  // Výzvy a čísla, která tyhle testy čtou, jsou v podrobnostech výsledku.
  if ((await stranka.locator(".vysledek").getAttribute("data-sbaleno")) === "ano") await akce("vysledek-sbalit").click();
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

describe("výzvy o efektivitu", () => {
  it("zadání úrovně říká, oč se ve třech výzvách hraje, a paleta má zkoušku do zlomu", async () => {
    await otevri("1-01", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    // Zadání ukazuje jen zlato každé výzvy; stupně bronz a stříbro až výsledek. Výzvy jsou až
    // pro projitou úroveň, proto jsou v zadání sbalené a hráč si je rozklikne.
    const castVyzev = stranka.locator('#okno-zadani details[data-cast="zadani-vyzvy"]');
    expect(await castVyzev.locator("summary").isVisible()).toBe(true);
    expect(await castVyzev.evaluate((cast) => (cast as HTMLDetailsElement).open)).toBe(false);
    await castVyzev.locator("summary").click();
    const vyzvy = (await stranka.locator('[data-udaj="zadani-vyzvy"] li').allInnerTexts()).map((v) => v.replace(/[  ]/g, " "));
    expect(vyzvy).toEqual([
      "Nejlevnější most: zlato do 31 100 Kč.",
      "Nejlehčí most: zlato do 914 kg.",
      "Únosnost na korunu (zkouška Do zlomu): zlato od 37,4 t na 100 000 Kč.",
    ]);
    // Medaile jsou cíl úrovně: sbalené jsou první částí nad provozem a výzvami a jejich řádek
    // se znaky je vidět bez posouvání.
    expect(await stranka.locator("#okno-zadani details.okno__vice").first().getAttribute("data-cast")).toBe("zadani-medaile");
    const okno = (await stranka.locator("#okno-zadani").boundingBox())!;
    const medaile = (await stranka.locator('#okno-zadani details[data-cast="zadani-medaile"] > summary').boundingBox())!;
    expect(medaile.y + medaile.height).toBeLessThan(okno.y + okno.height);
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    // V první kapitole je zkouška do zlomu pod „Více“.
    await rozbalPaletu(stranka);
    const tlacitko = akce("zlom");
    expect(await tlacitko.isVisible()).toBe(true);
    expect(await tlacitko.innerText()).toContain("Do zlomu");
    // Zadání a nápověda jsou nahoře v paletě, vidět bez posouvání.
    for (const jmeno of ["zadani", "napoveda"]) {
      const obrys = (await stranka.locator(`#obrazovka-uroven .paleta [data-akce="${jmeno}"]`).boundingBox())!;
      expect(obrys.y, jmeno).toBeLessThan(400);
    }
  });

  it("zkoušku do zlomu hra nepustí, dokud mostovka nevede od břehu k břehu", async () => {
    // Prázdný výkres: tlačítkem i klávesou D.
    await rozbalPaletu(stranka);
    await akce("zlom").click();
    expect(await telo("rezim")).toBe("stavba");
    expect(await udaj("hlaseni")).toBe("Zkouška do zlomu zatěžuje mostovku a na trase mezi 0 a 8 m žádná neleží. Dostav most od břehu k břehu.");
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("d");
    expect(await telo("rezim")).toBe("stavba");
    // Trámy bez mostovky: zátěž by neměla na čem ležet.
    const most = JSON.parse(navrhNaText(RESENI["1-01"]!.pruchod)) as { pruty: { prvek: string }[] };
    most.pruty = most.pruty.filter((p) => p.prvek !== "mostovka-drevo");
    await nactiMost(JSON.stringify(most));
    expect(Number(await telo("pruty"))).toBeGreaterThan(0);
    await rozbalPaletu(stranka);
    await akce("zlom").click();
    expect(await telo("rezim")).toBe("stavba");
    expect(await udaj("hlaseni")).toContain("Dostav most od břehu k břehu");
    expect(await telo("zlom")).toBeNull();
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
    expect(await textVyzvy("zlom")).toContain("zatím nezměřeno");

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
    await rozbalPaletu(stranka);
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
    expect(await udaj("vysledek-prvni")).toContain("Jako první povolil prut");
    await stranka.screenshot({ path: `${SLOZKA}/r3-vysledek-do-zlomu.png` });

    // Podvěšený most unese skoro dvakrát víc za stejnou cenu. Dokud neprošel běžnou zkouškou,
    // do výzvy se nepočítá a výsledek to řekne; rekord zůstává.
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["1-01"]!.mistrovska));
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("d");
    await pockejNaZkousku();
    expect(await naKonec()).toBe("ZKOUŠKA DO ZLOMU");
    expect(Number(await telo("zlom"))).toBeGreaterThan(100);
    expect(await udaj("vysledek-shrnuti")).toContain("Do výzvy o únosnost se to zatím nepočítá");
    expect(await stupne()).toEqual(["3", "3", "1"]);
    // Po běžné zkoušce, kterou projde, už ano: zlato.
    await akce("upravit").click();
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await akce("upravit").click();
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("d");
    await pockejNaZkousku();
    expect(await naKonec()).toBe("ZKOUŠKA DO ZLOMU");
    expect(await udaj("vysledek-shrnuti")).not.toContain("nepočítá");
    expect(await stupne()).toEqual(["3", "3", "3"]);
  }, 300_000);

  it("slabší most rekord nezhorší a přehled kampaně ukazuje součet stupňů", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["1-01"]!.rozpocet));
    await rozbalPaletu(stranka);
    await akce("zlom").click();
    await pockejNaZkousku();
    expect(await naKonec()).toBe("ZKOUŠKA DO ZLOMU");
    expect(await stupne()).toEqual(["3", "3", "3"]);
    // Řádek výzvy ukazuje rekord a řekne, že právě zkoušený most dopadl jinak.
    expect(await textVyzvy("zlom")).toMatch(/rekord [\d,]+ t na 100 000 Kč \(tenhle most [\d,]+ t na 100 000 Kč\) · zlato/);

    await stranka.goto(adresa);
    await stranka.locator('body[data-rezim="prehled"]').waitFor();
    const karta = stranka.locator('[data-uroven="1-01"] .karta__vyzvy');
    expect(await karta.innerText()).toBe("výzvy 9 z 9");
    expect(await karta.getAttribute("title")).toBe("Nejlevnější most: zlato; Nejlehčí most: zlato; Únosnost na korunu: zlato");
    // Úroveň, kterou hráč ještě neprošel, výzvy neukazuje.
    expect(await stranka.locator('[data-uroven="1-02"] .karta__vyzvy').count()).toBe(0);
    await stranka.screenshot({ path: `${SLOZKA}/r4-prehled-s-vyzvami.png` });
  }, 240_000);

  it("most nad rozpočet zkoušku do zlomu nedostane", async () => {
    await otevri("1-01");
    // Věšadlo, které úrovní projde, a nad ním zbytečných šestnáct metrů trámů: platný most,
    // jen dražší než rozpočet 45 000 Kč.
    const drahy = JSON.parse(navrhNaText(RESENI["1-01"]!.pruchod)) as {
      stycniky: { id: number; x: number; y: number }[];
      pruty: { id: number; a: number; b: number; prvek: string }[];
    };
    const stycnik = (x: number, y: number): number => {
      const znamy = drahy.stycniky.find((st) => st.x === x && st.y === y);
      if (znamy) return znamy.id;
      const id = Math.max(...drahy.stycniky.map((st) => st.id)) + 1;
      drahy.stycniky.push({ id, x, y });
      return id;
    };
    const tram = (a: [number, number], b: [number, number]): void => {
      drahy.pruty.push({ id: Math.max(...drahy.pruty.map((p) => p.id)) + 1, a: stycnik(...a), b: stycnik(...b), prvek: "drevo-lehke" });
    };
    tram([0, 0], [2, 4]);
    tram([2, 4], [4, 2]);
    tram([4, 2], [6, 4]);
    tram([6, 4], [8, 0]);
    tram([2, 4], [6, 4]);
    await nactiMost(JSON.stringify(drahy));
    expect(await telo("pruty")).toBe(String(drahy.pruty.length));
    expect(await stranka.locator(".rozpocet").getAttribute("data-stav")).toBe("nad");
    // Odmítnutí je kvůli rozpočtu, ne kvůli jiné chybě návrhu: tlačítkem i klávesou D.
    await rozbalPaletu(stranka);
    await akce("zlom").click();
    expect(await telo("rezim")).toBe("stavba");
    expect(await udaj("hlaseni")).toBe("Zkouška nejde: most je o 10 454 Kč nad rozpočtem.");
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("d");
    expect(await telo("rezim")).toBe("stavba");
    expect(await telo("zlom")).toBeNull();
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
    expect(await udaj("zadani-text")).toContain("žádné medaile, všechny prvky");
    // Výchozí provoz: dvě osobní auta zleva a nákladní auto zprava.
    // Provoz je v zadání sbalený: hráč si ho rozklikne.
    await stranka.locator('#okno-zadani details[data-cast="zadani-provoz"] > summary').click();
    const provoz = await udaj("zadani-provoz");
    expect(provoz).toContain("2× osobní auto");
    expect(provoz).toContain("nákladní auto");
    // Výzvy o efektivitu sandbox nemá: nemá referenční mosty. V zadání chybí i jejich sbalený oddíl.
    expect(await stranka.locator('#okno-zadani [data-cast="zadani-vyzvy"]').isVisible()).toBe(false);
    expect(await stranka.locator('#okno-zadani [data-cast="zadani-vyzvy"] summary').isVisible()).toBe(false);
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
    ]);
    // V pískovišti se nesoutěží: medaile nejsou v paletě ani v razítku.
    expect(await telo("sandbox")).toBe("ano");
    expect(await stranka.locator('[data-udaj="podminky"]').isVisible()).toBe(false);
    expect(await stranka.locator('[data-udaj="medaile"]').isVisible()).toBe(false);
    // Nastavení údolí je hlavní ovladač pískoviště: nahoře v paletě, vidět bez posouvání.
    const nastaveni = (await akce("sandbox").boundingBox())!;
    expect(nastaveni.y + nastaveni.height).toBeLessThan(400);
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
    expect(await udaj("vysledek-shrnuti")).toMatch(/^(Přešli a přejeli|Přešli|Přejeli) všichni \(3\)\.$/);
    // Sandbox nemá další úroveň, výzvy ani medaile, a rekord si nezapisuje.
    expect(await akce("dalsi").isVisible()).toBe(false);
    expect(await stranka.locator('[data-cast="vyzvy"]').isVisible()).toBe(false);
    expect(await stranka.locator('[data-udaj="vysledek-medaile"]').isVisible()).toBe(false);
    await akce("upravit").click();
    const ulozeno = await stranka.evaluate(() => window.localStorage.getItem("mostmistr.ulozeni") ?? "{}");
    expect((JSON.parse(ulozeno) as { rekordy?: Record<string, unknown> }).rekordy?.["0-01"]).toBeUndefined();

    // Voda na dně opěry ani kotvy nemění: most zůstane bez varování.
    await akce("sandbox").click();
    await stranka.locator("#okno-sandbox").waitFor({ state: "visible" });
    await pole("#sandbox-voda").uncheck();
    await Promise.all([stranka.waitForEvent("load"), akce("sandbox-pouzit").click()]);
    await stranka.locator(PLATNO).waitFor();
    expect(await telo("pruty")).toBe("13");

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
    // Silniční provoz po koleji nejezdí: jízdní řád dostal výchozí vlak, ať po trati něco jede.
    expect(await pole('[data-udaj="sandbox-provoz"] li').count()).toBe(1);
    expect(await pole('[data-udaj="sandbox-provoz"] li [data-pole="druh"]').inputValue()).toBe("vlak-osobni");
    expect(await pole('[data-udaj="sandbox-provoz"] li [data-pole="pocet"]').inputValue()).toBe("4");
    // Trať má jednu kolej: vlak proti prvnímu nastavení odmítne a řekne proč.
    await akce("sandbox-pridat").click();
    const druhy = pole('[data-udaj="sandbox-provoz"] li').nth(1);
    await druhy.locator('[data-pole="smer"]').selectOption("-1");
    await akce("sandbox-pouzit").click();
    expect(await udaj("sandbox-hlaseni")).toContain("Trať má jednu kolej: vlak na 2. řádku");
    await druhy.locator("button").click();
    // Do nejužšího údolí se tři základy nevejdou a okno řekne, kolik jich smí být.
    await pole("#sandbox-rozpeti").fill("6");
    await pole("#sandbox-zaklady").fill("3");
    await akce("sandbox-pouzit").click();
    expect(await udaj("sandbox-hlaseni")).toBe("Do údolí širokého 6 m se vejde nejvýš tolik základů pro pilíře: 1.");
    await pole("#sandbox-rozpeti").fill("36");
    await pole("#sandbox-zaklady").fill("1");
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

  it("hotové údolí s kanálem: zvedací most se zámkem uprostřed pustí loď; vlastní cíl rozpočtu", async () => {
    await akce("sandbox").click();
    await stranka.locator("#okno-sandbox").waitFor({ state: "visible" });
    // Šest hotových údolí; kliknutí jen vyplní formulář a řekne to.
    expect(await pole("[data-predloha]").count()).toBe(6);
    expect(await pole("#sandbox-zvedani").isChecked()).toBe(false);
    expect(await pole('[data-udaj="sandbox-zvedani"]').isVisible()).toBe(false);
    await pole('[data-predloha="kanal"]').click();
    expect(await udaj("sandbox-hlaseni")).toBe("Vyplněno: Kanál 16 m. Uprav, co chceš, a dej Použít.");
    expect(await pole("#sandbox-rozpeti").inputValue()).toBe("16");
    expect(await pole("#sandbox-druh").inputValue()).toBe("silnice");
    expect(await pole("#sandbox-zvedani").isChecked()).toBe(true);
    expect(await pole("#sandbox-kridla").inputValue()).toBe("2");
    expect(await pole("#sandbox-lod").inputValue()).toBe("9");
    // Loď bez vody nejde a okno řekne, co s tím.
    await pole("#sandbox-voda").uncheck();
    await akce("sandbox-pouzit").click();
    expect(await udaj("sandbox-hlaseni")).toBe("Loď potřebuje vodu: zaškrtni, že je na dně voda, nebo nastav výšku lodi na 0.");
    await pole("#sandbox-voda").check();
    await stranka.screenshot({ path: `${SLOZKA}/r7b-sandbox-predloha.png` });
    await Promise.all([stranka.waitForEvent("load"), akce("sandbox-pouzit").click()]);
    await stranka.locator(PLATNO).waitFor();
    // Zvedací most má v paletě píst a zámek a na ose zvednutí, loď a sklopení.
    const prvky = await stranka.locator(".paleta__prvky [data-prvek]").evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-prvek")));
    expect(prvky).toContain("pist");
    expect(await stranka.locator('button[data-pridavek="zamek"]').isVisible()).toBe(true);
    expect(await udaj("jizdni-rad")).toContain("loď");

    // Dvě křídla po osmi metrech, píst pod každým, zámek uprostřed.
    const stycniky = [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 4, y: 0, svar: true },
      { id: 2, x: 8, y: 0, zamek: true },
      { id: 3, x: 12, y: 0, svar: true },
      { id: 4, x: 16, y: 0 },
      { id: 5, x: 0, y: -5 },
      { id: 6, x: 16, y: -5 },
    ];
    const most = {
      verze: 4,
      uroven: "0-01",
      stycniky,
      pruty: [
        { id: 0, a: 0, b: 1, prvek: "mostovka-ocel" },
        { id: 1, a: 1, b: 2, prvek: "mostovka-ocel" },
        { id: 2, a: 4, b: 3, prvek: "mostovka-ocel" },
        { id: 3, a: 3, b: 2, prvek: "mostovka-ocel" },
        { id: 4, a: 5, b: 1, prvek: "pist", zdvih: 2 },
        { id: 5, a: 6, b: 3, prvek: "pist", zdvih: 2 },
      ],
    };
    await nactiMost(JSON.stringify(most));
    expect(await telo("pruty")).toBe("6");
    await spust();
    await nastavCas(15);
    await stranka.screenshot({ path: `${SLOZKA}/r7c-sandbox-kanal.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await stranka.locator('[data-udaj="vysledek-pohyb"]').getAttribute("data-narazilo")).toBe("0");
    // Bez cíle výsledek o cíli mlčí.
    expect(await telo("cil-sandboxu")).toBe("");
    await akce("upravit").click();

    // Vlastní cíl: rozpočet pod cenou mostu (570 000 Kč) ke zkoušce nepustí, nad ní ano.
    await akce("sandbox").click();
    await stranka.locator("#okno-sandbox").waitFor({ state: "visible" });
    await pole("#sandbox-rozpocet").fill("5");
    await akce("sandbox-pouzit").click();
    expect(await udaj("sandbox-hlaseni")).toBe("Rozpočet musí být celé číslo od 10 000 do 50 000 000 Kč; prázdné pole znamená bez rozpočtu.");
    await pole("#sandbox-rozpocet").fill("600000");
    await Promise.all([stranka.waitForEvent("load"), akce("sandbox-pouzit").click()]);
    await stranka.locator(PLATNO).waitFor();
    // Cíl most nemaže a rozpočet je na liště i v zadání.
    expect(await telo("pruty")).toBe("6");
    expect(await udaj("rozpocet")).toBe("570 000 Kč / 600 000 Kč");
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await telo("cil-sandboxu")).toBe("splnen");
    expect(await udaj("vysledek-veta")).toContain("Vlastní cíl splněn: rozpočet 600 000 Kč.");
    await stranka.screenshot({ path: `${SLOZKA}/r7d-sandbox-cil.png` });
    await akce("upravit").click();
  }, 240_000);

  it("během sandboxu prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});

describe("nápověda", () => {
  it("řekne, z čeho je most, který úrovní projde, a na další kliknutí ukáže jeho obrys", async () => {
    await otevri("1-02");
    expect(await akce("napoveda").isVisible()).toBe(true);
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    // První krok je jen princip; materiál a obrys jsou další dva kroky.
    expect(await telo("napoveda")).toBe("princip");
    expect(await udaj("napoveda-princip")).toContain("příhrada nad ní");
    await akce("napoveda-dalsi").click();
    expect(await telo("napoveda")).toBe("material");
    const soupis = (await stranka.locator('[data-udaj="napoveda-soupis"] li').allInnerTexts()).map((v) => v.replace(/[  ]/g, " "));
    expect(soupis[0]).toMatch(/^Dřevěná mostovka: \d+× \(dohromady 12 m\)$/);
    expect(soupis.some((r) => r.startsWith("Lehký trám: "))).toBe(true);
    expect(await udaj("napoveda-cena")).toMatch(/^Stojí [\d ]+ Kč\./);
    await stranka.screenshot({ path: `${SLOZKA}/r8-napoveda.png` });

    await akce("napoveda-dalsi").click();
    expect(await telo("napoveda")).toBe("obrys-nabidka");
    await akce("napoveda-obrys").click();
    // S obrysem se staví: okno uhne a obrys zůstane na výkresu.
    expect(await stranka.locator("#okno-napoveda[open]").count()).toBe(0);
    expect(await telo("napoveda")).toBe("obrys");
    await stranka.screenshot({ path: `${SLOZKA}/r9-napoveda-obrys.png` });
    await akce("napoveda").click();
    expect(await akce("napoveda-obrys").innerText()).toBe("Schovat obrys");
    await akce("napoveda-obrys").click();
    expect(await telo("napoveda")).toBe("obrys-nabidka");
    await stranka.keyboard.press("Escape");
  });

  it("věta o ceně říká pravdu: most z nápovědy pro 1-01 je na medaili za rozpočet drahý, most pro 2-03 se do ní vejde", async () => {
    // 1-02 je otevřená z předchozího testu: věta podle skutečné ceny a meze medaile.
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    const veta = (await udaj("napoveda-cena")).replace(/[  ]/g, " ");
    const cena = Number(/^Stojí ([\d ]+) Kč/.exec(veta)![1]!.replace(/ /g, ""));
    const limit = Number(/do ([\d ]+) Kč\)/.exec(veta)![1]!.replace(/ /g, ""));
    expect(veta).toContain(cena > limit ? "na medaili za rozpočet" : "vejde i do medaile za rozpočet");
    await stranka.keyboard.press("Escape");
    // Věšadlo z nápovědy 1-01 stojí víc než inženýrský rozpočet (32 500 Kč): věta to přizná.
    await otevri("1-01");
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    await akce("napoveda-dalsi").click();
    expect(await udaj("napoveda-cena")).toBe(
      "Stojí 33 133 Kč. Projde, ale na medaili za rozpočet (do 32 500 Kč) je drahý; ta i mistrovská chtějí chytřejší most.",
    );
    await stranka.keyboard.press("Escape");
    // Most z nápovědy 2-03 se do inženýrského rozpočtu vejde, a věta to řekne také.
    await otevri("2-03");
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    await akce("napoveda-dalsi").click();
    expect(await udaj("napoveda-cena")).toBe(
      "Stojí 427 932 Kč, takže se vejde i do medaile za rozpočet (do 441 000 Kč). Mistrovskou medaili ani zlato ve výzvách ti nezaručí.",
    );
    await stranka.keyboard.press("Escape");
  });

  it("soupis řekne i hmotnost závaží a zdvih pístu; obrys je na výkresu", async () => {
    await otevri("2-03");
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await udaj("napoveda-princip")).toContain("Na mostovce jsou závaží");
    await akce("napoveda-dalsi").click();
    let soupis = (await stranka.locator('[data-udaj="napoveda-soupis"] li').allInnerTexts()).map((v) => v.replace(/[  ]/g, " "));
    expect(soupis.some((r) => /^styčníky se závažím: 3 \(.*\d kg\)$/.test(r)), soupis.join(" | ")).toBe(true);
    await akce("napoveda-dalsi").click();
    await akce("napoveda-obrys").click();
    expect(await telo("napoveda")).toBe("obrys");
    await stranka.screenshot({ path: `${SLOZKA}/r9b-napoveda-obrys-zavazi.png` });
    await otevri("7-01");
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await udaj("napoveda-princip")).toContain("zvedá ho píst");
    await akce("napoveda-dalsi").click();
    soupis = (await stranka.locator('[data-udaj="napoveda-soupis"] li').allInnerTexts()).map((v) => v.replace(/[  ]/g, " "));
    expect(soupis.some((r) => /^zdvih pístu: [+−][\d,]+ m$/.test(r)), soupis.join(" | ")).toBe(true);
    await akce("napoveda-dalsi").click();
    await akce("napoveda-obrys").click();
    await stranka.screenshot({ path: `${SLOZKA}/r9c-napoveda-obrys-pist.png` });
  });

  it("po druhé zkoušce, která neprojde, zvýrazní Nápovědu v paletě a po třetí ukáže u výsledku její první krok", async () => {
    // Čerstvá návštěva: kdo si nápovědu už otevřel sám, tomu ji hra nepřipomíná.
    await otevri("1-02");
    await nactiMostImportem(stranka, navrhNaText(RESENI["1-02"]!.pady[0]!.navrh));
    for (let pokus = 1; pokus <= 3; pokus++) {
      await spust();
      expect(await naKonec()).toBe("MOST NEOBSTÁL");
      // Kdo si podrobnosti s radou přečetl sám, tomu ji pruh při stejném nezdaru nevnucuje
      // (`test/e2e/rada.e2e.ts`); náhled nápovědy po třetím nezdaru ano.
      expect(await stranka.locator('[data-udaj="vysledek-rada"]').isVisible()).toBe(false);
      expect(await stranka.locator('[data-udaj="vysledek-nahled"]').isVisible()).toBe(pokus === 3);
      await akce("upravit").click();
      // Jedna výzva k téže věci: hlášení „Nedaří se?“ po náhledu nepřijde.
      expect(await udaj("hlaseni")).not.toContain("Nedaří se?");
      // Tlačítko Nápověda v paletě má po druhém nezdaru obrys.
      expect(await akce("napoveda").getAttribute("data-tip")).toBe(pokus >= 2 ? "napoveda" : null);
    }
    // Kdo nápovědu otevře, tomu obrys zmizí a náhled u výsledku už nepřijde.
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await akce("napoveda").getAttribute("data-tip")).toBeNull();
    await stranka.keyboard.press("Escape");
    await spust();
    await naKonec();
    expect(await stranka.locator('[data-udaj="vysledek-nahled"]').isVisible()).toBe(false);
    await akce("upravit").click();
    expect(await udaj("hlaseni")).not.toContain("Nedaří se?");
  }, 240_000);

  it("ukazatel u značky na časové ose řekne, co značka znamená", async () => {
    await otevri("1-02");
    await nactiMost(navrhNaText(RESENI["1-02"]!.pady[0]!.navrh));
    await spust();
    const bublina = stranka.locator('[data-udaj="osa-znacka"]');
    expect(await bublina.isVisible()).toBe(false);
    // Značky leží na dráze táhla podle času; první výjezd je v čase nula na jejím začátku.
    // Most se složí už v půl sekundě a ta značka je od začátku osy jen pár pixelů: ukazatel
    // proto míří přesně na značku výjezdu, ne „kousek od kraje“.
    const draha = (await stranka.locator("#cas").boundingBox())!;
    const vyjezd = (await stranka.locator("#obrazovka-uroven .osa__znacka--vyjezd").first().boundingBox())!;
    await stranka.mouse.move(vyjezd.x + vyjezd.width / 2, draha.y + draha.height / 2);
    await expect.poll(() => bublina.isVisible()).toBe(true);
    expect((await bublina.innerText()).replace(/[  ]/g, " ")).toMatch(/^0,0 s · vyráží: /);
    // Co se na mostě pokazilo: první značka, která není výjezd.
    const znacka = (await stranka.locator("#obrazovka-uroven .osa__znacka:not(.osa__znacka--vyjezd)").first().boundingBox())!;
    await stranka.mouse.move(znacka.x + znacka.width / 2, draha.y + draha.height / 2);
    await expect
      .poll(async () => (await bublina.innerText()).replace(/[  ]/g, " "))
      .toMatch(/ s · (porušení prutu \d+|.+ padá z mostu|z mostu padá \d+ lidí|konec mostu sjel z posuvné podpory)/);
    await stranka.screenshot({ path: `${SLOZKA}/rezimy-znacka-osy.png` });
    // Mimo značky bublina zmizí.
    await stranka.mouse.move(draha.x + draha.width / 2, draha.y - 200);
    await expect.poll(() => bublina.isVisible()).toBe(false);
    // Čárky výjezdů visí pod táhlem: bublina se ukáže i přímo na nich.
    await stranka.mouse.move(draha.x + 2, draha.y + draha.height + 5);
    await expect.poll(() => bublina.isVisible()).toBe(true);
    await stranka.mouse.move(draha.x + draha.width / 2, draha.y - 200);
    await expect.poll(() => bublina.isVisible()).toBe(false);
    await akce("upravit").click();
  }, 120_000);

  it("sandbox nápovědu nemá: není tam most, podle kterého by radila", async () => {
    await stranka.goto(`${adresa}?sandbox=1`);
    await stranka.locator(PLATNO).waitFor();
    expect(await akce("napoveda").isVisible()).toBe(false);
    expect(await akce("sandbox").isVisible()).toBe(true);
  });

  it("během nápovědy prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
