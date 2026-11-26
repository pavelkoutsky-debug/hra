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
import type { DavkaDeniku, UdalostDeniku } from "../../src/denik/udalosti";
import { prijmiDenik, prijmiVazbu, type ProstrediServeru } from "../../src/server/obsluha";
import { SkladVPameti } from "../../src/server/sklad";
import { RESENI } from "../../urovne/reseni";

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
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
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
    await otevriUroven(s, "1-01");
    await s.waitForTimeout(200);
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    expect(await bublina.isVisible()).toBe(false);
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
    await s.locator('[data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-02"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();
    await s.waitForTimeout(200);
    expect(await telo(s, "vyzva-zkousky")).toBeNull();
    await kontext.close();
  }, 180_000);
});
