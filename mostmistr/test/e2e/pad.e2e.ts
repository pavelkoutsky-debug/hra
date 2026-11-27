// Pád mostu a výsledek zkoušky v bezhlavém prohlížeči: zpomalený záběr na první porušení,
// kontrola stability už při stavbě, pruh výsledku s razítkem a úklid vývojářských položek.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { Kreslic } from "../../src/zkouska/regrese";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const verzeBaliku = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const udaj = (jmeno: string): Promise<string> => stranka.locator(`[data-udaj="${jmeno}"]`).innerText();
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);

/** Pohled výkresu: střed ve světě a měřítko v pixelech na metr. */
async function pohled(): Promise<{ x: number; y: number; meritko: number }> {
  const [x, y, meritko] = ((await stranka.locator(PLATNO).getAttribute("data-kamera")) ?? "").split(";").map(Number) as [number, number, number];
  return { x, y, meritko };
}

/** Svislá poloha bodu světa na stránce, v pixelech. */
async function vyskaNaStrance(y: number): Promise<number> {
  const p = await pohled();
  const o = (await stranka.locator(PLATNO).boundingBox())!;
  return o.y + o.height / 2 - (y - p.y) * p.meritko;
}

async function otevri(id: string): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator(PLATNO).waitFor();
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(text: string): Promise<void> {
  await rozbalPaletu(stranka);
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(text);
  await akce("okno-nacist").click();
}

/** Spustí zkoušku mezerníkem a nechá ji běžet; na výsledek nečeká. */
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

const pad = (uroven: string, poradi: number): string => navrhNaText(RESENI[uroven]!.pady[poradi]!.navrh);

/** Čas přehrávání v sekundách děje. */
const cas = async (): Promise<number> => Number(await stranka.locator("#cas").inputValue());

/** Načte stránku znovu (most zůstává uložený): hra tak zapomene, které porušení už ukázala. */
async function nactiZnovu(): Promise<void> {
  await stranka.reload();
  await stranka.locator(PLATNO).waitFor();
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

/** Počká, až přehrávání dojde do času `kdy`; cestou hlídá, že neběží zpomalený záběr. */
async function prehrajBezZaberu(kdy: number): Promise<void> {
  await expect
    .poll(
      async () => {
        if ((await telo("zaber")) === "bezi") throw new Error("Záběr běží, a neměl by.");
        return cas();
      },
      { timeout: 60_000, interval: 50 },
    )
    .toBeGreaterThan(kdy);
}

/** Návrh mostu pro úroveň `uroven` nakreslený po prutech. */
function nakresli(uroven: string, pruty: [string, [number, number], [number, number]][]): string {
  const k = new Kreslic(uroven);
  for (const [prvek, od, k2] of pruty) k.prut(prvek as Parameters<Kreslic["prut"]>[0], od, k2);
  return navrhNaText(k.navrh());
}

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

describe("zpomalený záběr na první porušení", () => {
  it("když prut povolí, přehrávání se zpomalí, pohled najede na to místo, vrátí se a hned přijde výsledek", async () => {
    await otevri("1-03");
    await nactiMost(pad("1-03", 1));
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("true");
    expect(await akce("zaber").evaluate((u) => u.textContent)).toBe("Zpomalení: zap");
    const domov = await pohled();
    await pust();
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    // V záběru: pohled je blíž a hlášení říká, co povolilo a co s tím (bez čísel).
    await expect.poll(async () => (await pohled()).meritko, { timeout: 5000 }).toBeGreaterThan(domov.meritko * 1.3);
    expect(await udaj("hlaseni")).toMatch(/^Jako první povolil prut \d+ \(.+\): vzpěr\. Byl stlačený a vybočil do strany.+\.$/);
    await stranka.screenshot({ path: `${SLOZKA}/p1-zaber.png` });
    // Čas se v záběru vleče: za půl sekundy skutečného času uběhne jen zlomek děje.
    const cas0 = await cas();
    await stranka.waitForTimeout(500);
    const cas1 = await cas();
    expect(cas1 - cas0).toBeGreaterThan(0);
    expect(cas1 - cas0).toBeLessThan(0.3);
    // Zvolená rychlost zůstává, jaká byla.
    expect(await stranka.locator('[data-rychlost="1"]').getAttribute("aria-pressed")).toBe("true");
    // Záběr doběhne sám a pohled je zpátky.
    await stranka.locator('body[data-zaber="hotovo"]').waitFor({ timeout: 20_000 });
    const potom = await pohled();
    expect(potom.meritko).toBeCloseTo(domov.meritko, 6);
    expect(potom.x).toBeCloseTo(domov.x, 6);
    expect(potom.y).toBeCloseTo(domov.y, 6);
    expect(await telo("rezim")).toBe("zkouska");
    // Výsledek nečeká na konec časové osy: je rozhodnuto, pruh přijde chvíli po pádu.
    await stranka.locator(".vysledek").waitFor({ state: "visible", timeout: 15_000 });
    const konec = Number(await stranka.locator("#cas").getAttribute("max"));
    expect(await cas()).toBeLessThan(konec - 1);
    expect(await udaj("vysledek-nadpis")).toBe("MOST NEOBSTÁL");
    expect(await stranka.locator('[data-udaj="verdikt"]').isVisible()).toBe(true);
    expect(await udaj("vysledek-veta")).toMatch(/Jako první povolil prut \d+ \(označený na výkresu\): vzpěr\.$/);
    await stranka.screenshot({ path: `${SLOZKA}/p1a-vysledek-hned.png` });
  }, 120_000);

  it("po návratu ke stavbě zůstane na výkresu značka, kde to povolilo první, dokud se most nezmění", async () => {
    await akce("upravit").click();
    expect(await telo("rezim")).toBe("stavba");
    expect(await telo("zaber")).toBeNull();
    expect(await telo("prvni-porucha")).toMatch(/^prut \d+ · vzpěr$/);
    await stranka.screenshot({ path: `${SLOZKA}/p1b-znacka-pri-stavbe.png` });
    // Jakákoli úprava mostu značku smaže: už neplatí.
    await akce("zpet").click();
    expect(await telo("prvni-porucha")).toBeNull();
    await akce("znovu").click();
  });

  it("stejné porušení podruhé za sebou dostane jen krátký záběr", async () => {
    await nactiZnovu();
    const trvani = async (): Promise<number> => {
      await pust();
      await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
      const od = Date.now();
      await stranka.locator('body[data-zaber="hotovo"]').waitFor({ timeout: 20_000 });
      const doba = Date.now() - od;
      await stranka.keyboard.press("Escape");
      expect(await telo("rezim")).toBe("stavba");
      return doba;
    };
    const poprve = await trvani();
    const podruhe = await trvani();
    expect(poprve).toBeGreaterThan(3000);
    expect(podruhe).toBeLessThan(0.7 * poprve);
  }, 180_000);

  it("Esc záběr přeskočí a zkouška běží dál; druhé Esc se vrátí ke stavbě", async () => {
    await nactiZnovu();
    const domov = await pohled();
    await pust();
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    await stranka.keyboard.press("Escape");
    expect(await telo("zaber")).toBe("hotovo");
    expect(await telo("rezim")).toBe("zkouska");
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
    await stranka.keyboard.press("Escape");
    expect(await telo("rezim")).toBe("stavba");
    expect(await telo("zaber")).toBeNull();
  }, 120_000);

  it("návrat ke stavbě uprostřed záběru vrátí i přiblížený pohled", async () => {
    await nactiZnovu();
    // Hráč si výkres přiblížil: pohled už není výchozí a změna velikosti okna by ho nespravila.
    await akce("priblizit").click();
    const domov = await pohled();
    await pust();
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    await expect.poll(async () => (await pohled()).meritko, { timeout: 5000 }).toBeGreaterThan(domov.meritko * 1.1);
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("stavba");
    const potom = await pohled();
    expect(potom.meritko).toBeCloseTo(domov.meritko, 6);
    expect(potom.x).toBeCloseTo(domov.x, 6);
    expect(await telo("zaber")).toBeNull();
    await akce("cely-vykres").click();
  }, 120_000);

  it("kliknutí do výkresu záběr přeskočí taky", async () => {
    await nactiZnovu();
    await pust();
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    const o = (await stranka.locator(PLATNO).boundingBox())!;
    await stranka.mouse.click(o.x + o.width / 2, o.y + o.height / 2);
    expect(await telo("zaber")).toBe("hotovo");
    expect(await telo("rezim")).toBe("zkouska");
  }, 120_000);

  it("záběr jde vypnout a volba se pamatuje; co povolilo, se hráč dozví i tak", async () => {
    await akce("zaber").click();
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("false");
    expect(await akce("zaber").evaluate((u) => u.textContent)).toBe("Zpomalení: vyp");
    await nactiZnovu();
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("false");
    const domov = await pohled();
    await pust();
    // Prut povolí kolem 13,8 s, pod prvním autem: přehrávání přes ten okamžik projde plnou
    // rychlostí a bez přiblížení.
    await prehrajBezZaberu(14.9);
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
    expect(await udaj("hlaseni")).toMatch(/^Jako první povolil prut \d+ /);
    await dopocitej();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    // Na vyžádání se zpomaleně přehraje i s vypnutou volbou.
    await akce("prehrat-poruseni").click();
    const okamzik = Number(await telo("zaznam-poruseni"));
    expect(okamzik).toBeGreaterThan(0);
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 20_000 });
    await expect.poll(async () => (await pohled()).meritko, { timeout: 5000 }).toBeGreaterThan(domov.meritko * 1.3);
    await akce("zaber").click();
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("true");
  }, 180_000);

  it("kdo si čas posouvá sám (krok, táhlo, Na konec), záběr nedostane", async () => {
    await nactiZnovu();
    const domov = await pohled();
    // Krok po ose a pak zase přehrávání (prut povolí kolem 13,8 s).
    await pust();
    await akce("krok-vpred").click();
    await akce("prehrat").click();
    await prehrajBezZaberu(14.9);
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
    await stranka.keyboard.press("Escape");
    await stranka.keyboard.press("Escape");
    expect(await telo("rezim")).toBe("stavba");
    // Táhlo času.
    await pust();
    await dopocitej();
    await stranka.locator("#cas").evaluate((tahlo) => {
      (tahlo as HTMLInputElement).value = "12.5";
      tahlo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await akce("prehrat").click();
    await prehrajBezZaberu(14.9);
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
    await stranka.keyboard.press("Escape");
    await stranka.keyboard.press("Escape");
    expect(await telo("rezim")).toBe("stavba");
    // Na konec ještě během výpočtu.
    await pust();
    await akce("na-konec").click();
    await dopocitej();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await telo("zaber")).not.toBe("bezi");
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
  }, 240_000);

  it("pád do mezery v mostovce: hra to řekne hned při spuštění a záběr míří na toho, kdo spadl", async () => {
    await otevri("1-01");
    // Jen levá půlka mostu: drží (trojúhelník se vzpěrou), ale ve čtvrtém metru končí.
    await nactiMost(
      nakresli("1-01", [
        ["mostovka-drevo", [0, 0], [4, 0]],
        ["drevo-lehke", [0, 0], [4, 2]],
        ["drevo-lehke", [4, 0], [4, 2]],
      ]),
    );
    expect(await telo("slozeni")).toBeNull();
    await pust();
    expect(await udaj("hlaseni")).toBe("Na trase od 4 m do 8 m chybí mostovka: kdo tam dojde nebo dojede, spadne.");
    await dopocitej();
    await naKonec();
    expect(await udaj("vysledek-nadpis")).toBe("MOST NEOBSTÁL");
    expect(await stranka.locator('[data-udaj="vysledek-shrnuti"]').textContent()).toContain("neleží mostovka");
  }, 120_000);
});

describe("most, který se složí vlastní vahou", () => {
  it("už při stavbě hra ukáže, kde a proč se složí", async () => {
    await otevri("1-01");
    expect(await telo("slozeni")).toBeNull();
    await nactiMost(pad("1-01", 1));
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBe("mostovka");
    expect(await telo("slozeni-misto")).toBe("4;0");
    await stranka.screenshot({ path: `${SLOZKA}/p2-slozeni-stavba.png` });
    // Most, který projde, značku nemá.
    await nactiMost(navrhNaText(RESENI["1-01"]!.pruchod));
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBeNull();
    // Půlka krokví: značka patří styčníku mostovky, který se propadne, ne vrcholu hotového trojúhelníku.
    await nactiMost(
      nakresli("1-01", [
        ["mostovka-drevo", [0, 0], [4, 0]],
        ["mostovka-drevo", [4, 0], [8, 0]],
        ["drevo-lehke", [4, 0], [4, 2]],
        ["drevo-lehke", [0, 0], [4, 2]],
      ]),
    );
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBe("ztuzeni");
    expect(await telo("slozeni-misto")).toBe("4;0");
    // Obdélníky bez úhlopříček mají stejný důvod.
    await otevri("2-01");
    await nactiMost(pad("2-01", 1));
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBe("ztuzeni");
  }, 120_000);

  it("volný prut na mostě, který stojí, je poznámka: žádné „složí se“, žádný záběr", async () => {
    await otevri("1-01");
    await nactiMost(
      nakresli("1-01", [
        ["mostovka-drevo", [0, 0], [4, 0]],
        ["mostovka-drevo", [4, 0], [8, 0]],
        ["drevo-lehke", [0, 0], [4, 2]],
        ["drevo-lehke", [4, 2], [8, 0]],
        ["drevo-lehke", [4, 0], [4, 2]],
        ["drevo-lehke", [4, 2], [7, 4]],
      ]),
    );
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBe("volny-konec");
    expect(await telo("slozeni-misto")).toBe("7;4");
    await stranka.screenshot({ path: `${SLOZKA}/p2b-volny-prut.png` });
    await pust();
    await dopocitej();
    await prehrajBezZaberu(1.5);
    await naKonec();
    expect(await udaj("vysledek-veta")).not.toContain("Složil se");
    const shrnuti = (await stranka.locator('[data-udaj="vysledek-shrnuti"]').textContent()) ?? "";
    expect(shrnuti).toContain("Prut 6 drží jen za jeden konec a při zkoušce se rozkýval.");
    expect(shrnuti).not.toContain("složil");
  }, 120_000);

  it("výsledek místo odborné věty řekne, co nedrží a co s tím, a nesvádí to na podporu", async () => {
    await otevri("1-01");
    await nactiMost(pad("1-01", 1));
    await pust();
    // Záběr patří místu, kde se most skládá.
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    expect(await udaj("hlaseni")).toContain("styčník mostovky nic nedrží");
    await dopocitej();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    // Pruh řekne i co s tím; podpírat zespodu tu není z čeho (pod mostem kotva není a o zem se
    // most opírat nesmí), takže rada vede nad mostovku.
    expect(await udaj("vysledek-veta")).toContain("Složil se vlastní vahou: styčník mostovky nic nedrží. Zavěs ho do trojúhelníku z prutů nad mostovkou.");
    const shrnuti = await stranka.locator('[data-udaj="vysledek-shrnuti"]').textContent();
    expect(shrnuti).toContain("Zavěs ho shora do trojúhelníku z prutů nad mostovkou. Zespodu ho tu podepřít nejde");
    expect(shrnuti).not.toContain("Podepři ho zespodu");
    expect(shrnuti).not.toContain("klidovou polohu");
    // V úrovni bez svarů, lan a pilířů se nic takového neradí.
    expect(shrnuti).not.toContain("svar");
    expect(shrnuti).not.toContain("lano");
    // Sjetí z posuvné podpory je následek, ne příčina: věta o prvním porušení se neukáže.
    expect(await stranka.locator('[data-udaj="vysledek-prvni"]').isHidden()).toBe(true);
    // Pád jde přehrát znovu zpomaleně.
    expect(await akce("prehrat-poruseni").isVisible()).toBe(true);
  }, 120_000);
});

describe("pruh výsledku a razítko", () => {
  it("prohra: razítko Zamítnuto, hlavní tlačítko Upravit most a most zůstává vidět", async () => {
    expect(await stranka.locator(".vysledek").getAttribute("data-stav")).toBe("neobstal");
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ano");
    const razitko = stranka.locator('[data-udaj="verdikt"]');
    expect(await razitko.isVisible()).toBe(true);
    expect(await razitko.innerText()).toMatch(/^ZAMÍTNUTO\s+LIST 1-01 · /);
    expect(await razitko.getAttribute("data-stav")).toBe("neobstal");
    expect(await akce("upravit").evaluate((u) => u.classList.contains("tlacitko--hlavni"))).toBe(true);
    expect(await akce("dalsi").isHidden()).toBe(true);
    // Pruh končí nad mostovkou (výška 0 m): výsledek most nezakrývá.
    const pruh = (await stranka.locator(".vysledek").boundingBox())!;
    expect(pruh.y + pruh.height).toBeLessThan(await vyskaNaStrance(0));
    // Hlášení ze záběru pod pruhem nezůstává.
    expect(await udaj("hlaseni")).toBe("");
    await stranka.screenshot({ path: `${SLOZKA}/p3-zamitnuto.png` });
  });

  it("hlášení, které přijde po výsledku, leží pod pruhem, ne za ním", async () => {
    // Kliknutí na prut ve zkoušce vypíše jeho největší namáhání do hlášení nad výkresem.
    const p = await pohled();
    const o = (await stranka.locator(PLATNO).boundingBox())!;
    await stranka.mouse.click(o.x + o.width / 2 + (-6 - p.x) * p.meritko, o.y + o.height / 2 - (0 - p.y) * p.meritko);
    await akce("krok-zpet").click();
    const pruh = (await stranka.locator(".vysledek").boundingBox())!;
    const hlaseni = stranka.locator('[data-udaj="hlaseni"]');
    await stranka.evaluate(() => {
      document.querySelector('[data-udaj="hlaseni"]')!.textContent = "zkouška polohy";
    });
    const h = (await hlaseni.boundingBox())!;
    expect(h.y).toBeGreaterThanOrEqual(pruh.y + pruh.height);
    await akce("na-konec").click();
  });

  it("podrobnosti (čísla, podmínky medailí, hlášení chyby) jsou na rozkliknutí", async () => {
    expect(await stranka.locator('[data-udaj="vysledek-shrnuti"]').isVisible()).toBe(false);
    expect(await akce("diagnostika").isVisible()).toBe(false);
    expect(await akce("vysledek-sbalit").innerText()).toBe("Podrobnosti ▾");
    expect(await akce("vysledek-sbalit").getAttribute("aria-controls")).toBe("vysledek-podrobnosti");
    await akce("vysledek-sbalit").click();
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ne");
    expect(await akce("vysledek-sbalit").getAttribute("aria-expanded")).toBe("true");
    expect(await stranka.locator('[data-udaj="vysledek-shrnuti"]').isVisible()).toBe(true);
    expect(await stranka.locator('[data-udaj="vysledek-medaile"]').isVisible()).toBe(true);
    expect(await akce("diagnostika").innerText()).toBe("Nahlásit chybu");
    // Otisk zkoušky hráči na očích není.
    expect(await stranka.locator('[data-udaj="otisk"]').isVisible()).toBe(false);
    await stranka.screenshot({ path: `${SLOZKA}/p4-podrobnosti.png` });
    // V širokém okně podrobnosti při skoku v čase zůstávají: seznam porušení se dá proklikat.
    await akce("krok-zpet").click();
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ne");
    await stranka.locator('[data-udaj="vysledek-poruseni"] button').first().click();
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ne");
    expect(await stranka.locator(".vysledek").isVisible()).toBe(true);
    await akce("vysledek-sbalit").click();
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ano");
  });

  it("výhra: razítko Schváleno, medaile v pruhu a Další úroveň hned po ruce", async () => {
    await akce("upravit").click();
    expect(await stranka.locator('[data-udaj="verdikt"]').isHidden()).toBe(true);
    await nactiMost(navrhNaText(RESENI["1-01"]!.pruchod));
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await stranka.locator(".vysledek").getAttribute("data-stav")).toBe("obstal");
    const razitko = stranka.locator('[data-udaj="verdikt"]');
    expect(await razitko.innerText()).toMatch(/^SCHVÁLENO\s+LIST 1-01 · /);
    expect(await razitko.getAttribute("data-stav")).toBe("obstal");
    expect(await stranka.locator('[data-udaj="vysledek-medaile-pruh"] [data-ziskana="true"]').count()).toBeGreaterThanOrEqual(1);
    expect(await stranka.locator('[data-udaj="vysledek-medaile-pruh"] li').count()).toBe(3);
    expect(await stranka.locator('[data-udaj="vysledek-medaile-pruh"] li').first().getAttribute("aria-label")).toMatch(/^Průchod: /);
    expect(await akce("dalsi").isVisible()).toBe(true);
    expect(await akce("dalsi").evaluate((u) => u.classList.contains("tlacitko--hlavni"))).toBe(true);
    expect(await akce("upravit").evaluate((u) => u.classList.contains("tlacitko--hlavni"))).toBe(false);
    // Přes lávku jdou jen chodci: „přešli“, ne „přešli a přejeli“.
    expect(await udaj("vysledek-veta")).toBe("Přešli všichni (36).");
    const pruh = (await stranka.locator(".vysledek").boundingBox())!;
    expect(pruh.y + pruh.height).toBeLessThan(await vyskaNaStrance(0));
    await stranka.screenshot({ path: `${SLOZKA}/p5-schvaleno.png` });
  }, 120_000);

  it("neúspěch v úrovni, která už je projitá: hlavní tlačítko je Upravit most, ne Další úroveň", async () => {
    await akce("upravit").click();
    await nactiMost(pad("1-01", 1));
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await akce("dalsi").isVisible()).toBe(true);
    expect(await akce("dalsi").evaluate((u) => u.classList.contains("tlacitko--hlavni"))).toBe(false);
    expect(await akce("upravit").evaluate((u) => u.classList.contains("tlacitko--hlavni"))).toBe(true);
  }, 120_000);

  it("zkouška do zlomu razítko ani medaile nedostane", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["1-01"]!.pruchod));
    await rozbalPaletu(stranka);
    await akce("zlom").click();
    await dopocitej();
    await naKonec();
    expect(await stranka.locator('[data-udaj="verdikt"]').isHidden()).toBe(true);
    expect(await stranka.locator('[data-udaj="vysledek-medaile-pruh"]').isHidden()).toBe(true);
  }, 180_000);

  it("brnknutí do mostu, který se složí: pruh řekne proč a nenabízí přehrání, které by nic nepřehrálo", async () => {
    await otevri("2-01");
    await nactiMost(pad("2-01", 0));
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBe("mostovka");
    await stranka.keyboard.press("b");
    const p = await pohled();
    const o = (await stranka.locator(PLATNO).boundingBox())!;
    const mostovka = RESENI["2-01"]!.pady[0]!.navrh.stycniky.filter((s) => s.y === 0).map((s) => s.x).sort((a, b) => a - b);
    const x = mostovka[Math.floor(mostovka.length / 2)]!;
    const bod = { x: o.x + o.width / 2 + (x - p.x) * p.meritko, y: o.y + o.height / 2 - (0 - p.y) * p.meritko };
    await stranka.mouse.move(bod.x, bod.y);
    await stranka.mouse.down();
    await stranka.mouse.move(bod.x, bod.y + 30, { steps: 3 });
    await stranka.mouse.move(bod.x, bod.y + 60, { steps: 3 });
    await stranka.mouse.up();
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("BRNKNUTÍ");
    expect(await akce("prehrat-poruseni").isHidden()).toBe(true);
    expect(await udaj("vysledek-veta")).toContain("Složil se vlastní vahou");
    expect(await telo("zaber")).not.toBe("bezi");
  }, 120_000);
});

describe("drobné chyby z recenze", () => {
  it("po načtení mostu z okna mezerník spustí zkoušku, ne znovu Import", async () => {
    await otevri("1-01");
    await nactiMost(navrhNaText(RESENI["1-01"]!.pruchod));
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("zkouska");
    expect(await stranka.locator("#okno").evaluate((o) => (o as HTMLDialogElement).open)).toBe(false);
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
  }, 120_000);

  it("zkouška do zlomu se počítá i po návratu do úrovně, když most dřív prošel", async () => {
    await nactiZnovu();
    await rozbalPaletu(stranka);
    await akce("zlom").click();
    await dopocitej();
    await naKonec();
    const shrnuti = (await stranka.locator('[data-udaj="vysledek-shrnuti"]').textContent()) ?? "";
    expect(shrnuti).toContain("unesl");
    expect(shrnuti).not.toContain("nepočítá");
  }, 180_000);

  it("chyba importu neukazuje vnitřní názvy", async () => {
    await akce("upravit").click();
    await rozbalPaletu(stranka);
    await akce("import").click();
    await stranka.locator("#okno-obsah").fill("tohle není most");
    await akce("okno-nacist").click();
    const hlaseni = await udaj("okno-hlaseni");
    expect(hlaseni).toMatch(/^Tenhle text most není: /);
    expect(hlaseni).not.toContain("navrh");
    await stranka.keyboard.press("Escape");
  });

  it("tah mostovky, který nejde rozdělit na stejné díly, se rozdělí na co nejmíň dílů", async () => {
    await otevri("1-01");
    await rozbalPaletu(stranka);
    await akce("smazat-vse").click();
    expect(await udaj("prutu")).toBe("0");
    const p = await pohled();
    const o = (await stranka.locator(PLATNO).boundingBox())!;
    const bod = (x: number, y: number) => ({ x: o.x + o.width / 2 + (x - p.x) * p.meritko, y: o.y + o.height / 2 - (y - p.y) * p.meritko });
    const od = bod(0, 0);
    const k = bod(5, 0);
    await stranka.mouse.move(od.x, od.y);
    await stranka.mouse.down();
    await stranka.mouse.move((od.x + k.x) / 2, od.y, { steps: 4 });
    await stranka.mouse.move(k.x, k.y, { steps: 4 });
    await stranka.mouse.up();
    // Pět metrů čtyřmetrové mostovky jsou dva díly (3 + 2), ne pět metrových.
    expect(await udaj("prutu")).toBe("2");
  }, 60_000);
});

describe("úklid vývojářských položek", () => {
  it("v přehledu kampaně není Zkušebna v liště, otisk sestavení není vidět a testovací odemykání je jen na vyžádání", async () => {
    await stranka.goto(adresa);
    await stranka.locator("#obrazovka-prehled").waitFor();
    expect(await stranka.locator('#obrazovka-prehled .lista a[href="/zkusebna.html"]').count()).toBe(0);
    expect(await stranka.locator('.prehled__verze a[href="/zkusebna.html"]').innerText()).toBe("Zkušebna výpočtu");
    expect(await udaj("prehled-verze")).toBe(`Mostmistr ${verzeBaliku}`);
    expect(await stranka.locator("#odemknout-vse").isVisible()).toBe(false);
    await stranka.screenshot({ path: `${SLOZKA}/p6-prehled.png` });
    await stranka.goto(`${adresa}?vyvoj=1`);
    await stranka.locator("#obrazovka-prehled").waitFor();
    expect(await stranka.locator("#odemknout-vse").isVisible()).toBe(true);
  });

  it("popisové pole výkresu ukazuje verzi bez otisku sestavení a počet prutů místo verze fyziky", async () => {
    await otevri("1-01");
    expect(await udaj("verze")).toBe(verzeBaliku);
    expect(await stranka.locator('[data-udaj="verze"]').getAttribute("title")).toMatch(new RegExp(`^${verzeBaliku.replaceAll(".", "\\.")} · ([0-9a-f]{7}|lokalni)$`));
    expect(await stranka.locator('[data-udaj="fyzika"]').isVisible()).toBe(false);
    expect(await udaj("prutu")).toMatch(/^\d+$/);
  });

  it("upozornění o záznamu hraní je v paletě až pod nástroji", async () => {
    const novy = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const okno = await novy.newPage();
    try {
      await okno.goto(`${adresa}?uroven=1-01`);
      await okno.locator(PLATNO).waitFor();
      await okno.locator('#okno-zadani[open] button[value="zavrit"]').click();
      await rozbalPaletu(okno);
      const upozorneni = (await okno.locator('.paleta [data-udaj="zaznam-upozorneni"]').boundingBox())!;
      const nastroje = (await okno.locator('.paleta [data-akce="import"]').boundingBox())!;
      expect(upozorneni.y).toBeGreaterThan(nastroje.y);
      // První, co hráč v paletě vidí, je zadání, ne oznámení.
      const zadani = (await okno.locator('.paleta [data-akce="zadani"]').boundingBox())!;
      expect(zadani.y).toBeLessThan(120);
    } finally {
      await novy.close();
    }
  });
});

describe("pád mostu na telefonu", () => {
  it("pruh výsledku, razítko a popisek záběru se vejdou, vypínač záběru je po ruce a analýza není pod pruhem", async () => {
    const telefon = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const s = await telefon.newPage();
    const chybyTelefonu: string[] = [];
    s.on("pageerror", (chyba) => chybyTelefonu.push(chyba.message));
    try {
      await s.goto(`${adresa}?uroven=1-01`);
      await s.locator(PLATNO).waitFor();
      await s.locator('#okno-zadani[open] button[value="zavrit"]').tap();
      await rozbalPaletu(s);
      await s.evaluate((text) => {
        (document.querySelector('[data-akce="import"]') as HTMLElement).click();
        (document.querySelector("#okno-obsah") as HTMLTextAreaElement).value = text;
        (document.querySelector('[data-akce="okno-nacist"]') as HTMLElement).click();
      }, pad("1-01", 1));
      await s.locator('[data-akce="zkouska"]').first().tap();
      await s.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
      await s.waitForTimeout(700);
      await s.screenshot({ path: `${SLOZKA}/p7a-telefon-zaber.png` });
      await s.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 150_000 });
      await s.locator('[data-akce="na-konec"]').tap();
      await s.locator(".vysledek").waitFor({ state: "visible" });
      expect(await s.locator('[data-akce="zaber"]').isVisible()).toBe(true);
      const sirka = await s.evaluate(() => document.documentElement.scrollWidth);
      expect(sirka).toBeLessThanOrEqual(390);
      const pruh = (await s.locator(".vysledek").boundingBox())!;
      expect(pruh.x).toBeGreaterThanOrEqual(0);
      expect(pruh.x + pruh.width).toBeLessThanOrEqual(390);
      // Pruh nesmí sebrat víc než třetinu výšky výkresu.
      const platno = (await s.locator(PLATNO).boundingBox())!;
      expect(pruh.height).toBeLessThan(platno.height / 3);
      // Razítko dopadá s animací (zmenšuje se z většího): měří se, až dosedne.
      await s.waitForTimeout(600);
      const razitko = (await s.locator('[data-udaj="verdikt"]').boundingBox())!;
      expect(razitko.x).toBeGreaterThanOrEqual(0);
      expect(razitko.x + razitko.width).toBeLessThanOrEqual(390);
      await s.screenshot({ path: `${SLOZKA}/p7-telefon.png` });
      // Analytický panel začíná až pod pruhem výsledku.
      await s.locator('[data-akce="analyza"]').tap();
      const analyza = (await s.locator('[data-udaj="analyza"]').boundingBox())!;
      const pruhPotom = (await s.locator(".vysledek__pruh").boundingBox())!;
      expect(analyza.y).toBeGreaterThanOrEqual(pruhPotom.y + pruhPotom.height);
      expect(chybyTelefonu).toEqual([]);
    } finally {
      await telefon.close();
    }
  }, 240_000);
});

describe("nálezy recenze hraní M17", () => {
  /** Text údaje i ze sbalené části výsledku, s obyčejnými mezerami. */
  const celyText = async (jmeno: string): Promise<string> =>
    ((await stranka.locator(`[data-udaj="${jmeno}"]`).textContent()) ?? "").replace(/[\u00a0\u202f]/g, " ");

  it("4-03: most s nedopnutými lany neslyší o kotevním laně ani o naklonění pylonu, ale že má nejdřív dopnout; po dopnutí projde", async () => {
    await otevri("4-03");
    await nactiMost(pad("4-03", 4));
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    const prvni = await celyText("vysledek-prvni");
    expect(prvni).toMatch(/^Jako první povolil prut \d+ \(pilíř\)/);
    expect(prvni).toContain("nejdřív je dopni");
    expect(prvni).not.toContain("kotevní");
    expect(prvni).not.toContain("nakloň");
    await akce("upravit").click();
    await akce("dopnout").click();
    await stranka.locator('body[data-dopnuti="hotovo"]').waitFor({ timeout: 60_000 });
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    // Pohodlí v autobusu se tady nehodnotí: řádek nesmí vedle medaile říkat „nepřijatelné“.
    const autobus = await celyText("vysledek-autobus");
    expect(autobus).toContain("tady se nehodnotí");
    expect(autobus).not.toMatch(/nepřijateln|komfort/);
  }, 400_000);

  it("6-03: pilíř ohnutý brzděním dostane radu, kterou úroveň dovoluje (vzpěra, svar), ne „silnější prvek“", async () => {
    await otevri("6-03");
    await nactiMost(pad("6-03", 3));
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    const prvni = await celyText("vysledek-prvni");
    expect(prvni).toContain("(pilíř)");
    expect(prvni).toContain("šikmou vzpěru");
    expect(prvni).toContain("svař jeho hlavu s mostovkou");
    expect(prvni).not.toContain("silnější");
    expect(prvni).not.toContain("Podepři ho uprostřed");
  }, 400_000);

  it("1-01: výsledek u nezískaných medailí řekne proč, s čísly", async () => {
    await otevri("1-01");
    await nactiMost(navrhNaText(RESENI["1-01"]!.rozpocet));
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    const radky = stranka.locator('[data-udaj="vysledek-medaile"] li');
    expect(await radky.evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-ziskana")))).toEqual(["true", "true", "false"]);
    const proc = ((await radky.nth(2).getAttribute("data-proc")) ?? "").replace(/\u00a0/g, " ");
    expect(proc).toMatch(/^využití \d+ %, smí nejvýš 30 %$/);
    expect(await radky.nth(2).locator(".medaile__proc").textContent()).toBe(`Proč ne: ${await radky.nth(2).getAttribute("data-proc")}.`);
    expect(await radky.nth(0).getAttribute("data-proc")).toBeNull();
  }, 300_000);

  it("1-02: na konci přehrávání ukazují čísla a barvy prutů obálku celé zkoušky a legenda to říká", async () => {
    await otevri("1-02");
    await nactiMost(navrhNaText(RESENI["1-02"]!.mistrovska));
    await pust();
    // Během děje okamžité využití.
    await stranka.locator('body[data-vyuziti-ukazuje="ted"]').waitFor({ timeout: 30_000 });
    expect(await udaj("legenda-vyuziti")).toBe("Využití teď");
    await dopocitej();
    await naKonec();
    await stranka.locator('body[data-vyuziti-ukazuje="obalka"]').waitFor({ timeout: 10_000 });
    expect(await udaj("legenda-vyuziti")).toBe("Využití za celou zkoušku");
    await stranka.screenshot({ path: `${SLOZKA}/p8-obalka-na-konci.png` });
    // Krok zpět: zase okamžité využití.
    await akce("krok-zpet").click();
    await stranka.locator('body[data-vyuziti-ukazuje="ted"]').waitFor({ timeout: 10_000 });
    await akce("upravit").click();
    await expect.poll(() => telo("vyuziti-ukazuje")).toBeNull();
    expect(await udaj("legenda-vyuziti")).toBe("Využití");
  }, 300_000);

  it("1-03: rozbalené podrobnosti zaberou nejvýš polovinu výkresu, věta v pruhu není useknutá a označený prut zůstane vidět", async () => {
    await otevri("1-03");
    await nactiMost(pad("1-03", 2));
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    const veta = stranka.locator('[data-udaj="vysledek-veta"]');
    expect(await veta.evaluate((u) => u.scrollHeight <= u.clientHeight + 1)).toBe(true);
    await akce("vysledek-sbalit").click();
    const platno = (await stranka.locator(PLATNO).boundingBox())!;
    const panel = (await stranka.locator(".vysledek").boundingBox())!;
    expect(panel.y + panel.height - platno.y).toBeLessThanOrEqual(0.55 * platno.height);
    // Prut, o kterém pruh mluví, leží pod panelem, ne za ním.
    const misto = await telo("oznaceny-misto");
    expect(misto).toBeTruthy();
    const [, y] = misto!.split(";").map(Number) as [number, number];
    const naStrance = await vyskaNaStrance(y);
    expect(naStrance).toBeGreaterThan(panel.y + panel.height);
    expect(naStrance).toBeLessThan(platno.y + platno.height);
    await stranka.screenshot({ path: `${SLOZKA}/p9-podrobnosti-polovina.png` });
  }, 300_000);
});

describe("stránka", () => {
  it("za celý průchod nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
