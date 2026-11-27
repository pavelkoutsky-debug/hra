// Věty výsledku, které říkají, co udělat, a náhled nápovědy po třetím nezdaru (0.25.0 „Méně textu“).
// Typické mosty nováčka v 1-01 (deník 26. 11. 2026: z 249 neprošlých zkoušek se na žádné nic
// nezlomilo): podpěra do údolí bez kotvy, kozy na dně údolí, vzpěry ze svahu, jen mostovka a
// mostovka z krátkých dílů pod nízkým trojúhelníkem. Pruh má říct, co se stalo a co udělat, a místo
// má být označené i po návratu ke stavbě. Potřetí v návštěvě ukáže pruh první krok nápovědy.
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import { navrhNaText } from "../../src/data/navrh";
import { TEXTY } from "../../src/ui/slovnik";
import type { DavkaDeniku, UdalostDeniku } from "../../src/denik/udalosti";
import { RESENI } from "../../urovne/reseni";
import { nactiMostImportem } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const denik: UdalostDeniku[] = [];

const udaj = (s: Page, jmeno: string) => s.locator(`[data-udaj="${jmeno}"]`);
const akce = (s: Page, jmeno: string) => s.locator(`[data-akce="${jmeno}"]`);
const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);

const M: IdPrvku = "mostovka-drevo";
const L: IdPrvku = "drevo-lehke";
type Prut = [IdPrvku, [number, number], [number, number]];
const most = (pruty: Prut[]): string => {
  const k = new Kreslic("1-01");
  for (const [prvek, a, b] of pruty) k.prut(prvek, a, b);
  return navrhNaText(k.navrh());
};
const MOSTOVKA: Prut[] = [
  [M, [0, 0], [4, 0]],
  [M, [4, 0], [8, 0]],
];
const MOSTOVKA_PO_DVOU: Prut[] = [
  [M, [0, 0], [2, 0]],
  [M, [2, 0], [4, 0]],
  [M, [4, 0], [6, 0]],
  [M, [6, 0], [8, 0]],
];
/** Mosty nováčka, které si lehnou na zem: kde je pata podpěry (x;y) a jak se snímek jmenuje. */
const OPRENE: { nazev: string; text: string; pata: [number, number] }[] = [
  { nazev: "podpera-do-udoli", text: most([...MOSTOVKA, [L, [4, 0], [4, -3]]]), pata: [4, -3] },
  { nazev: "kozy", text: most([...MOSTOVKA, [L, [4, 0], [3, -3]], [L, [4, 0], [5, -3]], [L, [3, -3], [5, -3]]]), pata: [3, -3] },
  { nazev: "vzpery-ze-svahu", text: most([...MOSTOVKA, [L, [1, -2], [4, 0]], [L, [7, -2], [4, 0]]]), pata: [1, -2] },
];
const JEN_MOSTOVKA = most(MOSTOVKA);
/** Mostovka po dvou metrech pod trojúhelníkem vysokým metr: nesloží se, ale houpe se přes mez. */
const HOUPE_SE = most([...MOSTOVKA_PO_DVOU, [L, [0, 0], [4, 1]], [L, [4, 1], [8, 0]], [L, [4, 1], [4, 0]]]);

const slov = (veta: string): number => veta.split(/\s+/).filter((s) => /[\p{L}\d]/u.test(s)).length;

async function otevri(s: Page, dotaz: string): Promise<void> {
  await s.goto(`${adresa}?${dotaz}`);
  await s.locator(PLATNO).waitFor();
  const tlacitko = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

/** Pustí zkoušku, počká na výpočet a skočí na konec; vrátí nadpis výsledku. */
async function zkus(s: Page): Promise<string> {
  await akce(s, "zkouska").click();
  expect(await telo(s, "rezim")).toBe("zkouska");
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo(s, "zkouska")).toBe("hotovo");
  await akce(s, "na-konec").click();
  await s.locator(".vysledek").waitFor({ state: "visible" });
  return udaj(s, "vysledek-nadpis").innerText();
}

/** Místo na výkresu (x;y ve světě) přepočtené na svislou souřadnici stránky. */
async function naStrance(s: Page, misto: string): Promise<number> {
  const [, y] = misto.split(";").map(Number) as [number, number];
  const [, ky, meritko] = ((await s.locator(PLATNO).getAttribute("data-kamera")) ?? "").split(";").map(Number) as [number, number, number];
  const platno = (await s.locator(PLATNO).boundingBox())!;
  return platno.y + platno.height / 2 - (y - ky) * meritko;
}

async function udalostDeniku(druh: string, data: Record<string, unknown> = {}): Promise<UdalostDeniku> {
  const sedi = (u: UdalostDeniku): boolean => u.druh === druh && Object.entries(data).every(([k, v]) => (u.data as Record<string, unknown> | undefined)?.[k] === v);
  await expect.poll(() => denik.some(sedi), { timeout: 20_000 }).toBe(true);
  return denik.find(sedi)!;
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4231, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  // Deník si test nechá posílat a čte ho (jako `rada.e2e.ts`).
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
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

async function novaStranka(): Promise<{ s: Page; chyby: string[] }> {
  const s = await prohlizec.newPage({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const chyby: string[] = [];
  s.on("pageerror", (chyba) => chyby.push(chyba.message));
  s.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  return { s, chyby };
}

describe("věty výsledku v 1-01 říkají, co udělat, a označí místo", () => {
  it("most opřený o dno údolí: pruh řekne proč a co s tím, pata podpěry je označená i po návratu ke stavbě", async () => {
    const { s, chyby } = await novaStranka();
    for (const tvar of OPRENE) {
      await otevri(s, "uroven=1-01");
      await nactiMostImportem(s, tvar.text);
      expect(await zkus(s)).toBe("MOST NEOBSTÁL");
      // Dřív: „sjel z podpory“, „kmitání nad mezí“ (příčina: krok chodce) nebo „nemá vlastní oporu“.
      expect(await telo(s, "kod-priciny"), tvar.nazev).toBe("opreno");
      const pricina = (await telo(s, "pricina")) ?? "";
      expect(pricina, tvar.nazev).toBe("Most se opřel o zem (označeno): podpěra bez kotvy nenese. Nes mostovku trojúhelníkem z prutů nad ní.");
      expect(slov(pricina)).toBeLessThanOrEqual(20);
      expect(slov(await udaj(s, "vysledek-veta").innerText())).toBeLessThanOrEqual(26);
      // Pata podpěry je na výkresu označená a pod pruhem vidět.
      const misto = (await telo(s, "oznaceny-misto"))!;
      expect(misto.split(";").map(Number)).toEqual(tvar.pata);
      const pruh = (await s.locator(".vysledek").boundingBox())!;
      expect(await naStrance(s, misto)).toBeGreaterThan(pruh.y + pruh.height);
      await s.screenshot({ path: `${SLOZKA}/verdikt-${tvar.nazev}.png` });
      // Podrobnosti mají celé znění s radou.
      await akce(s, "vysledek-sbalit").click();
      expect(await udaj(s, "vysledek-shrnuti").innerText()).toContain("Podpěra, která stojí na zemi bez kotvy, most neudrží");
      await akce(s, "upravit").click();
      expect(await telo(s, "porucha-misto")).toBe(`opreni;${tvar.pata[0]};${tvar.pata[1]}`);
      expect(await telo(s, "prvni-porucha")).toBe("Nes mostovku trojúhelníkem z prutů nad ní.");
      await s.screenshot({ path: `${SLOZKA}/verdikt-${tvar.nazev}-stavba.png` });
    }
    expect(chyby).toEqual([]);
    await s.close();
  }, 400_000);

  it("jen mostovka: složí se, pruh řekne, co udělat (bez podpírání zespodu, pod mostem kotva není), a styčník je označený", async () => {
    const { s, chyby } = await novaStranka();
    await otevri(s, "uroven=1-01");
    await nactiMostImportem(s, JEN_MOSTOVKA);
    expect(await zkus(s)).toBe("MOST NEOBSTÁL");
    expect(await udaj(s, "vysledek-veta").innerText()).toBe(
      "Z 36 lidí nepřešel nikdo. Složil se vlastní vahou: styčník mostovky nic nedrží. Zavěs ho do trojúhelníku z prutů nad mostovkou.",
    );
    expect(await telo(s, "oznaceny-misto")).toBe("4.00;0.00");
    await s.screenshot({ path: `${SLOZKA}/verdikt-jen-mostovka.png` });
    await akce(s, "vysledek-sbalit").click();
    expect(await udaj(s, "vysledek-shrnuti").innerText()).toContain("Zespodu ho tu podepřít nejde");
    expect(chyby).toEqual([]);
    await s.close();
  }, 200_000);

  it("„střecha“ nad mostovkou bez svislice: rada řekne spojit styčník s tím, co nad ním stojí", async () => {
    // Nález recenze hraním M19: nováček postavil trojúhelník z břehu na břeh, střed mostovky
    // k němu nepřipojil a hra mu dál radila „zavěs ho do trojúhelníku“, který už měl.
    const { s, chyby } = await novaStranka();
    await otevri(s, "uroven=1-01");
    await nactiMostImportem(s, most([...MOSTOVKA, [L, [0, 0], [4, 2]], [L, [4, 2], [8, 0]]]));
    expect(await zkus(s)).toBe("MOST NEOBSTÁL");
    expect(await udaj(s, "vysledek-veta").innerText()).toMatch(/Složil se vlastní vahou: styčník mostovky nic nedrží\. Spoj ho prutem se styčníkem nad mostovkou\.$/);
    expect(await telo(s, "oznaceny-misto")).toBe("4.00;0.00");
    await s.screenshot({ path: `${SLOZKA}/verdikt-strecha-bez-svislice.png` });
    await akce(s, "vysledek-sbalit").click();
    expect(await udaj(s, "vysledek-shrnuti").innerText()).toContain("Spoj ho prutem se styčníkem nad mostovkou: dokud k němu nic nevede");
    expect(chyby).toEqual([]);
    await s.close();
  }, 200_000);

  it("most prošel, ale je dražší než inženýrský rozpočet: pruh u rozpočtové medaile řekne, pod kolik musí", async () => {
    // Nález recenze hraním M19: úroveň ukazuje „rozpočet 45 000 Kč“, most za 33 133 Kč projde
    // a medaili Rozpočet nedostane; že medaile chce 32 500 Kč, bylo až v podrobnostech.
    const { s, chyby } = await novaStranka();
    await otevri(s, "uroven=1-01");
    await nactiMostImportem(s, most([...MOSTOVKA, [L, [0, 0], [4, 2]], [L, [4, 2], [8, 0]], [L, [4, 2], [4, 0]]]));
    expect(await zkus(s)).toBe("MOST OBSTÁL");
    const medaile = s.locator('[data-udaj="vysledek-medaile-pruh"] li');
    expect(await medaile.nth(0).getAttribute("data-ziskana")).toBe("true");
    expect(await medaile.nth(1).getAttribute("data-ziskana")).toBe("false");
    expect((await medaile.nth(1).innerText()).replace(/[\u202f\u00a0]/g, " ").replace(/\s+/g, " ")).toBe("◇ Rozpočet do 32 500 Kč");
    // Ostatní medaile cíl nemají.
    expect(await s.locator('[data-udaj="vysledek-medaile-pruh"] .medaile__cil').count()).toBe(1);
    await s.screenshot({ path: `${SLOZKA}/verdikt-cil-rozpoctu.png` });
    expect(chyby).toEqual([]);
    await s.close();
  }, 200_000);

  it("mostovka z krátkých dílů pod nízkým trojúhelníkem: houpe se přes mez, pruh jmenuje styčník, ne krok chodců", async () => {
    const { s, chyby } = await novaStranka();
    await otevri(s, "uroven=1-01");
    await nactiMostImportem(s, HOUPE_SE);
    expect(await zkus(s)).toBe("MOST NEOBSTÁL");
    expect(await telo(s, "kod-priciny")).toBe("kmitani");
    const pricina = (await telo(s, "pricina")) ?? "";
    // Nad mostovkou už něco stojí: rada neříká „zavěs do trojúhelníku“, ale s čím styčník spojit.
    expect(pricina).toBe("Most se houpal přes mez kmitání: označený styčník mostovky nic nedrží. Spoj ho prutem se styčníkem nad mostovkou.");
    expect(slov(pricina)).toBeLessThanOrEqual(20);
    const [x, y] = (await telo(s, "oznaceny-misto"))!.split(";").map(Number) as [number, number];
    expect([2, 6]).toContain(x);
    expect(y).toBe(0);
    await s.screenshot({ path: `${SLOZKA}/verdikt-houpe-se.png` });
    // Po návratu ke stavbě zůstává u styčníku značka s radou.
    await akce(s, "upravit").click();
    expect(await telo(s, "porucha-misto")).toBe(`houpani;${x};${y}`);
    expect(await telo(s, "prvni-porucha")).toBe("Zavěs ho do trojúhelníku z prutů nad mostovkou.");
    await s.screenshot({ path: `${SLOZKA}/verdikt-houpe-se-stavba.png` });
    expect(chyby).toEqual([]);
    await s.close();
  }, 200_000);
});

describe("náhled nápovědy po třetím nezdaru", () => {
  it("1-01: po druhém nezdaru obrys na Nápovědě, po třetím skica a princip v pruhu; tlačítko otevře nápovědu na dalším kroku", async () => {
    const { s, chyby } = await novaStranka();
    await otevri(s, "uroven=1-01");
    await nactiMostImportem(s, JEN_MOSTOVKA);
    expect(await zkus(s)).toBe("MOST NEOBSTÁL");
    expect(await udaj(s, "vysledek-nahled").isVisible()).toBe(false);
    await akce(s, "upravit").click();
    expect(await akce(s, "napoveda").getAttribute("data-tip")).toBeNull();

    // Podruhé stejně: rada, její tlačítko říká, co hráč dostane. Nápověda v paletě dostane obrys.
    expect(await zkus(s)).toBe("MOST NEOBSTÁL");
    expect(await udaj(s, "vysledek-rada").isVisible()).toBe(true);
    expect(await akce(s, "rada-napoveda").innerText()).toBe("Ukázat skicu");
    expect(await udaj(s, "vysledek-nahled").isVisible()).toBe(false);
    // Rada je hned pod větou pruhu: věta proto řekne jen, co se stalo, a rada jen, co s tím
    // (stejná slova dvakrát pod sebou zabrala na telefonu půl obrazovky).
    expect(await udaj(s, "vysledek-veta").innerText()).toBe("Z 36 lidí nepřešel nikdo. Složil se vlastní vahou: styčník mostovky nic nedrží.");
    expect(await udaj(s, "vysledek-rada-text").innerText()).toMatch(/^Podruhé za sebou stejně: Zavěs ho shora do trojúhelníku z prutů nad mostovkou\./);
    await akce(s, "upravit").click();
    expect(await akce(s, "napoveda").getAttribute("data-tip")).toBe("napoveda");
    await s.screenshot({ path: `${SLOZKA}/nahled-paleta.png` });

    // Potřetí: náhled nápovědy v pruhu (skica a věta o principu) a jediné tlačítko do nápovědy.
    expect(await zkus(s)).toBe("MOST NEOBSTÁL");
    const nahled = udaj(s, "vysledek-nahled");
    expect(await nahled.isVisible()).toBe(true);
    expect(await udaj(s, "vysledek-nahled-text").innerText()).toBe("Nápověda: Mostovku drží pár prutů nad ní: tvoří s ní trojúhelník a ten se neprohne.");
    expect(await akce(s, "rada-napoveda").isVisible()).toBe(false);
    expect(await akce(s, "nahled-napoveda").innerText()).toBe("Další krok nápovědy");
    // Skica je nakreslená (plátno není prázdné).
    const nakresleno = await udaj(s, "vysledek-nahled-skica").evaluate((platno) => {
      const c = platno as HTMLCanvasElement;
      const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let plnych = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) plnych++;
      return plnych;
    });
    expect(nakresleno).toBeGreaterThan(50);
    // Pruh nezakryje most: styčník, o kterém mluví, je pod ním.
    const pruh = (await s.locator(".vysledek").boundingBox())!;
    expect(await naStrance(s, (await telo(s, "oznaceny-misto"))!)).toBeGreaterThan(pruh.y + pruh.height);
    await s.screenshot({ path: `${SLOZKA}/nahled-1-01.png` });

    await akce(s, "nahled-napoveda").click();
    expect(await telo(s, "rezim")).toBe("stavba");
    await s.locator("#okno-napoveda").waitFor({ state: "visible" });
    // První krok hráč viděl u výsledku: nápověda je rovnou na druhém (materiál).
    expect(await telo(s, "napoveda")).toBe("material");
    expect(await akce(s, "napoveda").getAttribute("data-tip")).toBeNull();
    await s.screenshot({ path: `${SLOZKA}/nahled-napoveda.png` });
    // Jedna výzva k téže věci: hlášení „Nedaří se?“ nepřijde.
    expect(await udaj(s, "hlaseni").innerText()).not.toContain("Nedaří se?");
    await s.goto("about:blank");
    expect(await udalostDeniku("napoveda.nahled")).toMatchObject({ uroven: "1-01", data: { zkousek: 3 } });
    expect(await udalostDeniku("napoveda", { odkud: "nahled" })).toMatchObject({ uroven: "1-01", data: { stupen: 2, most: "pruchod", odkud: "nahled" } });
    expect(chyby).toEqual([]);
    await s.close();
  }, 400_000);

  it("kdo si nápovědu v návštěvě otevřel sám, náhled ani obrys v paletě nedostane", async () => {
    const { s } = await novaStranka();
    await otevri(s, "uroven=1-01");
    await nactiMostImportem(s, JEN_MOSTOVKA);
    await akce(s, "napoveda").click();
    await s.locator("#okno-napoveda").waitFor({ state: "visible" });
    await s.keyboard.press("Escape");
    for (let pokus = 1; pokus <= 3; pokus++) {
      expect(await zkus(s)).toBe("MOST NEOBSTÁL");
      expect(await udaj(s, "vysledek-nahled").isVisible()).toBe(false);
      await akce(s, "upravit").click();
      expect(await akce(s, "napoveda").getAttribute("data-tip")).toBeNull();
    }
    await s.close();
  }, 400_000);

  it("zkouška kapitoly 1-05 a Havarijní komise náhled nemají", async () => {
    const { s, chyby } = await novaStranka();
    await otevri(s, "uroven=1-05");
    await nactiMostImportem(s, navrhNaText(RESENI["1-05"]!.pady[0]!.navrh));
    for (let pokus = 1; pokus <= 3; pokus++) {
      expect(await zkus(s)).toBe("MOST NEOBSTÁL");
      expect(await udaj(s, "vysledek-nahled").isVisible()).toBe(false);
      await akce(s, "upravit").click();
    }
    // Komise: spadlý most se dá pustit, jak je; hra tu neradí a nápovědu nemá.
    await otevri(s, "uroven=9-01");
    expect(await akce(s, "napoveda").isVisible()).toBe(false);
    for (let pokus = 1; pokus <= 3; pokus++) {
      expect(await zkus(s)).toBe("MOST NEOBSTÁL");
      expect(await udaj(s, "vysledek-nahled").isVisible()).toBe(false);
      expect(await udaj(s, "vysledek-rada").isVisible()).toBe(false);
      await akce(s, "upravit").click();
    }
    expect(chyby).toEqual([]);
    await s.close();
  }, 400_000);

  for (const jazyk of ["cs", "en"] as const) {
    it(`telefon 390 × 844 (${jazyk}): náhled se vejde a most zůstane vidět mezi pruhem a legendou`, async () => {
      const telefon = await prohlizec.newContext({ locale: jazyk === "en" ? "en-GB" : "cs-CZ", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      const s = await telefon.newPage();
      const chyby: string[] = [];
      s.on("pageerror", (chyba) => chyby.push(chyba.message));
      await otevri(s, `uroven=1-01&jazyk=${jazyk}`);
      expect(await telo(s, "jazyk")).toBe(jazyk);
      await nactiMostImportem(s, JEN_MOSTOVKA);
      for (let pokus = 1; pokus <= 3; pokus++) {
        await zkus(s);
        if (pokus < 3) await akce(s, "upravit").click();
      }
      expect(await udaj(s, "vysledek-nahled").isVisible()).toBe(true);
      await s.screenshot({ path: `${SLOZKA}/nahled-telefon-${jazyk}.png` });
      const veta = await udaj(s, "vysledek-veta").innerText();
      const text = await udaj(s, "vysledek-nahled-text").innerText();
      if (jazyk === "en") {
        expect(text).toBe(`Hint: ${TEXTY.en["napoveda.princip.trojuhelnik-nad"]}`);
        expect(`${veta} ${text}`).not.toMatch(/[ěščřžýáíéůú]/);
        expect(await akce(s, "nahled-napoveda").innerText()).toBe("Next hint step");
      } else expect(text).toMatch(/^Nápověda: Mostovku drží pár prutů nad ní/);
      // Nic nepřetéká, tlačítko je celé vidět a dost velké pro prst.
      expect(await s.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      const tlacitko = (await akce(s, "nahled-napoveda").boundingBox())!;
      expect(tlacitko.x).toBeGreaterThanOrEqual(0);
      expect(tlacitko.x + tlacitko.width).toBeLessThanOrEqual(390);
      expect(tlacitko.height).toBeGreaterThanOrEqual(44);
      const platno = (await s.locator(PLATNO).boundingBox())!;
      const pruh = (await s.locator(".vysledek").boundingBox())!;
      expect(tlacitko.y + tlacitko.height).toBeLessThanOrEqual(pruh.y + pruh.height);
      expect(pruh.y + pruh.height - platno.y).toBeLessThan(platno.height * 0.6);
      // Styčník, o kterém pruh mluví, leží mezi pruhem a legendou dole na výkresu.
      const misto = await naStrance(s, (await telo(s, "oznaceny-misto"))!);
      const legenda = (await s.locator("#obrazovka-uroven .legenda").boundingBox())!;
      expect(misto).toBeGreaterThan(pruh.y + pruh.height);
      expect(misto).toBeLessThan(legenda.y);
      expect(chyby).toEqual([]);
      await telefon.close();
    }, 400_000);
  }
});
