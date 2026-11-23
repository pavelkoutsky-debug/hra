// Pád mostu a výsledek zkoušky v bezhlavém prohlížeči: zpomalený záběr na první porušení,
// kontrola stability už při stavbě, pruh výsledku s razítkem a úklid vývojářských položek.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";

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
  it("když prut povolí, přehrávání se zpomalí, pohled najede na to místo a pak se vrátí", async () => {
    await otevri("1-03");
    await nactiMost(pad("1-03", 1));
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("true");
    const domov = await pohled();
    await pust();
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    // V záběru: pohled je blíž a hlášení říká, co povolilo.
    await expect.poll(async () => (await pohled()).meritko, { timeout: 5000 }).toBeGreaterThan(domov.meritko * 1.3);
    expect(await udaj("hlaseni")).toMatch(/^Jako první selhal prut \d+ /);
    await stranka.screenshot({ path: `${SLOZKA}/p1-zaber.png` });
    // Čas se v záběru vleče: za půl sekundy skutečného času uběhne jen zlomek děje.
    const cas0 = Number(await stranka.locator("#cas").inputValue());
    await stranka.waitForTimeout(500);
    const cas1 = Number(await stranka.locator("#cas").inputValue());
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
  }, 120_000);

  it("Esc záběr přeskočí a zkouška běží dál; druhé Esc se vrátí ke stavbě", async () => {
    await akce("upravit").waitFor({ state: "attached" });
    await stranka.keyboard.press("Escape");
    expect(await telo("rezim")).toBe("stavba");
    const domov = await pohled();
    await pust();
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    await stranka.keyboard.press("Escape");
    expect(await telo("zaber")).toBe("hotovo");
    expect(await telo("rezim")).toBe("zkouska");
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
    await stranka.keyboard.press("Escape");
    expect(await telo("rezim")).toBe("stavba");
  }, 120_000);

  it("kliknutí do výkresu záběr přeskočí taky a prut nevybere", async () => {
    await pust();
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 60_000 });
    const o = (await stranka.locator(PLATNO).boundingBox())!;
    await stranka.mouse.click(o.x + o.width / 2, o.y + o.height / 2);
    expect(await telo("zaber")).toBe("hotovo");
    expect(await telo("rezim")).toBe("zkouska");
  }, 120_000);

  it("záběr jde vypnout, volba se pamatuje a tlačítko ve výsledku ho přehraje i tak", async () => {
    await akce("zaber").click();
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("false");
    await stranka.reload();
    await stranka.locator(PLATNO).waitFor();
    const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await tlacitko.count()) > 0) await tlacitko.click();
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("false");
    const domov = await pohled();
    await pust();
    await dopocitej();
    // Vypnutý záběr se sám nespustí: pohled se za celou dobu nehne.
    await expect.poll(() => telo("zaber"), { timeout: 5000 }).not.toBe("bezi");
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    // Na vyžádání se přehraje i s vypnutou volbou.
    await akce("prehrat-poruseni").click();
    const okamzik = Number(await telo("zaznam-poruseni"));
    expect(okamzik).toBeGreaterThan(0);
    await stranka.locator('body[data-zaber="bezi"]').waitFor({ timeout: 20_000 });
    await expect.poll(async () => (await pohled()).meritko, { timeout: 5000 }).toBeGreaterThan(domov.meritko * 1.3);
    await akce("zaber").click();
    expect(await akce("zaber").getAttribute("aria-pressed")).toBe("true");
  }, 180_000);

  it("kdo si čas posouvá sám, záběr nedostane", async () => {
    await stranka.keyboard.press("Escape");
    await stranka.keyboard.press("Escape");
    expect(await telo("rezim")).toBe("stavba");
    const domov = await pohled();
    await pust();
    await akce("na-konec").click();
    await dopocitej();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await telo("zaber")).not.toBe("bezi");
    expect((await pohled()).meritko).toBeCloseTo(domov.meritko, 6);
  }, 120_000);
});

describe("most, který se složí vlastní vahou", () => {
  it("už při stavbě hra ukáže, kde a proč se složí", async () => {
    await otevri("1-01");
    expect(await telo("slozeni")).toBeNull();
    await nactiMost(pad("1-01", 1));
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBe("mostovka");
    await stranka.screenshot({ path: `${SLOZKA}/p2-slozeni-stavba.png` });
    // Most, který projde, značku nemá.
    await nactiMost(navrhNaText(RESENI["1-01"]!.pruchod));
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBeNull();
    // Obdélníky bez úhlopříček mají jiný důvod.
    await otevri("2-01");
    await nactiMost(pad("2-01", 1));
    await expect.poll(() => telo("slozeni"), { timeout: 10_000 }).toBe("ztuzeni");
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
    expect(await udaj("vysledek-veta")).toContain("Složil se vlastní vahou: styčník mostovky nic nedrží.");
    const shrnuti = await stranka.locator('[data-udaj="vysledek-shrnuti"]').textContent();
    expect(shrnuti).toContain("Podepři ho vzpěrou od břehu, nebo ho zavěs do trojúhelníku z trámů.");
    expect(shrnuti).not.toContain("klidovou polohu");
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

  it("podrobnosti (čísla, podmínky medailí, hlášení chyby) jsou na rozkliknutí", async () => {
    expect(await stranka.locator('[data-udaj="vysledek-shrnuti"]').isVisible()).toBe(false);
    expect(await akce("diagnostika").isVisible()).toBe(false);
    expect(await akce("vysledek-sbalit").innerText()).toBe("Podrobnosti ▾");
    await akce("vysledek-sbalit").click();
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ne");
    expect(await akce("vysledek-sbalit").getAttribute("aria-expanded")).toBe("true");
    expect(await stranka.locator('[data-udaj="vysledek-shrnuti"]').isVisible()).toBe(true);
    expect(await stranka.locator('[data-udaj="vysledek-medaile"]').isVisible()).toBe(true);
    expect(await akce("diagnostika").innerText()).toBe("Nahlásit chybu");
    // Otisk zkoušky hráči na očích není.
    expect(await stranka.locator('[data-udaj="otisk"]').isVisible()).toBe(false);
    await stranka.screenshot({ path: `${SLOZKA}/p4-podrobnosti.png` });
    // Kdo se vrátí v čase, chce vidět most: podrobnosti se zavřou, pruh zůstane.
    await akce("krok-zpet").click();
    expect(await stranka.locator(".vysledek").getAttribute("data-sbaleno")).toBe("ano");
    expect(await stranka.locator(".vysledek").isVisible()).toBe(true);
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
    expect(await akce("dalsi").isVisible()).toBe(true);
    expect(await akce("upravit").evaluate((u) => u.classList.contains("tlacitko--hlavni"))).toBe(false);
    expect(await udaj("vysledek-veta")).toBe("Přešli a přejeli všichni (3).");
    const pruh = (await stranka.locator(".vysledek").boundingBox())!;
    expect(pruh.y + pruh.height).toBeLessThan(await vyskaNaStrance(0));
    await stranka.screenshot({ path: `${SLOZKA}/p5-schvaleno.png` });
  }, 120_000);

  it("pokus (brnknutí do zlomu) razítko nedostane", async () => {
    await akce("upravit").click();
    await akce("zlom").click();
    await dopocitej();
    await naKonec();
    expect(await stranka.locator('[data-udaj="verdikt"]').isHidden()).toBe(true);
    expect(await stranka.locator('[data-udaj="vysledek-medaile-pruh"]').isHidden()).toBe(true);
  }, 180_000);
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
    await stranka.reload();
    await stranka.locator(PLATNO).waitFor();
    const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await tlacitko.count()) > 0) await tlacitko.click();
    await akce("zlom").click();
    await dopocitej();
    await naKonec();
    const shrnuti = (await stranka.locator('[data-udaj="vysledek-shrnuti"]').textContent()) ?? "";
    expect(shrnuti).toContain("unesl");
    expect(shrnuti).not.toContain("nepočítá");
  }, 180_000);

  it("tah mostovky, který nejde rozdělit na stejné díly, se rozdělí na co nejmíň dílů", async () => {
    await otevri("1-01");
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
  it("v přehledu kampaně není Zkušebna v liště a testovací odemykání je jen na vyžádání", async () => {
    await stranka.goto(adresa);
    await stranka.locator("#obrazovka-prehled").waitFor();
    expect(await stranka.locator('#obrazovka-prehled .lista a[href="/zkusebna.html"]').count()).toBe(0);
    expect(await stranka.locator('.prehled__verze a[href="/zkusebna.html"]').innerText()).toBe("Zkušebna výpočtu");
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
  it("pruh výsledku a razítko se vejdou a vypínač záběru je po ruce", async () => {
    const telefon = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const s = await telefon.newPage();
    const chybyTelefonu: string[] = [];
    s.on("pageerror", (chyba) => chybyTelefonu.push(chyba.message));
    try {
      await s.goto(`${adresa}?uroven=1-01`);
      await s.locator(PLATNO).waitFor();
      await s.locator('#okno-zadani[open] button[value="zavrit"]').tap();
      await s.evaluate((text) => {
        (document.querySelector('[data-akce="import"]') as HTMLElement).click();
        (document.querySelector("#okno-obsah") as HTMLTextAreaElement).value = text;
        (document.querySelector('[data-akce="okno-nacist"]') as HTMLElement).click();
      }, pad("1-01", 1));
      await s.locator('[data-akce="zkouska"]').first().tap();
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
      expect(chybyTelefonu).toEqual([]);
    } finally {
      await telefon.close();
    }
  }, 240_000);
});

describe("stránka", () => {
  it("za celý průchod nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
