// Sedmá kapitola v bezhlavém prohlížeči: píst a jeho zdvih, dělicí zámek, loď, zvednutí a
// sklopení mostu, výsledek zvedání a dvoukřídlý most.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText, navrhZTextu } from "../../src/data/navrh";
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
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[  ]/g, " ");
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);

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

async function tahni(od: [number, number], k: [number, number]): Promise<void> {
  const a = await bodSveta(...od);
  const b = await bodSveta(...k);
  await stranka.mouse.move(a.x, a.y);
  await stranka.mouse.down();
  await stranka.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await stranka.mouse.move(b.x, b.y, { steps: 3 });
  await stranka.mouse.up();
}

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

/** Návrh, který má hra právě na výkresu. */
async function mostNaVykresu(): Promise<ReturnType<typeof navrhZTextu>> {
  await akce("export").click();
  const text = await stranka.locator("#okno-obsah").inputValue();
  await stranka.keyboard.press("Escape");
  return navrhZTextu(text);
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
/** Které medaile výsledek dal: průchod, rozpočet, mistrovská. */
const medaile = (): Promise<(string | null)[]> =>
  stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana]').evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-ziskana")));

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4202, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("přehled kampaně", () => {
  it("má sedmou kapitolu Přístav se čtyřmi úrovněmi", async () => {
    await stranka.goto(`${adresa}?vyvoj=1`);
    await stranka.locator(".karta").first().waitFor();
    const kapitoly = await stranka.locator(".prehled__kapitoly .kapitola").allInnerTexts();
    expect(kapitoly).toHaveLength(7);
    expect(kapitoly.at(-1)).toContain("Přístav");
    expect(kapitoly.at(-1)).toContain("Hydraulický píst, dělicí zámek");
    await stranka.locator("#odemknout-vse").check();
    const karty = await stranka.locator(".karta").allInnerTexts();
    for (const nazev of ["Zvedací most", "Dvě křídla", "Dlouhé křídlo", "Velký přístav"]) {
      expect(karty.some((k) => k.includes(nazev)), nazev).toBe(true);
    }
    await stranka.screenshot({ path: `${SLOZKA}/p0-kapitola-pristav.png` });
  });
});

describe("zvedací most", () => {
  it("zadání říká, kdy se most zvedá a jaká loď připluje; paleta má ocelovou mostovku, píst a zámek", async () => {
    await otevri("7-01", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    const provoz = await udaj("zadani-provoz");
    expect(provoz).toContain("V čase 5 s se zámky odemknou a písty most zvednou; v čase 16 s ho začnou sklápět.");
    expect(provoz).toContain("Loď vysoká 8 m a široká 7 m pluje pod mostem od času 12 s po dobu 3 s.");
    expect(await udaj("zadani-stavba")).toContain("Dělicí zámek: 25 000 Kč za kus");
    await stranka.screenshot({ path: `${SLOZKA}/p1-zadani-zvedaci-most.png` });
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    const prvky = (await stranka.locator(".paleta__prvky button").allInnerTexts()).map((p) => p.replace(/[\u00a0\u202f]/g, " "));
    expect(prvky.some((p) => p.includes("Ocelová mostovka"))).toBe(true);
    expect(prvky.some((p) => p.includes("Hydraulický píst"))).toBe(true);
    expect(prvky.some((p) => p.includes("Zámek") && p.includes("25 000 Kč za kus"))).toBe(true);
    // Lišta s jízdním řádem ukazuje i zvedání a loď.
    const rad = await udaj("jizdni-rad");
    expect(rad).toContain("5 s ↑ most se zvedá");
    expect(rad).toContain("12 s loď 8 m");
    expect(rad).toContain("16 s ↓ most se sklápí");
  });

  it("křídlo jde postavit myší: mostovka, svar, píst s nastavením zdvihu a zámek na opěře", async () => {
    await stranka.locator('[data-prvek="mostovka-ocel"]').click();
    await tahni([0, 0], [6, 0]);
    await tahni([6, 0], [12, 0]);
    // Svar ve styčníku uprostřed křídla a hned potom zámek na pravou opěru, jak radí zadání.
    // Kliknutí na Zámek v paletě jen přepne nástroj: svařený styčník, který po sobě svar
    // nechal vybraný, zámek nedostane.
    await stranka.locator('[data-pridavek="svar"]').click();
    const stred = await bodSveta(6, 0);
    await stranka.mouse.click(stred.x, stred.y);
    await stranka.locator('[data-pridavek="zamek"]').click();
    expect((await mostNaVykresu()).stycniky.find((s) => s.x === 6 && s.y === 0)).toEqual({ id: 1, x: 6, y: 0, svar: true });
    // Klik zámkem vedle mostu poradí, že zámek patří do styčníku.
    const vedle = await bodSveta(9, 4);
    await stranka.mouse.click(vedle.x, vedle.y);
    expect(await udaj("hlaseni")).toContain("Tady žádný styčník není");
    const opera = await bodSveta(12, 0);
    await stranka.mouse.click(opera.x, opera.y);
    // Píst z kotvy ve zdi do středu křídla; po nakreslení je vybraný a jde mu nastavit zdvih.
    await stranka.locator('[data-prvek="pist"]').click();
    await tahni([0, -3], [6, 0]);
    const nastaveni = stranka.locator('[data-nastaveni="zdvih"]');
    expect(await nastaveni.isVisible()).toBe(true);
    expect(await telo("zdvih")).toBe("1.00");
    expect(await udaj("zdvih")).toBe("vysune se o 1,00 m");
    for (let i = 0; i < 4; i++) await akce("zdvih-plus").click();
    expect(await telo("zdvih")).toBe("2.00");
    // Panel říká rozsah, o kolik se křídlo zvedne a kolik píst unese.
    const poznamka = await udaj("zdvih-poznamka");
    expect(poznamka).toContain("Nejvýš 3,25 m");
    expect(poznamka).toContain("Křídlo se zvedne o 59°");
    expect(poznamka).toContain("Píst tlačí i táhne nejvýš 1500 kN");
    expect(await telo("otoceni")).toBe("59");
    // O krok dál by píst křídlo zvedl přes 70°: panel varuje a zkouška se nepustí.
    await akce("zdvih-plus").click();
    expect(await udaj("zdvih-poznamka")).toContain("víc než 70°");
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("stavba");
    expect(await udaj("hlaseni")).toContain("Píst by křídlo zvedl o víc než 70°");
    // Zpátky na dva metry: píst je pořád vybraný.
    await akce("zdvih-min").click();
    expect(await telo("zdvih")).toBe("2.00");
    const most = await mostNaVykresu();
    expect(most.pruty.map((p) => p.prvek).sort()).toEqual(["mostovka-ocel", "mostovka-ocel", "pist"]);
    expect(most.pruty.find((p) => p.prvek === "pist")!.zdvih).toBe(2);
    expect(most.stycniky.find((s) => s.x === 12 && s.y === 0)!.zamek).toBe(true);
    expect(most.stycniky.find((s) => s.x === 6 && s.y === 0)!.svar).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/p2-kridlo-postavene.png` });
  });

  it("most se zvedne, loď propluje, most se sklopí a zamkne; výsledek to rozepíše", async () => {
    await spust();
    await nastavCas(13);
    await stranka.screenshot({ path: `${SLOZKA}/p3-zvednuty-most-a-lod.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    const pohyb = stranka.locator('[data-udaj="vysledek-pohyb"]');
    expect(await pohyb.getAttribute("data-zamceno")).toBe("true");
    expect(await pohyb.getAttribute("data-narazilo")).toBe("0");
    const text = await udaj("vysledek-pohyb");
    expect(text).toContain("zvednuto v");
    expect(text).toContain("loď proplula v");
    expect(text).toContain("zamčeno v");
    expect((await udaj("vysledek-pist")).replace(/\s/g, " ")).toMatch(/nejvýš \d+ kN z 1500 kN/);
    // Ráz při dosednutí s mezí medaile: tenhle most ji nesplní (píst z mělké kotvy).
    const dosednuti = (await udaj("vysledek-dosednuti")).replace(/\s/g, " ");
    expect(dosednuti).toMatch(/ráz \d+ kN, \d,\d× víc než v klidu; medaile chce nejvýš 250 kN/);
    expect(dosednuti).not.toContain("splněno");
    // Průchod a rozpočet; měkké dosednutí pro mistrovskou tenhle most nemá.
    expect(await medaile()).toEqual(["true", "true", "false"]);
    // Klik na píst řekne, kolik nejvíc tlačil (píst nemá využití jako prut).
    await akce("prehrat-znovu").click();
    // Ve druhé sekundě je most ještě dole a píst leží tam, kde byl nakreslen.
    await nastavCas(2);
    const napul = await bodSveta(3, -1.5);
    await stranka.mouse.click(napul.x, napul.y);
    expect((await udaj("hlaseni")).replace(/\s/g, " ")).toMatch(/Prut 3 \(píst\): největší síla \d+ kN z 1500 kN \(tlačil\)/);
    await naKonec();
    await stranka.screenshot({ path: `${SLOZKA}/p4-vysledek-zvedaci-most.png` });
  }, 240_000);

  it("bez zámku se most nezvedne a loď narazí: výsledek říká proč", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["7-01"]!.pady[1]!.navrh));
    await spust();
    await nastavCas(12.5);
    await stranka.screenshot({ path: `${SLOZKA}/p5-lod-narazila.png` });
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    const shrnuti = await udaj("vysledek-shrnuti");
    // Výsledek řekne, do kterého prutu loď narazila, a proč se most nezvedl.
    expect(shrnuti).toMatch(/Loď narazila do mostu: v jejím plavebním profilu zůstal prut \d+ \(ocelová mostovka\)/);
    expect(shrnuti).toContain("Píst most nezvedl");
    expect(await stranka.locator('[data-udaj="vysledek-pohyb"]').getAttribute("data-narazilo")).toBe("1");
    const radek = await udaj("vysledek-pohyb");
    expect(radek).toMatch(/loď narazila v .* do prutu \d+/);
    // Most bez zámku se nezamyká: o zamčení se nepíše.
    expect(radek).not.toContain("zamčeno");
    expect(radek).not.toContain("zámky nezapadly");
    // Medaile z předchozího mostu hráči zůstávají a výsledek to říká.
    expect(await medaile()).toEqual(["drive", "drive", "false"]);
    expect(await stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="drive"]').first().innerText()).toContain("už ji máš z dřívějška");
  }, 240_000);

  it("zámek ve styčníku, kam vede i píst, by spojoval tři části: hra zkoušku nepustí a řekne proč", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["7-01"]!.rozpocet));
    // Nástroj Zámek mohl zůstat zapnutý z dřívějška: nejdřív ho odložit, pak zapnout.
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Escape");
    await stranka.locator('[data-prvek="mostovka-ocel"]').click();
    await stranka.locator('[data-pridavek="zamek"]').click();
    const stred = await bodSveta(6, 0);
    await stranka.mouse.click(stred.x, stred.y);
    // Zámek je čep: svar ze styčníku zmizel.
    expect((await mostNaVykresu()).stycniky.find((st) => st.x === 6 && st.y === 0)).toMatchObject({ zamek: true });
    expect((await mostNaVykresu()).stycniky.find((st) => st.x === 6 && st.y === 0)!.svar).toBeUndefined();
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("stavba");
    expect(await udaj("hlaseni")).toContain("potkávají víc než dvě části mostu");
    await stranka.screenshot({ path: `${SLOZKA}/p5b-zamek-nedeli.png` });
  });
});

describe("dvě křídla", () => {
  it("křídla se uprostřed rozpojí, pustí loď a zase spojí; autobus pak přejede přes zámek", async () => {
    await otevri("7-02");
    // Razítko v rohu zakrývá pravou dolní kotvu pro píst: zprůhlední, aby byla vidět.
    expect(await stranka.locator("#obrazovka-uroven .pole").getAttribute("class")).toContain("pole--pruhledne");
    await stranka.screenshot({ path: `${SLOZKA}/p6a-dve-kridla-prazdny.png` });
    await nactiMost(navrhNaText(RESENI["7-02"]!.rozpocet));
    await stranka.screenshot({ path: `${SLOZKA}/p6-dve-kridla.png` });
    await spust();
    await nastavCas(15);
    await stranka.screenshot({ path: `${SLOZKA}/p7-dve-kridla-zvednuta.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toMatch(/^(Přešli a přejeli|Přešli|Přejeli) všichni \(5\)\.$/);
    expect(await stranka.locator('[data-udaj="vysledek-pohyb"]').getAttribute("data-zamceno")).toBe("true");
    // Dvoukřídlý most nemá zámek na opěře, takže řádek o dosednutí chybí.
    expect(await stranka.locator('dd[data-udaj="vysledek-dosednuti"]').isVisible()).toBe(false);
    expect(await medaile()).toEqual(["true", "true", "false"]);
  }, 240_000);

  it("během celého průchodu prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
