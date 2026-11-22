// Pátá kapitola v bezhlavém prohlížeči: laděný tlumič, analytický panel s rezonanční
// křivkou a tvary kmitání, budič, grafy při zkoušce, porovnání pokusů a záznam porušení.
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
const osa = () => stranka.locator('[data-udaj="osa-frekvenci"]');
const krivka = () => stranka.locator('canvas[data-udaj="krivka"]');
const cisloKrivky = async (atribut: string): Promise<number> => Number((await krivka().getAttribute(`data-${atribut}`)) ?? NaN);

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

async function klikni(a: [number, number]): Promise<void> {
  const p = await bodSveta(...a);
  await stranka.mouse.click(p.x, p.y);
}

/** Vlastní frekvence prázdného mostu, jak ji ukazuje osa frekvencí; null, dokud ji most nemá. */
async function frekvenceMostu(): Promise<number | null> {
  const zapis = await osa().getAttribute("data-frekvence");
  return zapis === null ? null : Number(zapis);
}

async function otevri(id: string): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator(PLATNO).waitFor();
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

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4197, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("zadání páté kapitoly", () => {
  it("úroveň 5-02 nabízí laděný tlumič a budič a ukázka předvede, co tlumič dělá", async () => {
    await stranka.goto(`${adresa}?uroven=5-02`);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-nazev")).toBe("Městský běh");
    expect(await udaj("zadani-text")).toContain("laděný tlumič");
    expect(await udaj("zadani-provoz")).toContain("40");
    expect(await udaj("zadani-stavba")).toContain("Laděný tlumič: 30 000 Kč za kus a 30 Kč za kilogram závaží, nejvýš 1000 kg");
    expect(await udaj("zadani-stavba")).toContain("Budič: zkušební zařízení zdarma");
    expect(await udaj("zadani-skutecnost")).toContain("Tchaj-pej 101");

    const ukazka = stranka.locator('[data-udaj="ukazka"]');
    await stranka.locator('[data-udaj="ukazka"][data-stav="hraje"]').waitFor({ timeout: 90_000 });
    const bez = ukazka.locator('[data-strana="a"]');
    const s = ukazka.locator('[data-strana="b"]');
    expect(await udaj("ukazka-a")).toBe("Bez tlumiče");
    expect(await udaj("ukazka-b")).toBe("S laděným tlumičem");
    expect(await bez.getAttribute("data-pruchod")).toBe("false");
    expect(await s.getAttribute("data-pruchod")).toBe("true");
    expect(Number(await bez.getAttribute("data-kmitani"))).toBeGreaterThan(2.5);
    expect(Number(await s.getAttribute("data-kmitani"))).toBeLessThan(2.5);
    expect(await udaj("ukazka-popis")).toContain("závaží na pružině");
    await stranka.waitForTimeout(6000);
    await stranka.screenshot({ path: `${SLOZKA}/60-zadani-mestsky-beh.png` });
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
  }, 120_000);

  it("ukázka dlouhého děje se přehrává zrychleně a říká to", async () => {
    await stranka.goto(`${adresa}?uroven=5-01`);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-medaile")).toContain("nerozkmitá nad 0,5 m/s²");
    expect(await udaj("zadani-skutecnost")).toContain("Golden Gate");
    await stranka.locator('[data-udaj="ukazka"][data-stav="hraje"]').waitFor({ timeout: 120_000 });
    expect(await stranka.locator('[data-udaj="ukazka"] [data-poznamka]').innerText()).toMatch(
      /^Pohyb mostu je \d+× zvětšený.* Děj je 3× zrychlený\.$/,
    );
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
  }, 150_000);
});

describe("laděný tlumič a analytický panel při stavbě", () => {
  let spickaBez = 0;
  let vrcholuBez = 0;

  it("analytický panel ukáže rezonanční křivku mostu s lidmi a její špičku", async () => {
    await otevri("5-02");
    await nactiMost(navrhNaText(RESENI["5-02"]!.pady[1]!.navrh));
    await expect.poll(frekvenceMostu, { timeout: 10_000 }).toBeGreaterThan(2);
    // V úrovni s rezonanční křivkou je panel otevřený od začátku; klávesa A ho zavírá a otevírá.
    expect(await telo("analyza")).toBe("otevrena");
    await stranka.keyboard.press("a");
    expect(await telo("analyza")).toBe("zavrena");
    expect(await stranka.locator('[data-udaj="analyza"]').isVisible()).toBe(false);
    await akce("analyza").click();
    expect(await telo("analyza")).toBe("otevrena");
    expect(await akce("analyza").getAttribute("aria-pressed")).toBe("true");
    await expect.poll(() => cisloKrivky("vrcholu"), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    spickaBez = await cisloKrivky("nejvyssi");
    vrcholuBez = await cisloKrivky("vrcholu");
    expect(spickaBez).toBeGreaterThan(0);
    // Špička mostu s běžci leží v jejich pásmu kolem 2,6 Hz.
    const popis = await udaj("krivka-popis");
    expect(popis).toMatch(/^Nejvyšší špička s lidmi: \d+,\d\d m\/s² na 1 kN při 2,[3-7]\d Hz\.$/);
    await stranka.screenshot({ path: `${SLOZKA}/61-rezonancni-krivka.png` });
  });

  it("tlumič se zavěsí pod vybraný styčník, naladí se na most s lidmi a zdraží most", async () => {
    const cenaPred = await udaj("cena");
    await stranka.keyboard.press("v");
    await klikni([16, 0]);
    const nastaveni = stranka.locator('[data-nastaveni="ladeny"]');
    expect(await nastaveni.isVisible()).toBe(true);
    expect(await udaj("ladeny-prepnout")).toBe("Zavěsit");
    await stranka.keyboard.press("l");
    expect(await udaj("ladeny-prepnout")).toBe("Odebrat");
    expect(await udaj("ladeny-hmota")).toBe("300 kg");
    expect(await udaj("ladeny-frekvence")).toMatch(/^2,[3-7]\d? Hz$/);
    expect(await udaj("cena")).not.toBe(cenaPred);
    // Těžší závaží až po mez úrovně.
    for (let i = 0; i < 14; i++) await akce("ladeny-hmota-plus").click();
    expect(await udaj("ladeny-hmota")).toBe("1000 kg");
    expect(await akce("ladeny-hmota-plus").isDisabled()).toBe(true);
    await akce("ladeny-frekvence-plus").click();
    await akce("ladeny-frekvence-min").click();
    await stranka.screenshot({ path: `${SLOZKA}/62-ladeny-tlumic.png` });
  });

  it("tlumič rozdělí rezonanční špičku na dvě nižší", async () => {
    await expect.poll(() => cisloKrivky("nejvyssi"), { timeout: 10_000 }).toBeLessThan(0.5 * spickaBez);
    expect(await cisloKrivky("vrcholu")).toBeGreaterThan(vrcholuBez);
    await stranka.screenshot({ path: `${SLOZKA}/63-rozdelena-spicka.png` });
  });

  it("tvar kmitání se po kliknutí rozhýbe na výkresu", async () => {
    const tvary = stranka.locator('[data-udaj="tvary"] button');
    expect(await tvary.count()).toBe(3);
    expect(await tvary.first().innerText()).toMatch(/^1\. tvar · \d,\d\d Hz$/);
    await tvary.first().click();
    expect(await telo("tvar")).toBe("0");
    expect(await tvary.first().getAttribute("aria-pressed")).toBe("true");
    await stranka.waitForTimeout(400);
    await stranka.screenshot({ path: `${SLOZKA}/64-tvar-kmitani.png` });
    await tvary.first().click();
    expect(await telo("tvar")).toBe("");
    await stranka.keyboard.press("Escape");
  });
});

describe("budič", () => {
  let vlastni = 0;
  let nalezena = 0;

  it("přeladí celý rozsah a najde, kde most rezonuje", async () => {
    await nactiMost(navrhNaText(RESENI["5-02"]!.pady[1]!.navrh));
    await expect.poll(frekvenceMostu, { timeout: 10_000 }).toBeGreaterThan(2);
    vlastni = (await frekvenceMostu())!;
    await stranka.keyboard.press("u");
    expect(await akce("budic").getAttribute("aria-pressed")).toBe("true");
    expect(await stranka.locator('[data-nastaveni="budic"]').isVisible()).toBe(true);
    expect(await telo("rytmus-budice")).toBe("rozsah");
    expect(await udaj("budic-rytmus")).toBe("0,5–6 Hz");
    expect(await udaj("hlaseni")).toBe("Klikni na styčník mostu, do kterého má budič bušit.");
    await klikni([16, 0]);
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    expect(await telo("zkouska")).toBe("hotovo");
    await nastavCas(20);
    await stranka.screenshot({ path: `${SLOZKA}/65-budic.png` });
    expect(await naKonec()).toBe("BUDIČ");
    nalezena = Number(await telo("budic"));
    // Budič buší do prázdného mostu: rezonanci najde u jeho vlastní frekvence.
    expect(Math.abs(nalezena - vlastni)).toBeLessThan(0.15);
    expect(Number(await telo("budic-zrychleni"))).toBeGreaterThan(0);
    expect(await udaj("vysledek-shrnuti")).toMatch(/\d,\d\d Hz/);
    // Pokus se nepočítá: žádné medaile.
    expect(await stranka.locator('[data-udaj="vysledek-medaile"]').isVisible()).toBe(false);
    await akce("upravit").click();
    // Změřená křivka se kreslí přes spočítanou a budič se sám nastaví na nalezený rytmus.
    expect(await cisloKrivky("zmereno")).toBeGreaterThan(100);
    expect(Math.abs(Number(await telo("rytmus-budice")) - nalezena)).toBeLessThan(0.03);
    expect(await udaj("krivka-popis")).toContain("měření budičem");
    await stranka.screenshot({ path: `${SLOZKA}/66-zmerena-krivka.png` });
  }, 180_000);

  it("ve stálém rytmu změří jeden bod křivky", async () => {
    const zmerenoPred = await cisloKrivky("zmereno");
    await klikni([16, 0]);
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 90_000 });
    expect(await naKonec()).toBe("BUDIČ");
    expect(await udaj("vysledek-shrnuti")).toMatch(/^Ve stálém rytmu \d,\d\d Hz se mostovka rozkmitala na \d+,\d\d m\/s² na 1 kN síly\.$/);
    await akce("upravit").click();
    expect(await cisloKrivky("zmereno")).toBeGreaterThan(zmerenoPred);
    // Rytmus jde posouvat po krocích a vrátit na přelaďování.
    const rytmus = Number(await telo("rytmus-budice"));
    await akce("budic-min").click();
    expect(Number(await telo("rytmus-budice"))).toBeCloseTo(rytmus - 0.05, 5);
    await akce("budic-rozsah").click();
    expect(await telo("rytmus-budice")).toBe("rozsah");
    await stranka.keyboard.press("u");
    expect(await akce("budic").getAttribute("aria-pressed")).toBe("false");
  }, 120_000);
});

describe("zkouška s davem", () => {
  it("běžecký závod přes lávku s tlumičem: průběhy, síly v prutu a reakce podpor", async () => {
    await nactiMost(navrhNaText(RESENI["5-02"]!.pruchod));
    await spust();
    expect(await telo("analyza")).toBe("otevrena");
    await nastavCas(12);
    await expect.poll(async () => Number(await telo("prubehu")), { timeout: 10_000 }).toBeGreaterThan(100);
    expect(await stranka.locator('[data-cast="graf-kmitani"]').isVisible()).toBe(true);
    expect(await udaj("prut-napoveda")).toBe("Klikni na prut: uvidíš jeho síly a průběh využití.");
    await klikni([14, 0]);
    await expect.poll(() => telo("vybrany-prut")).toMatch(/^\d+$/);
    const udaje = await udaj("prut-udaje");
    expect(udaje).toContain("největší využití");
    expect(udaje).toContain("osová síla");
    expect(udaje).toContain("ohybový moment");
    expect(await udaj("graf-prut-nadpis")).toMatch(/^využití prutu \d+ \[%\]$/i);
    const reakce = await udaj("reakce");
    expect(reakce).toContain("x = 0 m");
    expect(reakce).toContain("x = 32 m");
    expect(reakce).toMatch(/↑ \d+,\d kN/);
    await stranka.screenshot({ path: `${SLOZKA}/67-beh-analyza.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    // Výsledek počítá běžce, ne řady, ve kterých je simulace vede.
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (40).");
    expect(await udaj("vysledek-kmitani")).toMatch(/^\d,\d\d m\/s² · /);
    await stranka.screenshot({ path: `${SLOZKA}/68-vysledek-beh.png` });
    await akce("upravit").click();
  }, 180_000);

  it("druhá zkouška se porovná s minulou", async () => {
    await nactiMost(navrhNaText(RESENI["5-02"]!.mistrovska));
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    const rozdily = await stranka.locator(".vysledek__rozdil").allInnerTexts();
    expect(rozdily.length).toBeGreaterThanOrEqual(2);
    for (const radek of rozdily) expect(radek).toMatch(/^minule .+ · rozdíl .+$/);
    expect(await stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="true"]').count()).toBe(2);
    await stranka.screenshot({ path: `${SLOZKA}/69-porovnani-pokusu.png` });
    await akce("upravit").click();
    await stranka.keyboard.press("a");
    expect(await telo("analyza")).toBe("zavrena");
  }, 180_000);

  it("dav na nábřeží: sto dvacet lidí přejde klidnou lávku", async () => {
    await otevri("5-01");
    await nactiMost(navrhNaText(RESENI["5-01"]!.rozpocet));
    await spust();
    await nastavCas(40);
    await stranka.screenshot({ path: `${SLOZKA}/70-dav.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (120).");
  }, 180_000);

  it("dav na dvoumetrové příhradě: nikdo nespadne, ale promenáda se houpe víc, než zadání dovoluje", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["5-01"]!.pady[1]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toContain("víc, než zadání dovoluje (0,5 m/s²)");
  }, 180_000);

  it("průvod s kapelou: tlumič naladěný na most s lidmi", async () => {
    await otevri("5-03");
    await nactiMost(navrhNaText(RESENI["5-03"]!.mistrovska));
    await spust();
    await nastavCas(22);
    await stranka.screenshot({ path: `${SLOZKA}/71-pruvod.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="true"]').count()).toBe(2);
  }, 180_000);

  it("koncert: skákající dav uprostřed mostu a tlumiče na dvojnásobku rytmu", async () => {
    await otevri("5-04");
    await nactiMost(navrhNaText(RESENI["5-04"]!.mistrovska));
    await spust();
    await nastavCas(24);
    await stranka.screenshot({ path: `${SLOZKA}/72-koncert.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["5-04"]!.pady[1]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toContain("rozkmital víc, než se dá snést");
  }, 240_000);
});

describe("záznam porušení", () => {
  it("výsledek řekne, který prut selhal první a proč, a přehraje to zpomaleně", async () => {
    await otevri("1-03");
    await nactiMost(navrhNaText(RESENI["1-03"]!.pady[1]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    const veta = await udaj("vysledek-prvni");
    expect(veta).toMatch(/^Jako první selhal prut \d+ \(.+\): .+ kN při únosnosti \d+,\d kN.*\.$/);
    expect(await akce("prehrat-poruseni").isVisible()).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/73-prvni-poruseni.png` });
    await akce("prehrat-poruseni").click();
    const okamzik = Number(await telo("zaznam-poruseni"));
    expect(okamzik).toBeGreaterThan(0);
    expect(await stranka.locator(".vysledek").isVisible()).toBe(false);
    expect(await udaj("hlaseni")).toBe(veta);
    // Prut, který selhal, je označený; analytický panel o něm řekne víc.
    await stranka.keyboard.press("a");
    expect(await telo("analyza")).toBe("otevrena");
    expect(await telo("vybrany-prut")).toMatch(/^\d+$/);
    expect(await udaj("prut-udaje")).toContain("rozhoduje");
    // Přehrává se desetinovou rychlostí kolem okamžiku zlomu.
    expect(await stranka.locator('[data-rychlost="0.1"]').getAttribute("aria-pressed")).toBe("true");
    await stranka.waitForTimeout(1500);
    const cas = Number(await stranka.locator("#cas").inputValue());
    expect(cas).toBeGreaterThan(okamzik - 0.65);
    expect(cas).toBeLessThan(okamzik + 1.3);
    await stranka.screenshot({ path: `${SLOZKA}/74-zaznam-poruseni.png` });
  }, 120_000);

  it("za celý průchod stránka nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
