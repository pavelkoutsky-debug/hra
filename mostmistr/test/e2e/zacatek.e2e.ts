// Začátek hry v bezhlavém prohlížeči: krok nahoře v přehledu pro nového a vracejícího se hráče
// (počítač, telefon, angličtina), zvýrazněné tlačítko Zkouška po dokončení mostovky v 1-01
// a co o tom ví deník (první akce, odkaz z přehledu, kód příčiny v `zkouska.konec`). Deník
// jde do skutečné obsluhy serveru zapojené do náhledového serveru, jako v `denik.e2e.ts`.
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { zakodujMost } from "../../src/data/sdileni";
import type { DavkaDeniku, UdalostDeniku } from "../../src/denik/udalosti";
import { prijmiDenik, prijmiVazbu, type ProstrediServeru } from "../../src/server/obsluha";
import { SkladVPameti } from "../../src/server/sklad";
import { RESENI } from "../../urovne/reseni";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];
const sklad = new SkladVPameti();
let cislo = 0;
const prostredi: ProstrediServeru = {
  sklad,
  ted: () => new Date(),
  nahoda: () => (++cislo).toString(16).padStart(6, "0"),
  prostredi: "test",
  hesloSpravce: "tajne-heslo-spravce-123",
  adresa: () => "203.0.113.7",
};

function napoj(cesta: string, obsluha: (zadost: Request, p: ProstrediServeru) => Promise<Response>): void {
  const vyrid = (zadost: IncomingMessage, odpoved: ServerResponse): void => {
    const casti: Buffer[] = [];
    zadost.on("data", (cast: Buffer) => casti.push(cast));
    zadost.on("end", () => {
      const hlavicky = new Headers();
      for (const [jmeno, hodnota] of Object.entries(zadost.headers)) if (typeof hodnota === "string") hlavicky.set(jmeno, hodnota);
      const predana = new Request(new URL(cesta, adresa), { method: "POST", headers: hlavicky, body: Buffer.concat(casti).toString("utf8") });
      void obsluha(predana, prostredi).then(async (vysledek) => {
        odpoved.statusCode = vysledek.status;
        vysledek.headers.forEach((hodnota, jmeno) => odpoved.setHeader(jmeno, hodnota));
        odpoved.end(await vysledek.text());
      });
    });
  };
  server.middlewares.stack.unshift({ route: cesta, handle: vyrid });
}

/** Události, které server přijal od hráče se zadaným číslem, v pořadí. */
async function udalostiHrace(hrac: string): Promise<UdalostDeniku[]> {
  const davky = (await Promise.all((await sklad.klice("denik/")).map((k) => sklad.cti(k)))) as DavkaDeniku[];
  return davky
    .filter((d) => d.hlavicka.hrac === hrac)
    .sort((a, b) => a.hlavicka.zacatek - b.hlavicka.zacatek || a.poradi - b.poradi)
    .flatMap((d) => d.udalosti);
}

async function pockejNa(hrac: string, druh: string, podminka: (u: UdalostDeniku) => boolean = () => true): Promise<UdalostDeniku> {
  await expect.poll(async () => (await udalostiHrace(hrac)).some((u) => u.druh === druh && podminka(u)), { timeout: 30_000 }).toBe(true);
  return (await udalostiHrace(hrac)).filter((u) => u.druh === druh && podminka(u)).at(-1)!;
}

const cisloHrace = (s: Page): Promise<string> => s.evaluate(() => window.localStorage.getItem("mostmistr.hrac") ?? "");
const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);
const start = (s: Page) => s.locator('[data-akce="prehled-start"]');

async function novyKontext(volby: Parameters<Browser["newContext"]>[0] = {}): Promise<{ kontext: BrowserContext; s: Page }> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...volby });
  const s = await kontext.newPage();
  s.on("pageerror", (chyba) => chyby.push(chyba.message));
  s.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  return { kontext, s };
}

async function otevriUroven(s: Page, id: string): Promise<void> {
  await s.goto(`${adresa}?uroven=${id}`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await zavrit.count()) > 0) await zavrit.click();
}

async function bodSveta(s: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return s.evaluate(
    ([sx, sy, volic]) => {
      const platno = document.querySelector<HTMLCanvasElement>(volic as string)!;
      const [kx, ky, m] = platno.dataset.kamera!.split(";").map(Number) as [number, number, number];
      const o = platno.getBoundingClientRect();
      return { x: o.left + o.width / 2 + ((sx as number) - kx) * m, y: o.top + o.height / 2 - ((sy as number) - ky) * m };
    },
    [x, y, PLATNO] as const,
  );
}

async function tahni(s: Page, od: [number, number], po: [number, number]): Promise<void> {
  const a = await bodSveta(s, ...od);
  const b = await bodSveta(s, ...po);
  await s.mouse.move(a.x, a.y);
  await s.mouse.down();
  await s.mouse.move(b.x, b.y, { steps: 4 });
  await s.mouse.up();
}

async function pustADopocitej(s: Page): Promise<void> {
  await s.locator(PLATNO).focus();
  await s.keyboard.press("Space");
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 120_000 });
  expect(await telo(s, "zkouska")).toBe("hotovo");
}

/** Nic na stránce není širší než okno. */
async function nepretika(s: Page): Promise<void> {
  expect(await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4221, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  napoj("/api/denik", prijmiDenik);
  napoj("/api/vazba", prijmiVazbu);
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
  expect(chyby).toEqual([]);
});

describe("krok nahoře v přehledu", () => {
  it("nový hráč na počítači: jeden výrazný krok rovnou do 1-01; deník ví, že na něj klikl", async () => {
    const { kontext, s } = await novyKontext();
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    expect(await start(s).isVisible()).toBe(true);
    expect(await start(s).innerText()).toBe("Postavit první most ▸");
    expect(await start(s).getAttribute("data-stav")).toBe("zacit");
    expect(await start(s).getAttribute("href")).toBe("?uroven=1-01");
    // Krok je nad postupem a kapitolami: první, co hráč uvidí.
    const krok = (await start(s).boundingBox())!;
    const kapitoly = (await s.locator("#obrazovka-prehled .prehled__kapitoly").boundingBox())!;
    expect(krok.y + krok.height).toBeLessThan(kapitoly.y);
    await s.screenshot({ path: `${SLOZKA}/zacatek-novy.png` });
    const hrac = await cisloHrace(s);
    await start(s).click();
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "rezim")).toBe("stavba");
    const odkaz = await pockejNa(hrac, "prehled.odkaz");
    expect(odkaz.data).toEqual({ kam: "zacit" });
    // Klik byl první akcí na přehledu.
    expect((await pockejNa(hrac, "stranka.akce")).data).toMatchObject({ jak: "mys" });
    expect((await udalostiHrace(hrac)).find((u) => u.druh === "sezeni.start")!.data).toEqual({ navrat: false, akce: true });
    await kontext.close();
  });

  it("nový hráč na telefonu a v angličtině: krok se vejde a ostatní odkazy přehledu zůstávají", async () => {
    const { kontext, s } = await novyKontext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    const krok = (await start(s).boundingBox())!;
    expect(krok.x).toBeGreaterThanOrEqual(0);
    expect(krok.x + krok.width).toBeLessThanOrEqual(390);
    expect(krok.height).toBeGreaterThanOrEqual(44);
    expect(krok.y + krok.height).toBeLessThan(844);
    await nepretika(s);
    await s.screenshot({ path: `${SLOZKA}/zacatek-novy-telefon.png` });
    await s.goto(`${adresa}?jazyk=en`);
    await s.locator(".karta").first().waitFor();
    expect(await start(s).innerText()).toBe("Build your first bridge ▸");
    await nepretika(s);
    await s.screenshot({ path: `${SLOZKA}/zacatek-novy-telefon-en.png` });
    // Ostatní vstupy fungují dál.
    for (const [cesta, rezim] of [["?sandbox=1", "stavba"], ["?list", "list"], ["?uroven=1-02", "stavba"]] as const) {
      await s.goto(`${adresa}${cesta}`);
      await expect.poll(() => telo(s, "rezim")).toBe(rezim);
    }
    await s.goto(`${adresa}?soukromi`);
    await s.locator("#okno-soukromi[open]").waitFor();
    expect(await start(s).isVisible()).toBe(true);
    await kontext.close();
  });

  it("vracející se hráč pokračuje rozestavěnou úrovní, po průchodu další neprojitou", async () => {
    const { kontext, s } = await novyKontext();
    await otevriUroven(s, "1-01");
    await tahni(s, [0, 0], [4, 0]);
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    expect(await start(s).getAttribute("data-stav")).toBe("pokracovat");
    expect((await start(s).innerText()).replace(/[  ]/g, " ")).toBe("Pokračovat: 1-01 Lávka přes potok ▸");
    // Projitá 1-01: pokračuje se v 1-02.
    await otevriUroven(s, "1-01");
    await rozbalPaletu(s);
    await s.locator('[data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();
    await pustADopocitej(s);
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    expect(await start(s).getAttribute("data-cil")).toBe("1-02");
    expect(await start(s).innerText()).toMatch(/^Pokračovat: 1-02 /);
    await s.screenshot({ path: `${SLOZKA}/zacatek-pokracovat.png` });
    await s.setViewportSize({ width: 390, height: 844 });
    await nepretika(s);
    await s.screenshot({ path: `${SLOZKA}/zacatek-pokracovat-telefon.png` });
    await kontext.close();
  }, 180_000);
});

describe("zvýrazněná zkouška v první úrovni", () => {
  it("po dokončení mostovky se tlačítko Zkouška zvýrazní, po první zkoušce už nikdy", async () => {
    const { kontext, s } = await novyKontext();
    await otevriUroven(s, "1-01");
    const tlacitko = s.locator('[data-akce="zkouska"]');
    const bublina = s.locator('[data-udaj="vyzva-zkousky"]');
    const radaStavby = s.locator('[data-udaj="rada-stavby"]');
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    // Dokud vede průvodce (duch dalšího dílu mostovky), řádek klávesových rad pod výkresem mlčí.
    expect(await telo(s, "vedeni")).not.toBeNull();
    expect(await radaStavby.isVisible()).toBe(false);
    // Zkouška s mezerou v mostovce zvýraznění nemá a deník dostane kód příčiny.
    await tahni(s, [0, 0], [4, 0]);
    await s.waitForTimeout(200);
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    expect(await bublina.isVisible()).toBe(false);
    await tahni(s, [4, 0], [8, 0]);
    await expect.poll(() => telo(s, "vyzva-zkousky")).toBe("ano");
    expect(await tlacitko.getAttribute("class")).toContain("tlacitko--vyzva");
    expect(await bublina.isVisible()).toBe(true);
    expect(await bublina.innerText()).toContain("Teď most vyzkoušej");
    // Ani bublina u tlačítka Zkouška nemá vedle sebe řádek klávesových rad.
    expect(await radaStavby.isVisible()).toBe(false);
    // Bublina je pod tlačítkem a míří na něj.
    const t = (await tlacitko.boundingBox())!;
    const b = (await bublina.boundingBox())!;
    expect(b.y).toBeGreaterThan(t.y + t.height);
    expect(b.x).toBeLessThan(t.x + t.width);
    expect(b.x + b.width).toBeGreaterThan(t.x);
    expect(await tlacitko.evaluate((e) => getComputedStyle(e).animationName)).toBe("vyzva-zkousky");
    await s.screenshot({ path: `${SLOZKA}/zacatek-vyzva-zkousky.png` });
    // Omezený pohyb: zvýraznění bez animace.
    await s.emulateMedia({ reducedMotion: "reduce" });
    expect(await tlacitko.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    expect(await tlacitko.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
    await s.emulateMedia({ reducedMotion: "no-preference" });
    // Telefon: bublina se vejde do okna.
    await s.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => ((await bublina.boundingBox())?.x ?? -1) >= 0).toBe(true);
    const bt = (await bublina.boundingBox())!;
    expect(bt.x + bt.width).toBeLessThanOrEqual(390);
    await nepretika(s);
    await s.screenshot({ path: `${SLOZKA}/zacatek-vyzva-zkousky-telefon.png` });
    await s.setViewportSize({ width: 1280, height: 720 });

    // Jakmile je mostovka hotová, má hráč v ruce levnější Lehký trám: z mostovky (první v paletě)
    // jinak nováčci stavěli i podpěry a zkouška se kvůli rozpočtu nepustila.
    const mostovka = s.locator('.paleta [data-prvek="mostovka-drevo"]');
    const lehky = s.locator('.paleta [data-prvek="drevo-lehke"]');
    expect(await telo(s, "prvek-prepnut")).toBe("drevo-lehke");
    expect(await lehky.getAttribute("aria-pressed")).toBe("true");
    expect(await mostovka.getAttribute("aria-pressed")).toBe("false");
    // Most, který zkouška odmítne (kdo si mostovku vybere znovu, postaví z ní trojúhelníky
    // a přetáhne rozpočet), ke zkoušce nevybízí: bublina by zakryla hlášení a radila opak.
    await mostovka.click();
    for (const [a, b] of [[[0, 0], [2, 3]], [[2, 3], [4, 0]], [[4, 0], [6, 3]], [[6, 3], [8, 0]]] as [[number, number], [number, number]][]) await tahni(s, a, b);
    await expect.poll(() => telo(s, "pruty")).toBe("6");
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    expect(await bublina.isVisible()).toBe(false);
    await tlacitko.click();
    expect(await telo(s, "rezim")).toBe("stavba");
    // Hlášení říká, o kolik je most dražší a kde ušetřit (4 díly mostovky po 3,61 m navíc).
    expect((await s.locator('[data-udaj="hlaseni"]').innerText()).replace(/[\u202f\u00a0]/g, " ")).toBe(
      "Most je o 11 056 Kč dražší než rozpočet. Před zkouškou ho zlevni. Mostovka je dražší než „Lehký trám“ a patří jen na cestu: pruty z ní mimo cestu vyber a zvol v paletě „Lehký trám“.",
    );
    for (let i = 0; i < 4; i++) await s.locator('[data-akce="zpet"]').click();
    await expect.poll(() => telo(s, "pruty")).toBe("2");
    await expect.poll(() => telo(s, "vyzva-zkousky")).toBe("ano");
    // Krok Zpět a Znovu přes dokončení mostovky prvek v ruce nepřepíná podruhé.
    expect(await mostovka.getAttribute("aria-pressed")).toBe("true");
    await lehky.click();

    const hrac = await cisloHrace(s);
    await pustADopocitej(s);
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    expect(await tlacitko.getAttribute("class")).not.toContain("tlacitko--vyzva");
    // Holá mostovka v 1-01 neprojde: deník nese kód příčiny ze stejného pořadí jako pruh výsledku.
    const konec = await pockejNa(hrac, "zkouska.konec");
    expect(konec.data!.pruchod).toBe(false);
    expect(konec.data!.pricina).toBe(await telo(s, "kod-priciny"));
    expect(["poruseni", "slozeni", "spadl", "pruhyb", "kmitani"]).toContain(konec.data!.pricina);
    // Zpátky ke stavbě a po načtení stránky se zvýraznění nevrátí.
    await s.locator('[data-akce="na-konec"]').click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    await s.locator('[data-akce="upravit"]').click();
    await s.waitForTimeout(200);
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    // Průvodce skončil: řádek rad je zpátky.
    expect(await radaStavby.isVisible()).toBe(true);
    // Po první zkoušce, která neprošla, hra řekne, co dál a čím: mostovku podepřít lehkým trámem.
    expect(await s.locator('[data-udaj="hlaseni"]').innerText()).toBe(
      "Mostovka sama neunese ani sebe: její styčníky mezi podporami musí něco držet, třeba trojúhelník z prutů nad ní. V ruce máš prvek „Lehký trám“, je levnější než mostovka; ta patří jen na cestu.",
    );
    await s.screenshot({ path: `${SLOZKA}/zacatek-podepri.png` });
    await otevriUroven(s, "1-01");
    await s.waitForTimeout(200);
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    expect(await bublina.isVisible()).toBe(false);
    // Hráč, který se vrací k mostu s hotovou mostovkou, má levnější prut v ruce hned po otevření.
    // Když si mostovku vybere sám, hra mu ji z ruky nebere (žádné přepnutí při další akci).
    expect(await telo(s, "prvek-prepnut")).toBe("drevo-lehke");
    expect(await lehky.getAttribute("aria-pressed")).toBe("true");
    await mostovka.click();
    expect(await mostovka.getAttribute("aria-pressed")).toBe("true");
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Escape");
    await tahni(s, [0, 0], [2, 3]);
    await expect.poll(() => telo(s, "pruty")).toBe("3");
    expect(await mostovka.getAttribute("aria-pressed")).toBe("true");
    await kontext.close();
  }, 180_000);

  it("polovina mostovky se složí: kód „slozeni“ má přednost před mezerou jako v pruhu; jiná úroveň zvýraznění nemá", async () => {
    const { kontext, s } = await novyKontext();
    await otevriUroven(s, "1-01");
    const hrac = await cisloHrace(s);
    await tahni(s, [0, 0], [4, 0]);
    await pustADopocitej(s);
    // Konzola od břehu se složí vlastní vahou; pruh výsledku mluví o složení, ne o mezeře.
    expect(await telo(s, "kod-priciny")).toBe("slozeni");
    await s.locator('[data-akce="na-konec"]').click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    expect(await telo(s, "pricina")).toMatch(/slož/i);
    expect((await pockejNa(hrac, "zkouska.konec")).data).toMatchObject({ pruchod: false, pricina: "slozeni", mezera: true });
    await otevriUroven(s, "1-02");
    await rozbalPaletu(s);
    await s.locator('[data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-02"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();
    await s.waitForTimeout(200);
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    await kontext.close();
  }, 180_000);
});

describe("paleta první kapitoly", () => {
  /** Nástroje a části palety, které jsou v první kapitole pod „Více“. */
  const VEDLEJSI = ['[data-akce="zrcadlit"]', '[data-akce="smazat-vse"]', '[data-akce="zlom"]', '[data-akce="export"]', '[data-akce="import"]',
    '[data-akce="sdilet"]', '[data-akce="zebricek"]', '[data-udaj="zadani"]', '[data-akce="zadani-cele"]', '[data-akce="pojmy"]', '[data-udaj="podminky"]'];
  const ZAKLAD = ['[data-akce="zadani"]', '[data-akce="napoveda"]', '[data-akce="vyber"]', '[data-akce="smazat"]', '[data-akce="zpet"]', '[data-akce="znovu"]',
    '[data-prvek="mostovka-drevo"]', '[data-prvek="drevo-lehke"]'];
  const vPalete = (s: Page, volic: string) => s.locator(`#obrazovka-uroven .paleta ${volic}`);
  const vice = (s: Page) => s.locator('#obrazovka-uroven [data-akce="paleta-vice"]');

  it("1-01 ukazuje základ, Více zbytek a pamatuje si to i v 1-02 a po načtení; 2-01 má paletu celou; zkratky jdou i se zavřeným Více", async () => {
    const { kontext, s } = await novyKontext();
    await otevriUroven(s, "1-01");
    expect(await vice(s).isVisible()).toBe(true);
    expect(await vice(s).getAttribute("aria-expanded")).toBe("false");
    for (const volic of ZAKLAD) expect(await vPalete(s, volic).isVisible(), volic).toBe(true);
    for (const volic of VEDLEJSI) expect(await vPalete(s, volic).isVisible(), volic).toBe(false);
    // Na prázdné 1-01 je na obrazovce úrovně nejvýš 16 tlačítek a odkazů (bez upozornění na záznam hraní).
    const tlacitek = await s.evaluate(
      () =>
        [...document.querySelectorAll("#obrazovka-uroven button, #obrazovka-uroven a")].filter((e) => {
          const o = e.getBoundingClientRect();
          return o.width > 0 && o.height > 0 && e.closest('[data-udaj="zaznam-upozorneni"]') === null;
        }).length,
    );
    expect(tlacitek).toBeLessThanOrEqual(16);
    await s.screenshot({ path: `${SLOZKA}/paleta-1-01-zavreno.png` });

    // Zkratky schovaných nástrojů fungují i se zavřeným „Více“: D pustí zkoušku do zlomu
    // (bez mostovky jen poradí, co chybí).
    await s.locator(PLATNO).focus();
    await s.keyboard.press("d");
    await expect.poll(() => s.locator('[data-udaj="hlaseni"]').innerText()).toContain("Zkouška do zlomu zatěžuje mostovku");
    expect(await vice(s).getAttribute("aria-expanded")).toBe("false");

    const hrac = await cisloHrace(s);
    await vice(s).click();
    expect(await vice(s).getAttribute("aria-expanded")).toBe("true");
    for (const volic of VEDLEJSI) expect(await vPalete(s, volic).isVisible(), volic).toBe(true);
    // Zrcadlit a Vše pryč jsou pod „Více“, ne mezi základními nástroji nad prvky.
    const tlacitkoVice = (await vice(s).boundingBox())!;
    expect((await vPalete(s, '[data-akce="zrcadlit"]').boundingBox())!.y).toBeGreaterThan(tlacitkoVice.y);
    expect((await vPalete(s, '[data-akce="smazat-vse"]').boundingBox())!.y).toBeGreaterThan(tlacitkoVice.y);
    expect((await pockejNa(hrac, "paleta.vice")).data).toEqual({ otevreno: true });
    await s.screenshot({ path: `${SLOZKA}/paleta-1-01-otevreno.png` });

    // Rozbalené „Více“ přežije přechod do další úrovně kapitoly i načtení stránky.
    await otevriUroven(s, "1-02");
    expect(await vice(s).getAttribute("aria-expanded")).toBe("true");
    expect(await vPalete(s, '[data-akce="import"]').isVisible()).toBe(true);
    await s.reload();
    await s.locator(PLATNO).waitFor();
    await s.locator('#okno-zadani[open] button[value="zavrit"]').click();
    expect(await vice(s).getAttribute("aria-expanded")).toBe("true");
    expect(await vPalete(s, '[data-akce="zrcadlit"]').isVisible()).toBe(true);

    // Sbalit: Zkratka M zrcadlí most i se zavřeným „Více“ (krok jde vzít zpět).
    await vPalete(s, '[data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-02"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();
    await vice(s).click();
    expect(await vice(s).getAttribute("aria-expanded")).toBe("false");
    expect((await pockejNa(hrac, "paleta.vice", (u) => u.data?.otevreno === false)).data).toEqual({ otevreno: false });
    expect(await vPalete(s, '[data-akce="zrcadlit"]').isVisible()).toBe(false);
    const pred = await s.evaluate(() => localStorage.getItem("mostmistr.ulozeni"));
    await s.locator(PLATNO).focus();
    await s.keyboard.press("m");
    await expect.poll(() => s.evaluate(() => localStorage.getItem("mostmistr.ulozeni"))).not.toBe(pred);
    expect(await vice(s).getAttribute("aria-expanded")).toBe("false");

    // Od druhé kapitoly tlačítko „Více“ není a paleta je celá, i když si ho hráč v první kapitole zavřel.
    await otevriUroven(s, "2-01");
    expect(await vice(s).isVisible()).toBe(false);
    for (const volic of ['[data-akce="zrcadlit"]', '[data-akce="smazat-vse"]', '[data-akce="zlom"]', '[data-akce="export"]', '[data-akce="import"]', '[data-akce="sdilet"]', '[data-akce="pojmy"]'])
      expect(await vPalete(s, volic).isVisible(), volic).toBe(true);
    // Zrcadlit stojí mezi nástroji za Výběrem jako dřív.
    expect(await s.locator('#obrazovka-uroven .paleta__nastroje [data-akce="vyber"] + [data-akce="zrcadlit"]').count()).toBe(1);
    await s.screenshot({ path: `${SLOZKA}/paleta-2-01.png` });
    await kontext.close();
  }, 180_000);

  it("pískoviště a cizí most z odkazu mají paletu celou", async () => {
    const { kontext, s } = await novyKontext();
    await s.goto(`${adresa}?sandbox`);
    await s.locator(PLATNO).waitFor();
    expect(await vice(s).isVisible()).toBe(false);
    expect(await vPalete(s, '[data-akce="import"]').isVisible()).toBe(true);
    // Host z odkazu dostává věty o Sdílení: paleta je celá i v 1-01.
    await s.goto(`${adresa}?most=${zakodujMost(RESENI["1-01"]!.pruchod)}&uroven=1-01`);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ano");
    expect(await vice(s).isVisible()).toBe(false);
    expect(await vPalete(s, '[data-akce="sdilet"]').isVisible()).toBe(true);
    expect(await vPalete(s, '[data-akce="zrcadlit"]').isVisible()).toBe(true);
    await kontext.close();
  }, 120_000);

  it("telefon: v 1-01 jsou prvky nahoře v paletě a nic nepřetéká, se zavřeným i otevřeným Více", async () => {
    const { kontext, s } = await novyKontext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await s.goto(`${adresa}?uroven=1-01`);
    await s.locator(PLATNO).waitFor();
    await s.locator('#okno-zadani[open] button[value="zavrit"]').tap();
    const mostovka = (await vPalete(s, '[data-prvek="mostovka-drevo"]').boundingBox())!;
    const zadani = (await vPalete(s, '[data-akce="zadani"]').boundingBox())!;
    // Prvky jsou nad Zadáním i nástroji a na obrazovce bez posouvání palety.
    expect(mostovka.y).toBeLessThan(zadani.y);
    expect(mostovka.y + mostovka.height).toBeLessThanOrEqual(844);
    expect((await vPalete(s, '[data-prvek="drevo-lehke"]').boundingBox())!.y + 44).toBeLessThanOrEqual(844);
    await nepretika(s);
    const platno = (await s.locator(PLATNO).boundingBox())!;
    expect(platno.height).toBeGreaterThanOrEqual(844 / 3);
    await s.screenshot({ path: `${SLOZKA}/paleta-1-01-telefon.png` });
    await vice(s).tap();
    expect(await vice(s).getAttribute("aria-expanded")).toBe("true");
    await vPalete(s, '[data-akce="import"]').scrollIntoViewIfNeeded();
    expect(await vPalete(s, '[data-akce="import"]').isVisible()).toBe(true);
    await nepretika(s);
    expect((await s.locator(PLATNO).boundingBox())!.height).toBeCloseTo(platno.height, 0);
    await s.screenshot({ path: `${SLOZKA}/paleta-1-01-telefon-vice.png` });
    await kontext.close();
  }, 120_000);
});
