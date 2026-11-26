// Posun víc styčníků naráz v bezhlavém prohlížeči: nástroj Výběr a posun myší, šipky na
// klávesnici, prst na telefonu a jednorázová rada po první prošlé zkoušce.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText, navrhZTextu, type NavrhMostu } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const MOST = RESENI["1-03"]!.pruchod;

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];

const udaj = (s: Page, jmeno: string): Promise<string> => s.locator(`[data-udaj="${jmeno}"]`).innerText();
const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);

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

/** Otevře úroveň 1-03 s mostem pro průchod (příhrada s horním pásem ve 3 m). */
async function otevriSMostem(s: Page, klepnout = false): Promise<void> {
  await s.goto(`${adresa}?uroven=1-03&zaznam=vypnout`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if (klepnout) await zavrit.tap();
  else await zavrit.click();
  const importovat = s.locator('#obrazovka-uroven .paleta [data-akce="import"]');
  if (klepnout) await importovat.tap();
  else await importovat.click();
  await s.locator("#okno-obsah").fill(navrhNaText(MOST));
  const nacist = s.locator('[data-akce="okno-nacist"]');
  if (klepnout) await nacist.tap();
  else await nacist.click();
  expect(await telo(s, "pruty")).toBe(String(MOST.pruty.length));
}

/** Most na výkresu (přes Export, jak ho vidí hráč). */
async function mostNaVykresu(s: Page): Promise<NavrhMostu> {
  await s.locator('#obrazovka-uroven .paleta [data-akce="export"]').click();
  const text = await s.locator("#okno-obsah").inputValue();
  await s.locator("#okno button[value=zavrit]").click();
  return navrhZTextu(text);
}

const vyskyHornihoPasu = (navrh: NavrhMostu): number[] =>
  navrh.stycniky
    .filter((st) => st.x === 4 || st.x === 8 || st.x === 12)
    .map((st) => st.y)
    .filter((y) => y !== 0)
    .sort();

/** Myší táhne z bodu světa do bodu světa po krocích. */
async function tahniMysi(s: Page, a: [number, number], b: [number, number]): Promise<void> {
  const pa = await bodSveta(s, ...a);
  const pb = await bodSveta(s, ...b);
  await s.mouse.move(pa.x, pa.y);
  await s.mouse.down();
  for (let krok = 1; krok <= 6; krok++) await s.mouse.move(pa.x + ((pb.x - pa.x) * krok) / 6, pa.y + ((pb.y - pa.y) * krok) / 6);
  await s.mouse.up();
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4220, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("posun víc styčníků naráz", () => {
  let s: Page;

  it("nástroj se jmenuje Výběr a posun; rámeček a tah za vybraný styčník posunou celý výběr a Zpět ho vrátí", async () => {
    s = await prohlizec.newPage({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    s.on("console", (zprava) => {
      if (zprava.type() === "error") chyby.push(zprava.text());
    });
    await otevriSMostem(s);
    // Výchozí řádek rad ukazuje, kde je posun.
    expect(await udaj(s, "rada-stavby")).toContain("V: posun styčníků");
    const tlacitko = s.locator('[data-akce="vyber"]');
    expect(await tlacitko.innerText()).toMatch(/Výběr a posun$/);
    expect(await tlacitko.getAttribute("data-popis")).toBe("paleta.vyber.popis");
    await tlacitko.click();
    expect(await s.locator('[data-udaj="rada-stavby"]').getAttribute("data-rada")).toBe("vyber");
    expect(await udaj(s, "rada-stavby")).toContain("styčníku, šipky: posun");

    // Rámeček přes horní pás: tři styčníky a dva pruty mezi nimi.
    await tahniMysi(s, [2.6, 3.6], [13.4, 2.4]);
    expect(await telo(s, "posun-vyberu")).toBe("3;0");
    expect(await s.locator('[data-udaj="rada-stavby"]').getAttribute("data-rada")).toBe("vyberPosun");
    // Tah za prostřední vybraný styčník o metr dolů.
    await tahniMysi(s, [8, 3], [8, 2]);
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([2, 2, 2]);
    // Výběr zůstal: tah znovu a pak dvakrát Zpět.
    expect(await telo(s, "posun-vyberu")).toBe("3;0");
    await s.screenshot({ path: `${SLOZKA}/posun-tah.png` });
    await s.locator('[data-akce="zpet"]').click();
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([3, 3, 3]);
    // Tah, který by horní pás slil s mostovkou, se neprovede a hra řekne proč.
    await tahniMysi(s, [2.6, 3.6], [13.4, 2.4]);
    await tahniMysi(s, [8, 3], [8, 0]);
    expect(await udaj(s, "hlaseni")).toBe("Na tom místě už styčník je.");
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([3, 3, 3]);
  }, 60_000);

  it("šipky posunou výběr o metr; bez výběru posunou pohled; pravidla platí i pro šipky", async () => {
    await s.locator(PLATNO).focus();
    expect(await telo(s, "posun-vyberu")).toBe("3;0");
    const kamera = await s.locator(PLATNO).getAttribute("data-kamera");
    await s.keyboard.press("ArrowDown");
    expect(await s.locator(PLATNO).getAttribute("data-kamera")).toBe(kamera);
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([2, 2, 2]);
    await s.locator(PLATNO).focus();
    await s.keyboard.press("ArrowUp");
    await s.keyboard.press("ArrowUp");
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([4, 4, 4]);
    // Každá šipka je jeden krok Zpět.
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Control+z");
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([3, 3, 3]);
    // Celý most dolů: kotvy stojí a mostovka by vjela do zakázané zóny.
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Control+a");
    expect(await telo(s, "posun-vyberu")).toBe(`${MOST.stycniky.length - 2};2`);
    await s.keyboard.press("ArrowDown");
    expect(await udaj(s, "hlaseni")).toBe("Zakázanou zónou most vést nesmí.");
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([3, 3, 3]);
    // Bez výběru šipka posouvá pohled jako dřív.
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Escape");
    expect(await telo(s, "posun-vyberu")).toBeNull();
    const pred = await s.locator(PLATNO).getAttribute("data-kamera");
    await s.keyboard.press("ArrowDown");
    expect(await s.locator(PLATNO).getAttribute("data-kamera")).not.toBe(pred);
  }, 60_000);

  it("po první prošlé zkoušce hra jednou řekne, že most jde upravit posunem; podruhé už ne", async () => {
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    // Kdo se vrátí ke stavbě dřív, než výsledek uvidí, ještě neví, že most prošel: rada o posunu
    // mu to neprozradí a nespotřebuje se.
    expect(await s.locator(".vysledek").isVisible()).toBe(false);
    await s.keyboard.press("Space");
    await s.locator('body[data-rezim="stavba"]').waitFor();
    expect(await telo(s, "tip-posunu")).toBeNull();
    expect(await s.locator('[data-akce="vyber"]').getAttribute("data-tip")).toBeNull();
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await s.locator('[data-akce="na-konec"]').click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    expect(await s.locator(".vysledek").getAttribute("data-stav")).toBe("obstal");
    await s.locator('[data-akce="upravit"]').click();
    expect(await udaj(s, "hlaseni")).toContain("Most jde upravit i bez přestavby: Výběr a posun (V)");
    expect(await telo(s, "tip-posunu")).toBe("ukazan");
    expect(await s.locator('[data-akce="vyber"]').getAttribute("data-tip")).toBe("posun");
    // Hlášení most nezakrývá: je nad mostem (horní pás je ve 3 m).
    const hlaseni = (await s.locator('[data-udaj="hlaseni"]').boundingBox())!;
    expect(hlaseni.y + hlaseni.height).toBeLessThan((await bodSveta(s, 8, 3)).y);
    await s.screenshot({ path: `${SLOZKA}/posun-tip.png` });
    // Kdo nástroj zkusí, tomu zvýraznění zmizí.
    await s.locator('[data-akce="vyber"]').click();
    expect(await s.locator('[data-akce="vyber"]').getAttribute("data-tip")).toBeNull();
    // Po načtení stránky a další prošlé zkoušce už hra nic neříká.
    await s.reload();
    await s.locator(PLATNO).waitFor();
    const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await zavrit.count()) > 0) await zavrit.click();
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await s.locator('[data-akce="na-konec"]').click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    await s.locator('[data-akce="upravit"]').click();
    expect(await udaj(s, "hlaseni")).not.toContain("Výběr a posun");
    expect(await telo(s, "tip-posunu")).toBeNull();
    await s.close();
  }, 300_000);
});

describe("šipky a styčník vybraný přídavkem", () => {
  it("závaží pověšené kliknutím šipka neposune: posouvá pohled; s nástrojem Výběr a posun styčník posune", async () => {
    const most = RESENI["2-03"]!.pruchod;
    const p = await prohlizec.newPage({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    p.on("pageerror", (chyba) => chyby.push(chyba.message));
    await p.goto(`${adresa}?uroven=2-03&zaznam=vypnout`);
    await p.locator(PLATNO).waitFor();
    await p.locator('#okno-zadani[open] button[value="zavrit"]').click();
    await p.locator('#obrazovka-uroven .paleta [data-akce="import"]').click();
    await p.locator("#okno-obsah").fill(navrhNaText(most));
    await p.locator('[data-akce="okno-nacist"]').click();
    const poloha = async (): Promise<{ x: number; y: number; zavazi: boolean } | null> => {
      const st = (await mostNaVykresu(p)).stycniky.find((k) => k.x === 8 && Math.abs(k.y) <= 2);
      return st ? { x: st.x, y: st.y, zavazi: (st.zavazi ?? 0) > 0 } : null;
    };
    expect(await poloha()).toEqual({ x: 8, y: 0, zavazi: false });
    // Závaží na styčník mostovky v 8 m: nástroj styčník vybere kvůli nastavení hmotnosti.
    await p.locator('button[data-pridavek="zavazi"]').click();
    const misto = await bodSveta(p, 8, 0);
    await p.mouse.click(misto.x, misto.y);
    expect(await poloha()).toEqual({ x: 8, y: 0, zavazi: true });
    await p.locator(PLATNO).focus();
    const kamera = await p.locator(PLATNO).getAttribute("data-kamera");
    await p.keyboard.press("ArrowUp");
    expect(await poloha()).toEqual({ x: 8, y: 0, zavazi: true });
    expect(await p.locator(PLATNO).getAttribute("data-kamera")).not.toBe(kamera);
    // Tentýž styčník vybraný nástrojem Výběr a posun už šipka bere jako výběr k posunu: pohled
    // stojí a hra buď styčník posune, nebo řekne, proč to nejde (lávka 2-03 má mostovku rovnou).
    await p.locator('[data-akce="vyber"]').click();
    const znovu = await bodSveta(p, 8, 0);
    await p.mouse.click(znovu.x, znovu.y);
    expect(await telo(p, "posun-vyberu")).toBe("1;0");
    await p.locator(PLATNO).focus();
    const predPosunem = await p.locator(PLATNO).getAttribute("data-kamera");
    await p.keyboard.press("ArrowUp");
    expect(await p.locator(PLATNO).getAttribute("data-kamera")).toBe(predPosunem);
    const po = await poloha();
    if (po === null || po.y === 0) expect((await udaj(p, "hlaseni")).length).toBeGreaterThan(10);
    else expect(po).toEqual({ x: 8, y: 1, zavazi: true });
    await p.close();
  }, 60_000);
});

describe("posun prstem na telefonu", () => {
  let kontext: BrowserContext;
  let s: Page;
  let protokol: CDPSession;

  /** Jedním prstem táhne z bodu světa do bodu světa. */
  async function tahniPrstem(a: [number, number], b: [number, number]): Promise<void> {
    const pa = await bodSveta(s, ...a);
    const pb = await bodSveta(s, ...b);
    const posli = (typ: string, body: { x: number; y: number }[]): Promise<unknown> =>
      protokol.send("Input.dispatchTouchEvent", { type: typ as "touchStart", touchPoints: body.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: 1 })) });
    await posli("touchStart", [pa]);
    for (let krok = 1; krok <= 6; krok++) await posli("touchMove", [{ x: pa.x + ((pb.x - pa.x) * krok) / 6, y: pa.y + ((pb.y - pa.y) * krok) / 6 }]);
    await posli("touchEnd", []);
    await s.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
  }

  it("telefon 390 × 844: Výběr a posun je cíl na prst, rámeček i posun jdou prstem a nic nepřetéká", async () => {
    kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    s = await kontext.newPage();
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    protokol = await kontext.newCDPSession(s);
    await otevriSMostem(s, true);
    const tlacitko = s.locator('#obrazovka-uroven [data-akce="vyber"]');
    const obrys = (await tlacitko.boundingBox())!;
    expect(obrys.height).toBeGreaterThanOrEqual(44);
    expect(obrys.width).toBeGreaterThanOrEqual(44);
    expect(obrys.x + obrys.width).toBeLessThanOrEqual(390.5);
    await tlacitko.tap();
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("true");
    // Rámeček prstem přes horní pás, pak tah prstem za vybraný styčník o metr dolů.
    await tahniPrstem([2.6, 3.6], [13.4, 2.4]);
    expect(await telo(s, "posun-vyberu")).toBe("3;0");
    // Prst nemusí trefit styčník přesně: stačí být v dosahu cíle pro prst.
    const m = Number((await s.locator(PLATNO).getAttribute("data-kamera"))!.split(";")[2]);
    const vedle = Math.min(0.9, 15 / m);
    await tahniPrstem([8 + vedle, 3], [8 + vedle, 2]);
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([2, 2, 2]);
    expect(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await s.screenshot({ path: `${SLOZKA}/posun-telefon.png` });
    // Zpět v liště telefonu vrátí celý posun jedním klepnutím.
    await s.locator('#obrazovka-uroven .lista [data-akce="zpet-rychle"]').tap();
    expect(vyskyHornihoPasu(await mostNaVykresu(s))).toEqual([3, 3, 3]);
    await kontext.close();
  }, 120_000);

  it("prohlížeč při posunu nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
